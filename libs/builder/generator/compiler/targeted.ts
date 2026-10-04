import { existsSync, statSync } from 'node:fs';

import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationRequest,
  DeclarationDescriptor,
  Dependency,
  DiscoverySnapshot,
  EntryDescriptor,
  FileChange,
  JsonValue,
  KeywordExport,
  PageArtifact,
  RemoteKeywordSnapshot,
  ServiceResult,
} from '../contracts';
import {
  type DependencyRefresher,
  type ObservationStamp,
  CONFLICTING_CONTENT_DIGEST,
  sameStamp,
  stampOf,
  stampSettledBefore,
} from '../graph';
import {
  type UnitIndex,
  keywordBindingDigests,
  normalizePath,
  UnitIndex as UnitIndexClass,
} from '../graph/unit-index';
import { dependencyIdentity } from '../kernel/canonical';
import type { SynchronizationPath } from '../semantic/semantic-service';
import { type PathPass, classifyChanges, dirty, discoveryChanges, keywordDiff } from './classify';
import { type Unit, uniqueDependencies, unitExports } from './common';
import type { DescribePlan } from './describe';
import type { UnitRecord } from './fold';
import type { CompilationOptions } from './index';
import type { GenerationPlan } from './plan';
import type { CommittedGeneration, GenerationRetention } from './retention';
import { scopedSemanticMode } from './semantic-closure';

/**
 * The targeted rebuild: a development watch generation whose changes are content, page (entry),
 * program or structural edits compiles only the units they reach, and replays every other unit
 * from the retained build of its base.
 *
 * - Before discovery, the changes (with the changes of every generation against the same base that
 *   did not commit, and the paths a stat sweep of the retained observations finds changed) are
 *   classified against the base's reverse index. Anything but content, an evaluated entry input
 *   (a page module or a file it imports), an existing program input or a structural change the
 *   structural class scopes (entries added, removed or moved, a discovery or program glob that
 *   gained or lost a file, a deleted program file, an unknown path) goes FULL; program inputs and
 *   structural changes only while the generation records semantic closures.
 * - After discovery and the semantic synchronization, the fresh-discovery check: the
 *   configuration, the `onlyForTags` exclusions and the output templates must equal the base's.
 *   Every entry the base does not have is described, the units of every entry it no longer has are
 *   dropped, and every entry whose descriptor or evaluated value changed becomes a candidate (all
 *   of its units), as does a guide whose live values (playground controls read from its evaluated
 *   page) changed. When the program is not the base's (it was patched or synchronized again), every
 *   replayed unit's semantic closures are refreshed against it, as the full path's reuse predicate
 *   does, and each unit whose closure changed makes its entry a candidate (an API declaration only
 *   itself). API entries are enumerated again, in entry order, whenever the program or the entry
 *   set may have changed: a declaration the enumeration adds, drops or describes differently is
 *   described (or dropped) on its own, and every other declaration unit is replayed.
 * - Candidates are described, rendered, linked and assembled by the full path's own code (its
 *   reuse predicates included). Every other unit is replayed: its retained records are what the
 *   full path would record for it, and its previous artifact is what the full path would build.
 *   The keyword set is combined in full, and the one-hop consumers of every key whose binding
 *   changed are linked and assembled again. The site-wide outputs (routes, context, search index,
 *   keywords, API lists) are aggregated in full, the output existence scan covers every previously
 *   published output, and the fold builds the result as the full path does.
 * - Any doubt goes FULL in the same generation: a precondition, a class, the equality check, the
 *   dirty threshold, a digest conflict, an unknown path no rebuilt unit read, and any error
 *   diagnostic of the targeted attempt (the full path is the arbiter of failures).
 */

/** `on`: targeted generations; `verify`: each targeted generation is also compiled in full and compared. */
export type TargetedMode = 'on' | 'verify';

export function targetedMode(options: CompilationOptions): TargetedMode | undefined {
  return options.targetedRebuild === false
    ? undefined
    : options.targetedRebuild === 'verify'
      ? 'verify'
      : 'on';
}

/** One unit of a retained build: its state and records once its generation completed. */
export interface RetainedUnit {
  /** Never changed after its generation (`previous` is dropped). */
  unit: Unit;
  /**
   * Every render step of its generation reused the previous IR: its dependency list and input
   * digest are the reuse projection, so its artifact is exactly what the full path builds for it
   * while its inputs stay unchanged.
   */
  settled: boolean;
}

/** What discovery and setup produced, compared by the fresh-discovery equality check. */
interface DiscoveryFacts {
  configuration: string;
  order: string;
  filtered: string;
  globalKeywords: string;
  remoteKeywords: string;
  templates: string;
}

/**
 * The stat of a recorded path when its generation observed it: a regular file's stamp, a path that
 * did not exist or was not a file, or `unverifiable` (written while it was observed, or recorded
 * with a conflicting digest): the sweep always reports that one as changed.
 */
export type Observation = ObservationStamp | 'missing' | 'present' | 'unverifiable';

