import type { Dependency, SemanticClosureDependency } from '../contracts';
import { digestOf as valueDigest } from '../kernel/canonical';
import type { FlagValue } from '../kernel/flags';
import type { Footprint } from '../kernel/footprint';
import { programIndex } from './program-index';
import type { ProgramObservations } from './program-observations';
import type { Snapshot } from './program-state';

/**
 * Recorded semantic closures: in a scoped development generation every semantic query records one
 * `semantic-closure` dependency, `{ scopeId, key: <query>, digest }`, in place of the global
 * `semantic-reference`. The digest covers exactly the program files the query's
 * footprint read (`R`), their type closures, the program environment and the derived-class lists
 * it read (`ProgramIndex`).
 *
 * The artifact carries only the digest. `R` stays with the retained program (`ClosureStore`,
 * keyed by digest, so a record always belongs to the digest it produced), and the refresher
 * recomputes the digest from it over the current program. A digest without a record still holds
 * when the whole program equals the one of the previous candidate, since every closure is a
 * function of the program; otherwise it refreshes as changed and its unit is recomputed, as without
 * scoping. A runtime that carries no records (a fresh runtime, a recycle) is seeded from the
 * persistent store (`compiler/closure-store.ts`, {@link SemanticClosures.seed}). A record is
 * checked every time it is used: the digest covers `R` and the derived identities themselves, so
 * a record recomputes to its dependency's digest only when it is that digest's record and the
 * closure holds, whatever its source. The store also keeps its program's file order: with
 * `stableTypeOrdering` output depends on the relative order of the files that declare the printed
 * types, so when two files both programs have swapped places no earlier closure is confirmed
 * (every closure refreshes as changed); files added or removed reorder no surviving file.
 *
 * Shape closures (`NGDOC_SHAPE_CLOSURE`, on by default) follow the files of `R` by their content
 * and their declaration-shape closures (`ProgramIndex.closure` with `shape`): a body edit that
 * keeps every declaration shape then changes only the closures whose `R` holds the edited file.
 * Their keys carry {@link SHAPE_KEY_SUFFIX}, so a digest recorded in the other mode never holds
 * without a record (a cache restored across a switch change). `verify` reports every closure that
 * holds only by its shapes as narrowed ({@link SemanticClosures.narrowed}): its type-closure digest
 * changed since its query recorded it, or is not known (a record carried from a generation that did
 * not keep it); the compiler then renders the content reused on it again and compares.
 */

/** The mode of shape closures: `off` keeps type closures for every file of `R`. */
export type ShapeClosureMode = FlagValue;

/** The key suffix of a closure recorded with shape closures. */
export const SHAPE_KEY_SUFFIX = '@shape';

/** What one closure digest was computed from. */
export interface ClosureRecord {
  /** `R`: the program files the query's semantic channels touched, sorted. */
  readonly files: readonly string[];
  /** The classes whose derived-class list the query read, sorted. */
  readonly derived: readonly string[];
  /**
   * Shape closures in `verify` mode: per closure key, the closure's digest with type closures only
   * when that query last recorded this digest (queries with equal footprints share a record).
   */
  readonly wide?: Readonly<Record<string, string>>;
  /**
   * Set only on a record the service hands to the persistent store (`closureRecord`): the file
   * order of the program it holds on, which the store keeps as the seeded records' order.
   */
  readonly order?: readonly string[];
}

/**
 * Closure records by digest, handed from one generation of a runtime to the next, with the file
 * order of the program they were refreshed on ({@link programOrder}).
 */
export type ClosureStore = ReadonlyMap<string, ClosureRecord> & {
  readonly order?: readonly string[];
};

/** Previous records are carried while the store stays within this factor of the live records. */
const CARRY_FACTOR = 4;
const CARRY_MINIMUM = 5_000;

export class SemanticClosures {
  /** Whether queries record closures (a scoped development generation). */
  enabled = false;
  private previous: ClosureStore = new Map();
  /** Whether the previous records' program and the current one order every common file alike. */
  private ordered?: boolean;
  private current = new Map<string, ClosureRecord>();
  /** The whole-program digest of the previous candidate's program. */
  private base?: string;
  /** Digests whose record came from the persistent store in this generation (see `seed`). */
  private seeded = new Set<string>();
  /** `verify`: the closures (`key` and digest) that held only by their shapes in this generation. */
  private readonly narrowedClosures = new Set<string>();

