import { minimatch } from 'minimatch';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { NormalizedOutputOptions, OutputBundle } from 'rollup';
import { glob } from 'tinyglobby';
import type {
  ConfigEnv,
  Connect,
  IndexHtmlTransformContext,
  Plugin,
  ResolvedConfig,
  UserConfig,
  ViteDevServer,
} from 'vite';

import { ngDocDevStyleTags } from './dev-styles';
import { contentType } from './mime';

/**
 * An asset entry, as in the `assets` option of Angular's application builder: a path (a file or
 * a directory, relative to the workspace root) or a glob with its input and output directories.
 */
export type NgDocViteAssetPattern =
  | string
  | { glob: string; input: string; output?: string; ignore?: string[] };

/**
 * The Angular application a Vite configuration builds. `browser`, `server`, `polyfills`, `styles`
 * and `assets` mean what they mean in an `angular.json` build target; the target's other options
 * have a Vite or Analog equivalent, which the plugin names when one is passed. Relative paths
 * resolve against `workspaceRoot`.
 */
export interface NgDocViteApplicationOptions {
  /** Absolute workspace root (default: the current directory). */
  workspaceRoot?: string;
  /** The project's source root: a path asset lands at its path relative to it (default: the directory of `browser`). */
  sourceRoot?: string;
  /** The browser entry, for example `src/main.ts`. */
  browser: string;
  /**
   * The server entry, for example `src/main.server.ts`, whose default export bootstraps the
   * application for the server. It enables the server build and prerendering.
   */
  server?: string;
  /**
   * Modules imported before the application, for example `['zone.js']`. The server entry keeps
   * only `zone.js` (as `zone.js/node`) and `@angular/localize/init`, as the Angular CLI does.
   */
  polyfills?: string[];
  /** Global style sheets, in order. */
  styles?: string[];
  /** Files copied into the build and served by the development server. */
  assets?: NgDocViteAssetPattern[];
}

/** The URL of the browser entry module that the index page loads. */
export const NG_DOC_BROWSER_ENTRY = '/@ng-doc-application/browser.js';
/** The module id of the server entry; `buildNgDocViteApplication` builds it into `server.mjs`. */
export const NG_DOC_SERVER_ENTRY = '/@ng-doc-application/server.js';

const BROWSER_ID = '\0ng-doc-application:browser';
const SERVER_ID = '\0ng-doc-application:server';
const ANGULAR_DEDUPE = [
  '@angular/common',
  '@angular/compiler',
  '@angular/core',
  '@angular/platform-browser',
  '@angular/router',
];
const CORE_IMPORT = /['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g;

interface ResolvedAsset {
  input: string;
  output: string;
  glob: string;
  ignore: string[];
}

/** What `buildNgDocViteApplication` reads from the plugin of a resolved configuration. */
export interface NgDocViteApplicationApi {
  readonly schemaVersion: 1;
  readonly serverEntry?: string;
}

const OPTIONS = new Set([
  'workspaceRoot',
  'sourceRoot',
  'browser',
  'server',
  'polyfills',
  'styles',
  'assets',
]);

/** Build target options that change the output, and where their equivalent lives. */
const MOVED_OPTIONS: Readonly<Record<string, string>> = {
  aot: 'Analog always compiles ahead of time; remove it',
  baseHref: 'Vite `base`',
  crossOrigin: 'Vite `html.cspNonce` / `build.modulePreload`; remove it',
  define: 'Vite `define`',
  deployUrl: 'Vite `base`',
  externalDependencies: 'Vite `build.rollupOptions.external`',
  fileReplacements: 'createNgDocAngularPlugins({ fileReplacements })',
  i18nMissingTranslation: 'not supported by the Vite engine',
  index: 'Vite `root` (the folder of index.html)',
  inlineStyleLanguage: 'createNgDocAngularPlugins({ inlineStylesExtension })',
  loader: 'Vite `assetsInclude` or a Vite plugin',
  localize: 'not supported by the Vite engine',
  main: 'the `browser` option',
  outputMode: 'the `ssr` and `prerender` options of @ng-doc/builder:vite-application',
  outputPath: 'the `outputPath` option of @ng-doc/builder:vite-application, or Vite `build.outDir`',
  prerender: 'the `prerender` option of @ng-doc/builder:vite-application',
  scripts: 'an import in the browser entry, or a <script> tag in index.html',
  serviceWorker: 'not supported by the Vite engine',
  ssr: 'the `ssr` option of @ng-doc/builder:vite-application',
  stylePreprocessorOptions: 'Vite `css.preprocessorOptions.scss.loadPaths`',
  tsConfig: 'createNgDocAngularPlugins({ tsconfig })',
  webWorkerTsConfig: 'not supported by the Vite engine',
};

/** Build target options without an effect on the output here, or whose Vite default matches. */
const IGNORED_OPTIONS: Readonly<Record<string, string>> = {
  allowedCommonJsDependencies: 'Vite has no CommonJS warning to silence',
  budgets: 'Vite has no size budgets',
  extractLicenses: 'Vite keeps license comments in its output',
  namedChunks: 'Vite names chunks by default',
  optimization: 'Vite minifies builds by default (`build.minify`)',
  outputHashing: 'Vite hashes the output file names by default',
  progress: 'use the `progress` option of createNgDocVitePlugin',
  sourceMap: 'set Vite `build.sourcemap`',
  statsJson: 'use a Rollup visualizer plugin',
  verbose: 'use Vite `logLevel`',
};

/**
 * Checks the keys of the options: an Angular CLI build option the plugin does not take fails with
 * its Vite or Analog equivalent; an option without an effect is returned for a warning.
 */
export function checkOptionKeys(options: object): string[] {
  const keys = Object.keys(options).sort();
  const moved = keys.filter((key) => !OPTIONS.has(key) && !(key in IGNORED_OPTIONS));
  if (moved.length) {
    throw new TypeError(
      `[NGDOC_VITE_APPLICATION_OPTION] createNgDocApplicationPlugin does not take ${moved
        .map((key) =>
          key in MOVED_OPTIONS
            ? `\`${key}\` (use ${MOVED_OPTIONS[key]})`
            : `\`${key}\` (unknown option)`,
        )
        .join(', ')}.`,
    );
  }
  return keys
    .filter((key) => key in IGNORED_OPTIONS)
    .map(
      (key) =>
        `[NGDOC_VITE_APPLICATION_OPTION] createNgDocApplicationPlugin ignores \`${key}\`: ${IGNORED_OPTIONS[key]}.`,
    );
}