/** The per-unit records and facts of one successful build, retained for the next generation. */
export interface RetainedBuild {
  units: RetainedUnit[];
  byEntry: Map<string, RetainedUnit[]>;
  /** Guide entry → `readGuideValues` as JSON. */
  guideValues: Map<string, string>;
  observations: Map<string, Observation>;
  /** Content-level glob dependencies of the units (their membership is refreshed). */
  globs: Dependency[];
  facts: DiscoveryFacts;
  /** The keyword loaders' results of the build: a targeted attempt's discovery pins them. */
  remoteKeywords: RemoteKeywordSnapshot[];
}

/** What the phases ask of the targeted path about one unit. */
export interface ReplayScope {
  /** The retained unit a replayed unit was built from; undefined for a described unit. */
  retained(unit: Unit): RetainedUnit | undefined;
  /** A replayed unit that is not linked and assembled again (not a one-hop consumer). */
  keepsLink(unit: Unit): boolean;
}

/** Thrown inside a targeted attempt: the generation runs FULL instead, for `message`. */
export class TargetedFallback extends Error {}

type GuideValues = (entryId: string) => ServiceResult<JsonValue>;

const discoveryFacts = (found: DiscoverySnapshot, templates: Dependency[]): DiscoveryFacts => ({
  configuration: JSON.stringify(found.configuration),
  order: found.entries.map((entry) => entry.id).join('\n'),
  filtered: JSON.stringify(found.filtered ?? null),
  globalKeywords: JSON.stringify(found.globalKeywords),
  remoteKeywords: JSON.stringify(found.remoteKeywords),
  templates: JSON.stringify(templates),
});

/** Whether a path, or a path below it (it is a directory), was read. */
function explained(path: string, read: ReadonlySet<string>): boolean {
  if (read.has(path)) return true;
  const prefix = `${path}/`;
  for (const item of read) if (item.startsWith(prefix)) return true;
  return false;
}

/** The paths a stat sweep finds changed since they were observed (only paths `index` records). */
function sweep(build: RetainedBuild, index: UnitIndex): FileChange[] {
  const changed: FileChange[] = [];
  for (const [file, observed] of build.observations) {
    let same: boolean;
    if (observed === 'unverifiable') same = false;
    else if (observed === 'missing') same = !existsSync(file);
    else if (observed === 'present') {
      same = existsSync(file) && stampOf(file) === undefined;
    } else {
      const current = stampOf(file);
      same = current !== undefined && sameStamp(current, observed);
    }
    if (!same && index.hits(file).length) changed.push({ kind: 'update', path: file });
  }
  return changed;
}

/**
 * Records the stat of every content and existence path in `dependencies` as observed by a
 * generation that began at `observedAtNs` (`seen`: paths already recorded by this call's caller).
 */
function observe(
  observations: Map<string, Observation>,
  dependencies: Dependency[],
  observedAtNs: bigint,
  seen: Set<string>,
): void {
  const stamped = (file: string): Observation => {
    const stamp = stampOf(file);
    return stamp && stampSettledBefore(stamp, observedAtNs) ? stamp : 'unverifiable';
  };
  for (const dependency of dependencies) {
    if (dependency.kind !== 'content' && dependency.kind !== 'existence') continue;
    const file = normalizePath(dependency.path);
    if (dependency.kind === 'content') {
      if (seen.has(`c\0${file}`)) continue;
      seen.add(`c\0${file}`);
      observations.set(
        file,
        dependency.digest === CONFLICTING_CONTENT_DIGEST ? 'unverifiable' : stamped(file),
      );
      continue;
    }
    if (seen.has(`c\0${file}`) || seen.has(`e\0${file}`)) continue;
    seen.add(`e\0${file}`);
    let kind: 'file' | 'other' | 'missing';
    try {
      kind = statSync(file).isFile() ? 'file' : 'other';
    } catch {
      kind = 'missing';
    }
    if (!dependency.exists) observations.set(file, kind === 'missing' ? 'missing' : 'unverifiable');
    else if (kind === 'other') observations.set(file, 'present');
    else observations.set(file, kind === 'file' ? stamped(file) : 'unverifiable');
  }
}

