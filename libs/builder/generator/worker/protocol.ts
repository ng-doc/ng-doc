import type {
  ArtifactSnapshot,
  CompilationProgressUpdate,
  CompilationResult,
  CompilationRetention,
  PageArtifact,
  RetainedCompilation,
} from '../contracts';

/** Strings are the only worker messages; executable and native objects cannot cross this port. */
export function encode(value: unknown): string {
  const result = JSON.stringify(
    value,
    function (this: Record<string, unknown>, key: string, item: unknown) {
      const original = this[key];
      if (
        typeof item === 'function' ||
        typeof item === 'symbol' ||
        typeof item === 'bigint' ||
        (typeof item === 'number' && !Number.isFinite(item)) ||
        (original !== null &&
          typeof original === 'object' &&
          !Array.isArray(original) &&
          ((Object.getPrototypeOf(original) !== Object.prototype &&
            Object.getPrototypeOf(original) !== null) ||
            typeof (original as { toJSON?: unknown }).toJSON === 'function'))
      )
        throw new Error('Worker transport requires JSON values');
      return item;
    },
  );
  if (result === undefined) throw new Error('Worker transport requires a JSON value');
  return result;
}

export function decode(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') throw new Error('Worker message must be JSON text');
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Worker message must be an object');
  }
  return parsed as Record<string, unknown>;
}

export function resultFrom(value: unknown): CompilationResult {
  if (value === null || typeof value !== 'object') throw new Error('Invalid compilation result');
  const result = value as CompilationResult;
  if (
    !Array.isArray(result.dependencies) ||
    !Array.isArray(result.diagnostics) ||
    !Array.isArray(result.whyRebuilt) ||
    (result.candidate !== undefined &&
      (result.candidate === null ||
        typeof result.candidate !== 'object' ||
        !Array.isArray(result.candidate.artifacts)))
  ) {
    throw new Error('Invalid compilation result');
  }
  return result;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A candidate snapshot as a patch of the snapshot it was compiled from.
 *
 * `keys` lists the candidate's keys in order (object keys whose value is not `undefined`, as JSON
 * keeps them); a key is taken from `set` when present there, otherwise from the base object, so a
 * patched object has exactly the candidate's keys, order and JSON values. `artifacts` is always
 * rebuilt from the entries. Every other top-level key of the snapshot is always in `set`: they are
 * small, and the snapshot revision does not cover all of them (`globalKeywords`, `remoteKeywords`),
 * so they must never be taken from a base that only matches by revision.
 */
export interface SnapshotDelta {
  /** Revision of the base snapshot; `null` for an empty base (no previous snapshot). */
  base: string | null;
  keys: string[];
  set: Record<string, unknown>;
  artifacts: DeltaArtifact[];
}

/**
 * An artifact of the candidate, in candidate order: without `keys`, the base artifact with this id
 * and revision (artifact revisions are content hashes, and the compiler keeps the previous revision
 * only for a value-equal artifact); with `keys`, a changed artifact whose unlisted keys are copied
 * from the base artifact with this id.
 */
export type DeltaArtifact =
  | { id: string; revision: string }
  | { id: string; revision: string; keys: string[]; set: Record<string, unknown> };

/**
 * Up to this many changed artifacts are also diffed key by key against their base artifact (an
 * edit usually changes the aggregate's search index but not its program dependencies). Above it,
 * changed artifacts are sent whole, so a large delta costs no comparison.
 */
export const FIELD_LEVEL_LIMIT = 16;

function sameJson(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function fields(
  value: object,
  base: object | undefined,
  skip?: string,
): { keys: string[]; set: Record<string, unknown> } {
  const record = value as Record<string, unknown>;
  const previous = base as Record<string, unknown> | undefined;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined);
  const set: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === skip) continue;
    if (!previous || !Object.hasOwn(previous, key) || !sameJson(record[key], previous[key]))
      set[key] = record[key];
  }
  return { keys, set };
}

/** The candidate as a delta of `base` (the snapshot it was compiled from). */
export function snapshotDelta(
  base: ArtifactSnapshot | undefined,
  candidate: ArtifactSnapshot,
): SnapshotDelta {
  const previous = new Map((base?.artifacts ?? []).map((artifact) => [artifact.id, artifact]));
  const unchanged = (artifact: PageArtifact) =>
    previous.get(artifact.id)?.revision === artifact.revision;
  const fieldLevel =
    candidate.artifacts.filter((artifact) => !unchanged(artifact)).length <= FIELD_LEVEL_LIMIT;
  return {
    base: base?.revision ?? null,
    ...fields(candidate, undefined, 'artifacts'),
    artifacts: candidate.artifacts.map((artifact) =>
      unchanged(artifact)
        ? { id: artifact.id, revision: artifact.revision }
        : {
            id: artifact.id,
            revision: artifact.revision,
            ...fields(artifact, fieldLevel ? previous.get(artifact.id) : undefined),
          },
    ),
  };
}