/** The polyfills of the server entry: Angular keeps only zone.js (for Node) and localize. */
export function serverPolyfills(polyfills: readonly string[]): string[] {
  const kept = new Set<string>();
  for (const item of polyfills) {
    if (item === 'zone.js' || item === 'zone.js/node') kept.add('zone.js/node');
    else if (item === '@angular/localize/init') kept.add(item);
  }
  return [...kept];
}

function unsafeSegment(value: string): boolean {
  return (
    value.includes('\\') ||
    value.includes('\0') ||
    value.split('/').some((segment) => segment === '..' || segment === '')
  );
}

function optionError(message: string): TypeError {
  return new TypeError(`[NGDOC_VITE_APPLICATION] ${message}`);
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw optionError(`${name} must be a non-empty string.`);
  }
  return value;
}

function posix(value: string): string {
  return value.replace(/\\/g, '/');
}

function specifier(workspaceRoot: string, value: string): string {
  // As in the Angular CLI: a file of the workspace is imported by path, anything else (`zone.js`)
  // is a module name.
  const file = path.resolve(workspaceRoot, value);
  return value.startsWith('.') || path.isAbsolute(value) || existsSync(file) ? posix(file) : value;
}

/**
 * Resolves Angular CLI asset entries; a path entry is expanded against the file system.
 */
export async function resolveAssets(
  assets: readonly NgDocViteAssetPattern[],
  workspaceRoot: string,
  sourceRoot: string,
): Promise<ResolvedAsset[]> {
  const resolved: ResolvedAsset[] = [];
  for (const [index, asset] of assets.entries()) {
    if (typeof asset === 'string') {
      const input = path.resolve(workspaceRoot, text(asset, `assets[${index}]`));
      const file = await stat(input).then(
        (value) => value.isFile(),
        () => {
          throw optionError(`assets[${index}] does not exist: ${asset}`);
        },
      );
      const directory = file ? path.dirname(input) : input;
      const relative = path.relative(sourceRoot, directory);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw optionError(
          `assets[${index}] (${asset}) is outside sourceRoot (${sourceRoot}); use a { glob, input, output } entry.`,
        );
      }
      resolved.push({
        input: directory,
        output: posix(relative),
        glob: file ? path.basename(input) : '**/*',
        ignore: [],
      });
      continue;
    }
    if (!asset || typeof asset !== 'object') throw optionError(`assets[${index}] is invalid.`);
    // As in the Angular CLI, the output is relative to the output directory: `/assets/` is `assets`.
    const output = posix(asset.output ?? '').replace(/^\/+|\/+$/g, '');
    if (output.split('/').includes('..') || path.isAbsolute(output)) {
      throw optionError(`assets[${index}].output must stay inside the output directory.`);
    }
    resolved.push({
      input: path.resolve(workspaceRoot, text(asset.input, `assets[${index}].input`)),
      output,
      glob: text(asset.glob, `assets[${index}].glob`),
      ignore: [...(asset.ignore ?? [])],
    });
  }
  return resolved;
}

