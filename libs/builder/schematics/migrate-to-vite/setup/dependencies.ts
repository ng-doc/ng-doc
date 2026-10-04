import { Tree } from '@angular-devkit/schematics';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, posix } from 'path';

import { JsonFile } from './json-file';

/**
 * The packages the Vite engine needs next to `@ng-doc/builder`, with the version ranges it is
 * released and tested with (`ng-doc.viteEngine` in the package's own manifest), so the schematic of
 * a release always installs that release's ranges. Each is a caret range (`^8.3.0`): npm installs
 * the newest matching release, and nothing is pinned.
 */
export function ngDocViteDependencies(): { [name: string]: string } {
  const manifest = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
    'ng-doc'?: { viteEngine?: { [name: string]: string } };
  };
  return Object.fromEntries(Object.entries(manifest['ng-doc']?.viteEngine ?? {}).sort());
}

/**
 * The packages whose version the Vite engine checks when it starts: it refuses any version outside
 * the range, while the others only differ from what it is tested with.
 */
const ENFORCED = new Set(['vite']);

/** Whether the Vite engine refuses to start with a version of this package outside its range. */
export function isEnforced(name: string): boolean {
  return ENFORCED.has(name);
}

/** A dependency the workspace has at a version outside the Vite engine's range. */
export interface DependencyMismatch {
  name: string;
  expected: string;
  /** The specifier in `package.json`; empty for an outdated Angular that is only installed. */
  found: string;
  /** The installed version, when it is what lies outside the range. */
  installed?: string;
}

/** The report line of a dependency mismatch, with the command that fixes an enforced one. */
export function dependencyMismatchText({
  name,
  expected,
  found,
  installed,
}: DependencyMismatch): string {
  const is = `\`${name}\` is \`${found}\`${installed ? ` (installed \`${installed}\`)` : ''}`;
  return isEnforced(name)
    ? `${is}; the Vite engine requires \`${expected}\` and does not start ` +
        `with another version. Update it: \`npm i -D ${name}@${expected}\`.`
    : `${is}; the Vite engine is tested with \`${expected}\`.`;
}

type Version = readonly [number, number, number];

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.+-]*)?$/;

