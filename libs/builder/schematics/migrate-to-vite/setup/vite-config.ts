import prettierSync from '@prettier/sync';
import { posix } from 'path';

/** An `assets` entry, as in `angular.json`: a path, or a glob with input and output folders. */
export type NgDocViteAssetEntry =
  | string
  | { glob: string; input: string; output?: string; ignore?: string[] };

/** A `fileReplacements` entry, as in `angular.json`. */
export interface NgDocFileReplacement {
  replace: string;
  with: string;
}

/** The settings that may differ between the configurations of a build target. */
export interface NgDocViteModeSettings {
  /** The TypeScript configuration of the application, workspace-relative. */
  tsconfig: string;
  fileReplacements: NgDocFileReplacement[];
  /** Vite `base`; the plugin also writes it to `<base href>`. */
  base?: string;
  sourcemap?: boolean | 'hidden';
  define?: { [name: string]: string };
}

/**
 * Settings per Vite mode. A Vite mode is the name of a build configuration; `fallback` applies to
 * any other mode, as the target's plain `options` did.
 */
export interface NgDocViteModes {
  byMode: { [mode: string]: NgDocViteModeSettings };
  fallback: NgDocViteModeSettings;
}

/** Development server settings that Vite reads from its `server` block. */
export interface NgDocViteServerSettings {
  headers?: { [name: string]: string };
  open?: boolean | string;
  allowedHosts?: string[] | true;
}

/**
 * Everything the generated `vite.config.mjs` describes. Paths are workspace-relative and POSIX;
 * the generated file resolves them against its own location, so the workspace can move.
 */
export interface NgDocViteSetup {
  /** The project name. It names the generated and cache folders. */
  project: string;
  /** Where the configuration file goes, workspace-relative (for example `vite.config.mjs`). */
  configFile: string;
  /** The folder of `index.html`, which becomes the Vite root. */
  root: string;
  sourceRoot: string;
  browser: string;
  server?: string;
  polyfills: string[];
  styles: string[];
  assets: NgDocViteAssetEntry[];
  /** `inlineStyleLanguage`, for Analog's `inlineStylesExtension`. */
  inlineStylesExtension?: string;
  /** Sass load paths (`stylePreprocessorOptions.includePaths`). */
  loadPaths: string[];
  /** Modules left out of the bundles (`externalDependencies`). */
  externalDependencies: string[];
  /** The build output folder; `vite build` writes the browser files to `<outputPath>/browser`. */
  outputPath: string;
  /** A component that is always in the application, such as the root component. */
  rootComponent: string;
  /** The NgDoc configuration file, if any. */
  ngDocConfig?: string;
  /** The documentation folder, used when the NgDoc configuration has no `docsPath`. */
  docsRoot: string;
  /** The generated folder, used when the NgDoc configuration has no `outDir`. */
  outputRoot: string;
  cacheRoot: string;
  /** Build tags matched against `onlyForTags`; the Vite mode when absent. */
  tags?: string[];
  progress?: string;
  devServer?: NgDocViteServerSettings;
  modes: NgDocViteModes;
}

