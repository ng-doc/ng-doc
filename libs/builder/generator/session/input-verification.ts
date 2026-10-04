import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { compareText } from '../../helpers/text-order';
import type { Dependency, FileChange } from '../contracts';
import { createDependencyRefresher } from '../graph';

export type PhysicalInput = Extract<Dependency, { kind: 'content' | 'existence' | 'glob' }>;

/** Bounds concurrently open files while re-observing a complete compilation input set. */
const CONCURRENCY = 64;

function normalize(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

function owned(file: string, roots: readonly string[]): boolean {
  return roots.some((root) => file === root || file.startsWith(`${root}/`));
}

function members(values: readonly string[], roots: readonly string[]): string {
  return JSON.stringify(
    [...new Set(values.map(normalize))].filter((file) => !owned(file, roots)).sort(),
  );
}

/** The filesystem observations of a compilation; semantic and keyword digests derive from them. */
export function physicalInputs(dependencies: readonly Dependency[]): PhysicalInput[] {
  return dependencies.filter(
    (dependency): dependency is PhysicalInput =>
      dependency.kind === 'content' ||
      dependency.kind === 'existence' ||
      dependency.kind === 'glob',
  );
}

/**
 * Re-observes every recorded filesystem input with the compiler's own dependency refresher.
 *
 * Content and existence observations must match exactly, including observations below the
 * generator-owned roots: a compilation that read its own previous outputs is only current while
 * those bytes are unchanged. Glob membership is compared without owned-root members because
 * semantic source membership excludes generated output by construction and watchers never report
 * owned-root changes. Any read failure or difference reports a change.
 */
export async function inputsUnchanged(
  inputs: readonly PhysicalInput[],
  ownedRoots: readonly string[],
): Promise<boolean> {
  const roots = ownedRoots.map(normalize);
  const refresher = createDependencyRefresher();
  for (let offset = 0; offset < inputs.length; offset += CONCURRENCY) {
    const observations = await Promise.all(
      inputs.slice(offset, offset + CONCURRENCY).map(async (input) => {
        const refreshed = await refresher.refresh([input], []);
        // A failed glob scan returns its recorded membership; the error itself is the change.
        if (refreshed.diagnostics.some((item) => item.severity === 'error')) return false;
        const current = refreshed.dependencies[0];
        if (input.kind === 'content')
          return current?.kind === 'content' && current.digest === input.digest;
        if (input.kind === 'existence')
          return current?.kind === 'existence' && current.exists === input.exists;
        return (
          current?.kind === 'glob' &&
          members(current.members, roots) === members(input.members, roots)
        );
      }),
    );
    if (observations.some((unchanged) => !unchanged)) return false;
  }
  return true;
}

const CHANGE_RANK: Record<FileChange['kind'], number> = { update: 0, create: 1, delete: 1 };

/**
 * Re-observes recorded filesystem inputs and reports each difference as the file event a watcher
 * would have delivered: a changed digest is an update, a vanished file a delete, an existence
 * flip a create or delete, and glob membership differences creates and deletes. Paths below the
 * generator-owned roots are never reported, exactly as watchers ignore them. A glob that cannot be
 * scanned reports nothing: its members are still individually observed as content inputs.
 */
export async function changedInputs(
  inputs: readonly PhysicalInput[],
  ownedRoots: readonly string[],
): Promise<FileChange[]> {
  const roots = ownedRoots.map(normalize);
  const refresher = createDependencyRefresher();
  const changes = new Map<string, FileChange>();
  const add = (kind: FileChange['kind'], file: string): void => {
    const path = normalize(file);
    if (owned(path, roots)) return;
    const existing = changes.get(path);
    if (!existing || CHANGE_RANK[kind] > CHANGE_RANK[existing.kind])
      changes.set(path, { kind, path });
  };
  for (let offset = 0; offset < inputs.length; offset += CONCURRENCY) {
    await Promise.all(
      inputs.slice(offset, offset + CONCURRENCY).map(async (input) => {
        if (input.kind !== 'glob' && owned(normalize(input.path), roots)) return;
        const refreshed = await refresher.refresh([input], []);
        const current = refreshed.dependencies[0];
        if (input.kind === 'content') {
          if (current?.kind !== 'content') add('delete', input.path);
          else if (current.digest !== input.digest) add('update', input.path);
          return;
        }
        if (input.kind === 'existence') {
          if (current?.kind === 'existence' && current.exists !== input.exists)
            add(current.exists ? 'create' : 'delete', input.path);
          return;
        }
        if (
          current?.kind !== 'glob' ||
          refreshed.diagnostics.some((item) => item.severity === 'error')
        )
          return;
        const before = new Set(input.members.map(normalize));
        const after = new Set(current.members.map(normalize));
        after.forEach((member) => before.has(member) || add('create', member));
        before.forEach((member) => after.has(member) || add('delete', member));
      }),
    );
  }
  return [...changes.values()].sort((left, right) => compareText(left.path, right.path));
}

/** `file` itself and every directory above it that is in `wanted`, appended to `into`. */
function wantedAtOrAbove(file: string, wanted: ReadonlySet<string>, into: string[]): void {
  for (
    let cursor = file, parent = path.dirname(file);
    ;
    cursor = parent, parent = path.dirname(parent)
  ) {
    if (wanted.has(cursor)) into.push(cursor);
    if (parent === cursor) return;
  }
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Re-observes only the recorded inputs at the given paths. A watch host passes the targets it has
 * just begun watching and the changes it rejected while the generation that recorded them ran:
 * that generation may have read them before any watch could report a change. Differences are
 * reported exactly as `changedInputs` reports them.
 *
 * A path selects every content or existence observation at or below it, and every glob whose root
 * is at, below or above it, so that a membership change is found. A glob records membership only,
 * never content: it vouches for a directory (a glob base), but a file is compared only through its
 * own content or existence observation. A path without one has nothing to compare with (for
 * example a file the generation read but never recorded), so it is reported as changed: an
 * `update` while it exists, otherwise a `delete`. Paths below the owned roots are never reported.
 */
export async function reobservedChanges(
  inputs: readonly PhysicalInput[],
  ownedRoots: readonly string[],
  paths: readonly string[],
): Promise<FileChange[]> {
  const roots = ownedRoots.map(normalize);
  const wanted = new Set(paths.map(normalize).filter((file) => !owned(file, roots)));
  if (!wanted.size) return [];
  const directories = new Set([...wanted].filter(isDirectory));
  const selected: PhysicalInput[] = [];
  const covered = new Set<string>();
  for (const input of inputs) {
    const found: string[] = [];
    if (input.kind === 'glob') {
      const root = normalize(input.root);
      wantedAtOrAbove(root, wanted, found);
      for (const file of wanted) if (file.startsWith(`${root}/`)) found.push(file);
    } else {
      wantedAtOrAbove(normalize(input.path), wanted, found);
    }
    if (!found.length) continue;
    selected.push(input);
    for (const file of found) {
      if (input.kind !== 'glob' || directories.has(file)) covered.add(file);
    }
  }
  const changes = new Map(
    (await changedInputs(selected, ownedRoots)).map((change) => [change.path, change]),
  );
  for (const file of wanted) {
    if (!covered.has(file) && !changes.has(file))
      changes.set(file, { kind: existsSync(file) ? 'update' : 'delete', path: file });
  }
  return [...changes.values()].sort((left, right) => compareText(left.path, right.path));
}
