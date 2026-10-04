import { Tree } from '@angular-devkit/schematics';
import { posix } from 'path';

import { readTsconfigPaths } from './setup/dependencies';
import { findRootComponent, serverEntryNgModule } from './setup/source';
import { createNgDocViteTargets, NgDocViteBuildTargetOptions } from './setup/targets';
import {
  NgDocFileReplacement,
  NgDocViteAssetEntry,
  NgDocViteModeSettings,
  NgDocViteServerSettings,
  NgDocViteSetup,
} from './setup/vite-config';
import {
  JsonLike,
  JsonRecord,
  parseTargetString,
  resolveTargetOptions,
  targetBuilder,
  WorkspaceProject,
  WorkspaceTarget,
} from './setup/workspace';

/** The legacy builders the schematic migrates, and the frozen Angular CLI builders of the new engine. */
export const LEGACY_BUILD_BUILDERS = [
  '@ng-doc/builder:application',
  '@ng-doc/builder:modern-application',
];
export const LEGACY_SERVE_BUILDERS = [
  '@ng-doc/builder:dev-server',
  '@ng-doc/builder:modern-dev-server',
];

/**
 * How an option or a workspace detail is carried over:
 * - `migrated`: applied to the Vite configuration or the new targets;
 * - `dropped`: it has no effect under Vite, or Vite's default matches it;
 * - `manual`: not migrated, and the site may behave differently until it is handled by hand;
 * - `blocking`: the project cannot be migrated; nothing is changed.
 */
export type FindingLevel = 'migrated' | 'dropped' | 'manual' | 'blocking';

export interface MigrationFinding {
  level: FindingLevel;
  /** The option (`build.fileReplacements`) or the subject (`package.json`). */
  subject: string;
  message: string;
}

/** A `buildTarget` of another target that must keep pointing at the legacy build. */
export interface Retarget {
  target: string;
  before?: string;
  after: string;
}

/** Everything the migration of one project changes. */
export interface MigrationPlan {
  project: WorkspaceProject;
  build: { name: string; legacyName: string; legacy: WorkspaceTarget; next: WorkspaceTarget };
  serve?: { name: string; legacyName: string; legacy: WorkspaceTarget; next: WorkspaceTarget };
  setup: NgDocViteSetup;
  retargets: Retarget[];
  /** The legacy engine's generated folder, deleted once so the new engine can own it. */
  legacyOutput?: string;
  findings: MigrationFinding[];
}

export interface AnalyzeOptions {
  /** The configuration file to create, workspace-relative (default `<root>/vite.config.mjs`). */
  viteConfig?: string;
  /** The root component, workspace-relative (default: found from the browser entry). */
  rootComponent?: string;
  /**
   * The name the original build target is kept under, for the Angular builders that read its
   * options. By default it is `<build>-legacy`, which still builds the site with the legacy
   * builders; a target kept under another name is not offered as the way to keep a server.
   */
  keptBuildName?: string;
}

/**
 * Every option of Angular's `application` builder (and NgDoc's `ngDoc` extension) that the
 * schematic knows. Anything else in a build target is reported as unknown.
 */
export const KNOWN_BUILD_OPTIONS = [
  'allowedCommonJsDependencies',
  'aot',
  'appShell',
  'assets',
  'baseHref',
  'browser',
  'budgets',
  'clearScreen',
  'conditions',
  'crossOrigin',
  'define',
  'deleteOutputPath',
  'deployUrl',
  'externalDependencies',
  'extractLicenses',
  'fileReplacements',
  'i18nDuplicateTranslation',
  'i18nMissingTranslation',
  'index',
  'inlineStyleLanguage',
  'loader',
  'localize',
  'main',
  'namedChunks',
  'ngDoc',
  'optimization',
  'outputHashing',
  'outputMode',
  'outputPath',
  'poll',
  'polyfills',
  'prerender',
  'preserveSymlinks',
  'progress',
  'scripts',
  'security',
  'server',
  'serviceWorker',
  'sourceMap',
  'ssr',
  'statsJson',
  'stylePreprocessorOptions',
  'styles',
  'subresourceIntegrity',
  'tsConfig',
  'verbose',
  'watch',
  'webWorkerTsConfig',
];

/** The Vite mode that stands for a build target's plain options, when it has no default configuration. */
export const PLAIN_MODE = 'default';

function uniqueName(name: string, taken: string[]): string {
  let candidate = name;
  for (let index = 2; taken.includes(candidate); index++) candidate = `${name}-${index}`;
  return candidate;
}

/** The value of a vite-application flag when a configuration leaves it unset. */
function defaultFlag(key: string): unknown {
  return key === 'routes' ? [] : true;
}

