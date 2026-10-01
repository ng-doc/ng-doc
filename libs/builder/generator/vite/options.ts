import { NG_DOC_SYNTAX_THEME_NAME } from '@ng-doc/core';
import path from 'node:path';
import type { Alias, Plugin, UserConfig } from 'vite';

import { type GeneratorBootstrapOptions, assertDevelopmentContent } from '../bootstrap';
import type { PublishedGeneratorConfiguration } from '../contracts';
import { type ProgressOptionSetting, isProgressSetting } from '../progress/settings';
import { canonicalDrive } from './paths';

export const DEFAULT_GENERATED_ALIAS = '@ng-doc/generated';
export const GENERATED_STAGE_IGNORE = '**/.ng-doc-stage-*/**';
const DEFAULT_THEMES: Record<string, string> = {
  'github-light': 'shiki/themes/github-light.mjs',
  'ayu-dark': 'shiki/themes/ayu-dark.mjs',
};
/** Themes `@ng-doc/app` creates itself: no browser module to prebundle or configure. */
const BUILT_IN_THEMES: ReadonlySet<string> = new Set([NG_DOC_SYNTAX_THEME_NAME]);
const REQUIRED_BROWSER_PREBUNDLES = ['esthetic', 'shiki/langs/angular-html.mjs'];

export interface NgDocVitePluginOptions {
  generator: GeneratorBootstrapOptions;
  /**
   * Confirms that the following Analog Angular plugin is configured with `liveReload: true`.
   * The completion companion relies on Analog awaiting TypeScript compilation in that mode.
   */
  analogLiveReload: true;
  /** The complete array from createNgDocAngularPlugins in the built generator/vite/angular entry. */
  angularPlugins: readonly Plugin[];
  /** Absolute path to a real, always-present Angular application component. */
  angularComponentProbe: string;
  generatedAlias?: string;
  maxExternalWatchTargets?: number;
  /** Explicit browser module specifiers for non-default published theme names. */
  themeModules?: Readonly<Record<string, string>>;
  /**
   * Generation progress in the terminal: `auto` (default), `live`, `plain`, `verbose`, `summary`
   * or `off`. `NGDOC_PROGRESS` overrides it; Vite `logLevel` `warn`, `error` or `silent` turns
   * progress off unless it or the environment variable asks for it.
   */
  progress?: ProgressOptionSetting;
}

export interface ResolvedNgDocViteOptions {
  generator: GeneratorBootstrapOptions;
  generatedAlias: string;
  maxExternalWatchTargets: number;
  themeModules: Readonly<Record<string, string>>;
  leaseIdentity: string;
  angularPlugins: readonly Plugin[];
  angularComponentProbe: string;
  progress?: ProgressOptionSetting;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

export function resolveOptions(options: NgDocVitePluginOptions): ResolvedNgDocViteOptions {
  if (!options || typeof options !== 'object' || !options.generator) {
    throw new TypeError('generator must be provided.');
  }
  assertDevelopmentContent(options.generator.developmentContent);
  if ((options as { maxContentRequests?: unknown }).maxContentRequests !== undefined) {
    throw new TypeError(
      '[NGDOC_VITE_OPTION_REMOVED] maxContentRequests was removed with the virtual content mode; remove the option.',
    );
  }
  if (options.analogLiveReload !== true) {
    throw new TypeError(
      'analogLiveReload must be true and @analogjs/vite-plugin-angular must use liveReload: true.',
    );
  }
  if (!Array.isArray(options.angularPlugins) || options.angularPlugins.length === 0) {
    throw new TypeError(
      'angularPlugins must be the complete non-empty Analog Angular plugin array.',
    );
  }
  const angularComponentProbe = text(options.angularComponentProbe, 'angularComponentProbe');
  if (
    !path.isAbsolute(angularComponentProbe) ||
    !/\.ts$/.test(angularComponentProbe) ||
    /\.d\.ts$/.test(angularComponentProbe) ||
    angularComponentProbe.includes('?')
  ) {
    throw new TypeError(
      'angularComponentProbe must be an absolute application .ts component path.',
    );
  }
  const generatedAlias = text(options.generatedAlias ?? DEFAULT_GENERATED_ALIAS, 'generatedAlias');
  // A semantic TypeScript program includes transitive declaration/config inputs even for a
  // one-page project. Keep this bounded, while leaving enough room for real workspaces.
  const capacity = options.maxExternalWatchTargets ?? 50_000;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100_000) {
    throw new RangeError('maxExternalWatchTargets must be an integer between 1 and 100000.');
  }
  const themeModules = Object.fromEntries(
    Object.entries(options.themeModules ?? {}).map(([name, module]) => [
      text(name, 'themeModules name'),
      text(module, `themeModules.${name}`),
    ]),
  );
  if (
    options.progress !== undefined &&
    (!isProgressSetting(options.progress) || (options.progress as string) === 'json')
  ) {
    throw new TypeError('progress must be auto, live, plain, verbose, summary or off.');
  }
  const workspace = path.resolve(text(options.generator.workspaceRoot, 'workspaceRoot'));
  const defaultRoot = path.resolve(
    text(options.generator.defaults.outputRoot, 'defaults.outputRoot'),
  );
  return {
    generator: options.generator,
    generatedAlias,
    maxExternalWatchTargets: capacity,
    themeModules,
    leaseIdentity: `${text(options.generator.projectId, 'projectId')}\0${workspace}\0${defaultRoot}`,
    angularPlugins: [...options.angularPlugins],
    angularComponentProbe: path.normalize(angularComponentProbe),
    ...(options.progress ? { progress: options.progress } : {}),
  };
}