  constructor(private readonly shape: ShapeClosureMode = 'on') {}

  /** Starts a generation: its mode, and the records of the generation it continues. */
  start(enabled: boolean, previous: ClosureStore | undefined): void {
    this.enabled = enabled;
    this.previous = previous ?? new Map();
    this.ordered = undefined;
    this.current = new Map();
    this.base = undefined;
    this.seeded = new Set();
    this.narrowedClosures.clear();
  }

  /**
   * Seeds a generation that carries no records of its runtime with the records of the persistent
   * store (`load` is called only then). They are used as the carried records are: each is checked
   * when it is used, and the next generation carries it.
   */
  seed(load: () => ClosureStore): void {
    if (!this.enabled || this.previous.size) return;
    const store = load();
    if (!store.size) return;
    this.previous = store;
    this.ordered = undefined;
    this.seeded = new Set(store.keys());
  }

  /** The record of a closure digest, recorded, refreshed or carried in this generation. */
  recorded(digest: string): ClosureRecord | undefined {
    return this.current.get(digest) ?? this.previous.get(digest);
  }

  /** The whole-program `semantic` digest of the previous candidate (from its aggregate artifact). */
  setBase(digest: string | undefined): void {
    this.base = digest;
  }

  /**
   * The closure dependency of one query, or undefined when its footprint cannot state one (the
   * caller then records the global reference).
   */
  record(
    state: Snapshot,
    key: string,
    footprint: Footprint,
  ): SemanticClosureDependency | undefined {
    const scopeId = state.observations.semantic?.scopeId;
    if (!scopeId) return undefined;
    const files = footprint.files;
    const derived = footprint.derived ?? [];
    const recorded = this.shape === 'off' ? key : `${key}${SHAPE_KEY_SUFFIX}`;
    let record: ClosureRecord = { files, derived };
    const digest = digestOf(state, record, this.shape !== 'off');
    if (this.shape === 'verify') {
      const earlier = this.current.get(digest) ?? this.previous.get(digest);
      record = {
        ...record,
        wide: { ...earlier?.wide, [recorded]: digestOf(state, record, false) },
      };
    }
    this.current.set(digest, record);
    return { kind: 'semantic-closure', scopeId, key: recorded, digest };
  }

  /**
   * The current digest of a recorded closure, or undefined when it cannot be recomputed (no
   * record, and a program other than the previous candidate's).
   */
  refresh(state: Snapshot, dependency: SemanticClosureDependency): string | undefined {
    const program = state.observations.semantic;
    if (!program || dependency.scopeId !== program.scopeId) return undefined;
    // A closure of the other mode: its digest is another formula's.
    if (dependency.key.endsWith(SHAPE_KEY_SUFFIX) !== (this.shape !== 'off')) return undefined;
    // Two files that swapped places since the previous records' program may reorder any union
    // (`stableTypeOrdering`): no closure recorded before states its output any more, whatever its
    // digest (a query of this generation may record the same digest on the new order). Records
    // without an order are treated the same, unless the program equals the previous candidate's
    // (the program the records held on, so the same order).
    this.ordered ??=
      this.previous.order !== undefined &&
      sameRelativeOrder(this.previous.order, programOrder(state));
    if (!this.ordered && !this.holds(state)) return undefined;
    const record = this.current.get(dependency.digest) ?? this.previous.get(dependency.digest);
    // A stored record is not recomputed while the program is the previous candidate's (the closure
    // holds): it is carried, and checked when a later program uses it. Shape closures in `verify`
    // mode recompute it below, so that its type-closure digest is checked as a carried record's.
    if (
      record &&
      this.shape !== 'verify' &&
      this.seeded.has(dependency.digest) &&
      this.holds(state)
    ) {
      this.current.set(dependency.digest, record);
      return dependency.digest;
    }
    if (record) {
      const digest = digestOf(state, record, this.shape !== 'off');
      if (digest === dependency.digest) {
        this.current.set(digest, record);
        // `verify`: a type-closure digest that changed, or that the record does not know for this
        // query (carried from a generation that did not keep one), cannot rule out narrowing.
        const wide = record.wide?.[dependency.key];
        if (
          this.shape === 'verify' &&
          (wide === undefined || digestOf(state, record, false) !== wide)
        )
          this.narrowedClosures.add(narrowedKey(dependency));
      }
      return digest;
    }
    return this.holds(state) ? dependency.digest : undefined;
  }

