import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { FSWatcher } from 'vite';

import { canonicalDrive } from './paths';
import { WATCH_ATTACH_GRACE_MS } from './vite-event-source';

/**
 * How long the development host waits for the watcher to list every directory of the output root
 * before its watch starts. After this the watch starts anyway: only a commit made while chokidar
 * still scans the root could go unreported, and none is made before the watch starts.
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
 * the Vite root (the documentation site's `apps/ng-doc/src` root with its output in
 * `ng-doc-modernization/`) therefore reported only the modules the browser had loaded: a new page
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
 * Resolves `watched` once the output is watched (at once when the Vite root contains it, or when
 * the watcher cannot list what it watches), `timeout` after `timeoutMs` (the caller warns), and
 * `disposed` as soon as `disposed()` is true.
 */
export async function watchOutputRoot(
  watcher: FSWatcher,
  viteRoot: string,
  outputRoot: string,
  files: readonly string[],
  options: { timeoutMs?: number; disposed?: () => boolean } = {},
): Promise<'watched' | 'timeout' | 'disposed'> {
  const { timeoutMs = OUTPUT_WATCH_ATTACH_TIMEOUT_MS, disposed = () => false } = options;
  const roots = spellings(viteRoot);
  if (spellings(outputRoot).some((output) => roots.some((root) => within(output, root)))) {
    return 'watched';
  }
  if (disposed()) return 'disposed';
  watcher.add(outputRoot);
  const getWatched = (watcher as Partial<FSWatcher>).getWatched;
  if (typeof getWatched !== 'function') return 'watched';
  const root = normalize(outputRoot);
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
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (disposed()) return 'disposed';
    const watched = new Map(
      Object.entries(getWatched.call(watcher)).map(([directory, names]) => [
        normalize(directory),
        new Set(names),
      ]),
    );
    const ready = [...entries].every(([directory, names]) => {
      const listed = watched.get(directory);
      return listed !== undefined && [...names].every((name) => listed.has(name));
    });
    if (ready) break;
    if (Date.now() >= deadline) return 'timeout';
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await new Promise((resolve) => setTimeout(resolve, WATCH_ATTACH_GRACE_MS));
  return disposed() ? 'disposed' : 'watched';
}
