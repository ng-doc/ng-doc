import type {
  CompilationContext,
  CompilationRequest,
  CompilationRetention,
  FileChange,
  RetainedCompilation,
  RetainedSemanticState,
  SemanticProgramRetention,
  SemanticProgramSynchronization,
  SemanticRetentionRequest,
} from '../contracts';
import type { UnitIndex } from '../graph/unit-index';
import {
  flagOff,
  INCREMENTAL_PROGRAM_FLAG,
  INCREMENTAL_SKIP_FLAG,
  readFlag,
} from '../kernel/flags';
import type { IncrementalProgramMode, SynchronizationPath } from '../semantic/semantic-service';
import { hash } from './common';
import type { CompilationOptions } from './index';
import type { RetainedBuild } from './targeted';

/**
 * Kill switch for the retained-program skip only: `0`, `false`, `off` or `no` in the compiler
 * runtime's environment (the worker inherits the host's) makes every development generation
 * synchronize its program from scratch and retain nothing. Exact incremental reuse
 * (`incrementalReuse`) is unaffected.
 */
export const INCREMENTAL_SKIP_ENV = INCREMENTAL_SKIP_FLAG;

/**
 * Kill switch of the incremental program (`NGDOC_INCREMENTAL_PROGRAM`): `0`, `false`, `off` or `no`
 * make a development generation synchronize its program anew after any program-file edit, as
 * before patching existed; `verify` checks every patch against a cold synchronization. Read in the
 * compiler runtime's environment (the worker inherits the host's).
 */
export const INCREMENTAL_PROGRAM_ENV = INCREMENTAL_PROGRAM_FLAG;

/** The switch as the process sets it: the option first, then `NGDOC_INCREMENTAL_PROGRAM`. */
export function incrementalProgramMode(options: CompilationOptions): IncrementalProgramMode {
  if (options.incrementalProgram === false) return 'off';
  const value = readFlag(INCREMENTAL_PROGRAM_ENV).value;
  return value === 'off' ? 'off' : options.incrementalProgram === 'verify' ? 'verify' : value;
}

/**
 * The program a development generation retains for the next one: valid only for the base revision
 * it produced, so the next generation may use it only when its request's previous snapshot is
 * exactly that candidate (the caller committed it). It is keyed by the compiler options as well, so
 * another project or configuration never reuses it.
 */
export interface RetainedGeneration extends RetainedCompilation {
  key: string;
  base: string;
  semantic: RetainedSemanticState;
  /**
   * The reverse index of this base's build (graph/unit-index.ts): built at the end of a
   * generation that returned the candidate `base`, while the targeted rebuild is on. It follows
   * the entry's committed/working lifetime, beside the program.
   */
  index?: UnitIndex;
  /** The per-unit records a targeted generation replays for the units it does not rebuild. */
  build?: RetainedBuild;
  /**
   * The changes of every generation against this base that did not commit (failed, aborted or
   * discarded). A targeted generation adds them to its own changes before it skips anything: a
   * full generation re-reads every input, a targeted one only what its changes reach. Each
   * restore appends to a new entry's list; the entry of the next committed candidate starts empty.
   */
  pending?: readonly FileChange[];
}

/** What a compile may use from the committed entry for its base. */
export interface CommittedGeneration {
  index: UnitIndex;
  build?: RetainedBuild;
  pending: readonly FileChange[];
}

const isRetainedGeneration = (
  entry: RetainedCompilation | undefined,
): entry is RetainedGeneration => entry !== undefined && 'semantic' in entry;

export interface IncrementalRetentionReport {
  /**
   * Generations that reused / rebuilt the program, promoted / restored a retained program, or
   * discarded one. `promoted` counts the offers of a candidate's program: with an in-process
   * slot or a `compile-end` handle that commits it, with an `acknowledged` handle (a delta
   * compile) it becomes the working entry, which the caller's acknowledgement may still drop (the
   * runtime slot's own `promoted` counts only the promotions). `restored` counts the committed
   * entries handed back, also those restored beside a working entry.
   */
  counters: {
    reused: number;
    rebuilt: number;
    promoted: number;
    restored: number;
    discarded: number;
  };
  /** The retained program's base revision, if one is held. */
  retained?: { base: string };
  /**
   * A long-lived runtime's retained candidate program awaiting the commit's acknowledgement;
   * never present for the in-process slot.
   */
  working?: { base: string };
  /**
   * The last retaining generation: how its program was obtained, and why a retained one was
   * discarded. When it found no committed entry because an earlier generation invalidated it,
   * `discarded` says so (`invalidated: consumed`, `invalidated: mutated`, …) instead of looking
   * like a cold start, so a rebuild can always be explained; a fresh slot reports no reason.
   */
  last?: { synchronization?: SynchronizationPath; discarded?: string };
}

