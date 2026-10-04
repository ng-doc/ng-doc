import { compareText } from '../../helpers/text-order';
import type {
  ArtifactSnapshot,
  CompilationResult,
  Dependency,
  Diagnostic,
  RebuildReason,
} from '../contracts';
import { CONFLICTING_CONTENT_DIGEST } from '../graph';
import { dependencyKey, uniqueDependencies } from './common';

/**
 * Per-unit records and the fold.
 *
 * Every phase of a compile writes what it emits (diagnostics and dependencies) into records
 * instead of shared accumulators, and every exit builds its `CompilationResult` with `fold`. The
 * fold replays the records phase-major, units in plan order, which is exactly the order in which
 * the full path runs its phases:
 *
 * 1. discovery, semantic, setup (cache restore, output templates);
 * 2. per unit: describe (`enumerateApi` on the entry's first unit, entry-doc, `describeGuide`,
 *    `describe`), then the unit's dependency list;
 * 3. plan (descriptor duplicates);
 * 4. per unit: render/demo steps, then the unit's dependency list;
 * 5. keywords (duplicates, index completeness);
 * 6. per unit: link; 7. per unit: assembly;
 * 8. aggregate, scope validation, and a failure of the whole attempt.
 *
 * Dependencies enter one map in that order, last write wins, and two content reads of one path
 * with different digests are recorded as conflicting.
 *
 * A render step records the projection the full path used for it: `fresh` when it rendered,
 * emitting its diagnostics and raw dependencies; `reuse` when its reuse predicate held, emitting
 * nothing and adding only the compacted IR dependencies to the unit. The unit's dependency list
 * after render is derived from its describe list and the steps' projections, so a later slice can
 * replay a retained unit by choosing its projection. Describe and link are replayed as recorded
 * (the full path runs them for every unit), and so is assembly.
 *
 * Two facts a replay that chooses projections for retained units must not lose:
 * - a `none` step is not necessarily empty: a descriptor without a current request settles as
 *   `none` with the error `COMPILATION_CONTENT_DESCRIPTOR_REQUEST` (render.ts), and the fold replays
 *   every step's `emitted`, whatever its projection;
 * - an assembly is fresh-equivalent unless the assembly memo supplied it: the unit record says
 *   which (`UnitRecord.assembly`). A memoised assembly emits no diagnostics (a unit with assembly
 *   diagnostics is never memoised), so today replaying it as recorded is exact.
 */

export interface Contribution {
  diagnostics: Diagnostic[];
  dependencies: Dependency[];
}

export type GlobalPhase =
  | 'discovery'
  | 'semantic'
  | 'setup'
  | 'plan'
  | 'keywords'
  | 'aggregate'
  | 'validate'
  | 'failure';

/** One descriptor, or the demo-assets IR (`<unit>:demos`), of a unit's render phase. */
export interface RenderStep {
  id: string;
  /**
   * `fresh`: rendered in this generation; `reuse`: the previous IR; `none`: no IR (a descriptor
   * without a current request). `none` may still carry an error in `emitted`
   * (`COMPILATION_CONTENT_DESCRIPTOR_REQUEST`), which the fold replays like any other.
   */
  projection: 'fresh' | 'reuse' | 'none';
  /** Emitted into the generation: diagnostics and raw dependencies (empty for `reuse`). */
  emitted: Contribution;
  /** Compacted dependencies the step adds to the unit's own dependency list. */
  unitDependencies: Dependency[];
}

export interface UnitRecord {
  describe: Contribution[];
  /** The unit's dependency list once describe completed. */
  described?: Dependency[];
  render: RenderStep[];
  /** Whether the unit's render phase completed (its dependency list was then emitted). */
  rendered: boolean;
  link: Contribution[];
  assemble: Contribution[];
  /**
   * How the assembly phase obtained the unit's outputs, routes and API list: `memo` when the
   * assembly memo supplied the previous page (the reuse projection: nothing is emitted), `fresh`
   * when it was assembled in this generation. Unset until the assembly phase reaches the unit.
   */
  assembly?: 'memo' | 'fresh';
}

type Tracer = (records: GenerationRecords) => void;
let tracer: Tracer | undefined;

/**
 * Tests only: `sink` receives every new `GenerationRecords`, which then also keeps a journal of
 * its contributions in the order the phases emitted them (see `foldContributions`).
 */
export function traceRecords(sink: Tracer | undefined): void {
  tracer = sink;
}

export class GenerationRecords {
  readonly units: UnitRecord[] = [];
  readonly reasons: RebuildReason[] = [];
  /** Tests only (`traceRecords`): every contribution in emission order. */
  readonly journal?: Contribution[];
  private readonly globals = new Map<GlobalPhase, Contribution[]>();
  private readonly errorStages = new Set<Diagnostic['stage']>();

  constructor() {
    if (tracer) {
      this.journal = [];
      tracer(this);
    }
  }

  /** Whether any recorded diagnostic is an error. */
  failed(): boolean {
    return this.errorStages.size > 0;
  }

  global(phase: GlobalPhase, value: Contribution): void {
    const contribution = this.note(value);
    const list = this.globals.get(phase);
    if (list) list.push(contribution);
    else this.globals.set(phase, [contribution]);
  }

  globalContributions(phase: GlobalPhase): readonly Contribution[] {
    return this.globals.get(phase) ?? [];
  }

  /** Opens the record of the next unit in plan order. */
  unit(): UnitRecord {
    const record: UnitRecord = {
      describe: [],
      render: [],
      rendered: false,
      link: [],
      assemble: [],
    };
    this.units.push(record);
    return record;
  }

