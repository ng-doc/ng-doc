import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The packages whose code shapes what a generation produces (parsing, rendering, highlighting,
 * formatting, search records, bundling of page modules), read from the `package.json` they
 * resolve to from this module. A package named with a second entry is resolved from that
 * package's directory: `shiki` from `@shikijs/rehype`, which loads it, and `@shikijs/core` from
 * that `shiki`.
 */
const RUNTIME_PACKAGES: ReadonlyArray<readonly [string, string?]> = [
  ['typescript'],
  ['ts-morph'],
  ['@ts-morph/common'],
  ['prettier'],
  ['@prettier/sync'],
  ['@shikijs/rehype'],
  ['shiki', '@shikijs/rehype'],
  ['@shikijs/core', 'shiki'],
  ['marked'],
  ['gray-matter'],
  ['nunjucks'],
  ['esbuild'],
  ['@microsoft/tsdoc'],
  ['@orama/orama'],
  ['@orama/plugin-parsedoc'],
  ['posthtml-parser'],
  ['posthtml-render'],
  ['rehype'],
  ['rehype-parse'],
  ['rehype-stringify'],
  ['rehype-minify-whitespace'],
  ['unified'],
  ['github-slugger'],
  ['stringify-entities'],
  ['css-what'],
  ['oxc-parser'],
];

let packages: Readonly<Record<string, string | null>> | undefined;

/**
 * The resolved version of every package in {@link RUNTIME_PACKAGES} (`null` when it does not
 * resolve), in that order. Read once per process: a package upgraded while it runs is not the code
 * it loaded, and the next process reads the new versions.
 */
export function runtimePackages(): Readonly<Record<string, string | null>> {
  packages ??= Object.freeze(
    packageVersions(RUNTIME_PACKAGES, path.dirname(fileURLToPath(import.meta.url))),
  );
  return packages;
}

/**
 * The version of each package of `list` as Node's resolution finds it from `from` upwards, or from
 * the directory of the package named second (`null` when it does not resolve or names none).
 */
export function packageVersions(
  list: ReadonlyArray<readonly [string, string?]>,
  from: string,
): Record<string, string | null> {
  const versions: Record<string, string | null> = {};
  const directories = new Map<string, string | undefined>();
  for (const [name, via] of list) {
    const start = via ? directories.get(via) : from;
    const directory = start ? packageDirectory(name, start) : undefined;
    directories.set(name, directory);
    versions[name] = directory ? packageVersion(directory) : null;
  }
  return versions;
}

/** The directory of package `name` as Node's resolution finds it from `directory` upwards. */
function packageDirectory(name: string, directory: string): string | undefined {
  for (let current = directory; ; current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.dirname(current) === current) return undefined;
  }
}

function packageVersion(directory: string): string | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const version = (value as { version?: unknown } | null)?.version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}