/**
 * The in-process slot: used by every compile whose context brings no slot of its own (tests,
 * in-process hosts, the reference path). A persistent development worker's compiler module lives as
 * long as its runtime, but that runtime passes its own slot (`CompilationContext.retention`,
 * worker/protocol.ts), which promotes on the commit's acknowledgement. This one needs no
 * acknowledgement: one entry, the offer of a returned candidate is committed at once, and there is
 * never a working entry.
 */
function createProcessRetention(): CompilationRetention & { reset(): void } {
  let retainedGeneration: RetainedCompilation | undefined;
  let invalidated: string | undefined;
  const commit = (entry: RetainedCompilation): void => {
    retainedGeneration = entry;
    invalidated = undefined;
  };
  return {
    take() {
      const entry = retainedGeneration;
      retainedGeneration = undefined;
      return entry;
    },
    offer: commit,
    restore(entry: RetainedCompilation) {
      if (retainedGeneration) return false;
      commit(entry);
      return true;
    },
    invalidate(reason: string) {
      if (!retainedGeneration) invalidated = reason;
    },
    held: () =>
      retainedGeneration
        ? { committed: retainedGeneration.base }
        : invalidated !== undefined
          ? { invalidated }
          : {},
    reset() {
      retainedGeneration = undefined;
      invalidated = undefined;
    },
  };
}

/** The in-process slot of this runtime. */
export const processRetention = createProcessRetention();

/**
 * What the retained-program skip did in this runtime, whichever slot served it: the counters and
 * the last generation are per process; `retained` (and `working`) describe the slot the last
 * retaining generation used.
 */
const statistics: Required<Pick<IncrementalRetentionReport, 'counters'>> &
  Pick<IncrementalRetentionReport, 'last'> = {
  counters: { reused: 0, rebuilt: 0, promoted: 0, restored: 0, discarded: 0 },
};
let reported: CompilationRetention = processRetention;

/** Instrumentation and tests: what the retained-program skip did in this runtime. */
export function incrementalRetention(): IncrementalRetentionReport {
  const held = reported.held();
  return structuredClone({
    counters: statistics.counters,
    ...(held.committed !== undefined ? { retained: { base: held.committed } } : {}),
    ...(held.working !== undefined ? { working: { base: held.working } } : {}),
    ...(statistics.last ? { last: statistics.last } : {}),
  });
}

/** Drops the in-process retained program and resets the counters (tests). */
export function resetIncrementalRetention(): void {
  processRetention.reset();
  reported = processRetention;
  statistics.counters = { reused: 0, rebuilt: 0, promoted: 0, restored: 0, discarded: 0 };
  statistics.last = undefined;
}

/**
 * One compile's use of a retention slot (its context's, or the in-process one): takes the
 * committed entry when the compile starts, decides whether the semantic service may reuse its
 * program, offers the program of a returned candidate, and restores the taken entry only when its
 * program is still intact. The slot decides where an offer goes (committed at once, or a working
 * entry promoted on the commit's acknowledgement).
 */
export class GenerationRetention {
  /**
   * Retained-program skip: development generations of a long-lived runtime only. Production,
   * one-shot builds and the reference path neither use nor keep a program.
   */
  readonly retaining: boolean;
  private readonly key: string;
  private readonly port: CompilationRetention;
  private taken: RetainedGeneration | undefined;
  private takenBase: string | undefined;
  /** The index, build and pending changes of the taken entry, kept to restore it with its program. */
  private takenIndex: UnitIndex | undefined;
  private takenBuild: RetainedBuild | undefined;
  private takenPending: readonly FileChange[] = [];
  /** Whether this generation took an entry of this compiler from the slot. */
  private tookEntry = false;
  /** Why the slot held no usable entry for this generation (another compile invalidated it). */
  private invalidated: string | undefined;
  private reusedProgram = false;
  /**
   * The taken program was patched in place: it now describes this generation's tree, not the
   * taken entry's base, so it is offered only for this generation's candidate and never restored.
   */
  private patched = false;
  /** A `patched-failed` synchronization's taken program, restored as the same object. */
  private handedBack: RetainedSemanticState | undefined;
  private discarded: string | undefined;

