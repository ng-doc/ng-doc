import { type FSWatcher, existsSync, watch as watchDirectory } from 'node:fs';
import path from 'node:path';

import type { FileChange } from '../contracts';
import { probeState } from './external-probes';

/**
 * At most this many directories are watched for missing inputs. The inputs are grouped by their
 * nearest existing directory, so thousands of missing paths (module resolution and configuration
 * lookups) cost one watch per directory. Inputs beyond it are reported to the owner, which keeps
 * them native and warns.
 */
export const MAX_MISSING_PATH_DIRECTORIES = 1_024;

type Watch = (
  directory: string,
  listener: (event: string, name: string | null) => void,
) => FSWatcher;

const defaultWatch: Watch = (directory, listener) =>
  watchDirectory(directory, { persistent: false }, (event, name) =>
    listener(event, typeof name === 'string' ? name : null),
  );

/** The directory that is watched for `target`: its nearest existing ancestor. */
function anchorOf(target: string): string {
  let cursor = path.dirname(target);
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return cursor;
}

/**
 * Reports the creation, change and removal of inputs that chokidar's `fs.watch` backend cannot
 * report (see `watchesMissingPaths` in `vite-event-source.ts`). Each input is watched through a
 * non-recursive watch of its nearest existing directory, which one watch shares among all the
 * inputs below it. An event there re-reads the state of the inputs it names (all of them when the
 * platform names none) and reports each one whose state changed. A new directory on an input's
 * path moves the input to it; a removed one moves it back up.
 */
export class MissingPathWatcher {
  private readonly states = new Map<string, string>();
  private readonly anchors = new Map<string, string>();
  private readonly members = new Map<string, Set<string>>();
  private readonly handles = new Map<string, FSWatcher>();
  private disposed = false;

  constructor(
    private readonly emit: (change: FileChange) => void,
    private readonly maxDirectories: number = MAX_MISSING_PATH_DIRECTORIES,
    private readonly watch: Watch = defaultWatch,
  ) {}

  get size(): number {
    return this.states.size;
  }

  /** The number of watched directories. */
  get directories(): number {
    return this.handles.size;
  }

  has(target: string): boolean {
    return this.states.has(target);
  }

  /**
   * Starts watching `targets` and returns the ones that did not fit in the directory budget. The
   * state of each is taken now, so a change after this call is reported.
   */
  add(targets: readonly string[]): string[] {
    const rejected: string[] = [];
    if (this.disposed) return [...targets];
    for (const target of targets) {
      if (this.states.has(target)) continue;
      const anchor = anchorOf(target);
      if (!this.handles.has(anchor) && this.handles.size >= this.maxDirectories) {
        rejected.push(target);
        continue;
      }
      this.states.set(target, probeState(target));
      this.attach(target, anchor);
    }
    return rejected;
  }

  dispose(): void {
    this.disposed = true;
    for (const handle of this.handles.values()) handle.close();
    this.handles.clear();
    this.members.clear();
    this.anchors.clear();
    this.states.clear();
  }

  private attach(target: string, anchor: string): void {
    this.anchors.set(target, anchor);
    let members = this.members.get(anchor);
    if (!members) {
      members = new Set();
      this.members.set(anchor, members);
      try {
        const handle = this.watch(anchor, (_event, name) => this.changed(anchor, name));
        // A watch fails when its directory goes away: its inputs move up.
        handle.on('error', () => this.changed(anchor, null));
        this.handles.set(anchor, handle);
      } catch {
        // The directory went away before the watch: re-anchoring below finds its parent.
        queueMicrotask(() => this.changed(anchor, null));
      }
    }
    members.add(target);
  }

  private detach(target: string): void {
    const anchor = this.anchors.get(target);
    if (anchor === undefined) return;
    this.anchors.delete(target);
    const members = this.members.get(anchor);
    members?.delete(target);
    if (members && !members.size) {
      this.members.delete(anchor);
      this.handles.get(anchor)?.close();
      this.handles.delete(anchor);
    }
  }

  private changed(anchor: string, name: string | null): void {
    if (this.disposed) return;
    const members = [...(this.members.get(anchor) ?? [])];
    const gone = !existsSync(anchor);
    for (const target of members) {
      // The first path segment below the anchor: the entry an event there can concern.
      const entry = path.relative(anchor, target).split(path.sep)[0];
      if (!gone && name !== null && name !== entry) continue;
      this.refresh(target);
    }
  }

  private refresh(target: string): void {
    // A directory created or removed on the target's path moves it to its new nearest one; the
    // re-anchored watch may already have missed the target's own creation, so its state is read
    // after the move.
    const anchor = anchorOf(target);
    if (anchor !== this.anchors.get(target)) {
      this.detach(target);
      this.attach(target, anchor);
    }
    const before = this.states.get(target);
    const state = probeState(target);
    if (before === undefined || state === before) return;
    this.states.set(target, state);
    const kind: FileChange['kind'] =
      before === 'missing' ? 'create' : state === 'missing' ? 'delete' : 'update';
    this.emit({ kind, path: target });
  }
}