const dedupe = (changes: readonly FileChange[]): FileChange[] => {
  const seen = new Set<string>();
  return changes.filter((change) => {
    const key = `${change.kind}\0${change.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** The report fields the targeted path fills for its generation (see `dry-run.ts`). */
export interface TargetedFacts {
  path: 'content' | 'full';
  reason?: string;
  pass?: PathPass;
  pending: number;
  swept: string[];
  candidates: { units: number; descriptors: number };
  keys: string[];
  /** Whether K was computed over the candidates' exports or (global/remote keywords changed) all keys. */
  keysFrom?: 'candidates' | 'all';
  consumers: number;
  closure: string[];
  /**
   * `pinned`: discovery kept the base's keyword loader results; `refreshed`: it was pinned, and
   * ran again with the loaders evaluated because the generation did not publish a targeted result.
   */
  loaders?: 'pinned' | 'refreshed';
  /** The structural class: entries the fresh discovery added and removed, by ID. */
  entries?: { added: string[]; removed: string[] };
  timings: { sweepMs: number; classifyMs: number; admitMs: number };
}

/** One generation's use of the targeted path (created before discovery). */
export class TargetedGeneration implements ReplayScope {
  readonly facts: TargetedFacts = {
    path: 'full',
    pending: 0,
    swept: [],
    candidates: { units: 0, descriptors: 0 },
    keys: [],
    consumers: 0,
    closure: [],
    timings: { sweepMs: 0, classifyMs: 0, admitMs: 0 },
  };
  /** Candidate units (owner IDs) and their entries. */
  readonly candidates = new Set<string>();
  /** Entries described in full (their descriptor changed, or the base has none). */
  private readonly candidateEntries = new Set<string>();
  /** Entries of the base the fresh discovery no longer has. */
  private removedEntries = new Set<string>();
  /**
   * API entries described declaration by declaration: their enumeration changed, or one of their
   * units is a candidate. The others are replayed (see {@link describing}).
   */
  private readonly apiEntries = new Set<string>();
  /** API entries whose own unit is described (its record holds the enumeration, which changed). */
  private readonly apiShells = new Set<string>();
  /** This generation's enumeration of every API entry, when it had to run again. */
  private readonly enumerations = new Map<string, ServiceResult<DeclarationDescriptor[]>>();
  /** Base owners the generation no longer has (known once the keyword set is combined). */
  private removedOwners: string[] = [];
  /** Unknown paths no fresh discovery or program input explains (a rebuilt unit must read them). */
  private unknown: string[] = [];
  private readonly replayed = new Map<Unit, RetainedUnit>();
  private linked = new Set<string>();
  /** K, and whether it was computed over every key (otherwise over the candidates' exports). */
  private keys: string[] = [];
  private everyKey = false;
  private keywordFacts = true;
  /**
   * Whether the generation's discovery inputs or program may differ from the base's (a changed
   * entry, a program synchronized again): the retained index then builds its input roles again.
   */
  private inputsChanged = false;
  /** Live guide values read in this generation (the retained ones for the next). */
  readonly guideValues = new Map<string, string>();

  private constructor(
    readonly mode: TargetedMode,
    private readonly request: CompilationRequest,
    private readonly committed: CommittedGeneration | undefined,
    private readonly startedNs: bigint,
  ) {}

  /**
   * Undefined when the targeted rebuild is off or the generation retains nothing (production,
   * one-shot, the reference path): such a generation is FULL and builds no retained state.
   */
  static start(
    options: CompilationOptions,
    request: CompilationRequest,
    context: CompilationContext | undefined,
    retention: GenerationRetention,
    startedNs: bigint,
  ): TargetedGeneration | undefined {
    const mode = targetedMode(options);
    if (!mode || !retention.retaining) return undefined;
    const committed = retention.committed(request, options.projectId);
    const targeted = new TargetedGeneration(mode, request, committed, startedNs);
    const precondition =
      context?.lifetime !== 'watch'
        ? 'not a watch generation'
        : request.contentRequest?.origin !== 'filesystem'
          ? `origin ${request.contentRequest?.origin ?? 'none'}`
          : !committed
            ? 'no committed index for this base'
            : !committed.build
              ? 'no retained build for this base'
              : undefined;
    let changes: FileChange[] = [...request.changes];
    if (committed?.build && precondition === undefined) {
      const swept = performance.now();
      const found = sweep(committed.build, committed.index);
      targeted.facts.timings.sweepMs = performance.now() - swept;
      targeted.facts.pending = committed.pending.length;
      targeted.facts.swept = found.map((change) => change.path).sort();
      changes = dedupe([...request.changes, ...committed.pending, ...found]);
    }
    const classified = performance.now();
    try {
      if (committed) {
        const pass = classifyChanges(
          committed.index,
          changes,
          precondition ?? (changes.length ? undefined : 'no changes'),
          { program: scopedSemanticMode(options, request) !== 'off' },
        );
        targeted.facts.pass = pass;
        for (const id of pass.units) targeted.candidates.add(id);
        if (pass.full !== undefined) targeted.facts.reason = pass.full;
        else if (pass.threshold !== undefined) targeted.facts.reason = pass.threshold;
      } else targeted.facts.reason = precondition;
    } catch (error) {
      targeted.facts.reason = `classification failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    targeted.facts.timings.classifyMs = performance.now() - classified;
    return targeted;
  }

  /** The base's reverse index, when there is one for this generation's base. */
  get index(): UnitIndex | undefined {
    return this.committed?.index;
  }

  /** Whether the path pass allows a targeted attempt (the equality check still follows). */
  get eligible(): boolean {
    return this.facts.reason === undefined && this.committed?.build !== undefined;
  }

  /**
   * The keyword loader results discovery keeps instead of invoking the loaders, when the path pass
   * allows a targeted attempt: the base's. Loaders are evaluated on every other generation (the
   * pin is refreshed by each FULL generation and by a restart). Decided before discovery, which
   * invokes the loaders; a generation that then does not publish a targeted result runs discovery
   * again without the pin.
   */
  pin(): RemoteKeywordSnapshot[] | undefined {
    if (!this.eligible || !this.facts.pass?.pin) return undefined;
    const pinned = this.committed!.build!.remoteKeywords;
    // No loaders in the base: nothing to pin, and a FULL fallback then needs no second discovery.
    if (pinned.length === 0) return undefined;
    this.facts.loaders = 'pinned';
    return pinned;
  }

  /** The generation runs FULL, for `reason` (the first reason is kept). */
  full(reason: string): void {
    this.facts.reason ??= reason;
  }

  /**
   * The fresh-discovery equality check and the other admission rules, after discovery, the
   * semantic synchronization and setup. False (with a reason) when the generation must run FULL.
   * It may add candidates: a guide whose live values changed.
   */
  async admit(input: {
    found: DiscoverySnapshot;
    synchronization: SynchronizationPath | undefined;
    plan: GenerationPlan;
    readGuideValues: GuideValues;
    refresher: DependencyRefresher;
  }): Promise<boolean> {
    const started = performance.now();
    try {
      const reason = await this.admission(input);
      if (reason !== undefined) this.full(reason);
      return reason === undefined;
    } finally {
      this.facts.timings.admitMs = performance.now() - started;
    }
  }

  private async admission({
    found,
    synchronization,
    plan,
    readGuideValues,
    refresher,
  }: Parameters<TargetedGeneration['admit']>[0]): Promise<string | undefined> {
    const committed = this.committed!;
    const build = committed.build!;
    const index = committed.index;
    // A program patched or synchronized again (an edited program input) is replayed against only
    // through the units' semantic closures, which are refreshed below; without them a replayed
    // unit would hold the global reference.
    const reused = synchronization?.path === 'reused';
    if (!synchronization || (!reused && plan.scopedSemantic === 'off'))
      return `program not reused${synchronization?.path === 'full' ? `: ${synchronization.reason}` : ''}`;
    const previous = this.request.previous!;
    if (!plan.sessionPrevious || plan.previous.length !== previous.artifacts.length)
      return 'previous snapshot not usable';
    // The structural class (the entry set may change) needs the semantic closures: a new or removed
    // entry changes the program's root membership.
    const structural = plan.scopedSemantic !== 'off';
    const facts = discoveryFacts(found, plan.outputDependencies);
    if (facts.configuration !== build.facts.configuration)
      return 'discovery: configuration changed';
    if (!structural && facts.order !== build.facts.order)
      return 'discovery: entry set or order changed';
    if (facts.filtered !== build.facts.filtered) return 'discovery: onlyForTags exclusions changed';
    if (facts.templates !== build.facts.templates) return 'output templates changed';
    const discovery = discoveryChanges(
      index,
      { configurationDigest: found.configuration.digest, entries: found.entries },
      structural,
    );
    if (discovery.full) return `discovery: ${discovery.full}`;
    // The global and remote keyword sets may differ (a computed `require` of a keyword file, a
    // loader that failed this time): that is not structural, it only widens the keyword diff.
    this.keywordFacts =
      facts.globalKeywords === build.facts.globalKeywords &&
      facts.remoteKeywords === build.facts.remoteKeywords;
    const aggregate = previous.artifacts.find((item) => item.identity.role === 'aggregate');
    if (!aggregate) return 'previous snapshot has no aggregate artifact';
    // A reused program is the base's, so it has the base's inputs. The inputs of a patched or new
    // program are owned by the aggregate artifact, which is always built in full.
    if (
      reused &&
      JSON.stringify(uniqueDependencies(plan.programDependencies)) !==
        JSON.stringify(aggregate.dependencies)
    )
      return 'program dependencies changed';
    // Glob memberships are not stat-swept. Units record none today (program globs belong to the
    // aggregate artifact), so a build whose units do is simply not replayed.
    if (build.globs.length) return 'units record content-level globs';
    const unknown = this.unexplained(found, plan);
    this.removedEntries = discovery.removed;
    if (discovery.added.size || discovery.removed.size)
      this.facts.entries = {
        added: [...discovery.added].sort(),
        removed: [...discovery.removed].sort(),
      };
    const ownersByEntry = new Map<string, string[]>();
    for (const owner of index.owners.values())
      ownersByEntry.set(owner.entryId, [...(ownersByEntry.get(owner.entryId) ?? []), owner.id]);
    const addEntry = (entryId: string): void => {
      this.candidateEntries.add(entryId);
      for (const id of ownersByEntry.get(entryId) ?? []) this.candidates.add(id);
    };
    // An API declaration is a candidate on its own: its entry is described declaration by
    // declaration. Any other unit makes its whole entry a candidate.
    const candidate = (owner: { id: string; entryId: string; entryKind: string }): void => {
      if (owner.entryKind === 'api') {
        this.candidates.add(owner.id);
        this.apiEntries.add(owner.entryId);
      } else this.candidateEntries.add(owner.entryId);
    };
    for (const id of this.candidates) {
      const owner = index.owners.get(id);
      if (!owner) return `candidate is not a unit of the base: ${id}`;
      if (!this.removedEntries.has(owner.entryId)) candidate(owner);
    }
    // Each entry whose descriptor changed is described again, and each new entry is described;
    // any other unit's describe, render and assembly read only its own entry.
    for (const id of discovery.entries) addEntry(id);
    for (const id of discovery.added) this.candidateEntries.add(id);
    this.inputsChanged =
      discovery.entries.size > 0 ||
      discovery.added.size > 0 ||
      discovery.removed.size > 0 ||
      !reused;
    // A replayed unit is exactly what the full path builds only while every non-physical
    // dependency it recorded is unchanged: the full path refreshes them, the replay does not. The
    // `evaluated` digests are refreshed against this generation's discovery (a shared module state
    // another module mutates, a file its module reads itself, an unattested value whose bundle
    // changed); the semantic closures (and a global reference a closure could not state) against
    // the current program, unless it is provably the base's. Each entry with a unit whose refreshed
    // dependency changed becomes a candidate (an API declaration only itself).
    const semantic = !plan.semantic.closuresHold();
    try {
      for (const { unit } of build.units) {
        if (this.removedEntries.has(unit.entry.id) || this.candidateEntries.has(unit.entry.id))
          continue;
        if (this.candidates.has(unit.id)) continue;
        if (!(await this.replayedChanged(unit, plan, refresher, semantic))) continue;
        if (unit.entry.kind === 'api')
          candidate({ ...unit, entryId: unit.entry.id, entryKind: 'api' });
        else addEntry(unit.entry.id);
      }
    } catch (error) {
      return `refresh of a replayed unit failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    // The live guide values a guide's description reads come from its evaluated page, not from
    // any recorded file (for example a playground's controls built from a computed `require`).
    for (const entry of found.entries) {
      if (entry.kind !== 'guide' || this.candidateEntries.has(entry.id)) continue;
      const values = JSON.stringify(readGuideValues(entry.id));
      this.guideValues.set(entry.id, values);
      if (values === build.guideValues.get(entry.id)) continue;
      addEntry(entry.id);
    }
    // API enumeration reads the program and every entry's route (a disambiguated route must not
    // take one): it runs again, for every API entry in entry order as the full path runs it,
    // whenever either may differ from the base's or an API entry is described.
    const api = found.entries.filter((entry) => entry.kind === 'api');
    if (
      api.length &&
      (!reused ||
        discovery.entries.size ||
        discovery.added.size ||
        discovery.removed.size ||
        this.apiEntries.size ||
        api.some((entry) => this.candidateEntries.has(entry.id)))
    )
      for (const entry of api) {
        const enumerated = plan.semantic.enumerateApi(entry.id);
        this.enumerations.set(entry.id, enumerated);
        if (!this.candidateEntries.has(entry.id)) this.enumerationDiff(entry.id, enumerated, build);
      }
    let descriptors = 0;
    for (const id of this.candidates) descriptors += index.owners.get(id)!.descriptors.length;
    this.facts.candidates = { units: this.candidates.size, descriptors };
    if (dirty(this.candidates.size, index.owners.size, descriptors))
      return `dirty threshold: ${this.candidates.size} of ${index.owners.size} units, ${descriptors} descriptors`;
    for (const entry of found.entries)
      if (!this.candidateEntries.has(entry.id) && !build.byEntry.has(entry.id))
        return `entry without retained units: ${entry.id}`;
    // An unknown path that no fresh input explains must be read by a unit this generation builds.
    if (unknown.length && !this.candidateEntries.size && !this.apiEntries.size)
      return `unknown path not read by this generation: ${unknown[0]}`;
    this.unknown = unknown;
    return undefined;
  }

  /**
   * The unknown paths of the path pass that neither this generation's discovery nor its program
   * read (a directory is explained by what they read below it).
   */
  private unexplained(found: DiscoverySnapshot, plan: GenerationPlan): string[] {
    const paths = this.facts.pass?.unknown ?? [];
    if (!paths.length) return [];
    const read = new Set<string>();
    const add = (dependencies: readonly Dependency[]): void => {
      for (const dependency of dependencies) {
        if (dependency.kind === 'content' || dependency.kind === 'existence')
          read.add(normalizePath(dependency.path));
        else if (dependency.kind === 'glob')
          dependency.members.forEach((member) => read.add(normalizePath(member)));
        else if (dependency.kind === 'semantic')
          dependency.files.forEach((file) => read.add(normalizePath(file)));
      }
    };
    for (const entry of found.entries) add(entry.dependencies);
    for (const phase of ['discovery', 'semantic'] as const)
      for (const contribution of plan.records.globalContributions(phase))
        add(contribution.dependencies);
    return paths.filter((path) => !explained(path, read));
  }

  /**
   * Compares an API entry's fresh enumeration with its retained units: the entry's own unit holds
   * the enumeration's contribution (its first describe record), each declaration unit its
   * descriptor. A difference makes the entry one described declaration by declaration, with its
   * own unit described when the contribution changed and each declaration whose descriptor changed
   * a candidate; new declarations are described and dropped ones removed.
   */
  private enumerationDiff(
    entryId: string,
    enumerated: ServiceResult<DeclarationDescriptor[]>,
    build: RetainedBuild,
  ): void {
    const retained = build.byEntry.get(entryId) ?? [];
    const shell = retained.find((item) => !item.unit.declaration);
    const contribution = JSON.stringify({
      diagnostics: enumerated.diagnostics,
      dependencies: enumerated.dependencies,
    });
    if (!shell || JSON.stringify(shell.unit.record.describe[0]) !== contribution) {
      this.apiEntries.add(entryId);
      this.apiShells.add(entryId);
    }
    const declarations = enumerated.value ?? [];
    const units = new Map(
      retained.flatMap((item) =>
        item.unit.declaration ? [[item.unit.declaration.id, item.unit] as const] : [],
      ),
    );
    let changed = declarations.length !== units.size;
    declarations.forEach((declaration, index) => {
      const unit = units.get(declaration.id);
      if (!unit) changed = true;
      else if (JSON.stringify(unit.declaration) !== JSON.stringify(declaration)) {
        // Its old exports enter the keyword diff.
        this.candidates.add(unit.id);
        changed = true;
      } else if (retained[index + 1]?.unit !== unit) changed = true;
    });
    if (changed) this.apiEntries.add(entryId);
  }

  /**
   * Whether a refresh changes a non-physical dependency a replayed unit recorded (its describe
   * records and its published artifact with every IR). `semantic`: the semantic closures and
   * references are refreshed too; otherwise the program is the base's and they hold.
   */
  private async replayedChanged(
    unit: Unit,
    plan: GenerationPlan,
    refresher: DependencyRefresher,
    semantic: boolean,
  ): Promise<boolean> {
    const artifact = plan.previousById.get(unit.id);
    const recorded = new Map<string, Dependency>();
    for (const dependency of [
      ...unit.dependencies,
      ...(artifact?.dependencies ?? []),
      ...(artifact?.content.flatMap((item) => item.ir.dependencies) ?? []),
    ]) {
      const refreshed =
        dependency.kind === 'evaluated' ||
        (semantic &&
          (dependency.kind === 'semantic-closure' || dependency.kind === 'semantic-reference'));
      if (!refreshed) continue;
      const identity = dependencyIdentity(dependency);
      const seen = recorded.get(identity);
      // Two records of one identity with different digests cannot both hold.
      if (seen && JSON.stringify(seen) !== JSON.stringify(dependency)) return true;
      recorded.set(identity, dependency);
    }
    if (!recorded.size) return false;
    const refreshed = await refresher.refresh([...recorded.values()], []);
    if (refreshed.diagnostics.some((item) => item.severity === 'error')) return true;
    const current = new Map(
      refreshed.dependencies.map((dependency) => [dependencyIdentity(dependency), dependency]),
    );
    for (const [identity, dependency] of recorded) {
      const now = current.get(identity);
      if (
        !now ||
        !('digest' in now) ||
        !('digest' in dependency) ||
        now.digest !== dependency.digest
      )
        return true;
    }
    return false;
  }

  /**
   * Describe phase of an entry with no candidate: appends its retained units, with records that
   * hold what the full path's describe (and, for a settled unit, render) phases would record.
   * False for an entry the caller describes: a candidate, a new entry, or an API entry described
   * declaration by declaration ({@link describing}).
   */
  replay(plan: GenerationPlan, entry: EntryDescriptor, units: Unit[]): boolean {
    if (this.candidateEntries.has(entry.id) || this.apiEntries.has(entry.id)) return false;
    for (const retained of this.committed!.build!.byEntry.get(entry.id) ?? [])
      this.replayUnit(plan, entry, retained, units);
    return true;
  }

  /**
   * How the caller describes an entry {@link replay} did not replay: an API entry takes this
   * generation's enumeration (enumerated for every API entry in entry order, so a second call
   * would see later entries' declarations), and one that is not a candidate replays its own unit
   * when its enumeration's contribution is unchanged and each declaration whose unit is unchanged.
   */
  describing(
    plan: GenerationPlan,
    entry: EntryDescriptor,
    units: Unit[],
  ): DescribePlan | undefined {
    const enumerated = this.enumerations.get(entry.id);
    if (entry.kind !== 'api' || !enumerated) return undefined;
    if (!this.apiEntries.has(entry.id) || this.candidateEntries.has(entry.id))
      return { enumerated };
    const retained = this.committed!.build!.byEntry.get(entry.id) ?? [];
    const byDeclaration = new Map(
      retained.map((item) => [item.unit.declaration?.id ?? '', item] as const),
    );
    return {
      enumerated,
      replay: (declaration) => {
        const item = byDeclaration.get(declaration?.id ?? '');
        if (
          !item ||
          this.candidates.has(item.unit.id) ||
          (declaration
            ? JSON.stringify(item.unit.declaration) !== JSON.stringify(declaration)
            : this.apiShells.has(entry.id))
        )
          return false;
        this.replayUnit(plan, entry, item, units);
        return true;
      },
    };
  }

  /** Appends one retained unit with the records the full path would hold for it. */
  private replayUnit(
    plan: GenerationPlan,
    entry: EntryDescriptor,
    retained: RetainedUnit,
    units: Unit[],
  ): void {
    const { options, configuration } = plan;
    const kept = retained.unit;
    const previous = plan.previousById.get(kept.id);
    if (
      !previous ||
      previous.fingerprint.compilerVersion !== options.compilerVersion ||
      previous.fingerprint.toolchainDigest !== options.toolchainDigest ||
      previous.fingerprint.configurationDigest !== configuration.digest
    )
      throw new TargetedFallback(`no previous artifact for replayed unit ${kept.id}`);
    // Only a settled unit keeps its retained render record. Any other one was rendered in its
    // generation: its record holds the fresh projection (raw dependencies emitted), and the full
    // path would now record the reuse projection, so the render phase builds that record here.
    const settled = retained.settled && kept.record.rendered;
    const record: UnitRecord = {
      describe: kept.record.describe,
      ...(kept.record.described ? { described: kept.record.described } : {}),
      render: settled ? kept.record.render : [],
      rendered: settled,
      link: [],
      assemble: [],
    };
    const unit: Unit = {
      ...kept,
      entry,
      previous,
      record,
      ir: settled ? previous.content.map((item) => item.ir) : [],
      dependencies: settled ? kept.dependencies : [...(kept.record.described ?? [])],
      inputDigest: settled ? kept.inputDigest : '',
    };
    plan.records.adopt(record);
    units.push(unit);
    this.replayed.set(unit, retained);
  }

  retained(unit: Unit): RetainedUnit | undefined {
    return this.replayed.get(unit);
  }

  keepsLink(unit: Unit): boolean {
    return this.replayed.has(unit) && !this.linked.has(unit.id);
  }

  /**
   * After render: a path a candidate read in this generation with other bytes than a replayed
   * unit recorded changed without an event that reached this generation. The full path would
   * refresh and render that unit again, so the generation runs FULL. Only digests of the same
   * recorder (the content compiler) are compared.
   */
  conflict(units: Unit[]): string | undefined {
    const fresh = new Map<string, string>();
    for (const unit of units) {
      if (this.replayed.has(unit)) continue;
      for (const step of unit.record.render)
        if (step.projection === 'fresh')
          for (const item of step.emitted.dependencies)
            if (item.kind === 'content') fresh.set(normalizePath(item.path), item.digest);
    }
    if (!fresh.size) return undefined;
    for (const unit of units) {
      if (!this.replayed.has(unit)) continue;
      for (const ir of unit.ir)
        for (const item of ir.dependencies) {
          if (item.kind !== 'content') continue;
          const digest = fresh.get(normalizePath(item.path));
          if (digest !== undefined && digest !== item.digest)
            return `digest conflict: ${item.path}`;
        }
    }
    return undefined;
  }

  /**
   * After the keyword set is combined: the keyword diff K and the link set (candidates plus the
   * one-hop consumers of K). One hop is exact: exports come only from entries and IR, and linking
   * changes neither.
   */
  closure(units: Unit[], keywords: KeywordExport[]): void {
    const index = this.committed!.index;
    const started = performance.now();
    const current = new Set(units.map((unit) => unit.id));
    this.removedOwners = [...index.owners.keys()].filter((id) => !current.has(id)).sort();
    if (this.keywordFacts) {
      // Only the exports of the candidates and of the units that came or went changed: every
      // other key keeps its export list.
      const keys = new Set<string>();
      for (const id of [...this.candidates, ...this.removedOwners])
        index.owners.get(id)?.exports.forEach((key) => keys.add(key));
      for (const unit of units) {
        if (this.replayed.has(unit)) continue;
        for (const item of unitExports(unit)) keys.add(item.key);
        for (const ir of unit.ir) for (const item of ir.exportedKeywords) keys.add(item.key);
      }
      const fresh = keywordBindingDigests(keywords.filter((item) => keys.has(item.key)));
      this.keys = [...keys].filter((key) => fresh.get(key) !== index.bindings.get(key)).sort();
      this.everyKey = false;
      this.facts.keysFrom = 'candidates';
    } else {
      this.keys = keywordDiff(index, keywords);
      this.everyKey = true;
      this.facts.keysFrom = 'all';
    }
    const consumers = [...index.consumersOf(this.keys)].filter(
      (id) => !this.candidates.has(id) && current.has(id),
    );
    this.linked = new Set([...this.candidates, ...consumers]);
    this.facts.keys = this.keys;
    this.facts.consumers = consumers.length;
    // Every unit the generation described (new ones included) and every unit it dropped.
    const described = units.filter((unit) => !this.replayed.has(unit)).map((unit) => unit.id);
    this.facts.closure = [...new Set([...this.linked, ...described, ...this.removedOwners])].sort();
    this.facts.timings.admitMs += performance.now() - started;
  }

  /**
   * After assembly: every unknown path of the path pass that no fresh discovery or program input
   * read must be read by a unit this generation built; otherwise the full path decides.
   */
  explain(artifacts: PageArtifact[], units: Unit[]): void {
    if (!this.unknown.length) return;
    const described = new Set(
      units.filter((unit) => !this.replayed.has(unit)).map((unit) => unit.id),
    );
    const read = new Set<string>();
    for (const artifact of artifacts) {
      if (!described.has(artifact.id)) continue;
      for (const dependency of [
        ...artifact.dependencies,
        ...artifact.content.flatMap((item) => item.ir.dependencies),
      ])
        if (dependency.kind === 'content' || dependency.kind === 'existence')
          read.add(normalizePath(dependency.path));
    }
    const missing = this.unknown.find((path) => !explained(path, read));
    if (missing) throw new TargetedFallback(`unknown path not read by this generation: ${missing}`);
  }

  /** The units a targeted generation linked and assembled (for the report). */
  get closureUnits(): ReadonlySet<string> {
    return this.linked;
  }

  /**
   * The retained build and index of this generation's published units, for the next generation.
   * `targeted`: the published result is this generation's targeted attempt, so the base's build
   * and index are overlaid; otherwise both are built from scratch.
   */
  retain(input: {
    targeted: boolean;
    units: Unit[];
    candidate: ArtifactSnapshot;
    found: DiscoverySnapshot;
    plan: GenerationPlan;
    keywords: KeywordExport[];
    discovery: Dependency[];
    guideValues: Map<string, string>;
  }): { index: UnitIndex; build: RetainedBuild } {
    const { units, candidate, found, plan, keywords } = input;
    const indexInput = {
      artifacts: candidate.artifacts,
      entries: found.entries,
      configurationDigest: found.configuration.digest,
      ...(found.configuration.headerTemplate
        ? { headerTemplate: found.configuration.headerTemplate }
        : {}),
      discovery: input.discovery,
      templates: plan.outputDependencies,
      keywords,
    };
    const base = input.targeted ? this.committed : undefined;
    const previous = new Map(
      (this.request.previous?.artifacts ?? []).map((item) => [item.id, item.revision]),
    );
    const artifacts = new Map(candidate.artifacts.map((item) => [item.id, item]));
    const retained: RetainedUnit[] = [];
    const byEntry = new Map<string, RetainedUnit[]>();
    for (const unit of units) {
      delete unit.previous;
      const settled =
        unit.record.rendered && unit.record.render.every((step) => step.projection === 'reuse');
      const item: RetainedUnit = { unit, settled };
      retained.push(item);
      const list = byEntry.get(unit.entry.id);
      if (list) list.push(item);
      else byEntry.set(unit.entry.id, [item]);
    }
    const observations = new Map(base?.build?.observations ?? []);
    const seen = new Set<string>();
    const globs: Dependency[] = [];
    const replaced = new Set<string>();
    for (const unit of units) {
      const artifact = artifacts.get(unit.id);
      if (!artifact) continue;
      for (const item of artifact.dependencies) if (item.kind === 'glob') globs.push(item);
      if (base && previous.get(unit.id) === artifact.revision && !this.candidates.has(unit.id))
        continue;
      replaced.add(unit.id);
      // Observed in this generation: a unit it described read its inputs again, and a full
      // generation read or refreshed every input.
      if (!base || this.candidates.has(unit.id) || !this.replayed.has(unit))
        observe(observations, artifact.dependencies, this.startedNs, seen);
    }
    // The units the generation dropped leave the index with their edges.
    if (base) for (const id of this.removedOwners) replaced.add(id);
    const index = base
      ? UnitIndexClass.overlay(base.index, indexInput, {
          replaced,
          entries: new Set([...this.candidateEntries, ...this.removedEntries]),
          ...(this.everyKey ? {} : { keys: this.keys }),
          ...(this.inputsChanged ? { inputs: true } : {}),
        })
      : UnitIndexClass.build(indexInput);
    const guideValues = new Map(base?.build?.guideValues ?? []);
    for (const [id, value] of input.guideValues) guideValues.set(id, value);
    return {
      index,
      build: {
        units: retained,
        byEntry,
        guideValues,
        observations,
        globs,
        facts: discoveryFacts(found, plan.outputDependencies),
        remoteKeywords: found.remoteKeywords,
      },
    };
  }
}

/** Changed units between two snapshots (the aggregate artifact excluded). */
export function changedArtifacts(
  previous: ArtifactSnapshot | undefined,
  candidate: ArtifactSnapshot,
): string[] {
  const units = (snapshot: ArtifactSnapshot | undefined) =>
    new Map(
      (snapshot?.artifacts ?? [])
        .filter((artifact: PageArtifact) => artifact.identity.role !== 'aggregate')
        .map((artifact) => [artifact.id, artifact.revision]),
    );
  const before = units(previous);
  const after = units(candidate);
  const changed = new Set<string>();
  for (const [id, revision] of after) if (before.get(id) !== revision) changed.add(id);
  for (const id of before.keys()) if (!after.has(id)) changed.add(id);
  return [...changed].sort();
}