  constructor(
    options: CompilationOptions,
    request: CompilationRequest,
    context: CompilationContext | undefined,
  ) {
    this.retaining =
      options.incrementalReuse !== false &&
      request.mode === 'development' &&
      context?.lifetime !== 'generation' &&
      !flagOff(INCREMENTAL_SKIP_ENV);
    this.key = this.retaining
      ? hash({
          projectId: options.projectId,
          workspaceRoot: options.workspaceRoot,
          configFile: options.configFile ?? null,
          defaults: options.defaults,
          discovery: options.discovery ?? null,
          templateRoot: options.templateRoot ?? null,
          compilerVersion: options.compilerVersion,
          toolchainDigest: options.toolchainDigest,
        })
      : '';
    this.port = context?.retention ?? processRetention;
    if (!this.retaining) return;
    reported = this.port;
    // The committed entry is taken for the whole generation, so no other compile can share the
    // Project. An entry this compiler did not make is never used.
    const entry = this.port.take();
    this.taken = isRetainedGeneration(entry) ? entry : undefined;
    this.tookEntry = this.taken !== undefined;
    this.takenIndex = this.taken?.index;
    this.takenBuild = this.taken?.build;
    this.takenPending = this.taken?.pending ?? [];
    if (entry === undefined) this.invalidated = this.port.held().invalidated;
    else if (!this.taken) this.invalidated = 'not made by this compiler';
  }

  /**
   * The committed entry's index when this generation may use it: the entry was
   * built under the same compiler options for exactly the request's previous revision. The same
   * conditions as the program's reuse, checked before discovery.
   */
  committedIndex(request: CompilationRequest, projectId: string): UnitIndex | undefined {
    return this.committed(request, projectId)?.index;
  }

  /** The committed entry's index, build and pending changes, under {@link committedIndex}'s rule. */
  committed(request: CompilationRequest, projectId: string): CommittedGeneration | undefined {
    const taken = this.taken;
    if (!taken?.index || taken.key !== this.key) return undefined;
    if (request.previous?.projectId !== projectId) return undefined;
    if (taken.base !== request.previous.revision) return undefined;
    return {
      index: taken.index,
      ...(taken.build ? { build: taken.build } : {}),
      pending: taken.pending ?? [],
    };
  }

  /** After discovery: the retention request for `synchronize`, or `undefined` when not retaining. */
  semanticRetention(
    request: CompilationRequest,
    projectId: string,
  ): SemanticRetentionRequest | undefined {
    if (!this.retaining) return undefined;
    const taken = this.taken;
    if (taken) {
      this.discarded =
        taken.key !== this.key
          ? 'retained for other compiler options'
          : request.previous?.projectId !== projectId
            ? 'no previous snapshot of this project'
            : taken.base !== request.previous.revision
              ? 'previous snapshot is not the retained base revision'
              : request.contentRequest?.origin === 'reconcile'
                ? 'reconcile generation (watcher rescan)'
                : undefined;
    }
    if (this.discarded) statistics.counters.discarded += 1;
    const retention: SemanticRetentionRequest =
      taken && !this.discarded ? { previous: taken.semantic } : {};
    if (taken && !this.discarded) this.takenBase = taken.base;
    else {
      this.takenIndex = undefined;
      this.takenBuild = undefined;
      this.takenPending = [];
    }
    // From here the retained program is referenced only through the request, so a stale
    // one can be collected while its replacement is built.
    this.taken = undefined;
    return retention;
  }