function outputName(asset: ResolvedAsset, relative: string): string {
  return asset.output ? `${asset.output}/${relative}` : relative;
}

/**
 * Every asset file by its output name; a later entry wins over an earlier one, as in Angular.
 */
export async function collectAssets(
  assets: readonly ResolvedAsset[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const asset of assets) {
    const matches = await glob(asset.glob, {
      cwd: asset.input,
      ignore: asset.ignore,
      dot: true,
      onlyFiles: true,
      expandDirectories: false,
    });
    for (const relative of matches.map(posix).sort()) {
      files.set(outputName(asset, relative), path.join(asset.input, relative));
    }
  }
  return files;
}

/**
 * The asset file a development request names, or undefined.
 */
export function matchAsset(
  assets: readonly ResolvedAsset[],
  base: string,
  url: string,
): { file: string; relative: string } | undefined {
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  } catch {
    return undefined;
  }
  const prefix = base.startsWith('/') ? base.replace(/\/?$/, '/') : '/';
  if (!pathname.startsWith(prefix)) return undefined;
  const requested = pathname.slice(prefix.length);
  if (unsafeSegment(requested)) return undefined;
  for (const asset of [...assets].reverse()) {
    const relative = asset.output
      ? requested.startsWith(`${asset.output}/`)
        ? requested.slice(asset.output.length + 1)
        : undefined
      : requested;
    if (
      relative &&
      minimatch(relative, asset.glob, { dot: true }) &&
      !asset.ignore.some((pattern) => minimatch(relative, pattern, { dot: true }))
    ) {
      return { file: path.join(asset.input, relative), relative };
    }
  }
  return undefined;
}

/**
 * The `@ng-doc/core` entry points that the installed NgDoc UI packages import.
 */
