import { Tree } from '@angular-devkit/schematics';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, posix } from 'path';

import { JsonFile } from './json-file';

/**
 * The packages the Vite engine needs next to `@ng-doc/builder`, at the exact versions it is
 * released with: its optional peer dependencies. They are read from the package's own manifest,
 * so the schematic of a release always installs that release's tuple.
 */
export function ngDocViteDependencies(): { [name: string]: string } {
  const manifest = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
    peerDependencies?: { [name: string]: string };
  };
  return Object.fromEntries(Object.entries(manifest.peerDependencies ?? {}).sort());
}

/** A dependency the workspace has at another version than the Vite engine's. */
export interface DependencyMismatch {
  name: string;
  expected: string;
  found: string;
}

/**
 * Adds the missing Vite engine dependencies to the `devDependencies` of `package.json`. A package
 * the workspace already has is left at its version and returned as a mismatch when that version
 * is not the exact one.
 */
export function addNgDocViteDependencies(
  tree: Tree,
  dependencies: { [name: string]: string } = ngDocViteDependencies(),
): { added: { [name: string]: string }; mismatches: DependencyMismatch[] } {
  const added: { [name: string]: string } = {};
  const mismatches: DependencyMismatch[] = [];
  if (!tree.exists('package.json')) return { added, mismatches };
  const json = new JsonFile(tree, 'package.json');
  for (const [name, expected] of Object.entries(dependencies)) {
    const found =
      (json.get(['dependencies', name]) as string | undefined) ??
      (json.get(['devDependencies', name]) as string | undefined);
    if (found === undefined) {
      json.modify(['devDependencies', name], expected);
      added[name] = expected;
    } else if (found !== expected) {
      mismatches.push({ name, expected, found });
    }
  }
  return { added, mismatches };
}

/**
 * The SHA-256 of a file's content without its layout, as recorded in the migration state. The
 * Angular CLI formats the files a schematic wrote with the workspace's Prettier configuration, so
 * whitespace and trailing commas are left out: a formatted file still counts as the one the
 * migration wrote, and any other change counts as the user's.
 */
export function hashContent(content: string): string {
  const normalized = content.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

const CACHE_LINES = new Set(['.cache', '.cache/', '.cache/ng-doc', '.cache/ng-doc/']);

/**
 * Adds a line to `.gitignore` when no existing line already ignores it. Returns whether the file
 * changed; false also when the workspace has no `.gitignore`.
 */
export function addGitIgnoreLine(tree: Tree, line: string): boolean {
  if (!tree.exists('.gitignore')) return false;
  const text = tree.readText('.gitignore');
  const wanted = line.replace(/^\//, '');
  const covered = text
    .split(/\r?\n/)
    .map((entry) => entry.trim().replace(/^\//, ''))
    .some(
      (entry) =>
        entry === wanted ||
        entry === `${wanted}/` ||
        (CACHE_LINES.has(entry) && CACHE_LINES.has(wanted)),
    );
  if (covered) return false;
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  tree.overwrite('.gitignore', `${text}${separator}\n# NgDoc cache\n${line}\n`);
  return true;
}

/** Reads `compilerOptions.paths` of a tsconfig and of the files it extends, nearest first. */
export function readTsconfigPaths(
  tree: Tree,
  file: string,
): { [alias: string]: string[] } | undefined {
  const seen = new Set<string>();
  let current: string | undefined = file;
  while (current && tree.exists(current) && !seen.has(current)) {
    seen.add(current);
    const json: JsonFile = new JsonFile(tree, current);
    const paths = json.get(['compilerOptions', 'paths']) as unknown;
    if (paths && typeof paths === 'object') return paths as { [alias: string]: string[] };
    const extended = json.get(['extends']) as unknown;
    current =
      typeof extended === 'string' && extended.startsWith('.')
        ? posix.join(posix.dirname(current), extended)
        : undefined;
  }
  return undefined;
}