/** Modes with the same settings for every configuration. */
export function fixedModes(settings: NgDocViteModeSettings): NgDocViteModes {
  return { byMode: {}, fallback: settings };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A piece of JavaScript inserted verbatim by `printLiteral`. */
export class Code {
  constructor(readonly text: string) {}
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/**
 * Prints a JSON-like value as a compact JavaScript literal with single quotes and bare keys;
 * `undefined` properties are left out and `Code` values are inserted verbatim. Prettier lays the
 * result out.
 */
export function printLiteral(value: unknown): string {
  if (value instanceof Code) return value.text;
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => printLiteral(item)).join(', ')}]`;
  if (value === undefined) return 'undefined';
  const entries = Object.entries(value as object).filter(([, item]) => item !== undefined);
  return `{ ${entries
    .map(([key, item]) =>
      item instanceof Code && item.text === key
        ? key
        : `${IDENTIFIER.test(key) ? key : quote(key)}: ${printLiteral(item)}`,
    )
    .join(', ')} }`;
}

function path(value: string): Code {
  return new Code(`workspace(${quote(value)})`);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The mode settings whose value is not the same in every mode. */
function varyingKeys(modes: NgDocViteModes): Array<keyof NgDocViteModeSettings> {
  const all = [modes.fallback, ...Object.values(modes.byMode)];
  const keys = new Set(all.flatMap((settings) => Object.keys(settings))) as Set<
    keyof NgDocViteModeSettings
  >;
  return [...keys].filter((key) => all.some((settings) => !same(settings[key], all[0][key])));
}

function relativeRoot(configFile: string): string {
  const folder = posix.dirname(configFile);
  return folder === '.'
    ? './'
    : `${folder
        .split('/')
        .map(() => '..')
        .join('/')}/`;
}

function pick(settings: NgDocViteModeSettings, keys: ReadonlySet<keyof NgDocViteModeSettings>) {
  return Object.fromEntries([...keys].sort().map((key) => [key, settings[key]]));
}

const PRETTIER = {
  parser: 'babel',
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  bracketSameLine: true,
} as const;

/**
 * Renders the `vite.config.mjs` of an NgDoc site on the Vite engine: `createNgDocApplicationPlugin`
 * with the application of the build target, and `createNgDocVitePlugin` with Analog's Angular
 * plugin and the NgDoc generator. The application plugin gets only the options it accepts, so the
 * configuration never fails with `NGDOC_VITE_APPLICATION_OPTION`. The output is formatted with
 * fixed Prettier options, so the same setup always renders the same bytes.
 */
export function renderNgDocViteConfig(setup: NgDocViteSetup, header: string[] = []): string {
  const varying = new Set(varyingKeys(setup.modes));
  const setting = (key: keyof NgDocViteModeSettings) =>
    varying.has(key) ? new Code(`settings.${key}`) : setup.modes.fallback[key];
  const tsconfig = varying.has('tsconfig')
    ? new Code('workspace(settings.tsconfig)')
    : path(setup.modes.fallback.tsconfig);
  const replacements = setting('fileReplacements');

  const application = {
    workspaceRoot: new Code('workspaceRoot'),
    sourceRoot: setup.sourceRoot || '.',
    browser: setup.browser,
    server: setup.server,
    polyfills: setup.polyfills.length ? setup.polyfills : undefined,
    styles: setup.styles.length ? setup.styles : undefined,
    assets: setup.assets.length ? setup.assets : undefined,
  };
  const angular = {
    tsconfig,
    workspaceRoot: new Code('workspaceRoot'),
    jit: false,
    disableTypeChecking: false,
    liveReload: true,
    inlineStylesExtension: setup.inlineStylesExtension,
    fileReplacements:
      replacements instanceof Code || (Array.isArray(replacements) && replacements.length)
        ? replacements
        : undefined,
  };
  const ngDoc = {
    analogLiveReload: true,
    angularPlugins: new Code(`createNgDocAngularPlugins(${printLiteral(angular)})`),
    angularComponentProbe: path(setup.rootComponent),
    progress: setup.progress,
    generator: {
      projectId: setup.project,
      workspaceRoot: new Code('workspaceRoot'),
      configFile: setup.ngDocConfig === undefined ? undefined : path(setup.ngDocConfig),
      discovery: setup.tags ? { tags: setup.tags } : undefined,
      defaults: {
        docsRoot: path(setup.docsRoot || '.'),
        tsConfig: tsconfig,
        outputRoot: path(setup.outputRoot),
        cacheRoot: path(setup.cacheRoot),
      },
    },
  };
  const loadPaths = setup.loadPaths.map(path);
  const config = {
    root: path(setup.root || '.'),
    base: setting('base'),
    publicDir: false,
    define: setting('define'),
    plugins: new Code(
      `[createNgDocApplicationPlugin(${printLiteral(application)}), ` +
        `createNgDocVitePlugin(${printLiteral(ngDoc)})]`,
    ),
    css: loadPaths.length
      ? { preprocessorOptions: { scss: { loadPaths }, sass: { loadPaths } } }
      : undefined,
    server: setup.devServer && Object.keys(setup.devServer).length ? setup.devServer : undefined,
    build: {
      outDir: path(posix.join(setup.outputPath, 'browser')),
      emptyOutDir: true,
      sourcemap: setting('sourcemap'),
      rolldownOptions: setup.externalDependencies.length
        ? { external: setup.externalDependencies }
        : undefined,
    },
  };

  const lines = [
    ...header.map((line) => `// ${line}`.trimEnd()),
    ...(header.length ? [''] : []),
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    '',
    "import { createNgDocAngularPlugins } from '@ng-doc/builder/generator/vite/angular/index.js';",
    "import { createNgDocApplicationPlugin, createNgDocVitePlugin } from '@ng-doc/builder/generator/vite/index.js';",
    '',
    `const workspaceRoot = fileURLToPath(new URL(${quote(relativeRoot(setup.configFile))}, import.meta.url));`,
    '/** A workspace-relative path as an absolute one. */',
    'const workspace = (file) => path.join(workspaceRoot, file);',
    '',
  ];
  if (varying.size) {
    const byMode = Object.fromEntries(
      Object.entries(setup.modes.byMode).map(([mode, settings]) => [mode, pick(settings, varying)]),
    );
    lines.push(
      '/** The settings that differ between the build configurations, by Vite mode. */',
      `const modes = ${printLiteral(byMode)};`,
      '/** The settings of any other mode: the build target options without a configuration. */',
      `const fallback = ${printLiteral(pick(setup.modes.fallback, varying))};`,
      '',
      'export default ({ mode }) => {',
      '  const settings = modes[mode] ?? fallback;',
      `  return ${printLiteral(config)};`,
      '};',
    );
  } else {
    lines.push(`export default () => (${printLiteral(config)});`);
  }
  // Prettier keeps the blank lines of its input, so the groups above stay apart.
  return prettierSync.format(lines.join('\n'), PRETTIER) as unknown as string;
}