/**
 * The generator options of one session with its build tags (`onlyForTags` of pages and
 * categories). Explicit `generator.discovery.tags` win; otherwise the only tag is the Vite mode:
 * `development` for the dev server and `production` for `vite build`, unless `--mode` names
 * another one. This mirrors the Angular builders, whose tags are the configuration name(s).
 */
export function generatorWithTags(
  generator: GeneratorBootstrapOptions,
  viteMode: string,
): GeneratorBootstrapOptions {
  if (generator.discovery?.tags !== undefined) return generator;
  return { ...generator, discovery: { ...generator.discovery, tags: [viteMode] } };
}

export function generatedAlias(
  options: ResolvedNgDocViteOptions,
  configuration: PublishedGeneratorConfiguration,
): Alias {
  return {
    find: options.generatedAlias,
    replacement: path.join(configuration.outputRoot, 'index.ts').replace(/\\/g, '/'),
  };
}

export function themeImports(
  options: ResolvedNgDocViteOptions,
  configuration?: PublishedGeneratorConfiguration,
): string[] {
  const names = configuration
    ? [configuration.themes.light, configuration.themes.dark]
    : Object.keys(DEFAULT_THEMES);
  return [
    ...new Set(
      names.map((name) => options.themeModules[name] ?? DEFAULT_THEMES[name]).filter(Boolean),
    ),
  ].sort();
}