  /**
   * `verify`: whether the closure held in this generation only by its shapes (its type closures
   * changed), so the content reused on it is rendered again and compared.
   */
  narrowed(dependency: SemanticClosureDependency): boolean {
    return this.narrowedClosures.has(narrowedKey(dependency));
  }

  /** Whether the program equals the previous candidate's, so every recorded closure holds. */
  holds(state: Snapshot | undefined): boolean {
    const program = state?.observations.semantic;
    return !!program && this.base !== undefined && this.base === program.digest;
  }

  /**
   * The records the next generation of this runtime refreshes against, with the file order of
   * `state`'s program (the one they hold on); without it the next generation cannot use them.
   */
  retained(state?: Pick<Snapshot, 'project'>): ClosureStore {
    const store = new Map(this.current);
    const limit = Math.max(CARRY_FACTOR * store.size, CARRY_MINIMUM);
    if (this.ordered !== false && store.size + this.previous.size <= limit)
      for (const [digest, record] of this.previous)
        if (!store.has(digest)) store.set(digest, record);
    return state ? Object.assign(store, { order: programOrder(state) }) : store;
  }
}

const orders = new WeakMap<object, readonly string[]>();

/**
 * The file order of the snapshot's current program: its source file names in program order, one
 * array per program. A program the patch or a restructuring re-created is a new program.
 */
export function programOrder(state: Pick<Snapshot, 'project'>): readonly string[] {
  const program = state.project.getProgram().compilerObject;
  let order = orders.get(program);
  if (!order) {
    order = program.getSourceFiles().map((source) => source.fileName);
    orders.set(program, order);
  }
  return order;
}

/**
 * Whether every pair of files that both orders contain is in the same relative order in both:
 * files added or removed reorder nothing, two surviving files that swapped places do.
 */
export function sameRelativeOrder(before: readonly string[], after: readonly string[]): boolean {
  if (before === after) return true;
  const positions = new Map(after.map((file, index) => [file, index]));
  let last = -1;
  for (const file of before) {
    const position = positions.get(file);
    if (position === undefined) continue;
    if (position < last) return false;
    last = position;
  }
  return true;
}

function digestOf(state: Snapshot, record: ClosureRecord, shape: boolean): string {
  return programIndex(state.project, observationsDigest(state.observations)).closure(
    record.files,
    record.derived,
    shape,
  );
}

const narrowedKey = (dependency: SemanticClosureDependency): string =>
  `${dependency.key}\0${dependency.digest}`;

const observationDigests = new WeakMap<ProgramObservations, string>();

/**
 * The program's global observations that no per-file fact covers: the tsconfig reads, the
 * formatter probes and the type-directive probes. Glob memberships and the content of program
 * files are left out: a file joining the program changes no other file's types unless it has a
 * global effect (then `env` has its content), and enumeration and derived lists are recomputed.
 */
function observationsDigest(observations: ProgramObservations): string {
  let digest = observationDigests.get(observations);
  if (digest === undefined) {
    const program = new Set(observations.importers());
    const kept = observations
      .global()
      .filter(
        (dependency: Dependency) =>
          dependency.kind !== 'glob' &&
          !(
            (dependency.kind === 'content' || dependency.kind === 'existence') &&
            program.has(dependency.path)
          ),
      );
    digest = valueDigest(kept);
    observationDigests.set(observations, digest);
  }
  return digest;
}

/** The whole-program `semantic` digest recorded by a candidate's aggregate artifact. */
export function programDigestOf(
  artifacts: ReadonlyArray<{ identity: { role: string }; dependencies: Dependency[] }>,
): string | undefined {
  const aggregate = artifacts.find((artifact) => artifact.identity.role === 'aggregate');
  const definition = aggregate?.dependencies.find((dependency) => dependency.kind === 'semantic');
  return definition?.kind === 'semantic' ? definition.digest : undefined;
}
