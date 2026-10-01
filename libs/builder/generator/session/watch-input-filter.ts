import { minimatch } from 'minimatch';
import { lstatSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import type {
  BuildResult,
  Diagnostic,
  FileChange,
  FileEventSource,
  WatchInputs,
} from '../contracts';
import { WATCHER_RESCAN } from './watch-signals';

/** Rejected paths retained while a generation is in flight before a reconcile is requested. */
export const MAX_DEFERRED_CHANGES = 1024;
/** Backoff of consecutive filter-requested reconciles: none for the first, then 1 s doubling to 60 s. */
export const RECONCILE_BACKOFF = Object.freeze({ initialMs: 1000, maxMs: 60_000 });

function normalize(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

/** On POSIX a backslash in a glob is an escape, so it reaches minimatch unchanged. */
function globPattern(pattern: string): string {
  return path.sep === '\\' ? pattern.replace(/\\/g, '/') : pattern;
}

function patternBase(root: string, pattern: string): string {
  const absolute = normalize(path.isAbsolute(pattern) ? pattern : path.join(root, pattern));
  const magic = absolute.search(/[*?{}[\]()!]/);
  if (magic < 0) return path.dirname(absolute).replace(/\\/g, '/');
  const slash = absolute.lastIndexOf('/', magic);
  return (slash > 0 ? absolute.slice(0, slash) : path.parse(absolute).root).replace(/\\/g, '/');
}

function within(target: string, directory: string): boolean {
  return target === directory || target.startsWith(`${directory}/`);
}

function real(target: string): string | null {
  try {
    return realpathSync.native(target).replace(/\\/g, '/');
  } catch {
    return null;
  }
}

function parent(target: string): string {
  return path.dirname(target).replace(/\\/g, '/');
}

/**
 * Physical -> recorded prefix aliases for recorded paths reached through a symlink below the
 * watched root. Native events arrive in the watched root's own spelling (the Parcel source
 * rewrites its physical prefix), so a symlinked, case-variant or /tmp-style root needs no alias.
 *
 * Aliases are per directory (plus a recorded file that is itself a symlink), so matching walks
 * the event path's ancestors: O(depth) per event, independent of the number of recorded files.
 * Directory realpaths are resolved afresh for every result, so a retargeted symlink or a
 * directory that appears later is picked up. Only "is a regular file" facts outlive a result;
 * a missing file is covered by its directory's alias and is looked at again next time.
 */
class PhysicalPaths {
  private regular = new Set<string>();

  constructor(private readonly root?: string) {}

  /** A recorded file changed: its symlink status is looked at again for the next result. */
  forget(file: string): void {
    this.regular.delete(file);
  }

  aliases(files: Iterable<string>, bases: Iterable<string>): Map<string, string[]> {
    const aliases = new Map<string, string[]>();
    /** False when this pair is already recorded (and so are the ancestors it implies). */
    const record = (from: string, to: string): boolean => {
      const list = aliases.get(from);
      if (list?.includes(to)) return false;
      if (list) list.push(to);
      else aliases.set(from, [to]);
      return true;
    };
    const resolved = new Map<string, string | null>();
    const root = this.root ? normalize(this.root) : undefined;
    const realRoot = root ? real(root) : null;
    const canonical = (target: string): string =>
      root && realRoot && realRoot !== root && within(target, realRoot)
        ? root + target.slice(realRoot.length)
        : target;
    const physical = (target: string): string | null => {
      let value = resolved.get(target);
      if (value === undefined) {
        const found = real(target);
        resolved.set(target, (value = found === null ? null : canonical(found)));
      }
      return value;
    };
    // Also alias the ancestors that share names, up to the symlink itself, so deleting or
    // recreating the physical directory behind a symlink matches the recorded directory.
    const add = (physicalPath: string, recorded: string): void => {
      for (
        let from = physicalPath, to = recorded;
        from !== to;
        from = parent(from), to = parent(to)
      ) {
        if (parent(from) === from || parent(to) === to || !record(from, to)) return;
        if (path.basename(from) !== path.basename(to)) return;
      }
    };
    // A recorded directory that does not exist yet resolves through its nearest existing
    // ancestor, so its later creation at the physical path below a symlink still matches.
    const directory = (target: string): void => {
      let existing = target;
      let value = physical(existing);
      while (value === null) {
        const up = parent(existing);
        if (up === existing) return;
        existing = up;
        value = physical(existing);
      }
      add(value + target.slice(existing.length), target);
    };
    const regular = new Set<string>();
    for (const file of files) {
      directory(parent(file));
      if (this.regular.has(file)) {
        regular.add(file);
        continue;
      }
      let stat;
      try {
        stat = lstatSync(file, { throwIfNoEntry: false });
      } catch {
        stat = undefined;
      }
      if (!stat) continue;
      if (!stat.isSymbolicLink()) {
        regular.add(file);
        continue;
      }
      const value = physical(file);
      if (value && value !== file) record(value, file);
    }
    for (const base of bases) directory(base);
    this.regular = regular;
    return aliases;
  }
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

interface CompiledGlob {
  root: string;
  bases: string[];
  include: string[];
  exclude: string[];
}

interface Effective {
  files: Set<string>;
  /** Every ancestor directory of a recorded file or glob base: their removal or arrival matters. */
  ancestors: Set<string>;
  globs: CompiledGlob[];
  /**
   * Physical prefix -> recorded prefix for recorded paths reached through a symlink (see
   * PhysicalPaths). Native watchers report physical paths; the compiler graph matches both.
   */
  aliases: Map<string, string[]>;
}

function compile(inputs: WatchInputs[], paths: PhysicalPaths): Effective {
  const files = new Set<string>();
  const ancestors = new Set<string>();
  const globs = new Map<string, CompiledGlob>();
  const allBases = new Set<string>();
  const addAncestors = (target: string): void => {
    for (let cursor = path.dirname(target).replace(/\\/g, '/'); !ancestors.has(cursor); ) {
      ancestors.add(cursor);
      const parent = path.dirname(cursor).replace(/\\/g, '/');
      if (parent === cursor) break;
      cursor = parent;
    }
  };
  for (const input of inputs) {
    for (const file of input.files) {
      const normalized = normalize(file);
      files.add(normalized);
      addAncestors(normalized);
    }
    for (const glob of input.globs) {
      const root = normalize(glob.root);
      const bases = [...new Set(glob.include.map((include) => patternBase(root, include)))];
      bases.forEach((base) => {
        ancestors.add(base);
        addAncestors(base);
        allBases.add(base);
      });
      const compiled = { root, bases, include: [...glob.include], exclude: [...glob.exclude] };
      globs.set(JSON.stringify(compiled), compiled);
    }
  }
  return {
    files,
    ancestors,
    globs: [...globs.values()],
    aliases: paths.aliases(files, allBases),
  };
}

function globMatches(glob: CompiledGlob, changed: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const subject = path.isAbsolute(pattern)
      ? changed
      : path.relative(glob.root, changed).replace(/\\/g, '/');
    return minimatch(subject, globPattern(pattern), { dot: true });
  });
}

/**
 * Admits only native changes that can affect the next generation: the filesystem inputs recorded
 * by the newest settled result (the last success unioned with any newer failure), as the Vite
 * adapter's watch-input registry does for its watcher. A recursive native watcher also reports
 * every unrelated workspace write (host caches, logs, editors); each of those would otherwise
 * supersede an in-flight generation. Until a result with inputs is observed, every change is
 * admitted.
 *
 * A recorded file matches on any change. Creating or deleting an ancestor directory of a recorded
 * file or glob base matches, as does a new directory below a glob base, because a moved directory
 * is reported once without its members. Other changes match only a recorded glob. A physical
 * (symlink-resolved) spelling of a recorded file or glob base matches like the recorded one.
 *
 * A generation can record an input for the first time (a new include, snippet or import). An
 * edit to it while that generation is in flight is not yet admissible, so rejected changes are
 * retained from `started` until the generation's result: the ones the new inputs admit are then
 * replayed as an ordinary batch. Beyond `capacity` distinct retained paths, or when the result
 * records no inputs at all (a compiler throw or worker crash), a lossy-watcher reconcile is
 * requested instead, with exponential backoff across consecutive requests (see
 * `scheduleReconcile`). A cancelled generation discards them: its successor reads
 * every input afresh. With no generation in flight nothing is retained.
 */
export class WatchInputFilter {
  private success?: WatchInputs;
  private failure?: WatchInputs;
  private effective?: Effective;
  private newest = -1;
  private readonly physical: PhysicalPaths;
  private readonly capacity: number;
  private inFlight = false;
  private readonly retained = new Map<string, FileChange>();
  private overflowed = false;
  private readonly backoff: { initialMs: number; maxMs: number };
  /** The newest result recorded no inputs, so no unrecorded path can be ruled out. */
  private inputsUnknown = false;
  /** Consecutive filter-requested reconciles since inputs were recorded or a change admitted. */
  private streak = 0;
  private reconcileTimer?: ReturnType<typeof setTimeout>;
  private consumer?: {
    replay(changes: FileChange[]): void;
    reconcile(diagnostic: Diagnostic): void;
  };

  /** `root` is the watched root, in the spelling its file event source reports. */
  constructor(
    options: {
      capacity?: number;
      root?: string;
      reconcileBackoff?: { initialMs: number; maxMs: number };
    } = {},
  ) {
    this.capacity = options.capacity ?? MAX_DEFERRED_CHANGES;
    this.physical = new PhysicalPaths(options.root);
    this.backoff = options.reconcileBackoff ?? RECONCILE_BACKOFF;
  }

  /** A generation started; it may record inputs that are rejected until its result arrives. */
  started(): void {
    this.inFlight = true;
  }

  observe(result: BuildResult): void {
    const retained = [...this.retained.values()];
    const overflowed = this.overflowed;
    this.retained.clear();
    this.overflowed = false;
    this.inFlight = false;
    if (result.status === 'cancelled' || result.generation < this.newest) return;
    const consumer = this.consumer;
    const recorded =
      !!result.watchInputs &&
      (result.watchInputs.files.length > 0 || result.watchInputs.globs.length > 0);
    if (!recorded) {
      // A compiler throw or worker crash/timeout records nothing, so a retained change to a file
      // only that generation read can neither be matched nor replayed: reconcile instead, with
      // backoff, because the reconciling generation may fail the same way while unrelated
      // writes keep arriving. Until inputs are recorded again, idle rejections also reconcile,
      // so an edit that fixes the failing input is picked up after at most the capped delay.
      this.inputsUnknown = true;
      if (overflowed || retained.length)
        this.scheduleReconcile(
          `Generation ${result.generation} recorded no inputs while ${overflowed ? `more than ${this.capacity}` : retained.length} unrecorded workspace path(s) changed.`,
        );
      if (!result.watchInputs) return;
    } else {
      this.inputsUnknown = false;
      if (!overflowed) this.settle();
    }
    this.newest = result.generation;
    if (result.status === 'success') {
      this.success = structuredClone(result.watchInputs);
      this.failure = undefined;
    } else {
      this.failure = structuredClone(result.watchInputs);
    }
    this.effective = compile(
      [this.success, this.failure].filter((item) => !!item),
      this.physical,
    );
    if (!consumer || !recorded) return;
    if (overflowed) {
      this.scheduleReconcile(
        `More than ${this.capacity} unrecorded workspace paths changed during generation ${result.generation}.`,
      );
      return;
    }
    const replay = retained.filter((change) => this.matches(change));
    // After the observer returns: the session must first settle the generation that produced
    // this result, so the replay supersedes nothing that already read the new bytes.
    if (replay.length) queueMicrotask(() => consumer.replay(replay));
  }

  matches(change: FileChange): boolean {
    const effective = this.effective;
    if (!effective) return true;
    const changed = normalize(change.path);
    if (effective.files.has(changed)) {
      this.physical.forget(changed);
      return true;
    }
    if (this.matchesPath(effective, change.kind, changed)) return true;
    if (!effective.aliases.size) return false;
    // O(depth): look up the event path and each ancestor as a physical alias prefix.
    for (let cursor = changed; ; ) {
      for (const recorded of effective.aliases.get(cursor) ?? []) {
        const spelling = recorded + changed.slice(cursor.length);
        if (effective.files.has(spelling)) this.physical.forget(spelling);
        if (this.matchesPath(effective, change.kind, spelling)) return true;
      }
      const slash = cursor.lastIndexOf('/');
      if (slash <= 0) return false;
      cursor = cursor.slice(0, slash);
    }
  }

  /**
   * Requests a lossy-watcher reconcile: the first of a streak at once, then after 1 s, 2 s, 4 s
   * ... up to the cap. While one is scheduled, further requests coalesce into it. The streak
   * ends when a result records inputs without overflow or a change is admitted on its own; both
   * run an ordinary generation that reads every input afresh, so a scheduled one is dropped.
   */
  private scheduleReconcile(reason: string): void {
    if (!this.consumer || this.reconcileTimer) return;
    const delay =
      this.streak === 0
        ? 0
        : Math.min(this.backoff.initialMs * 2 ** (this.streak - 1), this.backoff.maxMs);
    this.streak++;
    const diagnostic: Diagnostic = {
      code: WATCHER_RESCAN,
      severity: 'warning',
      stage: 'host',
      message: `${reason} Re-observing every recorded input${delay ? ` after ${delay} ms (consecutive reconcile ${this.streak})` : ''}.`,
    };
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = undefined;
      this.consumer?.reconcile(diagnostic);
    }, delay);
    this.reconcileTimer.unref?.();
  }

  private settle(): void {
    this.streak = 0;
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = undefined;
  }

  /** A change was admitted on its own: it runs an ordinary generation. */
  admitted(): void {
    this.settle();
  }

  /** Whether a filter-requested reconcile is scheduled, for diagnostics and tests. */
  reconcileScheduled(): boolean {
    return !!this.reconcileTimer;
  }

  /**
   * Retains a rejected change while a generation is in flight (see the class comment). While
   * the newest result recorded no inputs, an idle rejection requests a (backed-off) reconcile.
   */
  reject(change: FileChange): void {
    if (!this.inFlight && this.inputsUnknown) {
      this.scheduleReconcile(
        `A workspace path changed while generation inputs are unknown (${change.path}).`,
      );
      return;
    }
    if (!this.inFlight || !this.effective || this.overflowed) return;
    const changed = normalize(change.path);
    this.retained.set(changed, { kind: change.kind, path: change.path });
    if (this.retained.size > this.capacity) {
      this.retained.clear();
      this.overflowed = true;
    }
  }

  /** The number of retained paths (bounded by the capacity), for diagnostics and tests. */
  retainedCount(): number {
    return this.retained.size;
  }

  attach(consumer: WatchInputFilter['consumer']): () => void {
    this.consumer = consumer;
    return () => {
      if (this.consumer === consumer) this.consumer = undefined;
      this.retained.clear();
      this.overflowed = false;
      this.settle();
    };
  }

  private matchesPath(effective: Effective, kind: FileChange['kind'], changed: string): boolean {
    if (effective.files.has(changed)) return true;
    if (kind !== 'update' && effective.ancestors.has(changed)) return true;
    return effective.globs.some((glob) => {
      if (!glob.bases.some((base) => within(changed, base))) return false;
      if (globMatches(glob, changed, glob.exclude)) return false;
      return (
        globMatches(glob, changed, glob.include) || (kind === 'create' && isDirectory(changed))
      );
    });
  }
}

/**
 * A file event source that forwards only changes admitted by the filter, and later replays
 * retained changes the filter admits once a generation recorded them. Errors pass through.
 */
export function filterFileEvents(
  source: FileEventSource,
  filter: WatchInputFilter,
): FileEventSource {
  return {
    async subscribe(
      listener: (events: FileChange[]) => unknown,
      onError: (diagnostic: Diagnostic) => void,
    ) {
      const detach = filter.attach({ replay: listener, reconcile: onError });
      try {
        const subscription = await source.subscribe((events) => {
          const admitted: FileChange[] = [];
          for (const event of events) {
            if (filter.matches(event)) admitted.push(event);
            else filter.reject(event);
          }
          // `false`: the session discarded every admitted change as an unchanged save, so no
          // generation runs for them and a scheduled reconcile must not be dropped.
          if (admitted.length && listener(admitted) !== false) filter.admitted();
        }, onError);
        return {
          dispose: () => {
            detach();
            return subscription.dispose();
          },
        };
      } catch (error) {
        detach();
        throw error;
      }
    },
  };
}