function within(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The generator cache is written only by the committer and read only by the compiler; Vite never
 * serves or imports it, and the event source already drops owned-root events. Watching it only
 * costs a filesystem event, a directory scan and hot-update hooks per cache write.
 *
 * It is ignored only while it cannot contain anything Vite must observe: not the Vite root, the
 * workspace, the docs or tsconfig directory, and not the output root. The config-time defaults
 * are checked first; the resolved Vite root (`confirmRoot`) and the published configuration
 * (`admit`, before the committer writes) are re-checked later. A failed check fails open: the
 * matcher stops ignoring anything, and the caller re-adds the cache root to the watcher.
 */
export class CacheRootWatchIgnore {
  readonly cacheRoot?: string;
  private active: boolean;

  constructor(private readonly options: ResolvedNgDocViteOptions) {
    const cacheRoot = options.generator.defaults.cacheRoot;
    // Bootstrap publishes exactly this absolute root; anything else fails before generation.
    this.cacheRoot =
      typeof cacheRoot === 'string' && path.isAbsolute(cacheRoot)
        ? canonicalDrive(path.resolve(cacheRoot))
        : undefined;
    this.active = this.cacheRoot !== undefined;
  }

  get ignoring(): boolean {
    return this.active;
  }

  /** The watcher matcher for a Vite root, or undefined when the cache must stay watched. */
  matcher(viteRoot: string): ((file: string) => boolean) | undefined {
    const { workspaceRoot, defaults } = this.options.generator;
    this.guard([
      viteRoot,
      workspaceRoot,
      defaults.outputRoot,
      defaults.docsRoot,
      typeof defaults.tsConfig === 'string' ? path.dirname(defaults.tsConfig) : undefined,
    ]);
    const cacheRoot = this.cacheRoot;
    if (!this.active || !cacheRoot) return undefined;
    return (file) =>
      this.active && typeof file === 'string' && within(cacheRoot, path.resolve(file));
  }

  /** Re-checks the finally resolved Vite root (a later plugin can change `root`). */
  confirmRoot(viteRoot: unknown): boolean {
    return this.guard([viteRoot]);
  }

  /**
   * Re-checks the published configuration before its first physical write. Returns true when
   * this call stopped ignoring the cache root.
   */
  admit(configuration: Readonly<PublishedGeneratorConfiguration>): boolean {
    const cacheRoot = this.cacheRoot;
    if (!this.active || !cacheRoot) return false;
    const publishedCache =
      typeof configuration.cacheRoot === 'string'
        ? canonicalDrive(path.resolve(configuration.cacheRoot))
        : undefined;
    if (publishedCache === cacheRoot && this.guard([configuration.outputRoot])) return false;
    this.active = false;
    return true;
  }

  private guard(roots: unknown[]): boolean {
    const cacheRoot = this.cacheRoot;
    if (
      !this.active ||
      !cacheRoot ||
      // Unvalidated roots are rejected by bootstrap later; never ignore when one is missing.
      roots.some((value) => typeof value !== 'string' || !value) ||
      (roots as string[]).some((value) => within(cacheRoot, path.resolve(value)))
    ) {
      this.active = false;
    }
    return this.active;
  }
}

/**
 * IDE and OS metadata that NgDoc never reads but editors rewrite constantly: the workspace root's
 * JetBrains `.idea/` directory and macOS Finder `.DS_Store` files. NgDoc's recorded inputs are
 * TypeScript sources, `ng-doc.{page,category,api}.ts` descriptions and the files they include,
 * never these. It stays off when a configured root (Vite root, docs, output, tsconfig directory)
 * lies inside that `.idea/` directory. `.vscode/` is not ignored: VS Code keeps its frequently
 * written state outside the workspace, so ignoring it would save nothing.
 */
export function metadataWatchIgnore(
  options: ResolvedNgDocViteOptions,
  viteRoot: string,
): ((file: string) => boolean) | undefined {
  const { workspaceRoot, defaults } = options.generator;
  if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot)) return undefined;
  const idea = path.resolve(workspaceRoot, '.idea');
  const roots = [
    viteRoot,
    defaults.outputRoot,
    defaults.docsRoot,
    typeof defaults.tsConfig === 'string' ? path.dirname(defaults.tsConfig) : undefined,
  ];
  const ignoreIdea = !roots.some(
    (value) => typeof value === 'string' && value && within(idea, path.resolve(value)),
  );
  return (file) => {
    if (typeof file !== 'string') return false;
    const target = path.resolve(file);
    return path.basename(target) === '.DS_Store' || (ignoreIdea && within(idea, target));
  };
}

export function staticViteConfig(
  options: ResolvedNgDocViteOptions,
  viteRoot: string = process.cwd(),
  cacheWatch: CacheRootWatchIgnore = new CacheRootWatchIgnore(options),
): UserConfig {
  const cacheIgnore = cacheWatch.matcher(path.resolve(viteRoot));
  const metadataIgnore = metadataWatchIgnore(options, path.resolve(viteRoot));
  const ignored: Array<string | ((file: string) => boolean)> = [GENERATED_STAGE_IGNORE];
  if (cacheIgnore) ignored.push(cacheIgnore);
  if (metadataIgnore) ignored.push(metadataIgnore);
  return {
    optimizeDeps: {
      include: [
        ...new Set([
          ...REQUIRED_BROWSER_PREBUNDLES,
          ...themeImports(options),
          ...Object.values(options.themeModules),
        ]),
      ].sort(),
    },
    build: { sourcemap: true },
    server: {
      watch: { ignored },
    },
  };
}

export function assertThemeModules(
  options: ResolvedNgDocViteOptions,
  configuration: PublishedGeneratorConfiguration,
): void {
  const missing = [configuration.themes.light, configuration.themes.dark].filter(
    (name) => !DEFAULT_THEMES[name] && !BUILT_IN_THEMES.has(name) && !options.themeModules[name],
  );
  if (missing.length) {
    throw new Error(
      `[NGDOC_VITE_THEME_MODULE] Configure themeModules for published theme(s): ${[
        ...new Set(missing),
      ].join(', ')}`,
    );
  }
}