function parseVersion(text: string): Version | undefined {
  const match = VERSION.exec(text.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compare(left: Version, right: Version): number {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return 0;
}

/** The lower bound and the exclusive upper bound a caret range (`^8.3.0`, major ≥ 1) admits. */
function caretBounds(range: string): readonly [Version, Version] | undefined {
  const version = range.startsWith('^') ? parseVersion(range.slice(1)) : undefined;
  return version && version[0] > 0 ? [version, [version[0] + 1, 0, 0]] : undefined;
}

/**
 * Whether a declared dependency specifier can resolve to a version inside `required` (a caret
 * range): true when it does, false when it cannot, and undefined when the specifier is not a plain
 * version, caret or tilde range (a tag, a URL, `>=`, `||`, `x`), which this check cannot tell.
 * @param declared - The specifier in the workspace's `package.json`.
 * @param required - The engine's range, such as `^8.3.0`.
 */
export function admitsRange(declared: string, required: string): boolean | undefined {
  const bounds = caretBounds(required);
  if (!bounds) return undefined;
  const [low, high] = bounds;
  const text = declared.trim();
  const operator = /^[\^~=]/.exec(text)?.[0];
  const version = parseVersion(operator ? text.slice(1) : text);
  if (!version) return undefined;
  if (!operator || operator === '=')
    return compare(version, low) >= 0 && compare(version, high) < 0;
  // `^0.y.z` and `~x.y.z` stay below the next minor; `^x.y.z` below the next major.
  const upper: Version =
    operator === '~' || version[0] === 0 ? [version[0], version[1] + 1, 0] : [version[0] + 1, 0, 0];
  return compare(version, high) < 0 && compare(upper, low) > 0;
}

/**
 * The oldest Angular the Vite engine starts with. It refuses an older `@angular/compiler-cli`
 * (`NGDOC_VITE_ANGULAR_VERSION`, `MINIMUM_ANGULAR_COMPILER` in `generator/vite/angular-version.ts`),
 * so the setup refuses one too; `@angular/compiler` is always the same release.
 */
export const MINIMUM_VITE_ENGINE_ANGULAR = '22.2.0';

const ANGULAR_COMPILERS = ['@angular/compiler-cli', '@angular/compiler'];

/** The command that moves a workspace to the newest Angular 22. */
export const UPDATE_ANGULAR = 'ng update @angular/core@22 @angular/cli@22';

/**
 * Whether a version, or a declared specifier, cannot reach `minimum`: true for a version below it
 * and for a plain version, caret or tilde range whose every version is below it; undefined for a
 * specifier this check cannot tell (a tag, a URL, `>=`, `||`, `x`). Prereleases count as their
 * release, as the Vite engine's own check does.
 * @param declared - An installed version or a specifier in `package.json`.
 * @param minimum - The lowest admitted version, such as `22.2.0`.
 */
export function isBelowVersion(declared: string, minimum: string): boolean | undefined {
  const low = parseVersion(minimum);
  const text = declared.trim();
  const operator = /^[\^~=]/.exec(text)?.[0];
  const version = parseVersion(operator ? text.slice(1) : text);
  if (!low || !version) return undefined;
  if (!operator || operator === '=') return compare(version, low) < 0;
  // The specifier's exclusive upper bound, as in `admitsRange`.
  const upper: Version =
    operator === '~' || version[0] === 0 ? [version[0], version[1] + 1, 0] : [version[0] + 1, 0, 0];
  return compare(upper, low) <= 0;
}

/**
 * The Angular compilers of the workspace that are older than the Vite engine starts with
 * ({@link MINIMUM_VITE_ENGINE_ANGULAR}): by their installed version when the tree can read it,
 * otherwise by their specifier in `package.json`. The setup refuses to continue with any of them.
 * @param tree - The workspace tree.
 */
export function findOutdatedAngular(tree: Tree): DependencyMismatch[] {
  if (!tree.exists('package.json')) return [];
  const json = new JsonFile(tree, 'package.json');
  const outdated: DependencyMismatch[] = [];
  for (const name of ANGULAR_COMPILERS) {
    const found =
      (json.get(['dependencies', name]) as string | undefined) ??
      (json.get(['devDependencies', name]) as string | undefined);
    // The installed one is what the engine loads, even when only another package depends on it.
    const installed = installedVersion(tree, name);
    const version = installed ?? found;
    if (version !== undefined && isBelowVersion(version, MINIMUM_VITE_ENGINE_ANGULAR)) {
      outdated.push({
        name,
        expected: `>=${MINIMUM_VITE_ENGINE_ANGULAR}`,
        found: found ?? '',
        ...(installed !== undefined ? { installed } : {}),
      });
    }
  }
  return outdated;
}

/**
 * Why an outdated Angular compiler blocks the Vite setup, with the command that fixes it, written
 * to follow the package name in a report line.
 */
export function outdatedAngularText({ found, installed }: DependencyMismatch): string {
  const is = found
    ? `is \`${found}\`${installed ? ` (installed \`${installed}\`)` : ''}`
    : `is installed at \`${installed}\``;
  return (
    `${is}; the Vite engine needs ` +
    `Angular 22.2 or later and does not start with an older one. Update Angular first: ` +
    `\`${UPDATE_ANGULAR}\`.`
  );
}

/**
 * The version of a package installed in the workspace's `node_modules`, when the tree can read
 * it (a real workspace; schematic test trees have none).
 */
function installedVersion(tree: Tree, name: string): string | undefined {
  const file = `node_modules/${name}/package.json`;
  if (!tree.exists(file)) return undefined;
  try {
    const version = (JSON.parse(tree.readText(file)) as { version?: unknown }).version;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Adds the missing Vite engine dependencies to the `devDependencies` of `package.json`. A package
 * the workspace already declares is left as it is: nothing is added when its installed version
 * (or, before an install, its specifier) satisfies the engine's range, and it is returned as a
 * mismatch when it cannot.
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
      continue;
    }
    const installed = installedVersion(tree, name);
    if (installed !== undefined) {
      if (admitsRange(installed, expected) === false) {
        mismatches.push({ name, expected, found, installed });
      }
    } else if (admitsRange(found, expected) === false) {
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