  /**
   * After `synchronize`: how the program was obtained (`synchronization`, for the report) and what
   * the retention port says happened to the taken program (`outcome`). A `reused` or `patched`
   * program is kept through `retain()`; a `patched-failed` one is kept as the object handed back,
   * since the failed synchronization leaves nothing to retain. A `patched` program is the
   * candidate's only: it is never restored for the taken base.
   */
  synchronized(
    synchronization: SynchronizationPath | undefined,
    outcome: SemanticProgramSynchronization | undefined,
  ): void {
    if (!this.retaining) return;
    this.handedBack = outcome?.outcome === 'patched-failed' ? outcome.handedBack : undefined;
    this.patched = outcome?.outcome === 'patched';
    this.reusedProgram =
      outcome?.outcome === 'reused' ||
      outcome?.outcome === 'patched' ||
      this.handedBack !== undefined;
    if (!this.reusedProgram && this.takenBase !== undefined) {
      this.discarded =
        synchronization?.path === 'full' ? synchronization.reason : 'synchronization failed';
      statistics.counters.discarded += 1;
    }
    statistics.counters[this.reusedProgram ? 'reused' : 'rebuilt'] += 1;
    const discarded =
      this.discarded ??
      (this.invalidated !== undefined ? `invalidated: ${this.invalidated}` : undefined);
    statistics.last = {
      ...(synchronization ? { synchronization } : {}),
      ...(discarded ? { discarded } : {}),
    };
  }

  /**
   * When the compile ends. Offers the program of a returned candidate for exactly that revision
   * (with `index`, the reverse index of that candidate, when the dry run built one), and restores
   * the taken entry for its unchanged base only if this generation reused its program and the
   * program is still retainable. Every other taken entry is dropped here, which is how the
   * slot's committed entry is invalidated (a consumed or mutated Project must never serve the
   * next generation, whether or not this generation's commit is acknowledged); the slot is told
   * why:
   *
   * - `consumed`: a full synchronize released the program and built a replacement (or
   *   synchronize failed);
   * - `mutated`: a query added source files, so `retain()` refuses the program, and the
   *   generation offers no candidate entry either (the committed and working entries would share
   *   that Project);
   * - `patched`: the program was patched in place for this generation's tree, so it is offered
   *   for its candidate only (and dropped when there is none): kept for the taken base as well, a
   *   later generation against that base would take a program of another tree as its own;
   * - `ended before synchronize`: its changes were never checked (for example a discovery error);
   * - `not usable (…)`: it was for other compiler options or another base.
   *
   * The in-process slot holds the offer already, so it restores nothing when a candidate was
   * returned; a slot that waits for the acknowledgement restores the committed entry beside its
   * working one.
   */
  finish(
    retain: SemanticProgramRetention['retain'],
    promotedRevision: string | undefined,
    next: { index?: UnitIndex; build?: RetainedBuild } = {},
    changes: readonly FileChange[] = [],
  ): void {
    if (!this.retaining) return;
    let invalidated: string | undefined;
    if (this.taken) {
      // Ended before synchronize (for example a discovery error): the retained program was
      // never checked against this generation's changes, so it cannot be kept.
      statistics.counters.discarded += 1;
      statistics.last = { discarded: 'generation ended before synchronize' };
      this.taken = undefined;
      invalidated = 'ended before synchronize';
    } else if (this.tookEntry && this.takenBase === undefined) {
      invalidated = `not usable (${this.discarded})`;
    }
    const program = this.handedBack ?? retain();
    const restorable =
      program !== undefined && this.reusedProgram && !this.patched && this.takenBase !== undefined;
    if (this.takenBase !== undefined && !restorable)
      invalidated = this.patched ? 'patched' : this.reusedProgram ? 'mutated' : 'consumed';
    if (invalidated !== undefined) this.port.invalidate?.(invalidated);
    const entry = (
      base: string,
      semantic: RetainedSemanticState,
      unitIndex: UnitIndex | undefined,
      build: RetainedBuild | undefined,
      pending: readonly FileChange[],
    ): RetainedGeneration => ({
      key: this.key,
      base,
      semantic,
      ...(unitIndex ? { index: unitIndex } : {}),
      ...(build ? { build } : {}),
      ...(pending.length ? { pending } : {}),
    });
    if (program && promotedRevision !== undefined) {
      this.port.offer(entry(promotedRevision, program, next.index, next.build, []));
      statistics.counters.promoted += 1;
    }
    // The committed entry is handed back with this generation's changes: if its candidate is not
    // committed, the next generation against the same base still sees them.
    if (
      restorable &&
      this.port.restore(
        entry(this.takenBase!, program!, this.takenIndex, this.takenBuild, [
          ...this.takenPending,
          ...changes,
        ]),
      )
    )
      statistics.counters.restored += 1;
  }
}