/** Options without an effect under Vite, or whose Vite default matches the Angular CLI's. */
const DROPPED: { [option: string]: string } = {
  allowedCommonJsDependencies: 'Vite has no CommonJS warning to silence.',
  budgets: 'Vite has no size budgets.',
  clearScreen: 'Vite manages its own terminal output.',
  deleteOutputPath: 'The Vite build empties its output folders.',
  extractLicenses: 'Vite keeps license comments in its output.',
  i18nDuplicateTranslation: 'Only used with `localize`.',
  i18nMissingTranslation: 'Only used with `localize`.',
  namedChunks: 'Vite names chunks by default.',
  optimization:
    'Every `vite build` is optimized, in every mode; use the development server for unoptimized code.',
  poll: 'Use Vite `server.watch.usePolling` if you need polling.',
  progress: 'NgDoc reports its own progress (`ngDoc.progress` becomes the plugin `progress`).',
  statsJson: 'Use a Rollup visualizer plugin.',
  verbose: 'Use Vite `logLevel`.',
  watch: 'Use the development server; `vite build --watch` is not supported.',
};

/** Options that are not migrated and need a manual change, with the Vite way to do it. */
const MANUAL: { [option: string]: string } = {
  appShell: 'The Vite engine does not build an app shell; prerendered pages replace it.',
  conditions: 'Set Vite `resolve.conditions` if the application needs custom export conditions.',
  crossOrigin: 'Set the `crossorigin` attribute with a Vite plugin or in index.html.',
  deployUrl:
    'Vite `base` serves the whole application from one URL; use Vite `experimental.renderBuiltUrl` for a CDN.',
  loader: 'Use Vite `assetsInclude` or a Vite plugin for these file types.',
  preserveSymlinks: 'Set Vite `resolve.preserveSymlinks`.',
  scripts: 'Import the scripts from the browser entry, or add `<script>` tags to index.html.',
  serviceWorker: 'The Vite engine does not build the Angular service worker.',
  subresourceIntegrity: 'Use a Vite plugin to add `integrity` attributes.',
  webWorkerTsConfig: 'Vite bundles workers created with `new Worker(new URL(...))` itself.',
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: JsonLike | undefined): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function normalizePath(value: string): string {
  const normalized = posix.normalize(value.replace(/\\/g, '/')).replace(/^\.\/|\/$/g, '');
  return normalized === '.' ? '' : normalized;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Every option key that appears in a target, in its options or in any configuration. */
function optionKeys(target: WorkspaceTarget): string[] {
  const keys = new Set(Object.keys(target.options ?? {}));
  for (const configuration of Object.values(target.configurations ?? {})) {
    for (const key of Object.keys(configuration ?? {})) keys.add(key);
  }
  return [...keys].sort();
}

/** The legacy build and serve targets of a project, by name. */
export function findLegacyTargets(project: WorkspaceProject): {
  build?: string;
  serve?: string;
} {
  const names = Object.keys(project.targets);
  const build = names.find((name) =>
    LEGACY_BUILD_BUILDERS.includes(targetBuilder(project.targets[name]) ?? ''),
  );
  const serve = names.find((name) => {
    const target = project.targets[name];
    if (!LEGACY_SERVE_BUILDERS.includes(targetBuilder(target) ?? '')) return false;
    const reference = asString(
      resolveTargetOptions(target!, target!.defaultConfiguration)['buildTarget'],
    );
    const parsed = reference ? parseTargetString(reference) : undefined;
    return !parsed || !build || parsed.target === build;
  });
  return { ...(build ? { build } : {}), ...(serve ? { serve } : {}) };
}

/** Looks for the NgDoc configuration the legacy engine would load: upward from the browser entry. */
function findNgDocConfig(tree: Tree, browser: string): string | undefined {
  let directory = posix.dirname(browser);
  for (;;) {
    for (const name of ['ng-doc.config.ts', 'ng-doc.config.js']) {
      const candidate = directory === '.' ? name : posix.join(directory, name);
      if (tree.exists(candidate)) return candidate;
    }
    if (directory === '.' || directory === '' || directory === '/') return undefined;
    directory = posix.dirname(directory);
  }
}

function readBaseHref(tree: Tree, index: string): string | undefined {
  if (!tree.exists(index)) return undefined;
  const match = /<base\s[^>]*href\s*=\s*(["'])([^"']*)\1/i.exec(tree.readText(index));
  return match?.[2];
}

function fileReplacementsOf(value: JsonLike | undefined): NgDocFileReplacement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const replace = asString(entry['replace']) ?? asString(entry['src']);
    const replacement = asString(entry['with']) ?? asString(entry['replaceWith']);
    return replace && replacement ? [{ replace, with: replacement }] : [];
  });
}

function sourceMapOf(value: JsonLike | undefined): boolean | 'hidden' | undefined {
  if (value === true) return true;
  if (!isRecord(value)) return undefined;
  if (value['scripts'] === false) return undefined;
  return value['hidden'] === true ? 'hidden' : true;
}

/**
 * Analyzes the legacy `build` and `serve` targets of a project and plans the migration: the Vite
 * setup, the new targets, the targets to retarget and every finding for the report.
 */
