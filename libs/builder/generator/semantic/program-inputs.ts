import { existsSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { ts } from 'ts-morph';

import { compareText } from '../../helpers/text-order';
import type { Dependency } from '../contracts';
import { createDependencyRefresher } from '../graph';
import { normalize } from './dependencies';
import type { OwnedRoots } from './owned-roots';

/** Package folders TypeScript's `**` never enters unless a pattern names them. */
const PACKAGE_FOLDERS = ['node_modules', 'bower_components', 'jspm_packages'];
/** Characters fast-glob reads specially but TypeScript treats literally. */
const FAST_GLOB_SPECIAL = /[\\()[\]{}!+@|]/;

/** Present only while the recorded membership cannot be trusted: never exists, never verifies. */
export const UNVERIFIABLE_MEMBERSHIP = '.ng-doc-unverifiable-tsconfig-membership';

interface ConfigFileSpecs {
  validatedFilesSpec?: readonly string[];
  validatedIncludeSpecs?: readonly string[];
  validatedExcludeSpecs?: readonly string[];
}

export interface TsconfigSpecs {
  files: string[];
  include: string[];
  exclude: string[];
}

/** TypeScript's validated specs with `${configDir}` substituted, from the configuration it used. */
export function tsconfigSpecs(parsed: ts.ParsedCommandLine, configFile: string): TsconfigSpecs {
  const specs = (
    (parsed.options as Record<string, unknown>)['configFile'] as
      | { configFileSpecs?: ConfigFileSpecs }
      | undefined
  )?.configFileSpecs;
  if (specs) {
    const files = [...(specs.validatedFilesSpec ?? [])];
    return {
      files,
      include: [...(specs.validatedIncludeSpecs ?? (files.length ? [] : ['**/*']))],
      exclude: [...(specs.validatedExcludeSpecs ?? [])],
    };
  }
  // Fallback for a TypeScript without internal specs. Any translation gap is caught by the
  // record-time comparison with TypeScript's own root files below.
  const directory = normalize(dirname(configFile));
  const raw = (parsed.raw ?? {}) as Record<string, unknown>;
  const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.replaceAll('${configDir}', directory))
      : undefined;
  const files = strings(raw['files']);
  return {
    files: files ?? [],
    include: strings(raw['include']) ?? (files ? [] : ['**/*']),
    exclude: strings(raw['exclude']) ?? [],
  };
}

const wildcard = (segment: string): boolean => segment.includes('*') || segment.includes('?');

/** Splits an absolute normalized spec at its first TypeScript wildcard segment. */
function staticBase(spec: string): { base: string; rest: string[] } {
  const parts = spec.split('/');
  const index = parts.findIndex(wildcard);
  if (index < 0) return { base: spec, rest: [] };
  return { base: parts.slice(0, index).join('/') || '/', rest: parts.slice(index) };
}

function inside(root: string, path: string): boolean {
  return path === root || path.startsWith(root === '/' ? '/' : `${root}/`);
}

/**
 * Translates TypeScript spec segments into fast-glob segments with TypeScript's meaning:
 * only `*`, `?` and a whole `**` segment are wildcards; every other character is literal.
 * Without case-sensitive file names, letters match either case as TypeScript does.
 */
/**
 * How a literal character is written in a recorded fast-glob pattern. Patterns are recorded
 * through the graph refresher, which rewrites every backslash to `/`, so backslash escapes are
 * never used: special characters become a one-character bracket class, and `!` and `\` (whose
 * bracket classes fast-glob or minimatch read differently) become `?`, which only over-includes.
 */
function literal(character: string): string {
  if (character === '!' || character === '\\') return '?';
  return FAST_GLOB_SPECIAL.test(character) ? `[${character}]` : character;
}

let caseGroups: Map<string, string> | undefined;

/**
 * TypeScript matches case-insensitively with a non-Unicode `/i` RegExp, whose canonicalization
 * maps a code unit to its single-code-unit upper case unless that maps non-ASCII to ASCII.
 * Characters are therefore grouped by that canonical form (for example σ, ς and Σ), and a group
 * of one needs no class. Characters outside the Basic Multilingual Plane are never folded.
 */
function caseGroup(character: string): string {
  if (!caseGroups) {
    const canonical = (value: string): string => {
      const upper = value.toUpperCase();
      if (upper.length !== 1) return value;
      if (value.charCodeAt(0) >= 128 && upper.charCodeAt(0) < 128) return value;
      return upper;
    };
    const members = new Map<string, string[]>();
    for (let code = 0; code < 0x10000; code++) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const value = String.fromCharCode(code);
      const key = canonical(value);
      if (key === value && value.toLowerCase() === value) continue;
      members.set(key, [...(members.get(key) ?? []), value]);
    }
    caseGroups = new Map();
    for (const [key, group] of members) {
      const all = [...new Set([key, ...group])].sort();
      if (all.length > 1) all.forEach((value) => caseGroups!.set(value, `[${all.join('')}]`));
    }
  }
  return caseGroups.get(character) ?? literal(character);
}

/**
 * Translates TypeScript spec segments into fast-glob segments with TypeScript's meaning:
 * only `*`, `?` and a whole `**` segment are wildcards; every other character is literal.
 * Without case-sensitive file names, letters match every case variant TypeScript's `/i` does.
 */
function segmentPattern(segment: string, caseInsensitive: boolean): string {
  if (segment === '**') return segment;
  let pattern = '';
  for (const character of segment) {
    if (character === '*' || character === '?') pattern += character;
    else if (caseInsensitive) pattern += caseGroup(character);
    else pattern += literal(character);
  }
  return pattern;
}

