import path from 'node:path';
import ts from 'typescript';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';

import { canonicalDrive } from './paths';

/** The name of the plugin that resolves the `paths` of the application's tsconfig. */
export const NG_DOC_TSCONFIG_PATHS_PLUGIN = '@ng-doc/vite:tsconfig-paths';

/** The `tsconfig` option of the Analog Angular plugin. */
export type AngularTsconfigOption = string | (() => string) | undefined;

interface Pattern {
  readonly prefix: string;
  readonly suffix: string;
}

/** The `paths` of one tsconfig, with everything a resolution needs. */
export interface TsconfigPathMappings {
  readonly options: ts.CompilerOptions;
  /** The directory `paths` targets are relative to: `baseUrl`, else the declaring tsconfig's. */
  readonly base: string;
  readonly exact: ReadonlySet<string>;
  readonly patterns: readonly Pattern[];
}

/** A parsed tsconfig: its mappings (none without `paths`) and every file the parse read. */
export interface TsconfigPaths {
  readonly file: string;
  readonly mappings?: TsconfigPathMappings;
  /** The tsconfig and the configurations it extends, as canonical paths. */
  readonly inputs: ReadonlySet<string>;
}

const DECLARATION = /\.d\.(?:[cm]?ts|[^./\\]+\.ts)$/;
// `node:fs`, `virtual:x`, `data:…`: never a path mapping. A drive letter is caught as absolute.
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

function canonical(file: string): string {
  return canonicalDrive(path.resolve(file));
}

/**
 * The tsconfig the Analog Angular plugin compiles with, resolved as Analog resolves it: an
 * absolute path as is, anything else against the Vite root, and by default `tsconfig.app.json`
 * (`tsconfig.lib.json`, or `tsconfig.lib.prod.json` in production, for a library build).
 */
export function angularTsconfigPath(
  root: string,
  tsconfig: AngularTsconfigOption,
  isProd: boolean,
  isLib: boolean,
): string {
  const value = typeof tsconfig === 'function' ? tsconfig() : tsconfig;
  if (value && path.isAbsolute(value)) return value;
  const fallback = isLib
    ? isProd
      ? './tsconfig.lib.prod.json'
      : './tsconfig.lib.json'
    : './tsconfig.app.json';
  return path.resolve(root, value || fallback);
}

/**
 * Reads the `paths` of a tsconfig with TypeScript's own parser, so `extends` (files and packages),
 * `baseUrl` and the base directory of inherited `paths` mean what they mean to the compiler. The
 * parse never lists the program's files: only the compiler options are used.
 */
export function readTsconfigPaths(file: string): TsconfigPaths {
  const inputs = new Set<string>();
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    fileExists: (name) => ts.sys.fileExists(name),
    readFile(name: string) {
      inputs.add(canonical(name));
      return ts.sys.readFile(name);
    },
    readDirectory: () => [],
  };
  const text = host.readFile(file);
  if (text === undefined) return { file, inputs };
  const json = ts.parseConfigFileTextToJson(file, text);
  if (json.error) return { file, inputs };
  const { options } = ts.parseJsonConfigFileContent(
    json.config,
    host,
    path.dirname(file),
    undefined,
    file,
  );
  const paths = options.paths;
  if (!paths || Object.keys(paths).length === 0) return { file, inputs };
  const exact = new Set<string>();
  const patterns: Pattern[] = [];
  for (const key of Object.keys(paths)) {
    const star = key.indexOf('*');
    if (star === -1) exact.add(key);
    // TypeScript ignores a pattern with more than one wildcard.
    else if (key.indexOf('*', star + 1) === -1) {
      patterns.push({ prefix: key.slice(0, star), suffix: key.slice(star + 1) });
    }
  }
  const base =
    options.baseUrl ??
    (options as { pathsBasePath?: string }).pathsBasePath ??
    path.dirname(path.resolve(file));
  return { file, inputs, mappings: { options, base, exact, patterns } };
}

function matches(pattern: Pattern, source: string): boolean {
  return (
    source.length >= pattern.prefix.length + pattern.suffix.length &&
    source.startsWith(pattern.prefix) &&
    source.endsWith(pattern.suffix)
  );
}

/** Whether a specifier is a bare module name that a `paths` key of the mappings matches. */
export function matchesPathMapping(mappings: TsconfigPathMappings, source: string): boolean {
  if (
    !source ||
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('\0') ||
    source.includes('?') ||
    path.isAbsolute(source) ||
    SCHEME.test(source)
  ) {
    return false;
  }
  return mappings.exact.has(source) || mappings.patterns.some((item) => matches(item, source));
}