export function analyzeProject(
  tree: Tree,
  project: WorkspaceProject,
  buildName: string,
  serveName: string | undefined,
  options: AnalyzeOptions,
  builderKey: 'builder' | 'executor',
): MigrationPlan {
  const findings: MigrationFinding[] = [];
  const add = (level: FindingLevel, subject: string, message: string) =>
    findings.push({ level, subject, message });
  const legacy = project.targets[buildName]!;
  const legacyBuildName = options.keptBuildName ?? `${buildName}-legacy`;
  const modes = Object.keys(legacy.configurations ?? {});
  const defaultConfiguration = legacy.defaultConfiguration;
  // Nx interpolates `{workspaceRoot}`, `{projectRoot}` and `{projectName}` in options; the Vite
  // configuration gets the resolved paths, the new targets keep the tokens.
  const nx = (value: string) =>
    value
      .replace(/\{workspaceRoot\}\/?/g, '')
      .replace(/\{projectRoot\}/g, project.root || '.')
      .replace(/\{projectName\}/g, project.name);
  const interpolate = (value: JsonLike | undefined): JsonLike | undefined =>
    typeof value === 'string'
      ? nx(value)
      : Array.isArray(value)
        ? value.map((item) => interpolate(item) as JsonLike)
        : isRecord(value)
          ? (Object.fromEntries(
              Object.entries(value).map(([key, item]) => [key, interpolate(item)]),
            ) as JsonLike)
          : value;
  const resolve = (configuration: string | undefined) =>
    interpolate(resolveTargetOptions(legacy, configuration)) as JsonRecord;
  const base = resolve(defaultConfiguration);
  const perMode = Object.fromEntries(modes.map((mode) => [mode, resolve(mode)]));
  const plain = resolve(undefined);
  // Without a default configuration, `ng build` runs the plain options. The Vite target runs them
  // as a mode no configuration is named after, which the generated configuration maps to them.
  const plainMode =
    modes.length && !defaultConfiguration ? uniqueName(PLAIN_MODE, modes) : undefined;

  // Options that must be the same in every configuration: the application, not a mode, owns them.
  const fixed = (option: string): JsonLike | undefined => {
    const values = [plain, ...Object.values(perMode)].map((resolved) => resolved[option]);
    if (values.some((value) => !same(value, values[0]))) {
      add(
        'manual',
        `build.${option}`,
        `differs between the configurations; the configuration uses the value of ${
          defaultConfiguration ? `\`${defaultConfiguration}\`` : 'the target options'
        }. Move the other values into a mode-specific Vite setting by hand.`,
      );
    }
    return base[option];
  };

  const sourceRoot = project.sourceRoot;
  const browser = normalizePath(
    asString(fixed('browser')) ?? asString(fixed('main')) ?? posix.join(sourceRoot, 'main.ts'),
  );
  add('migrated', 'build.browser', `\`browser: '${browser}'\` of createNgDocApplicationPlugin.`);

  const serverValue = fixed('server');
  const server = asString(serverValue) ? normalizePath(asString(serverValue)!) : undefined;
  const serverModule = server ? serverEntryNgModule(tree, server) : undefined;
  if (serverModule) {
    add(
      'blocking',
      'build.server',
      `[NGDOC_MIGRATE_SERVER_NGMODULE] \`${server}\` exports the NgModule \`${serverModule}\` as its default export. The Vite engine prerenders with \`renderApplication\`, which needs a bootstrap function: export \`(context) => bootstrapApplication(App, config, context)\` instead (a standalone application), or keep the legacy builders.`,
    );
  } else if (server) {
    add('migrated', 'build.server', `\`server: '${server}'\` of createNgDocApplicationPlugin.`);
  }

  const indexValue = fixed('index');
  let index = posix.join(sourceRoot, 'index.html');
  if (indexValue === false) {
    add('blocking', 'build.index', 'is `false`; the Vite engine needs an index.html.');
  } else if (asString(indexValue) || isRecord(indexValue)) {
    index = normalizePath(
      asString(indexValue) ?? asString((indexValue as JsonRecord)['input']) ?? index,
    );
  }
  if (posix.basename(index) !== 'index.html') {
    add(
      'blocking',
      'build.index',
      `is \`${index}\`; Vite loads \`index.html\` from its root. Rename the file to index.html first.`,
    );
  }
  const root = normalizePath(posix.dirname(index));
  add('migrated', 'build.index', `Vite \`root\`: \`${root || '.'}\`.`);

  const polyfillsValue = fixed('polyfills');
  const polyfills = (
    Array.isArray(polyfillsValue)
      ? polyfillsValue
      : asString(polyfillsValue)
        ? [polyfillsValue]
        : []
  ).filter((item): item is string => typeof item === 'string');
  if (polyfills.length)
    add('migrated', 'build.polyfills', '`polyfills` of createNgDocApplicationPlugin.');

  const styles: string[] = [];
  const stylesValue = fixed('styles');
  for (const entry of Array.isArray(stylesValue) ? stylesValue : []) {
    if (typeof entry === 'string') styles.push(entry);
    else if (isRecord(entry) && asString(entry['input'])) {
      if (entry['inject'] === false || entry['bundleName'] !== undefined) {
        add(
          'manual',
          'build.styles',
          `\`${entry['input']}\` is a separate style bundle; the Vite engine injects every global style. Load it from the application instead.`,
        );
      } else styles.push(asString(entry['input'])!);
    }
  }
  if (styles.length) add('migrated', 'build.styles', '`styles` of createNgDocApplicationPlugin.');

  const outDirLiteral = legacyOutDir(tree, project, browser, base);
  const legacyOutput =
    outDirLiteral === null ? undefined : posix.join(outDirLiteral, 'ng-doc', project.name);
  const generatedAssets = new Set(
    [
      posix.join('ng-doc', project.name, 'assets'),
      legacyOutput && posix.join(legacyOutput, 'assets'),
    ].filter((item): item is string => !!item),
  );
  const assets: NgDocViteAssetEntry[] = [];
  const assetsValue = fixed('assets');
  for (const entry of Array.isArray(assetsValue) ? assetsValue : []) {
    if (typeof entry === 'string') {
      assets.push(entry);
      continue;
    }
    if (!isRecord(entry) || !asString(entry['glob']) || !asString(entry['input'])) continue;
    const input = asString(entry['input'])!;
    if (generatedAssets.has(normalizePath(input))) {
      add(
        'dropped',
        'build.assets',
        `\`${input}\`: the NgDoc Vite plugin serves and emits the generated assets itself.`,
      );
      continue;
    }
    if (entry['followSymlinks'] === true) {
      add(
        'manual',
        'build.assets',
        `\`${input}\` follows symbolic links; the Vite engine copies files only.`,
      );
    }
    const ignore = Array.isArray(entry['ignore'])
      ? entry['ignore'].filter((item): item is string => typeof item === 'string')
      : undefined;
    assets.push({
      glob: asString(entry['glob'])!,
      input,
      ...(asString(entry['output']) ? { output: asString(entry['output'])! } : {}),
      ...(ignore?.length ? { ignore } : {}),
    });
  }
  if (assets.length) add('migrated', 'build.assets', '`assets` of createNgDocApplicationPlugin.');

  const inlineStyleLanguage = asString(fixed('inlineStyleLanguage'));
  if (inlineStyleLanguage) {
    add(
      'migrated',
      'build.inlineStyleLanguage',
      `\`inlineStylesExtension: '${inlineStyleLanguage}'\` of createNgDocAngularPlugins.`,
    );
  }

  const stylePreprocessorOptions = fixed('stylePreprocessorOptions');
  const loadPaths: string[] = [];
  if (isRecord(stylePreprocessorOptions)) {
    for (const [key, value] of Object.entries(stylePreprocessorOptions)) {
      if (key === 'includePaths' && Array.isArray(value)) {
        loadPaths.push(...value.filter((item): item is string => typeof item === 'string'));
        add(
          'migrated',
          'build.stylePreprocessorOptions.includePaths',
          'Vite `css.preprocessorOptions.scss.loadPaths`.',
        );
      } else {
        add(
          'manual',
          `build.stylePreprocessorOptions.${key}`,
          'Set it in Vite `css.preprocessorOptions`.',
        );
      }
    }
  }

  const externalValue = fixed('externalDependencies');
  const externalDependencies = Array.isArray(externalValue)
    ? externalValue.filter((item): item is string => typeof item === 'string')
    : [];
  if (externalDependencies.length) {
    add('migrated', 'build.externalDependencies', 'Vite `build.rolldownOptions.external`.');
  }

  const rawOutputPath = resolveTargetOptions(legacy, defaultConfiguration)['outputPath'];
  const targetOutputPath =
    typeof rawOutputPath === 'string'
      ? rawOutputPath
      : isRecord(rawOutputPath) && typeof rawOutputPath['base'] === 'string'
        ? rawOutputPath['base']
        : undefined;
  const outputPathValue = fixed('outputPath');
  let outputPath = `dist/${project.name}`;
  if (asString(outputPathValue)) outputPath = normalizePath(asString(outputPathValue)!);
  else if (isRecord(outputPathValue) && asString(outputPathValue['base'])) {
    outputPath = normalizePath(asString(outputPathValue['base'])!);
    for (const [key, standard] of [
      ['browser', 'browser'],
      ['server', 'server'],
      ['media', 'media'],
    ]) {
      const custom = outputPathValue[key];
      if (typeof custom === 'string' && custom !== standard) {
        add(
          'manual',
          `build.outputPath.${key}`,
          `is \`${custom}\`; the Vite engine always writes \`${standard}/\`.`,
        );
      }
    }
  }
  add('migrated', 'build.outputPath', `\`outputPath\` of the vite-application target.`);

  // The settings a Vite mode may change, one per build configuration.
  const indexBase = readBaseHref(tree, index);
  const tsConfigDefault = posix.join(project.root, 'tsconfig.app.json');
  const modeSettings = (resolved: JsonRecord): NgDocViteModeSettings => {
    const baseHref = asString(resolved['baseHref']) ?? indexBase;
    const define = isRecord(resolved['define'])
      ? (Object.fromEntries(
          Object.entries(resolved['define']).filter(([, value]) => typeof value === 'string'),
        ) as { [name: string]: string })
      : undefined;
    return {
      tsconfig: normalizePath(asString(resolved['tsConfig']) ?? tsConfigDefault),
      fileReplacements: fileReplacementsOf(resolved['fileReplacements']),
      ...(baseHref && baseHref.startsWith('/') && baseHref !== '/'
        ? { base: baseHref.replace(/\/?$/, '/') }
        : {}),
      ...(sourceMapOf(resolved['sourceMap'])
        ? { sourcemap: sourceMapOf(resolved['sourceMap']) }
        : {}),
      ...(define && Object.keys(define).length ? { define } : {}),
    };
  };
  const byMode = Object.fromEntries(modes.map((mode) => [mode, modeSettings(perMode[mode])]));
  for (const resolved of [plain, ...Object.values(perMode)]) {
    const baseHref = asString(resolved['baseHref']);
    if (baseHref && !baseHref.startsWith('/')) {
      add(
        'manual',
        'build.baseHref',
        `\`${baseHref}\` is not absolute; set Vite \`base\` by hand.`,
      );
    }
    if (
      isRecord(resolved['sourceMap']) &&
      (resolved['sourceMap']['styles'] !== undefined ||
        resolved['sourceMap']['vendor'] !== undefined)
    ) {
      add(
        'manual',
        'build.sourceMap',
        'Vite `build.sourcemap` covers scripts only; `styles` and `vendor` are not migrated.',
      );
    }
  }
  for (const [option, target] of [
    ['tsConfig', '`tsconfig` of createNgDocAngularPlugins and the generator'],
    ['fileReplacements', '`fileReplacements` of createNgDocAngularPlugins, per Vite mode'],
    ['baseHref', 'Vite `base`'],
    ['sourceMap', 'Vite `build.sourcemap`'],
    ['define', 'Vite `define`'],
  ] as const) {
    if (optionKeys(legacy).includes(option)) add('migrated', `build.${option}`, `${target}.`);
  }

  // ngDoc: the configuration file, build tags and progress.
  const ngDoc = isRecord(base['ngDoc']) ? base['ngDoc'] : {};
  for (const key of Object.keys(ngDoc)) {
    if (!['config', 'tags', 'progress'].includes(key)) {
      add('manual', `build.ngDoc.${key}`, 'is not an option of the Vite engine.');
    }
  }
  const ngDocConfig = asString(ngDoc['config'])
    ? normalizePath(asString(ngDoc['config'])!)
    : findNgDocConfig(tree, browser);
  if (ngDocConfig) {
    add('migrated', 'ngDoc.config', `\`generator.configFile\`: \`${ngDocConfig}\`.`);
  } else {
    add('dropped', 'ngDoc.config', 'No ng-doc.config.ts was found; the engine uses its defaults.');
  }
  const tags = Array.isArray(ngDoc['tags'])
    ? ngDoc['tags'].filter((item): item is string => typeof item === 'string')
    : undefined;
  add(
    'dropped',
    'onlyForTags',
    tags
      ? `\`ngDoc.tags\` became \`generator.discovery.tags\`.`
      : 'The Vite engine applies `onlyForTags` of pages and categories, with the Vite mode as the build tag (the legacy engine ignored it).',
  );

  // Server rendering, prerendering and the output mode, per configuration: the target's options
  // get the flags of the plain options, and a configuration only the flags it changes.
  const renderFlags = (resolved: JsonRecord): NgDocViteBuildTargetOptions => {
    const flags: NgDocViteBuildTargetOptions = {};
    if (!server) return flags;
    const outputMode = asString(resolved['outputMode']);
    const ssr = resolved['ssr'];
    const prerender = resolved['prerender'];
    const onRequest = outputMode === 'server' || (!outputMode && !!ssr && prerender === false);
    if (onRequest) {
      add(
        'manual',
        'build.outputMode',
        'The Angular server that renders on request is not built. The vite-application target builds the server bundle and prerenders every route into `browser/`: deploy it as a static site' +
          (options.keptBuildName
            ? '.'
            : `, or keep the \`${legacyBuildName}\` target for the server.`),
      );
    } else if (!outputMode && prerender === false) {
      // No prerendering, as in the legacy build; without `ssr` no server bundle either.
      flags.prerender = false;
      if (!ssr) flags.ssr = false;
    }
    if (isRecord(ssr) && asString(ssr['entry'])) {
      add(
        'manual',
        'build.ssr.entry',
        `\`${ssr['entry']}\` is not built. The server bundle is \`server/server.mjs\` with the application's render entry, not a web server.`,
      );
    }
    if (outputMode) {
      add(
        'dropped',
        'serverRoutes',
        'Server route render modes (`app.routes.server.ts`) do not apply: every concrete route is prerendered.',
      );
    }
    if (isRecord(prerender)) {
      if (prerender['discoverRoutes'] === false) flags.discoverRoutes = false;
      const routesFile = asString(prerender['routesFile']);
      if (routesFile) {
        const file = normalizePath(nx(routesFile));
        if (tree.exists(file)) {
          flags.routes = tree
            .readText(file)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          add(
            'migrated',
            'build.prerender.routesFile',
            `its ${flags.routes.length} route(s) became \`routes\` of the vite-application target.`,
          );
        } else {
          add(
            'manual',
            'build.prerender.routesFile',
            `\`${routesFile}\` does not exist; add its routes to \`routes\` of the vite-application target.`,
          );
        }
      }
    }
    add(
      'migrated',
      'build.prerender',
      flags.prerender === false
        ? 'is `false`: the vite-application target does not prerender either.'
        : 'The vite-application target builds the server bundle and prerenders every route.',
    );
    return flags;
  };
  const buildOptions = renderFlags(plain);
  const buildConfigurations = Object.fromEntries(
    modes.map((mode) => {
      const flags = renderFlags(perMode[mode]) as Record<string, unknown>;
      const changed = Object.fromEntries(
        [...new Set([...Object.keys(flags), ...Object.keys(buildOptions)])]
          .filter((key) => !same(flags[key], (buildOptions as Record<string, unknown>)[key]))
          .map((key) => [key, flags[key] ?? defaultFlag(key)]),
      );
      return [mode, changed as NgDocViteBuildTargetOptions];
    }),
  );
  if (
    !server &&
    [plain, ...Object.values(perMode)].some((item) => item['prerender'] || item['ssr'])
  ) {
    add(
      'manual',
      'build.prerender',
      'needs a `server` entry; without one the Vite engine builds the browser application only.',
    );
  }
  for (const key of ['ssr', 'outputMode']) {
    if (optionKeys(legacy).includes(key) && !server)
      add('dropped', `build.${key}`, 'There is no server entry.');
  }

  // The remaining options: dropped, manual or blocking.
  const handled = new Set([
    'browser',
    'main',
    'server',
    'index',
    'polyfills',
    'styles',
    'assets',
    'inlineStyleLanguage',
    'stylePreprocessorOptions',
    'externalDependencies',
    'outputPath',
    'tsConfig',
    'fileReplacements',
    'baseHref',
    'sourceMap',
    'define',
    'ngDoc',
    'ssr',
    'prerender',
    'outputMode',
  ]);
  for (const option of optionKeys(legacy).filter((key) => !handled.has(key))) {
    const values = [plain, ...Object.values(perMode)].map((resolved) => resolved[option]);
    const active = values.filter((value) => value !== undefined && value !== false);
    if (option === 'localize') {
      if (active.length && !values.every((value) => Array.isArray(value) && !value.length)) {
        add(
          'blocking',
          'build.localize',
          'The Vite engine does not build localized applications. Keep the legacy builders.',
        );
      } else add('dropped', 'build.localize', 'Localization is off.');
    } else if (option === 'aot') {
      if (values.includes(false))
        add('manual', 'build.aot', 'Analog always compiles ahead of time.');
      else add('dropped', 'build.aot', 'Analog always compiles ahead of time.');
    } else if (option === 'outputHashing') {
      if (values.some((value) => value !== undefined && value !== 'all')) {
        add(
          'manual',
          'build.outputHashing',
          'Vite hashes every output file name; change `build.rolldownOptions.output` to name files differently.',
        );
      } else add('dropped', 'build.outputHashing', 'Vite hashes the output file names by default.');
    } else if (option === 'scripts') {
      if (values.some((value) => Array.isArray(value) && value.length))
        add('manual', 'build.scripts', MANUAL['scripts']);
      else add('dropped', 'build.scripts', 'The list is empty.');
    } else if (option === 'serviceWorker') {
      if (active.length) add('manual', 'build.serviceWorker', MANUAL['serviceWorker']);
      else add('dropped', 'build.serviceWorker', 'The service worker is off.');
    } else if (option === 'security') {
      const autoCsp = values.some((value) => isRecord(value) && value['autoCsp']);
      if (autoCsp)
        add(
          'manual',
          'build.security.autoCsp',
          'Add a Content Security Policy with a Vite plugin or at the web server.',
        );
      add(
        'dropped',
        'build.security',
        'The Angular server options (`allowedHosts`) do not apply to prerendered output.',
      );
    } else if (option in DROPPED) {
      add('dropped', `build.${option}`, DROPPED[option]);
    } else if (option in MANUAL) {
      add(active.length ? 'manual' : 'dropped', `build.${option}`, MANUAL[option]);
    } else {
      add(
        'manual',
        `build.${option}`,
        'is not a known option of the Angular application builder and was not migrated.',
      );
    }
  }

  // i18n in the project itself.
  if (
    isRecord(project.i18n) &&
    isRecord(project.i18n['locales']) &&
    Object.keys(project.i18n['locales']).length
  ) {
    add(
      'manual',
      'project.i18n',
      'The project defines locales; the Vite engine builds the source locale only.',
    );
  }

  // The serve target.
  const serveSettings = serveName
    ? analyzeServe(project, serveName, buildName, legacy, add, plainMode)
    : undefined;

  // The root component and the configuration file.
  const rootComponent = options.rootComponent
    ? normalizePath(options.rootComponent)
    : findRootComponent(tree, browser);
  if (!rootComponent) {
    add(
      'blocking',
      'rootComponent',
      `The root component could not be found from \`${browser}\`. Run the schematic again with \`--root-component <file>\`.`,
    );
  } else if (!tree.exists(rootComponent)) {
    add('blocking', 'rootComponent', `\`${rootComponent}\` does not exist.`);
  }
  const configFile = normalizePath(
    options.viteConfig ?? posix.join(project.root, 'vite.config.mjs'),
  );

  // The tsconfig must still map @ng-doc/generated to the generated folder.
  const tsconfig = modeSettings(base).tsconfig;
  const paths = readTsconfigPaths(tree, tsconfig);
  if (!paths?.['@ng-doc/generated']) {
    add(
      'manual',
      'tsconfig',
      `\`${tsconfig}\` maps no \`@ng-doc/generated\` path; map it to \`./${posix.join('ng-doc', project.name, 'index.ts')}\`.`,
    );
  } else {
    add(
      'dropped',
      'tsconfig',
      '`@ng-doc/generated` keeps pointing at the generated folder, which the Vite engine writes.',
    );
  }

  const setup: NgDocViteSetup = {
    project: project.name,
    configFile,
    root,
    sourceRoot,
    browser,
    ...(server ? { server } : {}),
    polyfills,
    styles,
    assets,
    ...(inlineStyleLanguage && inlineStyleLanguage !== 'css'
      ? { inlineStylesExtension: inlineStyleLanguage }
      : {}),
    loadPaths,
    externalDependencies,
    outputPath,
    rootComponent: rootComponent ?? '',
    ...(ngDocConfig ? { ngDocConfig } : {}),
    docsRoot: normalizePath(posix.dirname(browser)),
    outputRoot: posix.join('ng-doc', project.name),
    cacheRoot: posix.join('.cache/ng-doc', project.name),
    ...(tags ? { tags } : {}),
    ...(asString(ngDoc['progress']) ? { progress: asString(ngDoc['progress'])! } : {}),
    ...(serveSettings?.devServer ? { devServer: serveSettings.devServer } : {}),
    modes: { byMode, fallback: modeSettings(plain) },
  };

  const keep = (target: WorkspaceTarget | undefined): JsonRecord =>
    Object.fromEntries(
      Object.entries(target ?? {}).filter(
        ([key]) =>
          !['builder', 'executor', 'options', 'configurations', 'defaultConfiguration'].includes(
            key,
          ),
      ),
    );
  const targets = createNgDocViteTargets({
    configFile,
    outputPath: targetOutputPath ?? outputPath,
    modes,
    ...(defaultConfiguration ? { defaultConfiguration } : {}),
    ...(plainMode ? { buildMode: plainMode } : {}),
    build: buildOptions,
    buildConfigurations,
    serveModes: serveSettings?.modes ?? {},
    ...(serveSettings?.mode ? { serveMode: serveSettings.mode } : {}),
    ...(serveName && project.targets[serveName]?.defaultConfiguration
      ? { serveDefaultConfiguration: project.targets[serveName]!.defaultConfiguration }
      : {}),
    ...(serveSettings?.host ? { host: serveSettings.host } : {}),
    ...(serveSettings?.port !== undefined ? { port: serveSettings.port } : {}),
    builderKey,
    keepBuild: keep(legacy),
    keepServe: keep(serveName ? project.targets[serveName] : undefined),
  });

  const retargets = findRetargets(project, buildName, legacyBuildName, legacy);
  for (const retarget of retargets) {
    add(
      'migrated',
      `${retarget.target}.buildTarget`,
      `now \`${retarget.after}\`, so the Angular builder keeps reading the original build options.`,
    );
  }

  return {
    project,
    build: { name: buildName, legacyName: legacyBuildName, legacy, next: targets.build },
    ...(serveName
      ? {
          serve: {
            name: serveName,
            legacyName: `${serveName}-legacy`,
            legacy: project.targets[serveName]!,
            next: targets.serve,
          },
        }
      : {}),
    setup,
    retargets,
    ...(legacyOutput ? { legacyOutput } : {}),
    findings,
  };
}

/**
 * Reads `outDir` of the NgDoc configuration when it is a string literal, the only form a schematic
 * can evaluate; `null` when the configuration sets it some other way.
 */
function legacyOutDir(
  tree: Tree,
  project: WorkspaceProject,
  browser: string,
  options: JsonRecord,
): string | null {
  const ngDoc = isRecord(options['ngDoc']) ? options['ngDoc'] : {};
  const file = asString(ngDoc['config'])
    ? normalizePath(asString(ngDoc['config'])!)
    : findNgDocConfig(tree, browser);
  if (!file || !tree.exists(file)) return '';
  const text = tree.readText(file);
  if (!/\boutDir\b/.test(text)) return '';
  const literal = /\boutDir\s*:\s*(['"`])([^'"`$]*)\1/.exec(text);
  return literal ? normalizePath(literal[2]) : null;
}

function analyzeServe(
  project: WorkspaceProject,
  serveName: string,
  buildName: string,
  build: WorkspaceTarget,
  add: (level: FindingLevel, subject: string, message: string) => void,
  plainMode: string | undefined,
): {
  modes: { [configuration: string]: string };
  mode?: string;
  host?: string;
  port?: number;
  devServer?: NgDocViteServerSettings;
} {
  const serve = project.targets[serveName]!;
  const buildModes = Object.keys(build.configurations ?? {});
  const modeOf = (reference: JsonLike | undefined, subject: string): string | undefined => {
    const parsed = asString(reference) ? parseTargetString(asString(reference)!) : undefined;
    if (!parsed) return undefined;
    if (
      (parsed.project && parsed.project !== project.name) ||
      (parsed.target && parsed.target !== buildName)
    ) {
      add(
        'manual',
        subject,
        `\`${reference}\` is not the migrated build target; the development server uses this project's Vite configuration.`,
      );
      return undefined;
    }
    // Without a configuration, Architect runs the build target's default configuration, or its
    // plain options.
    const configuration = parsed.configuration?.split(',')[0] ?? build.defaultConfiguration;
    return configuration && buildModes.includes(configuration) ? configuration : plainMode;
  };
  const modes: { [configuration: string]: string } = {};
  for (const [name, configuration] of Object.entries(serve.configurations ?? {})) {
    const mode = modeOf(
      configuration?.['buildTarget'],
      `${serveName}.configurations.${name}.buildTarget`,
    );
    if (mode) modes[name] = mode;
  }
  const mode = modeOf(serve.options?.['buildTarget'], `${serveName}.buildTarget`);
  if (Object.keys(modes).length || mode) {
    add(
      'migrated',
      `${serveName}.buildTarget`,
      'Each serve configuration sets the Vite mode of its build configuration.',
    );
  }

  const devServer: NgDocViteServerSettings = {};
  const plain = resolveTargetOptions(serve, serve.defaultConfiguration);
  let host: string | undefined;
  let port: number | undefined;
  const keys = optionKeys(serve).filter((key) => key !== 'buildTarget');
  for (const key of keys) {
    const value = plain[key];
    const subject = `${serveName}.${key}`;
    switch (key) {
      case 'host':
        host = asString(value);
        add('migrated', subject, '`host` of the vite-dev-server target.');
        break;
      case 'port':
        port = typeof value === 'number' ? value : undefined;
        add('migrated', subject, '`port` of the vite-dev-server target.');
        break;
      case 'headers':
        if (isRecord(value)) {
          devServer.headers = Object.fromEntries(
            Object.entries(value).filter(([, item]) => typeof item === 'string'),
          ) as { [name: string]: string };
          add('migrated', subject, 'Vite `server.headers`.');
        }
        break;
      case 'open':
        if (value === true) devServer.open = true;
        add('migrated', subject, 'Vite `server.open`.');
        break;
      case 'allowedHosts':
        if (value === true) devServer.allowedHosts = true;
        else if (Array.isArray(value) && value.length) {
          devServer.allowedHosts = value.filter((item): item is string => typeof item === 'string');
        }
        add('migrated', subject, 'Vite `server.allowedHosts`.');
        break;
      case 'hmr':
      case 'liveReload':
      case 'watch':
        if (value === false) {
          add(
            'manual',
            subject,
            'is `false`; the Vite engine needs file watching and hot module replacement, so it is ignored.',
          );
        } else add('dropped', subject, 'The Vite engine always watches and reloads.');
        break;
      case 'prebundle':
      case 'verbose':
        add('dropped', subject, 'Vite prebundles dependencies and logs by its own settings.');
        break;
      case 'ngDoc':
        add(
          'manual',
          subject,
          'The development server uses the NgDoc settings of the build target.',
        );
        break;
      case 'proxyConfig':
        add('manual', subject, `\`${value}\`: move the proxy rules to Vite \`server.proxy\`.`);
        break;
      case 'ssl':
      case 'sslKey':
      case 'sslCert':
        add('manual', subject, 'Set Vite `server.https` with the key and certificate.');
        break;
      default:
        add('manual', subject, 'is not migrated to the Vite development server.');
    }
  }
  return {
    modes,
    ...(mode ? { mode } : {}),
    ...(host ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(Object.keys(devServer).length ? { devServer } : {}),
  };
}

/** Angular builders that read a build target's options and default to the project's `build`. */
const DEFAULT_BUILD_TARGET: { [builder: string]: string | undefined } = {
  '@angular/build:extract-i18n': '',
  '@angular-devkit/build-angular:extract-i18n': '',
  '@angular/build:unit-test': 'development',
};

/**
 * The other targets of the project whose Angular builder reads the build target's options: their
 * `buildTarget` (explicit, or the builder's default of `build`) must name the legacy target, which
 * keeps the Angular options.
 */
function findRetargets(
  project: WorkspaceProject,
  buildName: string,
  legacyName: string,
  build: WorkspaceTarget,
): Retarget[] {
  const retargets: Retarget[] = [];
  for (const [name, target] of Object.entries(project.targets)) {
    const builder = targetBuilder(target) ?? '';
    if (
      !target ||
      LEGACY_BUILD_BUILDERS.includes(builder) ||
      LEGACY_SERVE_BUILDERS.includes(builder)
    )
      continue;
    if (
      !builder.startsWith('@angular/build:') &&
      !builder.startsWith('@angular-devkit/build-angular:')
    )
      continue;
    const explicit = asString(target.options?.['buildTarget']);
    if (explicit) {
      const parsed = parseTargetString(explicit);
      if (
        parsed &&
        (parsed.project === '' || parsed.project === project.name) &&
        parsed.target === buildName
      ) {
        retargets.push({
          target: name,
          before: explicit,
          after: `${project.name}:${legacyName}${parsed.configuration ? `:${parsed.configuration}` : ''}`,
        });
      }
    } else if (builder in DEFAULT_BUILD_TARGET && buildName === 'build') {
      const configuration = DEFAULT_BUILD_TARGET[builder];
      const known =
        configuration && Object.keys(build.configurations ?? {}).includes(configuration);
      retargets.push({
        target: name,
        after: `${project.name}:${legacyName}${known ? `:${configuration}` : ''}`,
      });
    }
  }
  return retargets;
}
