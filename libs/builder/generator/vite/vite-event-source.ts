import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FSWatcher } from 'vite';

import type {
  BuildResult,
  Diagnostic,
  FileChange,
  FileEventSource,
  WatchInputs,
} from '../contracts';
import { WATCHER_RESCAN } from '../session/watch-signals';
import { hostDiagnostic } from './diagnostics';
import { ExternalProbeWatcher, MAX_EXTERNAL_PROBES } from './external-probes';
import { MAX_MISSING_PATH_DIRECTORIES, MissingPathWatcher } from './missing-paths';
import { canonicalDrive } from './paths';
import { WatchInputRegistry } from './watch-inputs';

type Listener = (events: FileChange[]) => void;
type ErrorListener = (diagnostic: Diagnostic) => void;

export interface WatchObservation {
  accepted: boolean;
  reconcile: boolean;
  /**
   * With `reconcile`: exactly what may have changed unseen, namely the new physical targets and
   * the rejected changes that the new inputs now match. Absent when the rejections overflowed
   * their bound: then every input is reconciled.
   */
  paths?: string[];
}

function normalize(value: string): string {
  return canonicalDrive(path.resolve(value).replace(/\\/g, '/'));
}

function within(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}/`);
}

/**
 * Distinct paths rejected while a generation is in flight that are kept to be checked against
 * its newly recorded inputs. Beyond this the check is replaced by an unconditional reconcile.
 */
export const MAX_RETAINED_REJECTIONS = 1024;

/** Recoverable watcher errors are reported together, at most once per this many milliseconds. */
export const WATCHER_ERROR_COALESCE_MS = 100;

/**
 * The code of a watcher failure that cannot recover while Vite runs. The lifecycle keeps it until
 * restart.
 */
export const NGDOC_VITE_WATCHER = 'NGDOC_VITE_WATCHER';

/**
 * Distinct paths outside the recorded inputs whose native watch was lost, kept because a later
 * generation can record an input there. More than this is fatal.
 */
export const MAX_LOST_WATCHES = 1024;

/**
 * How long the re-observation of new inputs waits for chokidar to attach their watches. chokidar
 * attaches after asynchronous `stat`/`realpath` calls and signals nothing per path; after this the
 * re-observation runs anyway (a slower attach leaves the same window as before it existed).
 */
export const WATCH_ATTACH_TIMEOUT_MS = 1_000;

/**
 * chokidar lists a path in `getWatched()` just before it registers the path's native listener
 * (FSEvents: one `realpath` later; `fs.watch`: after the directory read that lists its entries).
 * A watch is taken as attached this long after it is listed.
 */
export const WATCH_ATTACH_GRACE_MS = 10;

/**
 * chokidar (as bundled by Vite) reports no `change` of a path within 50 ms of the last one it
 * reported, and reports nothing for it afterwards either. An in-place save can then be reported
 * at its truncation only, and the generation it starts may read the half-written file. So each
 * forwarded change of a file is checked again this long after it was forwarded: a file whose
 * stat moved since is reported once more. Longer than chokidar's window, so a write inside it is
 * seen; a write after it is reported by chokidar itself.
 */
export const TRAILING_RESTAT_MS = 100;

/** A file's stat identity, or undefined when it cannot be stated. */
function statVersion(file: string): string | undefined {
  try {
    const state = statSync(file, { bigint: true });
    return `${state.dev}:${state.ino}:${state.size}:${state.mtimeNs}:${state.ctimeNs}`;
  } catch {
    return undefined;
  }
}

/** Whether chokidar's `getWatched()` lists `target` (a watched directory, or an entry of one). */
function listed(watched: ReadonlyMap<string, readonly string[]>, target: string): boolean {
  return (
    watched.has(target) ||
    (watched.get(path.dirname(target))?.includes(path.basename(target)) ?? false)
  );
}

/** A missing target is watched through its nearest existing ancestor directory. */
function nearestExistingPath(target: string): string {
  let cursor = target;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return cursor;
    cursor = parent;
  }
  return cursor;
}

/** An `fs` failure carried by a chokidar `error` event (every error chokidar itself raises). */
interface WatcherErrno {
  code: string;
  syscall?: string;
  path?: string;
  message: string;
}

function watcherErrno(error: unknown): WatcherErrno | undefined {
  if (!(error instanceof Error)) return undefined;
  const { code, syscall, path: target } = error as NodeJS.ErrnoException;
  if (typeof code !== 'string' || !/^E[A-Z0-9]+$/.test(code)) return undefined;
  return {
    code,
    ...(typeof syscall === 'string' ? { syscall } : {}),
    ...(typeof target === 'string' && target ? { path: target } : {}),
    message: error.message,
  };
}

interface PendingErrors {
  count: number;
  first: WatcherErrno;
}

/** Where the native watcher may be attached. */
export interface WatchScopeOptions {
  /**
   * The workspace root. Recorded files outside it are polled instead of natively watched; without
   * it every target goes to the native watcher.
   */
  workspaceRoot?: string;
  /** The poll interval for files outside the workspace (tests use a short one). */
  probeIntervalMs?: number;
  /**
   * Directories the watcher itself watches recursively (Vite's root). Its directory watches there
   * report every new file, so missing inputs below them stay with it.
   */
  watchedRoots?: readonly string[];
  /**
   * Whether missing inputs that the watcher cannot report get their own directory watches (see
   * `watchesMissingPaths`). Default true; false when the host does not watch at all.
   */
  watchMissingPaths?: boolean;
}

/** The workspace root as given and as resolved through symlinks (for example /var → /private/var). */
function workspaceRoots(root: string | undefined): string[] {
  if (!root) return [];
  const roots = new Set([normalize(root)]);
  try {
    roots.add(normalize(realpathSync(root)));
    // The spelling the engine publishes (on Windows: the on-disk case, `subst` drives resolved).
    roots.add(normalize(realpathSync.native(root)));
  } catch {
    // A root that cannot be resolved keeps only the spelling it was given.
  }
  // A filesystem root would make every path "inside": such a scope confines nothing.
  return [...roots].filter((value) => value !== normalize(path.parse(value).root));
}

/**
 * Whether the watcher is known to report the creation of every missing path it was given: only
 * chokidar's FSEvents backend (macOS), which watches each such path itself. Its other backends
 * (`fs.watch` on Linux and Windows, and polling) watch a missing path through a listener on the
 * nearest existing directory that accepts only that one name, and they throttle the directory's
 * reads per directory, so the first listener's read swallows the others: of several missing paths
 * in a directory that no full watch covers, only one is ever reported, and none whose parent
 * directory is missing as well. Any other watcher is assumed to behave the same way.
 */
function watchesMissingPaths(watcher: FSWatcher): boolean {
  const options = (watcher as unknown as { options?: { useFsEvents?: unknown } }).options;
  return options?.useFsEvents === true;
}

/** The chokidar 3 state that Vite 7's bundled watcher consults before attaching a path. */
interface ChokidarIgnoreState {
  _isIgnored?: unknown;
  _ignoredPaths?: unknown;
  options?: { disableGlobbing?: unknown; cwd?: unknown };
}

/**
 * Returns chokidar's own ignore predicate when skipping an ignored target is exactly equivalent to
 * adding it, otherwise undefined (every target is added, as before).
 *
 * chokidar never attaches a listener to, and never reports an event for, a path its
 * `_isIgnored(path)` rejects: its FSEvents handler returns before `setFSEventsListener` and drops
 * such paths in every event callback; its `fs.watch` handler returns before watching. Adding such
 * a path still costs a `stat` and a per-component JavaScript `realpath`, which for a semantic
 * program's `node_modules` declarations and resolution probes is thousands of filesystem calls on
 * the startup path. `add()` differs from that predicate in one way only: it first deletes the path
 * from `_ignoredPaths` (an earlier `unwatch`), so the predicate is used only while that set is
 * empty. Literal paths are required (`disableGlobbing`, which Vite always sets unless overridden),
 * and a relative `cwd` would change the checked path, so it must be unset.
 */
function watcherIgnores(watcher: FSWatcher): ((target: string) => boolean) | undefined {
  const state = watcher as unknown as ChokidarIgnoreState;
  const isIgnored = state._isIgnored;
  if (
    typeof isIgnored !== 'function' ||
    !(state._ignoredPaths instanceof Set) ||
    state._ignoredPaths.size !== 0 ||
    state.options?.disableGlobbing !== true ||
    state.options.cwd !== undefined
  ) {
    return undefined;
  }
  return (target) => {
    try {
      return Reflect.apply(isIgnored, watcher, [target]) === true;
    } catch {
      return false;
    }
  };
}

export class ViteFileEventSource implements FileEventSource {
  private readonly registry: WatchInputRegistry;
  private listener?: Listener;
  private errorListener?: ErrorListener;
  private disposed = false;
  private registration: Promise<WatchObservation> = Promise.resolve({
    accepted: true,
    reconcile: false,
  });
  private ownedRoots: string[] = [];
  private buffered: FileChange[] = [];
  private seeded = false;
  /** Paths rejected since the newest generation started, until its result is observed. */
  private retained = new Set<string>();
  private retainedOverflow = false;
  /** Recoverable failures outside the inputs since the newest generation started. */
  private retainedErrors = new Map<string, WatcherErrno>();
  private retainedErrorsOverflow = false;
  /** Lost native watches outside the inputs; chokidar never re-creates them. */
  private lostWatches = new Map<string, WatcherErrno>();
  private lostWatchesOverflow = false;
  /**
   * Incremented whenever an observation installs different effective inputs in the registry,
   * current or not; `checkedInputs` is the version whose inputs the retained failures were last
   * re-checked against.
   */
  private inputsVersion = 0;
  private checkedInputs = 0;
  private inFlight = false;
  private recoverable?: PendingErrors;
  private unrelated?: PendingErrors;
  private errorFlush?: ReturnType<typeof setTimeout>;
  private readonly workspace: string[];
  /** Whether missing inputs outside `watchedRoots` get the directory watches of `missing`. */
  private readonly groupsMissingPaths: boolean;
  private readonly watchedRoots: string[];
  private readonly missing: MissingPathWatcher;
  /** Warnings raised before `subscribe` gave them a listener. */
  private readonly pendingWarnings: Diagnostic[] = [];
  private readonly probes: ExternalProbeWatcher;
  /** Targets handed to the native watcher (the ones whose attachment can be awaited). */
  private readonly native = new Set<string>();
  /** The trailing re-stat of each recently forwarded file (see `TRAILING_RESTAT_MS`). */
  private readonly trailing = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly onAddDirectory = (value: string) => this.emitDirectory('create', value);
  private readonly onDeleteDirectory = (value: string) => this.emitDirectory('delete', value);
  /**
   * chokidar keeps watching after every `error` it emits; each one is an `fs` failure for a single
   * path (see `docs/architecture/evidence/t19/c-watcher-parity/README.md` for the sources):
   *
   * - `syscall: 'watch'`: the native `fs.watch` handle for the path could not be created (for
   *   example ENOSPC at the inotify limit, or EMFILE) or failed later. chokidar never re-creates
   *   it, so later changes there are never reported. Fatal when it can hide a recorded input.
   * - any other `fs` failure (stat, lstat, realpath, scandir, open, including awaitWriteFinish):
   *   the path is still watched or is re-read on its directory's next change, but an event may
   *   have been missed. Like the Angular CLI host's lossy FSEvents signal this is a `WATCHER_RESCAN` warning, and the
   *   session re-observes every committed input.
   *
   * A failure for a path that cannot hide a recorded input (outside the inputs, or below a
   * generator-owned root the generator itself rewrites) is only a warning. A value that is not
   * an `fs` failure was not raised by chokidar and stays fatal.
   */
  private readonly onError = (error: unknown) => {
    if (this.disposed) return;
    const failure = watcherErrno(error);
    if (!failure) {
      this.errorListener?.(
        hostDiagnostic(NGDOC_VITE_WATCHER, error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    // A path is absolute here: chokidar runs without `cwd` (see `watcherIgnores`), and Node's
    // live-handle failure carries no path at all (libuv passes none), which stays relevant.
    const target = failure.path === undefined ? undefined : normalize(failure.path);
    const relevant = target === undefined || this.covers(target);
    if (failure.syscall === 'watch') {
      if (relevant) {
        this.lostWatch(failure);
        return;
      }
      // Not an input yet, but chokidar never re-creates this watch: remember it, and fail as
      // soon as a generation records an input it can hide.
      if (!this.owned(target!) && !this.lostWatchesOverflow) {
        this.lostWatches.set(target!, failure);
        if (this.lostWatches.size > MAX_LOST_WATCHES) {
          // Too many to track: any of them may hide a future input (conservative).
          this.lostWatchesOverflow = true;
          this.lostWatches.clear();
          this.lostWatch({
            ...failure,
            message:
              `More than ${MAX_LOST_WATCHES} native watches were lost ` +
              `(latest: ${failure.message})`,
          });
          return;
        }
      }
    } else if (!relevant && this.inFlight && !this.owned(target!)) {
      // The generation in flight may record an input here; its observation re-checks this path.
      if (this.retainedErrors.size < MAX_RETAINED_REJECTIONS) {
        this.retainedErrors.set(target!, failure);
      } else if (!this.retainedErrors.has(target!)) {
        this.retainedErrorsOverflow = true;
      }
    }
    this.pend(relevant ? 'recoverable' : 'unrelated', failure);
  };

  constructor(
    private readonly watcher: FSWatcher,
    capacity: number,
    scope: WatchScopeOptions = {},
  ) {
    this.registry = new WatchInputRegistry(capacity);
    this.workspace = workspaceRoots(scope.workspaceRoot);
    this.groupsMissingPaths = scope.watchMissingPaths !== false && !watchesMissingPaths(watcher);
    this.watchedRoots = (scope.watchedRoots ?? []).flatMap((root) => workspaceRoots(root));
    this.probes = new ExternalProbeWatcher(
      (change) => void this.deliver(change),
      scope.probeIntervalMs,
    );
    this.missing = new MissingPathWatcher((change) => void this.deliver(change));
  }

  async seed(generation: number, watchInputs?: WatchInputs): Promise<WatchObservation> {
    if (!watchInputs) {
      this.seeded = true;
      return { accepted: true, reconcile: false };
    }
    const { accepted, reconcile } = await this.observe({
      status: 'success',
      generation,
      snapshot: undefined as never,
      manifest: undefined as never,
      diagnostics: [],
      whyRebuilt: [],
      watchInputs,
    });
    this.seeded = true;
    // No path list: the session re-observes every recorded input before the watch is ready.
    return { accepted, reconcile };
  }

  started(generation: number): void {
    this.registry.started(generation);
    // The new generation reads every input afresh, so earlier rejections cannot be stale for it.
    this.retained.clear();
    this.retainedOverflow = false;
    this.retainedErrors.clear();
    this.retainedErrorsOverflow = false;
    this.inFlight = true;
  }

  isCurrent(generation: number): boolean {
    return !this.disposed && this.registry.isCurrent(generation);
  }

  /**
   * Whether a host change is a generator input. A change rejected while a generation is in flight
   * is retained: if that generation records the path as a new input (it may have read the old
   * bytes), its observation requests a reconcile, as the Angular CLI host's WatchInputFilter
   * replays it.
   */
  matches(change: FileChange): boolean {
    const normalized = { ...change, path: normalize(change.path) };
    if (this.disposed || this.ownedRoots.some((root) => within(normalized.path, root))) {
      return false;
    }
    if (!this.seeded || this.registry.matches(normalized)) return true;
    if (this.inFlight && !this.retainedOverflow) {
      if (this.retained.size < MAX_RETAINED_REJECTIONS) this.retained.add(normalized.path);
      else if (!this.retained.has(normalized.path)) {
        this.retained.clear();
        this.retainedOverflow = true;
      }
    }
    return false;
  }

  /**
   * A change the host watcher reported. An input that has a directory watch of its own is reported
   * by that watch only, so one change never reaches the session twice.
   */
  forward(change: FileChange): boolean {
    const normalized = { ...change, path: normalize(change.path) };
    if (this.missing.has(normalized.path)) return false;
    const delivered = this.deliver(normalized);
    if (delivered && normalized.kind !== 'delete') this.restatLater(normalized.path);
    return delivered;
  }

  /**
   * Reports `file` again if its stat moves within `TRAILING_RESTAT_MS` of now: a write chokidar's
   * change throttle dropped. A later forward of the same file restarts the check from its state.
   */
  private restatLater(file: string): void {
    const pending = this.trailing.get(file);
    if (pending) clearTimeout(pending);
    const version = statVersion(file);
    const timer = setTimeout(() => {
      this.trailing.delete(file);
      const current = statVersion(file);
      // A deleted file is reported by chokidar itself: its unlink is never throttled.
      if (this.disposed || current === undefined || current === version) return;
      this.deliver({ kind: 'update', path: file });
    }, TRAILING_RESTAT_MS);
    timer.unref?.();
    this.trailing.set(file, timer);
  }

  private deliver(change: FileChange): boolean {
    const normalized = { ...change, path: normalize(change.path) };
    if (!this.matches(normalized)) return false;
    if (this.listener) this.listener([normalized]);
    else this.buffered.push(normalized);
    return true;
  }

  excludeOwned(...roots: string[]): void {
    this.ownedRoots = [
      ...new Set([...this.ownedRoots, ...roots.map((root) => normalize(root))]),
    ].sort();
  }

  observe(result: BuildResult): Promise<WatchObservation> {
    const run = async (): Promise<WatchObservation> => {
      if (this.disposed) return { accepted: false, reconcile: false };
      const observed = await this.registry.observe(result);
      if (observed.changed) this.inputsVersion += 1;
      // Re-check failures against every newly installed input set, even when this result is no
      // longer current: `started(N+1)` can land in the hop after `registry.observe(N)` installed
      // N's inputs, and N+1 then compares equal to them, so no later observation would.
      if (this.inputsVersion !== this.checkedInputs && !this.disposed) {
        this.checkedInputs = this.inputsVersion;
        this.recheckErrors();
      }
      if (!observed.accepted || !this.isCurrent(result.generation)) {
        return { accepted: false, reconcile: false };
      }
      if (observed.physicalAdded.length) {
        // A target the watcher ignores can never produce an event, whether or not it is added.
        // It is still a confirmed physical input, so reconciliation below is unchanged.
        const ignored = watcherIgnores(this.watcher);
        const targets = ignored
          ? observed.physicalAdded.filter((target) => !ignored(target))
          : observed.physicalAdded;
        const { native, polled, missing } = this.placeTargets(targets, observed.directories);
        const unplaced = this.missing.add(missing);
        if (unplaced.length) {
          // Kept native, where their creation may go unreported: said, never silent.
          native.push(...unplaced);
          this.warn({
            code: NGDOC_VITE_WATCHER,
            severity: 'warning',
            stage: 'host',
            message:
              `${unplaced.length} missing NgDoc input(s) could not be watched, because missing ` +
              `inputs span more than ${MAX_MISSING_PATH_DIRECTORIES} directories (first: ` +
              `${unplaced[0]}). Creating one of them may not regenerate the documentation; ` +
              'restart Vite after creating it.',
          });
        }
        if (native.length) this.watcher.add(native);
        native.forEach((target) => this.native.add(normalize(target)));
        if (polled.length) this.probes.add(polled);
        this.registry.confirmPhysical(observed.physicalAdded);
      }
      if (!this.isCurrent(result.generation)) return { accepted: false, reconcile: false };
      // Rejected while this generation ran and now an input: it may have read the old bytes.
      // Rejections were checked against the inputs this result replaces, so only new inputs can
      // match one.
      const overflow = observed.changed && this.retainedOverflow;
      const replayed =
        observed.changed && !overflow
          ? [...this.retained].filter((target) =>
              this.registry.matches({ kind: 'update', path: target }),
            )
          : [];
      this.retained.clear();
      this.retainedOverflow = false;
      this.retainedErrors.clear();
      this.retainedErrorsOverflow = false;
      this.inFlight = false;
      const reconcile = observed.physicalAdded.length > 0 || overflow || replayed.length > 0;
      return {
        accepted: true,
        reconcile,
        ...(reconcile && !overflow
          ? { paths: [...new Set([...observed.physicalAdded, ...replayed])].sort() }
          : {}),
      };
    };
    this.registration = this.registration.then(run, run);
    return this.registration;
  }

  async subscribe(
    listener: Listener,
    onError: ErrorListener,
  ): Promise<{ dispose(): Promise<void> }> {
    if (this.disposed) throw new Error('Vite event source is disposed.');
    this.listener = listener;
    this.errorListener = onError;
    this.watcher.on('addDir', this.onAddDirectory);
    this.watcher.on('unlinkDir', this.onDeleteDirectory);
    this.watcher.on('error', this.onError);
    await this.registration;
    if (this.disposed) throw new Error('Vite event source is disposed.');
    if (this.buffered.length) listener(this.buffered.splice(0));
    for (const warning of this.pendingWarnings.splice(0)) onError(warning);
    return { dispose: () => this.dispose() };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.probes.dispose();
    this.missing.dispose();
    for (const timer of this.trailing.values()) clearTimeout(timer);
    this.trailing.clear();
    this.pendingWarnings.length = 0;
    await this.registration.catch(() => {});
    this.watcher.off('addDir', this.onAddDirectory);
    this.watcher.off('unlinkDir', this.onDeleteDirectory);
    this.watcher.off('error', this.onError);
    if (this.errorFlush) clearTimeout(this.errorFlush);
    this.errorFlush = undefined;
    this.recoverable = undefined;
    this.unrelated = undefined;
    this.listener = undefined;
    this.errorListener = undefined;
    this.buffered = [];
    this.retained.clear();
    this.retainedErrors.clear();
    this.lostWatches.clear();
  }

  /**
   * Splits new physical targets between the native watcher and the external probe poller.
   *
   * Native: everything inside the workspace (missing files included: chokidar watches such a
   * path through its nearest directory and reports its creation), every glob base, and any file
   * at or below a glob base, whose native directory watch already covers it. Polled: the other
   * recorded files outside the workspace, which are the configuration lookups the compiler makes
   * in every directory up to the filesystem root. Adding those natively attached chokidar's
   * FSEvents streams to `/` and the home directory's parents. Beyond
   * `MAX_EXTERNAL_PROBES` the rest stays native, as before. Missing: with a watcher that cannot
   * report every missing path (see `watchesMissingPaths`), a missing file inside the workspace
   * that neither a glob base nor a recursively watched root covers is watched through its nearest
   * existing directory (`MissingPathWatcher`); one below such a root is left to the root's watch.
   */
  private placeTargets(
    targets: readonly string[],
    directories: readonly string[],
  ): { native: string[]; polled: string[]; missing: string[] } {
    const directorySet = new Set(directories);
    const native: string[] = [];
    const polled: string[] = [];
    const missing: string[] = [];
    for (const target of targets) {
      const covered = directorySet.has(target) || this.registry.underGlobBase(target);
      const outside =
        !covered &&
        this.workspace.length > 0 &&
        !this.workspace.some((root) => within(target, root));
      if (outside && this.probes.size + polled.length < MAX_EXTERNAL_PROBES) {
        polled.push(target);
        continue;
      }
      if (covered || outside || !this.groupsMissingPaths || existsSync(target)) {
        native.push(target);
        continue;
      }
      // A missing file below a recursively watched root: the root's directory watches report its
      // creation already, and a listener of its own would report it a second time.
      if (!this.watchedRoots.some((root) => within(target, root))) missing.push(target);
    }
    return { native, polled, missing };
  }

  private warn(diagnostic: Diagnostic): void {
    if (this.errorListener) this.errorListener(diagnostic);
    else this.pendingWarnings.push(diagnostic);
  }

  /**
   * Resolves once chokidar lists every given native target as watched, `false` after `timeoutMs`.
   * A new input is re-observed only after this: a change made after the re-observation is then
   * reported by the watch. chokidar's FSEvents handler records a path just before it registers the
   * path's listener (one `realpath` later), so a short grace follows. A watcher without
   * `getWatched()` (a test double) counts as attached.
   */
  async attached(
    paths: readonly string[],
    timeoutMs: number = WATCH_ATTACH_TIMEOUT_MS,
  ): Promise<boolean> {
    const targets = paths.map(normalize).filter((target) => this.native.has(target));
    const getWatched = (this.watcher as Partial<FSWatcher>).getWatched;
    if (!targets.length || typeof getWatched !== 'function') return true;
    const pending = targets.map(nearestExistingPath);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.disposed) return false;
      const watched = new Map(
        Object.entries(getWatched.call(this.watcher)).map(([directory, entries]) => [
          normalize(directory),
          entries,
        ]),
      );
      if (pending.every((target) => listed(watched, target))) break;
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await new Promise((resolve) => setTimeout(resolve, WATCH_ATTACH_GRACE_MS));
    return true;
  }

  private owned(target: string): boolean {
    return this.ownedRoots.some((root) => within(target, root));
  }

  /** Whether a watcher failure at `target` can hide a change to a recorded input. */
  private covers(target: string): boolean {
    if (this.owned(target)) return false;
    return !this.seeded || this.registry.covers(target);
  }

  private lostWatch(failure: WatcherErrno): void {
    this.errorListener?.(
      hostDiagnostic(
        NGDOC_VITE_WATCHER,
        `${failure.message}. The native watcher for this path could not be created or has ` +
          'failed, and chokidar does not retry it, so changes to NgDoc inputs there would be ' +
          'missed. Raise the operating-system watch or open-file limit (for example ' +
          'fs.inotify.max_user_watches) or set server.watch.usePolling, then restart Vite.',
      ),
    );
  }

  private pend(kind: 'recoverable' | 'unrelated', failure: WatcherErrno): void {
    const pending = (this[kind] ??= { count: 0, first: failure });
    pending.count += 1;
    this.errorFlush ??= setTimeout(() => this.flushErrors(), WATCHER_ERROR_COALESCE_MS);
    this.errorFlush.unref?.();
  }

  /**
   * The inputs just changed: a failure recorded while a path was not an input can now hide one.
   * A lost watch there is fatal; a recoverable failure during this generation requests a rescan.
   */
  private recheckErrors(): void {
    for (const [target, failure] of this.lostWatches) {
      if (!this.covers(target)) continue;
      this.lostWatches.delete(target);
      this.lostWatch(failure);
      return;
    }
    const retained = [...this.retainedErrors.values()];
    const covered = this.retainedErrorsOverflow
      ? retained[0]
      : retained.find((failure) => this.covers(normalize(failure.path!)));
    if (covered) this.pend('recoverable', covered);
  }

  private flushErrors(): void {
    this.errorFlush = undefined;
    const { recoverable, unrelated } = this;
    this.recoverable = undefined;
    this.unrelated = undefined;
    if (this.disposed) return;
    const describe = ({ count, first }: PendingErrors) =>
      `${first.message}${count > 1 ? ` (and ${count - 1} more)` : ''}`;
    if (unrelated) {
      this.errorListener?.({
        code: NGDOC_VITE_WATCHER,
        severity: 'warning',
        stage: 'host',
        message: `Watcher error outside the recorded NgDoc inputs: ${describe(unrelated)}.`,
      });
    }
    if (recoverable) {
      this.errorListener?.({
        code: WATCHER_RESCAN,
        severity: 'warning',
        stage: 'host',
        message:
          `The Vite watcher reported ${describe(recoverable)}, so file events may have been ` +
          'missed. Re-observing every recorded input.',
        ...(recoverable.first.path ? { source: { path: normalize(recoverable.first.path) } } : {}),
      });
    }
  }

  private emitDirectory(kind: FileChange['kind'], value: string): void {
    const change = { kind, path: normalize(value) };
    if (this.matches(change)) this.listener?.([change]);
  }
}