/**
 * The locations a specifier maps to, in order, as TypeScript substitutes them: an exact key wins,
 * otherwise the wildcard pattern with the longest prefix.
 */
export function pathMappingTargets(mappings: TsconfigPathMappings, source: string): string[] {
  const paths = mappings.options.paths ?? {};
  let targets: readonly string[] | undefined;
  let star = '';
  if (mappings.exact.has(source)) {
    targets = paths[source];
  } else {
    let best: Pattern | undefined;
    for (const pattern of mappings.patterns) {
      if (matches(pattern, source) && (!best || pattern.prefix.length > best.prefix.length)) {
        best = pattern;
      }
    }
    if (best) {
      targets = paths[`${best.prefix}*${best.suffix}`];
      star = source.slice(best.prefix.length, source.length - best.suffix.length);
    }
  }
  return (targets ?? []).map((target) => path.resolve(mappings.base, target.replace('*', star)));
}

function inNodeModules(file: string): boolean {
  return /[\\/]node_modules[\\/]/.test(file);
}

/**
 * Resolves the `compilerOptions.paths` of the application's tsconfig, as the Angular CLI does: a
 * bare specifier that a `paths` key matches is resolved by TypeScript's module resolution with the
 * tsconfig's options, then handed to Vite as the file path, so it gets the same module id as a
 * relative import of that file. A mapping TypeScript resolves to a declaration file (a built
 * library in `dist`, for example) is resolved as Vite resolves the installed package, or else its
 * mapped locations, which reads the package's `package.json`. What TypeScript does not resolve, or
 * finds in `node_modules`, is
 * left to Vite. Modules in `node_modules` never use the application's mappings, and an alias of
 * the Vite configuration wins over a mapping, since Vite applies aliases first.
 *
 * In development, the tsconfig and the configurations it extends are watched, and an edit of one
 * is read again at the next resolution.
 */
export function createTsconfigPathsPlugin(tsconfig: AngularTsconfigOption): Plugin {
  let root = '.';
  let isProd = false;
  let isLib = false;
  let file: string | undefined;
  let parsed: TsconfigPaths | undefined;

  const current = (): TsconfigPaths | undefined => {
    if (!file) return undefined;
    parsed ??= readTsconfigPaths(file);
    return parsed;
  };

  return {
    name: NG_DOC_TSCONFIG_PATHS_PLUGIN,
    enforce: 'pre',
    config(user: UserConfig) {
      // The same context the Analog plugin resolves its tsconfig in.
      root = user.root || '.';
      isProd = user.mode === 'production' || process.env['NODE_ENV'] === 'production';
      isLib = !!user.build?.lib;
    },
    configResolved() {
      file = angularTsconfigPath(root, tsconfig, isProd, isLib);
      parsed = undefined;
    },
    configureServer(server: ViteDevServer) {
      const inputs = [...(current()?.inputs ?? [])];
      if (inputs.length) server.watcher.add(inputs);
      const drop = (changed: string) => {
        if (parsed?.inputs.has(canonical(changed))) parsed = undefined;
      };
      server.watcher.on('change', drop);
      server.watcher.on('add', drop);
      server.watcher.on('unlink', drop);
    },
    async resolveId(
      source: string,
      importer: string | undefined,
      options: Parameters<Extract<Plugin['resolveId'], (...args: never[]) => unknown>>[2],
    ) {
      const mappings = current()?.mappings;
      if (!mappings || !matchesPathMapping(mappings, source)) return null;
      const importerFile = importer?.replace(/[?#].*$/, '');
      if (importerFile && inNodeModules(importerFile)) return null;
      const containing =
        importerFile && !importerFile.startsWith('\0') && path.isAbsolute(importerFile)
          ? importerFile
          : path.join(mappings.base, 'index.ts');
      const resolution = ts.resolveModuleName(
        source,
        containing,
        mappings.options,
        ts.sys,
      ).resolvedModule;
      // Not mapped to an existing file, or found in node_modules: Vite resolves it as a package.
      if (!resolution || resolution.isExternalLibraryImport) return null;
      let targets = [resolution.resolvedFileName];
      if (DECLARATION.test(resolution.resolvedFileName)) {
        // Only the types of a built library: an installed (or linked) copy is resolved as Vite
        // resolves packages, with its dependency optimization and SSR externals. A CommonJS build
        // served from its mapped folder would reach the browser untransformed.
        const installed = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (installed) return installed;
        targets = pathMappingTargets(mappings, source);
      }
      for (const target of targets) {
        const resolved = await this.resolve(target, importer, { ...options, skipSelf: true });
        if (resolved && !resolved.external) return resolved;
      }
      return null;
    },
  };
}