  /**
   * Appends the record of a unit the targeted path replays instead of describing it again: what
   * the full path would record for it, built from the retained build of a successful generation
   * (so it holds no error). Its phases that still run in this generation add to it as usual.
   */
  adopt(record: UnitRecord): void {
    this.units.push(record);
  }

  describe(record: UnitRecord, value: Contribution): void {
    record.describe.push(this.note(value));
  }

  described(record: UnitRecord, dependencies: Dependency[]): void {
    record.described = [...dependencies];
    this.journal?.push({ diagnostics: [], dependencies: record.described });
  }

  /** Opens the render step of a descriptor (or the demo-assets IR) with no IR yet. */
  renderStep(record: UnitRecord, id: string): RenderStep {
    const step: RenderStep = {
      id,
      projection: 'none',
      emitted: { diagnostics: [], dependencies: [] },
      unitDependencies: [],
    };
    record.render.push(step);
    return step;
  }

  /** What the step emitted, and the projection it took. */
  settle(
    step: RenderStep,
    projection: RenderStep['projection'],
    emitted: Contribution,
    unitDependencies: Dependency[] = [],
  ): void {
    step.projection = projection;
    step.emitted = this.note(emitted);
    step.unitDependencies = [...unitDependencies];
  }

  /** `dependencies` is the unit's actual list; the fold derives it from the steps. */
  rendered(record: UnitRecord, dependencies: Dependency[]): void {
    record.rendered = true;
    this.journal?.push({ diagnostics: [], dependencies: [...dependencies] });
  }

  link(record: UnitRecord, value: Contribution): void {
    record.link.push(this.note(value));
  }

  assemble(record: UnitRecord, value: Contribution, assembly: 'memo' | 'fresh' = 'fresh'): void {
    record.assembly = assembly;
    record.assemble.push(this.note(value));
  }

  reason(...values: RebuildReason[]): void {
    this.reasons.push(...values);
  }

  private note(value: Contribution): Contribution {
    const contribution = {
      diagnostics: [...value.diagnostics],
      dependencies: [...value.dependencies],
    };
    for (const item of contribution.diagnostics)
      if (item.severity === 'error') this.errorStages.add(item.stage);
    this.journal?.push(contribution);
    return contribution;
  }
}

/** Replays the records phase-major (see above) into the generation's result. */
export function fold(records: GenerationRecords, candidate?: ArtifactSnapshot): CompilationResult {
  const ordered: Contribution[] = [];
  const globals = (...phases: GlobalPhase[]) => {
    for (const phase of phases) ordered.push(...records.globalContributions(phase));
  };
  const dependencies = (values: Dependency[]) =>
    ordered.push({ diagnostics: [], dependencies: values });
  globals('discovery', 'semantic', 'setup');
  for (const unit of records.units) {
    ordered.push(...unit.describe);
    if (unit.described) dependencies(unit.described);
  }
  globals('plan');
  for (const unit of records.units) {
    for (const step of unit.render) ordered.push(step.emitted);
    if (unit.rendered)
      dependencies([
        ...(unit.described ?? []),
        ...unit.render.flatMap((step) => step.unitDependencies),
      ]);
  }
  globals('keywords');
  for (const unit of records.units) ordered.push(...unit.link);
  for (const unit of records.units) ordered.push(...unit.assemble);
  globals('aggregate', 'validate', 'failure');
  const folded = foldContributions(ordered);
  return {
    ...(candidate ? { candidate } : {}),
    dependencies: folded.dependencies,
    diagnostics: folded.diagnostics,
    whyRebuilt: mergeReasons(records.reasons),
  };
}

/** Diagnostics in order, and the generation's dependency map (conflicting digests), sorted. */
export function foldContributions(contributions: readonly Contribution[]): Contribution {
  const diagnostics: Diagnostic[] = [];
  const dependencyMap = new Map<string, Dependency>();
  for (const contribution of contributions) {
    for (const item of contribution.diagnostics) diagnostics.push(item);
    for (const value of contribution.dependencies) {
      const key = dependencyKey(value);
      const existing = dependencyMap.get(key);
      // Two reads of one path in this generation saw different bytes (for example describe and
      // render of a guide during an A→B→A write): no single digest describes what the candidate was
      // built from, so the path is recorded as conflicting and never verifies. A save of either
      // version then always starts a new generation.
      dependencyMap.set(
        key,
        value.kind === 'content' && existing?.kind === 'content' && existing.digest !== value.digest
          ? { ...value, digest: CONFLICTING_CONTENT_DIGEST }
          : value,
      );
    }
  }
  return { diagnostics, dependencies: uniqueDependencies([...dependencyMap.values()]) };
}

export function mergeReasons(values: RebuildReason[]): RebuildReason[] {
  const grouped = new Map<
    string,
    { ownerId: string; reason: RebuildReason['reason']; details: Set<string> }
  >();
  for (const value of values) {
    const key = `${value.ownerId}:${value.reason}`;
    const existing = grouped.get(key) ?? {
      ownerId: value.ownerId,
      reason: value.reason,
      details: new Set<string>(),
    };
    existing.details.add(value.detail);
    grouped.set(key, existing);
  }
  return [...grouped.values()]
    .map(({ ownerId, reason, details }) => ({
      ownerId,
      reason,
      detail: [...details].sort().join('; '),
    }))
    .sort((left, right) =>
      compareText(`${left.ownerId}:${left.reason}`, `${right.ownerId}:${right.reason}`),
    );
}