async function coreImports(root: string): Promise<string[]> {
  const found = new Set<string>();
  const require = createRequire(path.join(root, 'package.json'));
  for (const name of ['@ng-doc/app', '@ng-doc/ui-kit']) {
    let directory: string;
    try {
      directory = path.join(path.dirname(require.resolve(`${name}/package.json`)), 'fesm2022');
    } catch {
      continue;
    }
    const files = await readdir(directory).catch(() => [] as string[]);
    for (const file of files.filter((item) => item.endsWith('.mjs')).sort()) {
      for (const match of (await readFile(path.join(directory, file), 'utf8')).matchAll(
        CORE_IMPORT,
      )) {
        found.add(match[1]);
      }
    }
  }
  return [...found].sort();
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Sets `<base href>` to an absolute Vite base, or adds it at the start of `<head>`. */
export function withBase(html: string, base: string): string {
  if (!base.startsWith('/')) return html;
  const href = escapeAttribute(base);
  const existing = /(<base\s[^>]*href\s*=\s*)(["'])[^"']*\2/i;
  if (existing.test(html))
    return html.replace(existing, (_all, start: string) => `${start}"${href}"`);
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}<base href="${href}">`);
}

/**
 * Builds and serves an Angular application with Vite the way the Angular CLI application builder
 * does: the index page loads the polyfills, global styles and browser entry; assets are served in
 * development and copied into the build; `<base href>` follows Vite's `base`. With a `server`
 * entry, `NG_DOC_SERVER_ENTRY` is a self-contained server bundle for prerendering.
 *
 * Use it next to `createNgDocVitePlugin`. The Vite `root` is the directory of `index.html`.
 */
export function createNgDocApplicationPlugin(options: NgDocViteApplicationOptions): Plugin {
  if (!options || typeof options !== 'object') throw optionError('options must be an object.');
  const warnings = checkOptionKeys(options);
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const browser = path.resolve(workspaceRoot, text(options.browser, 'browser'));
  const server =
    options.server === undefined
      ? undefined
      : path.resolve(workspaceRoot, text(options.server, 'server'));
  const sourceRoot = path.resolve(workspaceRoot, options.sourceRoot ?? path.dirname(browser));
  const polyfills = (options.polyfills ?? []).map((item, index) =>
    specifier(workspaceRoot, text(item, `polyfills[${index}]`)),
  );
  const styles = (options.styles ?? []).map((item, index) =>
    posix(path.resolve(workspaceRoot, text(item, `styles[${index}]`))),
  );
  const assetPatterns = [...(options.assets ?? [])];
  let assets: Promise<ResolvedAsset[]> | undefined;
  const resolvedAssets = () => (assets ??= resolveAssets(assetPatterns, workspaceRoot, sourceRoot));
  let config: ResolvedConfig | undefined;
  const api: NgDocViteApplicationApi = Object.freeze({
    schemaVersion: 1,
    ...(server ? { serverEntry: NG_DOC_SERVER_ENTRY } : {}),
  });

  return {
    name: '@ng-doc/vite:application',
    enforce: 'pre',
    api: { ngDocApplication: api },
    async config(user: UserConfig, environment: ConfigEnv) {
      return {
        resolve: { dedupe: ANGULAR_DEDUPE },
        // Every `vite build` is a production build of the application (the Angular CLI's
        // `optimization`), whatever the Vite mode is named; a user `define` still wins.
        ...(environment.command === 'build'
          ? {
              define: Object.fromEntries(
                ['ngDevMode', 'ngJitMode']
                  .filter((name) => !(user.define && name in user.define))
                  .map((name) => [name, 'false']),
              ),
            }
          : {}),
        ...(environment.command === 'serve'
          ? {
              optimizeDeps: {
                include: await coreImports(path.resolve(user.root ?? process.cwd())),
              },
            }
          : {}),
        // The server bundle is imported by a plain Node process: it must hold every dependency,
        // partially compiled Angular libraries included.
        ...(environment.command === 'build' && environment.isSsrBuild
          ? { ssr: { noExternal: true } }
          : {}),
      };
    },
    configResolved(resolved: ResolvedConfig) {
      config = resolved;
      for (const warning of warnings) resolved.logger.warn(warning);
    },
    resolveId(source: string) {
      if (source === NG_DOC_BROWSER_ENTRY) return BROWSER_ID;
      if (source !== NG_DOC_SERVER_ENTRY) return null;
      if (!server) {
        throw new Error(
          '[NGDOC_VITE_SERVER_ENTRY] The server entry was requested, but createNgDocApplicationPlugin has no server option.',
        );
      }
      return SERVER_ID;
    },
    load(id: string) {
      if (id === BROWSER_ID) {
        return [...polyfills, ...styles, posix(browser)]
          .map((item) => `import ${JSON.stringify(item)};`)
          .join('\n');
      }
      if (id !== SERVER_ID) return null;
      return [
        ...serverPolyfills(options.polyfills ?? []).map(
          (item) => `import ${JSON.stringify(item)};`,
        ),
        `export { default as bootstrap } from ${JSON.stringify(posix(server!))};`,
        `export { renderApplication } from '@angular/platform-server';`,
        `export { Router } from '@angular/router';`,
        `export { runInInjectionContext } from '@angular/core';`,
      ].join('\n');
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html: string, context: IndexHtmlTransformContext) {
        return {
          html: withBase(html, config?.base ?? '/'),
          tags: [
            // The development server renders in the browser only; these make its first paint
            // styled, as a production page is.
            ...(context.server ? await ngDocDevStyleTags(context.server, styles) : []),
            {
              tag: 'script',
              attrs: { type: 'module', src: NG_DOC_BROWSER_ENTRY },
              injectTo: 'body',
            },
          ],
        };
      },
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(assetMiddleware(resolvedAssets, () => server.config.base));
    },
    async generateBundle(_output: NormalizedOutputOptions, bundle: OutputBundle) {
      if (config?.command !== 'build' || config.build.ssr) return;
      for (const [fileName, file] of [...(await collectAssets(await resolvedAssets()))].sort(
        ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
      )) {
        if (bundle[fileName]) {
          throw new Error(`[NGDOC_VITE_ASSET_COLLISION] Vite bundle already owns ${fileName}.`);
        }
        this.emitFile({ type: 'asset', fileName, source: await readFile(file) });
      }
    },
  };
}

function assetMiddleware(
  assets: () => Promise<ResolvedAsset[]>,
  base: () => string,
): Connect.NextHandleFunction {
  return (request, response, next) => {
    void assets().then(
      async (resolved) => {
        const match = matchAsset(resolved, base(), request.url ?? '/');
        const source = match ? await readFile(match.file).catch(() => undefined) : undefined;
        if (!match || !source) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', contentType(match.relative));
        response.end(source);
      },
      (error: unknown) => next(error),
    );
  };
}
