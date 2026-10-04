import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { FSWatcher } from 'vite';

import { canonicalDrive } from './paths';
import { WATCH_ATTACH_GRACE_MS } from './vite-event-source';

/**
 * How long the development host waits for the watcher to list every directory of the output root
 * before its watch starts. After this the watch starts anyway, with a warning: an output the
 * watcher does not list is never reported.
 */
export const OUTPUT_WATCH_ATTACH_TIMEOUT_MS = 10_000;

function normalize(value: string): string {
  return canonicalDrive(path.resolve(value).replace(/\\/g, '/'));
}

function within(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}/`);
}

/** The path as given and as resolved through symlinks (for example /var → /private/var). */
function spellings(value: string): string[] {
  const values = new Set([normalize(value)]);
  try {
    values.add(normalize(realpathSync(value)));
    // The spelling the engine publishes (on Windows: the on-disk case, `subst` drives resolved).
    values.add(normalize(realpathSync.native(value)));
  } catch {
    // A path that cannot be resolved keeps only the spelling it was given.
  }
  return [...values];
}

/**
 * Makes the Vite watcher report every change of the generated output.
 *
 * The host update coordinator expects a Vite hot update for every generated module a commit
 * creates, rewrites or deletes, and settles an edit only once they all arrived. Vite watches its
 * root recursively, but a file outside it only once Vite has served it. An output root outside
 * the Vite root (the documentation site's `apps/ng-doc/src` root with its output in `ng-doc/`)
 * therefore reported only the modules the browser had loaded: a new page
 * tab, a new page or an edit of a page nobody opened never produced its hot update, and the edit
 * failed with `NGDOC_VITE_HOST_TIMEOUT`. Such a root is added to the watcher here, and startup
 * waits until the output is watched, because chokidar ignores initial files: a file written while
 * it still scans a directory would be taken as initial and never reported.
 *
 * chokidar lists a directory in `getWatched()` before it has read it, and its `fs.watch` backend
 * (Linux, Windows) attaches the directory's native watch only after that read. So the output
 * counts as watched once every directory of the published output (`files`, relative to the root)
 * lists each of its published entries (the read is done), and `WATCH_ATTACH_GRACE_MS` later.
 *
 * An output root inside the Vite root is watched by Vite's recursive watch, but the initial commit
 * ran while chokidar still scanned that root. With the `fs.watch` backend a file published between
 * a directory's read and its watch is neither listed nor ever reported (only FSEvents, on macOS,
 * watches the whole tree at once). Each published directory whose entries the watcher does not all
 * list yet is therefore added again: chokidar reads it once more and takes what it finds as
 * initial (or, while a read of it still runs, reads it again after that one), and the same wait
 * follows.
 *
 * Resolves `watched` once the output is watched (at once when the watcher cannot list what it
 * watches), `timeout` after `timeoutMs` (the caller warns), and `disposed` as soon as `disposed()`
 * is true.
 */
export async function watchOutputRoot(
  watcher: FSWatcher,
  viteRoot: string,
  outputRoot: string,
  files: readonly string[],
  options: { timeoutMs?: number; disposed?: () => boolean } = {},
): Promise<'watched' | 'timeout' | 'disposed'> {
  const { timeoutMs = OUTPUT_WATCH_ATTACH_TIMEOUT_MS, disposed = () => false } = options;
  // Inside the Vite root, the output root as the watcher spells it: below the Vite root as given.
  const viteRoots = spellings(viteRoot);
  let inside: string | undefined;
  for (const output of spellings(outputRoot)) {
    const container = viteRoots.find((root) => within(output, root));
    if (container !== undefined) {
      inside = normalize(viteRoot) + output.slice(container.length);
      break;
    }
  }
  if (disposed()) return 'disposed';
  // Nothing published inside the Vite root: nothing its scan could have missed.
  if (inside !== undefined && files.length === 0) return 'watched';
  const root = inside ?? normalize(outputRoot);
  // Each directory with the entries its read must list: published files and subdirectories.
  const entries = new Map<string, Set<string>>([[root, new Set()]]);
  for (const file of files) {
    let target = `${root}/${file.replace(/\\/g, '/')}`;
    while (target !== root && within(target, root)) {
      const parent = path.posix.dirname(target);
      const listed = entries.get(parent) ?? new Set<string>();
      listed.add(path.posix.basename(target));
      entries.set(parent, listed);
      target = parent;
    }
  }
  if (inside === undefined) watcher.add(outputRoot);
  const getWatched = (watcher as Partial<FSWatcher>).getWatched;
  if (typeof getWatched !== 'function') return 'watched';
  /** The directories whose read has not listed every published entry (or that are unlisted). */
  const unread = () => {
    const watched = new Map(
      Object.entries(getWatched.call(watcher)).map(([directory, names]) => [
        normalize(directory),
        new Set(names),
      ]),
    );
    return [...entries]
      .filter(([directory, names]) => {
        const listed = watched.get(directory);
        return listed === undefined || [...names].some((name) => !listed.has(name));
      })
      .map(([directory]) => directory);
  };
  // Only those: another listener on a directory that is fully listed would just read it again on
  // each of its events. One whose read is still running reads once more when that read ends.
  if (inside !== undefined) for (const directory of unread()) watcher.add(directory);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (disposed()) return 'disposed';
    if (unread().length === 0) break;
    if (Date.now() >= deadline) return 'timeout';
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await new Promise((resolve) => setTimeout(resolve, WATCH_ATTACH_GRACE_MS));
  return disposed() ? 'disposed' : 'watched';
}