function object(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid snapshot delta: ${what}`);
  return value as Record<string, unknown>;
}

function strings(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error(`Invalid snapshot delta: ${what}`);
  return value as string[];
}

function assemble(
  keys: string[],
  set: Record<string, unknown>,
  base: Record<string, unknown> | undefined,
  what: string,
  artifacts?: PageArtifact[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === '__proto__' || Object.hasOwn(result, key))
      throw new Error(`Invalid snapshot delta: ${what} key ${key}`);
    if (artifacts && key === 'artifacts') result[key] = artifacts;
    else if (Object.hasOwn(set, key)) result[key] = set[key];
    else if (base && Object.hasOwn(base, key)) result[key] = base[key];
    else throw new Error(`Invalid snapshot delta: ${what} has no base value for ${key}`);
  }
  return result;
}

/**
 * Rebuilds the candidate from `base` and a (JSON-decoded) delta. Both processes run exactly this
 * function on equal bases, so the host's patched candidate and the runtime's retained working
 * snapshot are equal by construction. Unchanged artifacts are the base's own objects. Any
 * inconsistency throws; callers then fall back to the full transport.
 */
export function applySnapshotDelta(
  base: ArtifactSnapshot | undefined,
  value: unknown,
): ArtifactSnapshot {
  const delta = object(value, 'delta');
  if (delta['base'] !== (base?.revision ?? null))
    throw new Error(
      `Invalid snapshot delta: base ${String(delta['base'])} is not ${String(base?.revision ?? null)}`,
    );
  const previous = new Map<string, PageArtifact>();
  for (const artifact of base?.artifacts ?? []) {
    if (previous.has(artifact.id))
      throw new Error(`Invalid snapshot delta: duplicate base artifact ${artifact.id}`);
    previous.set(artifact.id, artifact);
  }
  if (!Array.isArray(delta['artifacts'])) throw new Error('Invalid snapshot delta: artifacts');
  const seen = new Set<string>();
  const artifacts = delta['artifacts'].map((item: unknown): PageArtifact => {
    const entry = object(item, 'artifact entry');
    const id = entry['id'];
    const revision = entry['revision'];
    if (typeof id !== 'string' || typeof revision !== 'string' || seen.has(id))
      throw new Error(`Invalid snapshot delta: artifact ${String(id)}`);
    seen.add(id);
    const old = previous.get(id);
    if (!('keys' in entry)) {
      if (!old || old.revision !== revision)
        throw new Error(`Invalid snapshot delta: no base artifact ${id} at ${revision}`);
      return old;
    }
    const artifact = assemble(
      strings(entry['keys'], `artifact ${id} keys`),
      object(entry['set'], `artifact ${id} values`),
      old as unknown as Record<string, unknown> | undefined,
      `artifact ${id}`,
    );
    if (artifact['id'] !== id || artifact['revision'] !== revision)
      throw new Error(`Invalid snapshot delta: artifact ${id} identity`);
    return artifact as unknown as PageArtifact;
  });
  const keys = strings(delta['keys'], 'snapshot keys');
  if (!keys.includes('artifacts')) throw new Error('Invalid snapshot delta: snapshot artifacts');
  const snapshot = assemble(
    keys,
    object(delta['set'], 'snapshot values'),
    base as unknown as Record<string, unknown> | undefined,
    'snapshot',
    artifacts,
  );
  if (typeof snapshot['revision'] !== 'string' || typeof snapshot['projectId'] !== 'string')
    throw new Error('Invalid snapshot delta: snapshot identity');
  return snapshot as unknown as ArtifactSnapshot;
}

/** Freezes a JSON value in place (the delta transport's verification mode). */
export function deepFreeze<T>(value: T): T {
  const pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (item === null || typeof item !== 'object' || Object.isFrozen(item)) continue;
    Object.freeze(item);
    for (const child of Object.values(item)) pending.push(child);
  }
  return value;
}

/**
 * How a runtime's retention slot keeps the entry a compile offers for its candidate: `acknowledged`
 * (a delta compile: the working entry, promoted only by the caller's commit acknowledgement) or
 * `compile-end` (committed at once: warm-ups, full-transport compiles and full-candidate retries,
 * which no acknowledgement follows).
 */
export type RetentionPromotion = 'acknowledged' | 'compile-end';

/** A runtime slot's state and counters (instrumentation and tests). */
export interface RuntimeRetentionState {
  committed: string | null;
  working: string | null;
  /** While no committed entry is held: why the last one was invalidated, if known. */
  invalidated: string | null;
  /** Offers kept as working entries / working entries promoted / working entries dropped unpromoted. */
  counters: { offered: number; promoted: number; dropped: number };
}

/**
 * The retention slot a long-lived runtime owns (see below). A compile never sees the slot itself:
 * it gets a handle from `serve`, which exposes only the {@link CompilationRetention} operations.
 */
export interface RuntimeRetention {
  /**
   * Before a compile: a handle for that compile only, to pass in its context. Its offers are kept
   * as `promotion` says, whatever other handles were served since: further compiles in one
   * runtime (a verifying full compile, an idle confirmation) must never change where another
   * compile's offer goes. The handle cannot promote, resync or change any policy.
   */
  serve(promotion: RetentionPromotion): CompilationRetention;
  /**
   * A compile message: the working entry becomes the committed one when the message promotes
   * exactly its revision (`promote`, sent only after the caller acknowledged that commit); any
   * other working entry is dropped.
   */
  promote(revision: unknown): void;
  /**
   * A resync to `base`: the working entry for exactly that revision becomes the committed one, any
   * other is dropped. The host resyncs only to its caller's committed snapshot, so that revision
   * was committed; this keeps the retained program when the identity rule forces a resync for a
   * same-revision snapshot object the runtime did not return.
   */
  resync(base: unknown): void;
  inspect(): RuntimeRetentionState;
}

/**
 * The retention slot of a long-lived development runtime. It holds a **committed** entry, valid for
 * the base the runtime's caller committed, and a **working** entry for the candidate of the last
 * delta compile, and follows exactly the messages that move the runtime's snapshots: `promote` and
 * `resync` promote or drop the working entry; a compile takes the committed entry for its whole run
 * and restores it only when its program is still intact.
 *
 * Copy-on-write: an offer never changes the committed entry. The two entries may share a program
 * that the working generation only read; a generation that consumed the committed program (a
 * full rebuild) or mutated it (added source files) restores nothing and offers nothing that shares
 * it, so both entries are invalid and the next generation rebuilds. The slot keeps why
 * (`invalidate`) until it holds a committed entry again; a working entry dropped while none is
 * held records `dropped unacknowledged` unless an earlier reason is already kept.
 */
export function createRuntimeRetention(): RuntimeRetention {
  let committed: RetainedCompilation | undefined;
  let working: RetainedCompilation | undefined;
  let invalidated: string | undefined;
  const counters = { offered: 0, promoted: 0, dropped: 0 };
  const commit = (entry: RetainedCompilation): void => {
    committed = entry;
    invalidated = undefined;
  };
  const settle = (revision: unknown): void => {
    if (working !== undefined && working.base === revision) {
      commit(working);
      counters.promoted++;
    } else if (working !== undefined) {
      counters.dropped++;
      if (!committed) invalidated ??= 'dropped unacknowledged';
    }
    working = undefined;
  };
  return {
    serve(promotion: RetentionPromotion): CompilationRetention {
      return Object.freeze({
        take() {
          const entry = committed;
          committed = undefined;
          return entry;
        },
        offer(entry: RetainedCompilation) {
          if (promotion === 'compile-end') {
            commit(entry);
            return;
          }
          working = entry;
          counters.offered++;
        },
        restore(entry: RetainedCompilation) {
          if (committed) return false;
          commit(entry);
          return true;
        },
        invalidate(reason: string) {
          if (!committed) invalidated = reason;
        },
        held: () => ({
          ...(committed ? { committed: committed.base } : {}),
          ...(working ? { working: working.base } : {}),
          ...(!committed && invalidated !== undefined ? { invalidated } : {}),
        }),
      });
    },
    promote: settle,
    resync: settle,
    inspect: () => ({
      committed: committed?.base ?? null,
      working: working?.base ?? null,
      invalidated: committed ? null : invalidated ?? null,
      counters: { ...counters },
    }),
  };
}

/**
 * Progress transport (advisory: it never changes a result). A compile message with
 * `progress: true` asks the runtime for `{ type: 'progress', id, update }` messages, sent before
 * the compile's reply on the same channel. Updates are JSON like every other message. `start`
 * and `end` go out at once; `advance` updates are coalesced to at most one per
 * {@link PROGRESS_INTERVAL_MS}, the latest winning, so a per-unit loop costs a few messages a
 * second whatever its size.
 */
export const PROGRESS_INTERVAL_MS = 100;

/** The runtime side: a sink for the compiler's updates that sends them, throttled. */
export interface ProgressChannel {
  sink(update: CompilationProgressUpdate): void;
  /** No more messages: a pending advance is dropped (the phase end or the reply supersedes it). */
  close(): void;
}

export function createProgressChannel(
  send: (update: CompilationProgressUpdate) => void,
  now: () => number = () => performance.now(),
): ProgressChannel {
  let closed = false;
  let sentAt = Number.NEGATIVE_INFINITY;
  let pending: CompilationProgressUpdate | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deliver = (update: CompilationProgressUpdate): void => {
    try {
      send(update);
    } catch {
      /* A lost progress message never fails the compile. */
    }
  };
  const flush = (): void => {
    timer = undefined;
    const update = pending;
    pending = undefined;
    if (!update || closed) return;
    sentAt = now();
    deliver(update);
  };
  const drop = (): void => {
    pending = undefined;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return {
    sink(update: CompilationProgressUpdate) {
      if (closed) return;
      if (update.state !== 'advance') {
        // The phase's start or end describes it completely: an older advance is obsolete.
        drop();
        deliver(update);
        return;
      }
      const wait = sentAt + PROGRESS_INTERVAL_MS - now();
      if (wait <= 0) {
        drop();
        sentAt = now();
        deliver(update);
        return;
      }
      pending = update;
      // Unref'd: a pending update never keeps the runtime alive.
      timer ??= setTimeout(flush, wait).unref();
    },
    close() {
      closed = true;
      drop();
    },
  };
}

const PROGRESS_PHASES: ReadonlySet<string> = new Set([
  'boot',
  'discovery',
  'restore',
  'semantic',
  'plan',
  'describe',
  'render',
  'keywords',
  'link',
  'assemble',
  'aggregate',
  'persist',
  'transfer',
]);

const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * A progress update received from a runtime, checked field by field, or `undefined`. A malformed
 * update is dropped, never an error: progress must not break the transport it rides on.
 */
export function progressUpdate(value: unknown): CompilationProgressUpdate | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const { phase, state, completed, total, reused, pass, reason } = raw;
  if (typeof phase !== 'string' || !PROGRESS_PHASES.has(phase)) return undefined;
  if (state !== 'start' && state !== 'advance' && state !== 'end') return undefined;
  if (
    (completed !== undefined && !count(completed)) ||
    (total !== undefined && !count(total)) ||
    (reused !== undefined && !count(reused)) ||
    (pass !== undefined && pass !== 'targeted' && pass !== 'full' && pass !== 'restored') ||
    (reason !== undefined && typeof reason !== 'string') ||
    (completed !== undefined && total !== undefined && completed > total) ||
    (reused !== undefined && completed !== undefined && reused > completed)
  )
    return undefined;
  return {
    phase: phase as CompilationProgressUpdate['phase'],
    state,
    ...(completed !== undefined ? { completed } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(reused !== undefined ? { reused } : {}),
    ...(pass !== undefined ? { pass } : {}),
    ...(typeof reason === 'string' ? { reason: reason.slice(0, 200) } : {}),
  };
}

/**
 * The host side of one job's progress: it forwards the runtime's checked updates to the caller's
 * sink while the job is live, and adds the phases only the host sees: `boot` (a runtime starting
 * for this job) and `transfer` (from the compiler's last phase to the result the caller receives,
 * including its encoding, the message and a delta's application). Nothing is forwarded once the
 * job's signal aborted or its result was delivered, and a throwing sink is ignored.
 */
export class ProgressRelay {
  private transferring = false;
  private done = false;
  /** A compiler update was relayed: a retry of the compile need not ask for progress again. */
  reported = false;

  constructor(
    private readonly sink: (update: CompilationProgressUpdate) => void,
    private readonly signal: AbortSignal,
  ) {}

  boot(state: 'start' | 'end'): void {
    this.emit({ phase: 'boot', state });
  }

  /** A `progress` message's update, as received. */
  forward(value: unknown): void {
    const update = progressUpdate(value);
    if (!update || update.phase === 'boot' || update.phase === 'transfer') return;
    // A fall back to the full pass restarts the phases: its own `persist` end starts the transfer.
    if (update.state === 'start' && update.pass === 'full') this.transferring = false;
    this.emit(update);
    this.reported = true;
    // The compiler's last phase is over (its cache writes, or a fast start's check that restored
    // the candidate): what follows until the result arrives is the transfer.
    if (
      (update.phase === 'persist' || (update.phase === 'restore' && update.pass === 'restored')) &&
      update.state === 'end' &&
      !this.transferring
    ) {
      this.transferring = true;
      this.emit({ phase: 'transfer', state: 'start' });
    }
  }

  /** The job's result is ready for the caller: the transfer ends and the relay goes quiet. */
  settled(): void {
    if (this.transferring) this.emit({ phase: 'transfer', state: 'end' });
    this.done = true;
  }

  private emit(update: CompilationProgressUpdate): void {
    if (this.done || this.signal.aborted) return;
    try {
      this.sink(update);
    } catch {
      /* Progress is advisory: a failing consumer never changes a compilation. */
    }
  }
}