interface IncludeGlob {
  root: string;
  include: Set<string>;
  /** Package-folder ignores are exact only when directory wildcards are whole `**` segments. */
  packageIgnore: boolean;
}

/**
 * Filesystem observations that let the session re-verify how the tsconfig selected its program
 * root files after watcher subscription:
 * - every `files` entry as an existence observation (program bytes are recorded separately);
 * - one glob per static include directory, recorded through the same dependency refresher the
 *   session re-verifies with, so an unchanged tree reproduces the recorded members exactly.
 *
 * Include patterns may over-include relative to TypeScript (supported-extension groups, dot
 * folders); excludes are applied only where fast-glob provably excludes no more than TypeScript.
 * As a backstop, if any TypeScript root file is not reproduced by the recorded observations, an
 * input that can never verify is recorded, so a translation gap always regenerates instead of
 * reusing a result that may be stale. Owned roots are never observed.
 */
export async function tsconfigMembershipDependencies(
  parsed: ts.ParsedCommandLine,
  configFile: string,
  owned: OwnedRoots,
  specs: TsconfigSpecs = tsconfigSpecs(parsed, configFile),
): Promise<Dependency[]> {
  const directory = normalize(dirname(configFile));
  const caseInsensitive = !ts.sys.useCaseSensitiveFileNames;
  const key = (path: string): string => (caseInsensitive ? path.toLowerCase() : path);
  const extensions = [
    'ts',
    'tsx',
    'mts',
    'cts',
    ...(parsed.options.allowJs ? ['js', 'jsx', 'mjs', 'cjs'] : []),
  ].map((extension) => segmentPattern(extension, caseInsensitive));
  const anyFile = `*.{${extensions.join(',')}}`;
  const dependencies: Dependency[] = [];
  const reproduced = new Set<string>();

  for (const file of specs.files) {
    const path = normalize(resolve(directory, file));
    if (owned.has(path)) continue;
    dependencies.push({ kind: 'existence', path, exists: existsSync(path) });
    reproduced.add(key(path));
  }

  const globs = new Map<string, IncludeGlob>();
  for (const spec of specs.include) {
    const absolute = normalize(resolve(directory, spec));
    const { base, rest } = staticBase(absolute);
    let root: string;
    let parts: string[];
    let literal: string[];
    if (!rest.length) {
      const name = posix.basename(absolute);
      // TypeScript treats a final segment without an extension as a directory.
      if (name.includes('.')) {
        root = posix.dirname(absolute);
        literal = [name];
        parts = [segmentPattern(name, caseInsensitive)];
      } else {
        root = absolute;
        literal = ['**', '*'];
        parts = ['**', anyFile];
      }
    } else {
      root = base;
      literal = rest;
      parts = rest.map((segment) => segmentPattern(segment, caseInsensitive));
      if (rest[rest.length - 1] === '*') parts[parts.length - 1] = anyFile;
    }
    if (owned.has(root)) continue;
    const glob = globs.get(root) ?? { root, include: new Set<string>(), packageIgnore: true };
    glob.include.add(parts.join('/'));
    if (
      literal.slice(0, -1).some((part) => part !== '**' && wildcard(part)) ||
      literal.some((part) => PACKAGE_FOLDERS.some((name) => part.toLowerCase().includes(name)))
    )
      glob.packageIgnore = false;
    globs.set(root, glob);
  }

  const refresher = createDependencyRefresher();
  let trustworthy = true;
  for (const glob of [...globs.values()].sort((a, b) => compareText(a.root, b.root))) {
    const exclude = new Set<string>();
    for (const spec of specs.exclude) {
      const absolute = normalize(resolve(directory, spec));
      const { base, rest } = staticBase(absolute);
      let patterns: string[] = [];
      if (!rest.length) {
        if (inside(glob.root, absolute) && absolute !== glob.root) {
          const relative = posix.relative(glob.root, absolute);
          patterns = [relative, `${relative}/**`];
        }
      } else if (inside(glob.root, base)) {
        const relative = posix.relative(glob.root, base);
        patterns = [[...(relative ? [relative] : []), ...rest].join('/')];
      } else if (inside(base, glob.root) && rest[0] === '**') {
        patterns = [rest.join('/')];
      }
      // Excludes stay case-sensitive and literal, so fast-glob excludes a subset of what
      // TypeScript excludes. A spec fast-glob could read differently is dropped (inclusion).
      if (patterns.some((pattern) => FAST_GLOB_SPECIAL.test(pattern))) continue;
      patterns.forEach((pattern) => exclude.add(pattern));
    }
    if (glob.packageIgnore) PACKAGE_FOLDERS.forEach((name) => exclude.add(`**/${name}/**`));
    const observed = await refresher.refresh(
      [
        {
          kind: 'glob',
          root: glob.root,
          include: [...glob.include].sort(),
          exclude: [...exclude].sort(),
          members: [],
        },
      ],
      [],
    );
    const recorded = observed.dependencies[0];
    if (observed.diagnostics.length || recorded?.kind !== 'glob') {
      trustworthy = false;
      continue;
    }
    const members = recorded.members.filter((file) => !owned.has(file));
    members.forEach((file) => reproduced.add(key(file)));
    dependencies.push({ ...recorded, members });
  }

  // Backstop: TypeScript's own root files must all be reproduced by what was recorded.
  if (
    !trustworthy ||
    parsed.fileNames.some((file) => !owned.has(file) && !reproduced.has(key(normalize(file))))
  ) {
    dependencies.push({
      kind: 'existence',
      path: normalize(resolve(directory, UNVERIFIABLE_MEMBERSHIP)),
      exists: true,
    });
  }
  return dependencies;
}
