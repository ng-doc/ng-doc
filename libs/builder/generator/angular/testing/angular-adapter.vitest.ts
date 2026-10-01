import type {
  ApplicationBuilderOptions,
  DevServerBuilderOptions,
  DevServerBuilderOutput,
} from '@angular/build';
import type { BuilderContext, BuilderOutput, BuilderRun, Target } from '@angular-devkit/architect';
import { Architect, createBuilder } from '@angular-devkit/architect';
import { TestingArchitectHost } from '@angular-devkit/architect/testing';
import { json } from '@angular-devkit/core';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { createGeneratorBuildSession } from '../../bootstrap';
import {
  type SourceCompilerBundle,
  bundleSourceCompiler,
} from '../../compiler/testing/source-bundle';
import type {
  ArtifactSnapshot,
  BuildEvent,
  BuildResult,
  BuildSession,
  BuildSessionServices,
  CommitRequest,
  CompilationRequest,
  Diagnostic,
  FileChange,
  FileEventSource,
  PublishedGeneratorConfiguration,
  WatchHandle,
} from '../../contracts';
import type { ProgressEvent } from '../../progress/events';
import { createBuildSession } from '../../session/build-session';
import applicationBuilder from '../application';
import devServerBuilder from '../dev-server';
import { createThemeIndexTransformer } from '../index-transform';
import {
  angularOutputRoots,
  createDevServerContext,
  requirePublishedConfiguration,
  resolveApplication,
  resolveDevServerApplication,
  stripNgDocApplicationOptions,
  withGeneratedAssets,
} from '../options';
import { createAngularProgress } from '../progress';
import { runModernApplication, runModernDevServer } from '../runner';
import type {
  AngularAdapterDependencies,
  ModernApplicationBuilderOptions,
  ModernDevServerBuilderOptions,
} from '../types';

let sourceBundle: Promise<SourceCompilerBundle> | undefined;
afterAll(async () => {
  await (await sourceBundle)?.dispose();
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function temporary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-angular.'));
  roots.push(root);
  return root;
}

const configuration = (root: string): PublishedGeneratorConfiguration => ({
  outputRoot: path.join(root, 'ng-doc', 'docs'),
  cacheRoot: path.join(root, '.cache', 'ng-doc', 'docs'),
  assetDirectory: 'assets',
  themes: { light: 'github-light', dark: 'ayu-dark' },
  digest: 'configuration',
});

function snapshot(root: string, overrides: Partial<ArtifactSnapshot> = {}): ArtifactSnapshot {
  return {
    configuration: configuration(root),
    projectId: 'docs',
    revision: 'revision',
    artifacts: [],
    globalKeywords: [],
    remoteKeywords: [],
    ...overrides,
  };
}

function success(
  root: string,
  generation: number = 1,
): Extract<BuildResult, { status: 'success' }> {
  return {
    status: 'success',
    generation,
    snapshot: snapshot(root),
    manifest: {
      schemaVersion: 1,
      projectId: 'docs',
      generation,
      revision: 'revision',
      files: [],
    },
    diagnostics: [],
    whyRebuilt: [],
  };
}

function failure(code: string = 'TEST_FAILURE'): BuildResult {
  return {
    status: 'failure',
    generation: 1,
    diagnostics: [{ code, severity: 'error', stage: 'content', message: 'failed' }],
    whyRebuilt: [],
  };
}

interface ContextHarness {
  context: BuilderContext;
  logs: string[];
  teardowns: Array<() => Promise<void> | void>;
  builders: Map<string, string>;
  targetOptions: Map<string, json.JsonObject>;
}

function targetKey(target: Target): string {
  return `${target.project}:${target.target}:${target.configuration ?? ''}`;
}

function context(root: string): ContextHarness {
  const logs: string[] = [];
  const teardowns: Array<() => Promise<void> | void> = [];
  const builders = new Map<string, string>();
  const targetOptions = new Map<string, json.JsonObject>();
  const harness: ContextHarness = {
    logs,
    teardowns,
    builders,
    targetOptions,
    context: {
      id: 1,
      builder: {
        builderName: '@ng-doc/builder:modern-application',
        description: 'test',
        optionSchema: true,
      },
      logger: {
        debug: (message: string) => logs.push(`debug:${message}`),
        info: (message: string) => logs.push(`info:${message}`),
        warn: (message: string) => logs.push(`warn:${message}`),
        error: (message: string) => logs.push(`error:${message}`),
        fatal: (message: string) => logs.push(`fatal:${message}`),
      },
      workspaceRoot: root,
      currentDirectory: root,
      target: { project: 'docs', target: 'build' },
      scheduleTarget: vi.fn(),
      scheduleBuilder: vi.fn(),
      getTargetOptions: async (target: Target) => targetOptions.get(targetKey(target)) ?? {},
      getProjectMetadata: vi.fn(),
      getBuilderNameForTarget: async (target: Target) =>
        builders.get(targetKey(target)) ?? 'other:builder',
      validateOptions: vi.fn(),
      reportRunning: vi.fn(),
      reportStatus: vi.fn(),
      reportProgress: vi.fn(),
      addTeardown: (teardown: () => Promise<void> | void) => teardowns.push(teardown),
    } as unknown as BuilderContext,
  };
  return harness;
}

const applicationOptions = (root: string): ModernApplicationBuilderOptions =>
  ({
    browser: path.relative(root, path.join(root, 'src', 'main.ts')),
    tsConfig: path.relative(root, path.join(root, 'tsconfig.app.json')),
    outputPath: 'dist/docs',
    inlineStyleLanguage: 'scss',
    baseHref: '/preview/',
    assets: [
      'public',
      { glob: '**/*', input: 'user-assets', output: 'assets/user' },
      { glob: '**/*', input: 'ng-doc/docs/assets', output: 'assets/ng-doc' },
    ],
    ngDoc: { config: 'ng-doc.config.ts' },
  }) as ModernApplicationBuilderOptions;

class FakeSession implements BuildSession {
  readonly modes: string[] = [];
  readonly sources: FileEventSource[] = [];
  observer?: (event: BuildEvent) => void;
  admissionEvent?: BuildEvent;
  disposals = 0;
  watchDisposals = 0;

  constructor(
    private readonly buildResult: BuildResult,
    private readonly watchResult: BuildResult = buildResult,
  ) {}

  async buildOnce(options?: { mode?: 'development' | 'production' }): Promise<BuildResult> {
    this.modes.push(options?.mode ?? 'production');
    return structuredClone(this.buildResult);
  }

  async watch(source: FileEventSource, onEvent: (event: BuildEvent) => void): Promise<WatchHandle> {
    this.sources.push(source);
    this.observer = onEvent;
    if (this.admissionEvent) onEvent(this.admissionEvent);
    return {
      initial: Promise.resolve(structuredClone(this.watchResult)),
      dispose: async () => {
        this.watchDisposals++;
      },
    };
  }

  async reconcileInputs(): Promise<void> {}

  async rescan(): Promise<void> {}

  async dispose(): Promise<void> {
    this.disposals++;
  }
}

interface DependencyHarness {
  dependencies: AngularAdapterDependencies;
  sessions: FakeSession[];
  sessionOptions: unknown[];
  ignores: string[][];
  applicationCalls: Array<{
    options: ApplicationBuilderOptions;
    context: BuilderContext;
    extensions: unknown;
  }>;
  devServerCalls: Array<{
    options: DevServerBuilderOptions;
    context: BuilderContext;
    extensions: unknown;
  }>;
}

function dependencyHarness(
  root: string,
  buildResult: BuildResult = success(root),
  watchResult: BuildResult = buildResult,
  applicationOutputs: BuilderOutput[] = [{ success: true }, { success: true, outputPath: 'dist' }],
): DependencyHarness {
  const sessions: FakeSession[] = [];
  const sessionOptions: unknown[] = [];
  const ignores: string[][] = [];
  const applicationCalls: DependencyHarness['applicationCalls'] = [];
  const devServerCalls: DependencyHarness['devServerCalls'] = [];
  const dependencies: AngularAdapterDependencies = {
    createSession: (options) => {
      // The session options carry the progress consumer, a function: record the rest.
      const { session: _session, ...cloneable } = options;
      sessionOptions.push(structuredClone(cloneable));
      const session = new FakeSession(buildResult, watchResult);
      sessions.push(session);
      return session;
    },
    createEventSource: (_workspace, options) => {
      ignores.push(options.ignore);
      return { subscribe: vi.fn() } as unknown as FileEventSource;
    },
    createIndexHtmlTransformer: async () => async (html) => `transformed:${html}`,
    buildApplication: (options, adapterContext, extensions) => {
      applicationCalls.push({ options, context: adapterContext, extensions });
      return (async function* () {
        for (const output of applicationOutputs) yield output;
      })();
    },
    executeDevServer: (options, adapterContext, extensions) => {
      devServerCalls.push({ options, context: adapterContext, extensions });
      return (async function* () {
        yield { success: true, baseUrl: 'http://localhost:4200/' };
      })();
    },
  };
  return {
    sessions,
    sessionOptions,
    ignores,
    applicationCalls,
    devServerCalls,
    dependencies,
  };
}

/** A dev server that reports readiness, then serves until `stopped` settles. */
function servingUntil(stopped: Promise<void>): AngularAdapterDependencies['executeDevServer'] {
  return () =>
    (async function* (): AsyncGenerator<DevServerBuilderOutput> {
      yield { success: true, baseUrl: 'http://localhost:4200/' } as DevServerBuilderOutput;
      await stopped;
    })();
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}

describe('Angular adapter options', () => {
  it('derives canonical generator defaults while preserving Angular baseHref and stripping ngDoc', async () => {
    const root = temporary();
    const h = context(root);
    const resolved = await resolveApplication(applicationOptions(root), h.context);
    expect(resolved).toMatchObject({
      projectId: 'docs',
      options: { baseHref: '/preview/', inlineStyleLanguage: 'scss' },
      bootstrap: {
        projectId: 'docs',
        workspaceRoot: root,
        configFile: path.join(root, 'ng-doc.config.ts'),
        defaults: {
          docsRoot: path.join(root, 'src'),
          tsConfig: path.join(root, 'tsconfig.app.json'),
          outputRoot: path.join(root, 'ng-doc', 'docs'),
          cacheRoot: path.join(root, '.cache', 'ng-doc', 'docs'),
        },
        discovery: { inlineStyleLanguage: 'SCSS' },
      },
    });
    expect(resolved.options).not.toHaveProperty('ngDoc');
    expect(applicationOptions(root)).toHaveProperty('ngDoc.config', 'ng-doc.config.ts');
  });

  it('rejects missing project, browser, malformed ngDoc and unsupported style language', async () => {
    const root = temporary();
    const h = context(root);
    h.context.target = undefined;
    await expect(resolveApplication(applicationOptions(root), h.context)).rejects.toThrow(
      /project/,
    );
    h.context.target = { project: 'docs', target: 'build' };
    await expect(
      resolveApplication({ tsConfig: 'tsconfig.json' } as never, h.context),
    ).rejects.toThrow(/browser/);
    await expect(
      resolveApplication({ ...applicationOptions(root), ngDoc: 'bad' } as never, h.context),
    ).rejects.toThrow(/ngDoc/);
    await expect(
      resolveApplication(
        { ...applicationOptions(root), inlineStyleLanguage: 'stylus' } as never,
        h.context,
      ),
    ).rejects.toThrow(/inlineStyleLanguage/);
  });

  it('uses CSS and no config for omitted optional application settings', async () => {
    const root = temporary();
    const h = context(root);
    const options = {
      browser: 'src/main.ts',
      tsConfig: 'tsconfig.json',
      ngDoc: {},
    } as ModernApplicationBuilderOptions;
    const resolved = await resolveApplication(options, h.context);
    expect(resolved.bootstrap).not.toHaveProperty('configFile');
    expect(resolved.bootstrap.discovery).toEqual({ inlineStyleLanguage: 'CSS', tags: [] });
    expect(withGeneratedAssets(resolved.options, configuration(root), root, 'docs').assets).toEqual(
      [
        {
          glob: '**/*',
          input: path.join(configuration(root).outputRoot, 'assets'),
          output: 'assets/ng-doc',
        },
      ],
    );
    const withoutNgDoc = await resolveApplication(
      { browser: 'src/main.ts', tsConfig: 'tsconfig.json' },
      h.context,
    );
    expect(withoutNgDoc.bootstrap).not.toHaveProperty('configFile');
  });

  it('replaces only generated asset mappings and preserves user assets and deployment paths', () => {
    const root = temporary();
    const options = applicationOptions(root);
    const config = configuration(root);
    const mapped = withGeneratedAssets(stripNgDocApplicationOptions(options), config, root, 'docs');
    expect(mapped.baseHref).toBe('/preview/');
    expect(mapped.assets).toEqual([
      'public',
      { glob: '**/*', input: 'user-assets', output: 'assets/user' },
      {
        glob: '**/*',
        input: path.join(config.outputRoot, 'assets'),
        output: 'assets/ng-doc',
      },
    ]);
    expect(options.assets).toHaveLength(3);
    expect(angularOutputRoots(mapped, root, 'docs')).toEqual([path.join(root, 'dist', 'docs')]);
    expect(
      angularOutputRoots({ ...mapped, outputPath: { base: 'dist/object' } }, root, 'docs'),
    ).toEqual([path.join(root, 'dist', 'object')]);
    // Without outputPath, Angular writes to dist/<project>.
    expect(angularOutputRoots({ ...mapped, outputPath: undefined }, root, 'site')).toEqual([
      path.join(root, 'dist', 'site'),
    ]);
  });

  it('requires published configuration from every successful snapshot', () => {
    const root = temporary();
    expect(requirePublishedConfiguration(snapshot(root))).toEqual(configuration(root));
    expect(() =>
      requirePublishedConfiguration(snapshot(root, { configuration: undefined })),
    ).toThrow(/published configuration/);
  });

  it('derives onlyForTags build tags from the configuration name unless ngDoc.tags is set', async () => {
    const root = temporary();
    const h = context(root);
    const tagsOf = async (options: ModernApplicationBuilderOptions = applicationOptions(root)) =>
      (await resolveApplication(options, h.context)).bootstrap.discovery?.tags;
    h.context.target = { project: 'docs', target: 'build', configuration: 'production' };
    expect(await tagsOf()).toEqual(['production']);
    h.context.target = { project: 'docs', target: 'build', configuration: 'production, staging' };
    expect(await tagsOf()).toEqual(['production', 'staging']);
    expect(
      await tagsOf({
        ...applicationOptions(root),
        ngDoc: { config: 'ng-doc.config.ts', tags: ['preview'] },
      }),
    ).toEqual(['preview']);
    for (const tags of ['preview', [''], [3]]) {
      await expect(
        resolveApplication({ ...applicationOptions(root), ngDoc: { tags } } as never, h.context),
      ).rejects.toThrow(/ngDoc.tags/);
    }
    // No configuration and no declared defaultConfiguration: no tags.
    h.context.target = { project: 'docs', target: 'build', configuration: '' };
    expect(await tagsOf()).toEqual([]);
  });

  it('resolves an empty configuration from the defaultConfiguration of angular.json or project.json', async () => {
    const root = temporary();
    const h = context(root);
    // `ng build` without -c: Architect passes an empty configuration name.
    h.context.target = { project: 'docs', target: 'build', configuration: '' };
    const tagsOf = async () =>
      (await resolveApplication(applicationOptions(root), h.context)).bootstrap.discovery?.tags;
    const write = (file: string, value: unknown) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), JSON.stringify(value));
    };
    // Nx: the project's project.json, located through the project metadata.
    vi.mocked(h.context.getProjectMetadata).mockResolvedValue({ root: 'apps/docs' });
    write('apps/docs/project.json', {
      targets: { build: { defaultConfiguration: 'production' }, serve: {} },
    });
    expect(await tagsOf()).toEqual(['production']);
    // Angular CLI: angular.json wins, `architect` or `targets`.
    write('angular.json', {
      projects: { docs: { architect: { build: { defaultConfiguration: 'staging' } } } },
    });
    expect(await tagsOf()).toEqual(['staging']);
    write('angular.json', {
      projects: { docs: { targets: { build: { defaultConfiguration: 'development' } } } },
    });
    expect(await tagsOf()).toEqual(['development']);
    // An unreadable workspace file or failing metadata gives no tags rather than an error.
    fs.writeFileSync(path.join(root, 'angular.json'), '{ not json');
    fs.writeFileSync(path.join(root, 'apps/docs/project.json'), '{ not json');
    expect(await tagsOf()).toEqual([]);
    vi.mocked(h.context.getProjectMetadata).mockRejectedValue(new Error('no metadata'));
    expect(await tagsOf()).toEqual([]);
    // An explicit configuration never reads the workspace.
    h.context.target = { project: 'docs', target: 'build', configuration: 'production' };
    expect(await tagsOf()).toEqual(['production']);
  });

  it('uses the served build target configuration, or its defaultConfiguration, as dev-server tags', async () => {
    const root = temporary();
    const h = context(root);
    // `ng serve` without -c: the serve target has an empty configuration name.
    h.context.target = { project: 'docs', target: 'serve', configuration: '' };
    const build = { project: 'docs', target: 'build', configuration: 'development' };
    h.targetOptions.set(targetKey(build), applicationOptions(root) as unknown as json.JsonObject);
    const tagsOf = async (options: ModernDevServerBuilderOptions) =>
      (await resolveDevServerApplication(options, h.context)).bootstrap.discovery?.tags;
    expect(await tagsOf({ buildTarget: 'docs:build:development' })).toEqual(['development']);
    const unconfigured = { project: 'docs', target: 'build' };
    h.targetOptions.set(targetKey(unconfigured), {
      ...applicationOptions(root),
      ngDoc: { tags: ['from-build'] },
    } as unknown as json.JsonObject);
    expect(await tagsOf({ buildTarget: 'docs:build' })).toEqual(['from-build']);
    expect(await tagsOf({ buildTarget: 'docs:build', ngDoc: { tags: ['override'] } })).toEqual([
      'override',
    ]);
    // Without a configuration in buildTarget: the build target's defaultConfiguration.
    h.targetOptions.set(
      targetKey(unconfigured),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    expect(await tagsOf({ buildTarget: 'docs:build' })).toEqual([]);
    fs.writeFileSync(
      path.join(root, 'angular.json'),
      JSON.stringify({
        projects: {
          docs: {
            architect: {
              build: { defaultConfiguration: 'production' },
              serve: { defaultConfiguration: 'development' },
            },
          },
        },
      }),
    );
    expect(await tagsOf({ buildTarget: 'docs:build' })).toEqual(['production']);
  });

  it('resolves dev-server target options and config override without mutating the target', async () => {
    const root = temporary();
    const h = context(root);
    const target = { project: 'docs', target: 'build', configuration: 'development' };
    h.targetOptions.set(targetKey(target), applicationOptions(root) as unknown as json.JsonObject);
    const resolved = await resolveDevServerApplication(
      { buildTarget: 'docs:build:development', ngDoc: { config: 'override.ts' } },
      h.context,
    );
    expect(resolved.bootstrap.configFile).toBe(path.join(root, 'override.ts'));
    expect(resolved.options).not.toHaveProperty('ngDoc');
    expect(h.targetOptions.get(targetKey(target))).toHaveProperty(
      'ngDoc.config',
      'ng-doc.config.ts',
    );
    for (const abbreviated of [':build:development', '::development']) {
      expect(
        (await resolveDevServerApplication({ buildTarget: abbreviated }, h.context)).options,
      ).toMatchObject({ browser: 'src/main.ts', tsConfig: 'tsconfig.app.json' });
    }
  });

  it('facades only modern application targets and returns generated options for them', async () => {
    const root = temporary();
    const h = context(root);
    const modern = { project: 'docs', target: 'build' };
    const unrelated = { project: 'docs', target: 'lint' };
    h.builders.set(targetKey(modern), '@ng-doc/builder:modern-application');
    h.builders.set(targetKey(unrelated), '@nx/eslint:lint');
    h.targetOptions.set(targetKey(modern), applicationOptions(root) as unknown as json.JsonObject);
    const unrelatedOptions = { lintFilePatterns: ['src/**/*.ts'] };
    h.targetOptions.set(targetKey(unrelated), unrelatedOptions);
    const application = await resolveApplication(applicationOptions(root), h.context);
    const facade = createDevServerContext(h.context, application, configuration(root));
    expect(await facade.getBuilderNameForTarget(modern)).toBe('@angular/build:application');
    expect(await facade.getBuilderNameForTarget(unrelated)).toBe('@nx/eslint:lint');
    expect(await facade.getTargetOptions(modern)).toMatchObject({
      assets: [
        'public',
        { glob: '**/*', input: 'user-assets', output: 'assets/user' },
        {
          glob: '**/*',
          input: path.join(configuration(root).outputRoot, 'assets'),
          output: 'assets/ng-doc',
        },
      ],
    });
    expect(await facade.getTargetOptions(unrelated)).toBe(unrelatedOptions);
    expect(facade.workspaceRoot).toBe(root);
  });
});

describe('theme index transformer', () => {
  it('loads the real restore script, injects exactly once and handles every head shape', async () => {
    const transform = await createThemeIndexTransformer(
      new URL('../restore-theme.js', import.meta.url),
    );
    const withHead = await transform('<html><head data-x="1"></head><body></body></html>');
    expect(withHead).toContain('<head data-x="1"><script data-ng-doc-theme-restore>');
    expect(withHead).toContain("localStorage.getItem('ng-doc-theme-id')");
    expect(await transform(withHead)).toBe(withHead);
    expect(withHead.match(/data-ng-doc-theme-restore/g) ?? []).toHaveLength(1);
    expect(await transform('<html><body>x</body></html>')).toContain(
      '<html><head><script data-ng-doc-theme-restore>',
    );
    expect(await transform('<!doctype html><body>x</body>')).toContain(
      '<!doctype html><head><script data-ng-doc-theme-restore>',
    );
    expect(await transform('<main>x</main>')).toMatch(/^<head><script data-ng-doc-theme-restore>/);
  });
});

describe('Angular application and dev-server runners', () => {
  it('gates an application host on committed generation and propagates initial failure', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root, failure());
    const outputs = await collect(
      runModernApplication(applicationOptions(root), h.context, deps.dependencies),
    );
    expect(outputs).toEqual([{ success: false, error: '[TEST_FAILURE] failed' }]);
    expect(deps.applicationCalls).toEqual([]);
    expect(deps.sessions[0]?.modes).toEqual(['production']);
    expect(deps.sessions[0]?.disposals).toBe(1);
    expect(h.logs).toContain('error:[TEST_FAILURE] failed');
  });

  it('forwards nonfatal generation diagnostics through the Architect logger', async () => {
    const root = temporary();
    const h = context(root);
    const generated = success(root);
    generated.diagnostics = [
      { code: 'TEST_WARNING', severity: 'warning', stage: 'host', message: 'careful' },
      { code: 'TEST_INFO', severity: 'info', stage: 'host', message: 'context' },
    ];
    const deps = dependencyHarness(root, generated);
    expect(
      await collect(runModernApplication(applicationOptions(root), h.context, deps.dependencies)),
    ).toEqual([{ success: true }, { success: true, outputPath: 'dist' }]);
    expect(h.logs).toEqual(
      expect.arrayContaining(['warn:[TEST_WARNING] careful', 'info:[TEST_INFO] context']),
    );
  });

  it('forwards the complete Angular application iterable after generation and asset adaptation', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root);
    const outputs = await collect(
      runModernApplication(applicationOptions(root), h.context, deps.dependencies),
    );
    expect(outputs).toEqual([{ success: true }, { success: true, outputPath: 'dist' }]);
    expect(deps.applicationCalls).toHaveLength(1);
    expect(deps.applicationCalls[0]?.options).toMatchObject({
      baseHref: '/preview/',
      assets: expect.arrayContaining([
        {
          glob: '**/*',
          input: path.join(configuration(root).outputRoot, 'assets'),
          output: 'assets/ng-doc',
        },
      ]),
    });
    expect(deps.applicationCalls[0]?.extensions).toHaveProperty('indexHtmlTransformer');
    expect(deps.sessionOptions[0]).toMatchObject({ projectId: 'docs' });
    expect(h.teardowns).toHaveLength(1);
    expect(deps.sessions[0]?.disposals).toBe(1);
  });

  it('rejects a hidden descendant output for watch while finite generation remains valid', async () => {
    const root = temporary();
    const hidden = success(root);
    hidden.snapshot.configuration = {
      ...configuration(root),
      outputRoot: path.join(root, 'generated', '.ng-doc', 'docs'),
    };

    const watchContext = context(root);
    const watchDependencies = dependencyHarness(root, hidden);
    expect(
      await collect(
        runModernApplication(
          { ...applicationOptions(root), watch: true },
          watchContext.context,
          watchDependencies.dependencies,
        ),
      ),
    ).toEqual([
      {
        success: false,
        error: expect.stringContaining('[NGDOC_ANGULAR_HIDDEN_OUTPUT]'),
      },
    ]);
    expect(watchDependencies.applicationCalls).toEqual([]);
    expect(watchDependencies.sessions[0]?.sources).toEqual([]);
    expect(watchContext.logs).toContainEqual(
      expect.stringContaining('error:[NGDOC_ANGULAR_HIDDEN_OUTPUT]'),
    );

    const finiteContext = context(root);
    const finiteDependencies = dependencyHarness(root, hidden);
    expect(
      await collect(
        runModernApplication(
          applicationOptions(root),
          finiteContext.context,
          finiteDependencies.dependencies,
        ),
      ),
    ).toEqual([{ success: true }, { success: true, outputPath: 'dist' }]);
    expect(finiteDependencies.applicationCalls).toHaveLength(1);
  });

  it('allows a generated output below a dot-prefixed workspace root', async () => {
    const parent = temporary();
    const root = path.join(parent, '.workspace');
    fs.mkdirSync(root);
    const h = context(root);
    const deps = dependencyHarness(root, success(root), success(root, 2));
    expect(
      await collect(
        runModernApplication(
          { ...applicationOptions(root), watch: true },
          h.context,
          deps.dependencies,
        ),
      ),
    ).toEqual([{ success: true }, { success: true, outputPath: 'dist' }]);
    expect(deps.applicationCalls).toHaveLength(1);
  });

  it('does not start a watch host when the post-subscription generation fails', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root, success(root), failure('RECONCILE_FAILED'));
    const outputs = await collect(
      runModernApplication(
        { ...applicationOptions(root), watch: true },
        h.context,
        deps.dependencies,
      ),
    );
    expect(outputs).toEqual([{ success: false, error: '[RECONCILE_FAILED] failed' }]);
    expect(deps.applicationCalls).toEqual([]);
    expect(deps.sessions[0]?.watchDisposals).toBe(1);
    expect(deps.sessions[0]?.disposals).toBe(1);
  });

  it('bars host admission on a fatal watcher diagnostic raised during initial reconciliation', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root, success(root), success(root, 2));
    const session = new FakeSession(success(root), success(root, 2));
    session.admissionEvent = {
      kind: 'diagnostic',
      diagnostic: { code: 'WATCHER_ERROR', severity: 'error', stage: 'host', message: 'admission' },
    };
    deps.dependencies.createSession = () => session;
    const outputs = await collect(
      runModernApplication(
        { ...applicationOptions(root), watch: true },
        h.context,
        deps.dependencies,
      ),
    );
    expect(outputs).toEqual([{ success: false, error: '[WATCHER_ERROR] admission' }]);
    expect(deps.applicationCalls).toEqual([]);
    expect(h.logs).toContain('error:[WATCHER_ERROR] admission');
  });

  it('bars host admission on a fatal watcher diagnostic while the index transformer loads', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root, success(root), success(root, 2));
    let releaseTransformer!: () => void;
    deps.dependencies.createIndexHtmlTransformer = () =>
      new Promise((resolve) => {
        releaseTransformer = () => resolve(async (html) => html);
      });
    const iterator = runModernApplication(
      { ...applicationOptions(root), watch: true },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    const pending = iterator.next();
    await vi.waitFor(() => expect(deps.sessions[0]?.observer).toBeTypeOf('function'));
    deps.sessions[0]?.observer?.({
      kind: 'diagnostic',
      diagnostic: {
        code: 'WATCHER_ERROR',
        severity: 'error',
        stage: 'host',
        message: 'before host',
      },
    });
    releaseTransformer();
    expect(await pending).toEqual({
      done: false,
      value: { success: false, error: '[WATCHER_ERROR] before host' },
    });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    expect(deps.applicationCalls).toEqual([]);
  });

  it('subscribes before the committed watch rescan, then surfaces recoverable generation failures', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root, success(root), success(root, 2));
    let release!: () => void;
    deps.dependencies.buildApplication = (options, adapterContext, extensions) => {
      deps.applicationCalls.push({ options, context: adapterContext, extensions });
      return (async function* (): AsyncGenerator<BuilderOutput> {
        yield { success: true };
        await new Promise<void>((resolve) => (release = resolve));
        yield { success: true, outputPath: 'rebuilt' };
      })();
    };
    const iterator = runModernApplication(
      { ...applicationOptions(root), watch: true },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ done: false, value: { success: true } });
    expect(deps.sessions[0]?.modes).toEqual(['development']);
    expect(deps.sessions[0]?.sources).toHaveLength(1);
    expect(deps.ignores[0]).toEqual(
      expect.arrayContaining([
        '**/node_modules/**',
        '**/.angular/**',
        configuration(root).outputRoot,
        configuration(root).cacheRoot,
        path.join(root, 'dist', 'docs'),
      ]),
    );
    deps.sessions[0]?.observer?.({ kind: 'result', result: failure('RECOVERABLE') });
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: false, error: '[RECOVERABLE] failed' },
    });
    deps.sessions[0]?.observer?.({
      kind: 'result',
      result: failure('BOOTSTRAP_RESTART_REQUIRED'),
    });
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: false, error: '[BOOTSTRAP_RESTART_REQUIRED] failed' },
    });
    // A recovered generation yields nothing itself: the host's next rebuild reports success.
    deps.sessions[0]?.observer?.({ kind: 'result', result: success(root, 4) });
    release();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: true, outputPath: 'rebuilt' },
    });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    expect(deps.sessions[0]?.watchDisposals).toBe(1);
  });

  it('yields a regeneration failure between host outputs and again after a native success', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root, success(root), success(root, 2));
    let release!: () => void;
    deps.dependencies.buildApplication = () =>
      (async function* (): AsyncGenerator<BuilderOutput> {
        yield { success: false, error: 'Angular failed' };
        await new Promise<void>((resolve) => (release = resolve));
        yield { success: true, outputPath: 'rebuilt' };
      })();
    const iterator = runModernApplication(
      { ...applicationOptions(root), watch: true },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: false, error: 'Angular failed' },
    });
    const failed = failure('GENERATOR_FAILED');
    failed.diagnostics.push({
      code: 'GENERATOR_NOTE',
      severity: 'info',
      stage: 'content',
      message: 'n',
    });
    deps.sessions[0]?.observer?.({ kind: 'started', generation: 2, changes: [] });
    deps.sessions[0]?.observer?.({ kind: 'unchanged', changes: [] });
    deps.sessions[0]?.observer?.({ kind: 'result', result: failed });
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: false, error: '[GENERATOR_FAILED] failed' },
    });
    expect(h.logs).toEqual(
      expect.arrayContaining(['error:[GENERATOR_FAILED] failed', 'info:[GENERATOR_NOTE] n']),
    );
    deps.sessions[0]?.observer?.({
      kind: 'diagnostic',
      diagnostic: { code: 'WATCHER_NOTE', severity: 'warning', stage: 'host', message: 'slow' },
    });
    deps.sessions[0]?.observer?.({
      kind: 'result',
      result: { ...failure('SILENT'), diagnostics: [] },
    });
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: false, error: 'NgDoc regeneration failed' },
    });
    release();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: true, outputPath: 'rebuilt' },
    });
    // The regeneration failure is still current: a native success does not hide it.
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: false, error: 'NgDoc regeneration failed' },
    });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    expect(h.logs).toContain('warn:[WATCHER_NOTE] slow');
    expect(deps.sessions[0]?.watchDisposals).toBe(1);
    expect(deps.sessions[0]?.disposals).toBe(1);
  });

  it.each(['options', 'generation', 'watch', 'reconciliation', 'transformer'] as const)(
    'starts nothing after a stop that arrives while waiting for the %s',
    async (step) => {
      const root = temporary();
      const h = context(root);
      const deps = dependencyHarness(root, success(root), success(root, 2));
      // Architect's stop runs the adapter's teardown.
      const stop = () => Promise.resolve(h.teardowns[0]?.());
      const options = { ...applicationOptions(root), watch: true };
      const create = deps.dependencies.createSession;
      deps.dependencies.createSession = (bootstrap) => {
        const session = create(bootstrap) as FakeSession;
        const buildOnce = session.buildOnce.bind(session);
        const watch = session.watch.bind(session);
        if (step === 'generation') {
          session.buildOnce = async (mode) => (await stop(), buildOnce(mode));
        }
        if (step === 'watch' || step === 'reconciliation') {
          session.watch = async (source, onEvent) => {
            const handle = await watch(source, onEvent);
            if (step === 'watch') await stop();
            else handle.initial = handle.initial.then(async (value) => (await stop(), value));
            return handle;
          };
        }
        return session;
      };
      if (step === 'transformer') {
        deps.dependencies.createIndexHtmlTransformer = async () => {
          await stop();
          return async (html) => html;
        };
      }
      const outputs = await collect(
        runModernApplication(
          step === 'options'
            ? {
                ...options,
                get ngDoc() {
                  void stop();
                  return options.ngDoc;
                },
              }
            : options,
          h.context,
          deps.dependencies,
        ),
      );
      expect(outputs).toEqual([]);
      expect(deps.applicationCalls).toEqual([]);
      expect(deps.sessions.map((session) => session.disposals)).toEqual(
        step === 'options' ? [] : [1],
      );
      if (step === 'watch' || step === 'reconciliation') {
        expect(deps.sessions[0]?.watchDisposals).toBe(1);
      }
    },
  );

  it('bounds each Angular teardown and still disposes the watch and the session', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root, success(root), success(root, 2));
    deps.dependencies.hostTeardownTimeoutMs = 20;
    deps.dependencies.buildApplication = (_options, hostContext) => {
      hostContext.addTeardown(() => new Promise(() => {}));
      return (async function* (): AsyncGenerator<BuilderOutput> {
        yield { success: true };
      })();
    };
    expect(
      await collect(
        runModernApplication(
          { ...applicationOptions(root), watch: true },
          h.context,
          deps.dependencies,
        ),
      ),
    ).toEqual([{ success: true }]);
    expect(h.logs).toContain(
      'warn:[NGDOC_ANGULAR_TEARDOWN_TIMEOUT] An Angular teardown did not finish within 20 ms.',
    );
    expect(deps.sessions[0]?.watchDisposals).toBe(1);
    expect(deps.sessions[0]?.disposals).toBe(1);
  });

  it('ends the run on a fatal watcher diagnostic and runs the teardowns Angular registered', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root, success(root), success(root, 2));
    let release!: () => void;
    let hostFinished = false;
    const late = vi.fn();
    deps.dependencies.buildApplication = (_options, hostContext) => {
      const stopped = new Promise<void>((resolve) => (release = resolve));
      // Angular ends its own iterator from the teardown it registers.
      hostContext.addTeardown(() => release());
      hostContext.addTeardown(() => {
        throw new Error('second teardown failed');
      });
      return (async function* (): AsyncGenerator<BuilderOutput> {
        try {
          yield { success: true };
          await stopped;
          hostContext.addTeardown(late);
        } finally {
          hostFinished = true;
        }
      })();
    };
    const iterator = runModernApplication(
      { ...applicationOptions(root), watch: true },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    await iterator.next();
    const lost = {
      kind: 'diagnostic',
      diagnostic: { code: 'WATCHER_ERROR', severity: 'error', stage: 'host', message: 'lost' },
    } as const;
    deps.sessions[0]?.observer?.(lost);
    deps.sessions[0]?.observer?.(lost);
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: false, error: '[WATCHER_ERROR] lost' },
    });
    // Architect runs no teardown after a run completes: the adapter runs Angular's itself.
    await expect(iterator.next()).rejects.toThrow('second teardown failed');
    await vi.waitFor(() => expect(hostFinished).toBe(true));
    await vi.waitFor(() => expect(late).toHaveBeenCalledOnce());
    // Only the adapter's own teardown reached Architect.
    expect(h.teardowns).toHaveLength(1);
    expect(deps.sessions[0]?.disposals).toBe(1);
    expect(deps.sessions[0]?.watchDisposals).toBe(1);
  });

  describe('through a real Architect', () => {
    async function schedule(
      root: string,
      deps: DependencyHarness,
    ): Promise<{ run: BuilderRun; outputs: BuilderOutput[] }> {
      const registry = new json.schema.CoreSchemaRegistry();
      registry.addPostTransform(json.schema.transforms.addUndefinedDefaults);
      const host = new TestingArchitectHost(root, root);
      const architect = new Architect(host, registry);
      host.addBuilder(
        'test:modern-application',
        createBuilder((options: json.JsonObject, builderContext) =>
          runModernApplication(
            options as unknown as ModernApplicationBuilderOptions,
            builderContext,
            deps.dependencies,
          ),
        ),
      );
      host.addTarget({ project: 'docs', target: 'build' }, 'test:modern-application', {
        ...(applicationOptions(root) as unknown as json.JsonObject),
        watch: true,
      });
      const run = await architect.scheduleTarget({ project: 'docs', target: 'build' });
      const outputs: BuilderOutput[] = [];
      run.output.subscribe((output) => outputs.push(output));
      return { run, outputs };
    }

    function hangingHost(deps: DependencyHarness, teardowns: { count: number }) {
      deps.dependencies.buildApplication = (_options, hostContext) => {
        let release!: () => void;
        const stopped = new Promise<void>((resolve) => (release = resolve));
        hostContext.addTeardown(() => {
          teardowns.count++;
          release();
        });
        return (async function* (): AsyncGenerator<BuilderOutput> {
          yield { success: true };
          await stopped;
        })();
      };
    }

    it('runs Angular teardowns after a fatal watcher error completes the run', async () => {
      const root = temporary();
      const deps = dependencyHarness(root, success(root), success(root, 2));
      const teardowns = { count: 0 };
      hangingHost(deps, teardowns);
      const { run, outputs } = await schedule(root, deps);
      await vi.waitFor(() => expect(outputs).toHaveLength(1));
      deps.sessions[0]?.observer?.({
        kind: 'diagnostic',
        diagnostic: { code: 'WATCHER_ERROR', severity: 'error', stage: 'host', message: 'lost' },
      });
      await expect(run.lastOutput).resolves.toMatchObject({
        success: false,
        error: '[WATCHER_ERROR] lost',
      });
      await vi.waitFor(() => expect(teardowns.count).toBe(1));
      expect(deps.sessions[0]?.disposals).toBe(1);
      await run.stop();
      expect(teardowns.count).toBe(1);
    });

    it('runs Angular teardowns once when Architect stops a running build (Ctrl-C)', async () => {
      const root = temporary();
      const deps = dependencyHarness(root, success(root), success(root, 2));
      const teardowns = { count: 0 };
      hangingHost(deps, teardowns);
      const { run, outputs } = await schedule(root, deps);
      await vi.waitFor(() => expect(outputs).toEqual([expect.objectContaining({ success: true })]));
      await run.stop();
      await vi.waitFor(() => expect(teardowns.count).toBe(1));
      await vi.waitFor(() => expect(deps.sessions[0]?.disposals).toBe(1));
      expect(deps.sessions[0]?.watchDisposals).toBe(1);
    });
  });

  it('publishes an edit to an input first recorded by the generation in flight', async () => {
    // A generation starts depending on a snippet, the snippet is edited before that generation's
    // result, and v2 must still be published.
    const root = fs.realpathSync(temporary());
    const page = path.join(root, 'docs', 'page.md');
    const snippet = path.join(root, 'snippets', 'snippet.md');
    fs.mkdirSync(path.dirname(page), { recursive: true });
    fs.mkdirSync(path.dirname(snippet), { recursive: true });
    fs.writeFileSync(page, 'v1');
    fs.writeFileSync(snippet, 'snippet v1');
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    const commits: string[] = [];
    let readSnippet = false;
    let gate: Promise<void> | undefined = undefined;
    let open!: () => void;
    const content = (file: string, body: string) => ({
      kind: 'content' as const,
      path: file,
      digest: createHash('sha256').update(body).digest('hex'),
    });
    const services: BuildSessionServices = {
      compiler: {
        async compile(request: CompilationRequest) {
          const body = fs.readFileSync(page, 'utf8');
          const dependencies = [content(page, body)];
          let included = '';
          if (body.includes('include')) {
            included = fs.readFileSync(snippet, 'utf8');
            dependencies.push(content(snippet, included));
            readSnippet = true;
            await gate;
          }
          return {
            candidate: snapshot(root, { revision: `${request.generation}:${body}|${included}` }),
            dependencies,
            diagnostics: [],
            whyRebuilt: [],
          };
        },
        async dispose() {},
      },
      committer: {
        async commit(request: CommitRequest) {
          commits.push(request.candidate.revision);
          return {
            status: 'committed',
            manifest: {
              schemaVersion: 1,
              projectId: request.candidate.projectId,
              generation: request.generation,
              revision: request.candidate.revision,
              files: [],
            },
            written: [],
            removed: [],
            diagnostics: [],
          };
        },
        async dispose() {},
      },
    };
    const h = context(root);
    h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
    h.targetOptions.set(
      targetKey(buildTarget),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    const deps = dependencyHarness(root);
    deps.dependencies.createSession = () => createBuildSession(services, { batchDelayMs: 0 });
    let emit!: (events: Array<{ kind: 'create' | 'update' | 'delete'; path: string }>) => void;
    deps.dependencies.createEventSource = () => ({
      async subscribe(listener: (events: FileChange[]) => unknown) {
        emit = listener;
        return { dispose: async () => {} };
      },
    });
    let release!: () => void;
    deps.dependencies.executeDevServer = servingUntil(
      new Promise((resolve) => (release = resolve)),
    );
    const iterator = runModernDevServer(
      { buildTarget: 'docs:build:development' },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    await iterator.next();
    expect(commits).toEqual(['1:v1|']);

    // The page starts including the snippet; the generation reads snippet v1 and keeps running.
    gate = new Promise<void>((resolve) => (open = resolve));
    fs.writeFileSync(page, 'v2 include');
    emit([{ kind: 'update', path: page }]);
    await vi.waitFor(() => expect(readSnippet).toBe(true));
    // The snippet is edited before that generation's result: it is not a recorded input yet.
    fs.writeFileSync(snippet, 'snippet v2');
    emit([{ kind: 'update', path: snippet }]);
    open();
    await vi.waitFor(() => expect(commits.at(-1)).toBe('3:v2 include|snippet v2'), {
      timeout: 3000,
    });
    // The snippet was not a recorded input when it changed: the watch-input filter retains the
    // change while the generation runs and replays it once the result records the snippet.
    expect(commits).toEqual(['1:v1|', '2:v2 include|snippet v1', '3:v2 include|snippet v2']);
    release();
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  it('watches the workspace without its caches and outputs and survives a lossy-watcher signal', async () => {
    // An FSEvents "Events were dropped" error is a warning, and writes to caches and outputs
    // (which would supersede every generation) are ignored by the watcher itself.
    const root = fs.realpathSync(temporary());
    const page = path.join(root, 'docs', 'page.md');
    fs.mkdirSync(path.dirname(page), { recursive: true });
    fs.writeFileSync(page, 'initial');
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    const requests: CompilationRequest[] = [];
    const commits: string[] = [];
    const services: BuildSessionServices = {
      compiler: {
        async compile(request: CompilationRequest) {
          requests.push(request);
          const body = fs.readFileSync(page, 'utf8');
          return {
            candidate: snapshot(root, { revision: `${request.generation}:${body}` }),
            dependencies: [
              {
                kind: 'content',
                path: page,
                digest: createHash('sha256').update(body).digest('hex'),
              },
            ],
            diagnostics: [],
            whyRebuilt: [],
          };
        },
        async dispose() {},
      },
      committer: {
        async commit(request: CommitRequest) {
          commits.push(request.candidate.revision);
          return {
            status: 'committed',
            manifest: {
              schemaVersion: 1,
              projectId: request.candidate.projectId,
              generation: request.generation,
              revision: request.candidate.revision,
              files: [],
            },
            written: [],
            removed: [],
            diagnostics: [],
          };
        },
        async dispose() {},
      },
    };
    const h = context(root);
    h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
    h.targetOptions.set(
      targetKey(buildTarget),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    const deps = dependencyHarness(root);
    deps.dependencies.createSession = () => createBuildSession(services, { batchDelayMs: 0 });
    let emit!: (events: Array<{ kind: 'create' | 'update' | 'delete'; path: string }>) => void;
    let report!: (diagnostic: Diagnostic) => void;
    deps.dependencies.createEventSource = (_root, options) => {
      deps.ignores.push(options.ignore);
      return {
        async subscribe(
          listener: (events: FileChange[]) => unknown,
          onError: (diagnostic: Diagnostic) => void,
        ) {
          emit = listener;
          report = onError;
          return { dispose: async () => {} };
        },
      };
    };
    let release!: () => void;
    deps.dependencies.executeDevServer = servingUntil(
      new Promise((resolve) => (release = resolve)),
    );
    const iterator = runModernDevServer(
      { buildTarget: 'docs:build:development' },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { success: true, baseUrl: 'http://localhost:4200/' },
    });
    expect(requests).toHaveLength(1);
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
    // Writes to paths the build never read start no generation.
    emit([
      { kind: 'update', path: path.join(root, '.idea/workspace.xml') },
      { kind: 'create', path: path.join(root, 'coverage/lcov.info') },
      { kind: 'update', path: path.join(root, 'dist/other/main.js') },
    ]);
    await settle();
    expect(requests).toHaveLength(1);
    expect(deps.ignores).toEqual([
      [
        '**/node_modules/**',
        '**/.git/**',
        '**/.angular/**',
        '**/.nx/**',
        configuration(root).outputRoot,
        configuration(root).cacheRoot,
        path.join(root, 'dist', 'docs'),
      ],
    ]);

    // A recorded input still regenerates.
    fs.writeFileSync(page, 'edited');
    emit([{ kind: 'update', path: page }]);
    await vi.waitFor(() => expect(commits.at(-1)).toBe('2:edited'));
    expect(requests[1].changes).toEqual([{ kind: 'update', path: page }]);

    // A lossy-watcher signal is a warning: the dev server keeps running and an edit whose event
    // was lost is reconciled from the recorded inputs.
    fs.writeFileSync(page, 'lost event');
    report({
      code: 'WATCHER_RESCAN',
      severity: 'warning',
      stage: 'host',
      message: 'Events were dropped by the FSEvents client. File system must be re-scanned.',
    });
    await vi.waitFor(() => expect(commits.at(-1)).toBe('3:lost event'));
    expect(requests[2].changes).toEqual([{ kind: 'update', path: page }]);
    expect(h.logs).toContain(
      'warn:[WATCHER_RESCAN] Events were dropped by the FSEvents client. File system must be re-scanned.',
    );
    release();
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    expect(h.logs.filter((line) => line.startsWith('error:'))).toEqual([]);
  });

  it('discards an unchanged save of a recorded input without a generation', async () => {
    const root = fs.realpathSync(temporary());
    const page = path.join(root, 'docs', 'page.md');
    fs.mkdirSync(path.dirname(page), { recursive: true });
    fs.writeFileSync(page, 'initial');
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    const requests: CompilationRequest[] = [];
    const commits: string[] = [];
    const services: BuildSessionServices = {
      compiler: {
        async compile(request: CompilationRequest) {
          requests.push(request);
          const body = fs.readFileSync(page, 'utf8');
          return {
            candidate: snapshot(root, { revision: `${request.generation}:${body}` }),
            dependencies: [
              {
                kind: 'content',
                path: page,
                digest: createHash('sha256').update(body).digest('hex'),
              },
            ],
            diagnostics: [],
            whyRebuilt: [],
          };
        },
        async dispose() {},
      },
      committer: {
        async commit(request: CommitRequest) {
          commits.push(request.candidate.revision);
          return {
            status: 'committed',
            manifest: {
              schemaVersion: 1,
              projectId: request.candidate.projectId,
              generation: request.generation,
              revision: request.candidate.revision,
              files: [],
            },
            written: [],
            removed: [],
            diagnostics: [],
          };
        },
        async dispose() {},
      },
    };
    const h = context(root);
    h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
    h.targetOptions.set(
      targetKey(buildTarget),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    const deps = dependencyHarness(root);
    deps.dependencies.createSession = () => createBuildSession(services, { batchDelayMs: 0 });
    let emit!: (events: Array<{ kind: 'create' | 'update' | 'delete'; path: string }>) => unknown;
    deps.dependencies.createEventSource = () => ({
      async subscribe(listener: (events: FileChange[]) => unknown) {
        emit = listener;
        return { dispose: async () => {} };
      },
    });
    let release!: () => void;
    deps.dependencies.executeDevServer = servingUntil(
      new Promise((resolve) => (release = resolve)),
    );
    const iterator = runModernDevServer(
      { buildTarget: 'docs:build:development' },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    expect(requests).toHaveLength(1);
    // The watch-input filter admits the recorded page; the session discards the identical save
    // and reports that to the filter, so no generation starts.
    fs.writeFileSync(page, 'initial');
    expect(emit([{ kind: 'update', path: page }])).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requests).toHaveLength(1);
    fs.writeFileSync(page, 'edited');
    emit([{ kind: 'update', path: page }]);
    await vi.waitFor(() => expect(commits.at(-1)).toBe('2:edited'));
    emit([{ kind: 'update', path: page }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requests).toHaveLength(2);
    release();
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    expect(h.logs.filter((line) => line.startsWith('error:'))).toEqual([]);
  });

  it('starts a verified dev-server watch with one generation and regenerates a raced input', async () => {
    const root = temporary();
    const page = path.join(root, 'docs', 'page.md');
    fs.mkdirSync(path.dirname(page), { recursive: true });
    fs.writeFileSync(page, 'initial');
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    const requests: CompilationRequest[] = [];
    const services: BuildSessionServices = {
      compiler: {
        async compile(request: CompilationRequest) {
          requests.push(request);
          const body = fs.readFileSync(page, 'utf8');
          return {
            candidate: snapshot(root, { revision: `${request.generation}:${body}` }),
            dependencies: [
              {
                kind: 'content',
                path: page,
                digest: createHash('sha256').update(body).digest('hex'),
              },
            ],
            diagnostics: [],
            whyRebuilt: [],
          };
        },
        async dispose() {},
      },
      committer: {
        async commit(request: CommitRequest) {
          return {
            status: 'committed',
            manifest: {
              schemaVersion: 1,
              projectId: request.candidate.projectId,
              generation: request.generation,
              revision: request.candidate.revision,
              files: [],
            },
            written: [],
            removed: [],
            diagnostics: [],
          };
        },
        async dispose() {},
      },
    };
    const serve = async (beforeReady: () => void) => {
      requests.splice(0);
      const h = context(root);
      h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
      h.targetOptions.set(
        targetKey(buildTarget),
        applicationOptions(root) as unknown as json.JsonObject,
      );
      const deps = dependencyHarness(root);
      deps.dependencies.createSession = () => createBuildSession(services, { batchDelayMs: 0 });
      deps.dependencies.createEventSource = () => ({
        async subscribe() {
          // Runs after the development buildOnce, before the native watcher reports readiness.
          beforeReady();
          return { dispose: async () => {} };
        },
      });
      const outputs = await collect(
        runModernDevServer({ buildTarget: 'docs:build:development' }, h.context, deps.dependencies),
      );
      expect(outputs).toEqual([{ success: true, baseUrl: 'http://localhost:4200/' }]);
      expect(deps.devServerCalls).toHaveLength(1);
      return requests.map(({ generation, mode, changes }) => ({ generation, mode, changes }));
    };

    expect(await serve(() => {})).toEqual([{ generation: 1, mode: 'development', changes: [] }]);
    expect(await serve(() => fs.writeFileSync(page, 'raced'))).toEqual([
      { generation: 1, mode: 'development', changes: [] },
      { generation: 2, mode: 'development', changes: [] },
    ]);
  });

  it.each(['include', 'files'] as const)(
    'starts a cold %s-style dev-server workspace that imports @ng-doc/generated with one generation',
    async (style) => {
      const root = temporary();
      const write = (file: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
      };
      write('ng-doc.config.ts', "export default { docsPath: 'src/docs' };\n");
      const compilerOptions = {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        types: [],
        baseUrl: '.',
        paths: { '@ng-doc/generated': ['ng-doc/docs/index.ts'] },
      };
      if (style === 'include') {
        write(
          'tsconfig.app.json',
          JSON.stringify({ compilerOptions, include: ['src/**/*.ts', 'ng-doc/docs/**/*.ts'] }),
        );
      } else {
        // Angular CLI default: a base tsconfig plus an application tsconfig with `files`.
        write('tsconfig.json', JSON.stringify({ compilerOptions }));
        write(
          'tsconfig.app.json',
          JSON.stringify({
            extends: './tsconfig.json',
            files: ['src/main.ts'],
            include: ['src/**/*.d.ts'],
          }),
        );
      }
      write(
        'src/main.ts',
        "import { NG_DOC_ROUTING } from '@ng-doc/generated';\nexport const routes = NG_DOC_ROUTING;\n",
      );
      const markdown = path.join(root, 'src/docs/guide/index.md');
      write(
        'src/docs/guide/ng-doc.page.ts',
        "const page = { title: 'Guide', route: 'guide', mdFile: './index.md' };\nexport default page;\n",
      );
      write('src/docs/guide/index.md', '# Guide\n\nCold Angular body.\n');
      const manifest = path.join(root, 'ng-doc/docs/.ng-doc-output-manifest.json');
      const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
      const compiler = await (sourceBundle ??= bundleSourceCompiler());
      const serve = async (beforeReady: () => void) => {
        const h = context(root);
        h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
        h.targetOptions.set(
          targetKey(buildTarget),
          applicationOptions(root) as unknown as json.JsonObject,
        );
        const deps = dependencyHarness(root);
        deps.dependencies.createSession = (options) =>
          createGeneratorBuildSession({
            ...options,
            templateRoot: compiler.templateRoot,
            worker: { moduleUrl: compiler.moduleUrl, workerEntryUrl: compiler.workerEntryUrl },
          });
        deps.dependencies.createEventSource = () => ({
          async subscribe() {
            beforeReady();
            return { dispose: async () => {} };
          },
        });
        const outputs = await collect(
          runModernDevServer(
            { buildTarget: 'docs:build:development' },
            h.context,
            deps.dependencies,
          ),
        );
        expect(outputs).toEqual([{ success: true, baseUrl: 'http://localhost:4200/' }]);
        return JSON.parse(fs.readFileSync(manifest, 'utf8')) as { generation: number };
      };

      // Cold: the initial commit creates the imported generated module, which is not a semantic
      // input, so readiness reuses the verified buildOnce.
      expect(fs.existsSync(path.join(root, 'ng-doc/docs/index.ts'))).toBe(false);
      expect((await serve(() => {})).generation).toBe(1);
      expect(fs.existsSync(path.join(root, 'ng-doc/docs/index.ts'))).toBe(true);
      // Warm: still one generation.
      expect((await serve(() => {})).generation).toBe(1);
      // A docs edit before watcher readiness still regenerates.
      expect(
        (await serve(() => fs.writeFileSync(markdown, '# Guide\n\nRaced Angular body.\n')))
          .generation,
      ).toBe(2);
    },
    120_000,
  );

  it('surfaces an initial generator failure before dev-server host admission', async () => {
    const root = temporary();
    const h = context(root);
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
    h.targetOptions.set(
      targetKey(buildTarget),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    const deps = dependencyHarness(root, failure('DEV_INITIAL_FAILED'));
    expect(
      await collect(
        runModernDevServer({ buildTarget: 'docs:build:development' }, h.context, deps.dependencies),
      ),
    ).toEqual([{ success: false, error: '[DEV_INITIAL_FAILED] failed' }]);
    expect(deps.devServerCalls).toEqual([]);
    expect(deps.sessions[0]?.disposals).toBe(1);
  });

  it('bars dev-server admission on a fatal watcher diagnostic while its transformer loads', async () => {
    const root = temporary();
    const h = context(root);
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
    h.targetOptions.set(
      targetKey(buildTarget),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    const deps = dependencyHarness(root, success(root), success(root, 2));
    let releaseTransformer!: () => void;
    deps.dependencies.createIndexHtmlTransformer = () =>
      new Promise((resolve) => {
        releaseTransformer = () => resolve(async (html) => html);
      });
    const iterator = runModernDevServer(
      { buildTarget: 'docs:build:development' },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    const pending = iterator.next();
    await vi.waitFor(() => expect(deps.sessions[0]?.observer).toBeTypeOf('function'));
    deps.sessions[0]?.observer?.({
      kind: 'diagnostic',
      diagnostic: {
        code: 'WATCHER_ERROR',
        severity: 'error',
        stage: 'host',
        message: 'dev transformer admission',
      },
    });
    releaseTransformer();
    expect(await pending).toEqual({
      done: false,
      value: { success: false, error: '[WATCHER_ERROR] dev transformer admission' },
    });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    expect(deps.devServerCalls).toEqual([]);
  });

  it('uses a narrow target facade for the public dev server and forwards readiness', async () => {
    const root = temporary();
    const h = context(root);
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
    h.targetOptions.set(
      targetKey(buildTarget),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    const deps = dependencyHarness(root, success(root), success(root, 2));
    deps.dependencies.executeDevServer = (options, adapterContext, extensions) => {
      deps.devServerCalls.push({ options, context: adapterContext, extensions });
      return (async function* () {
        expect(await adapterContext.getBuilderNameForTarget(buildTarget)).toBe(
          '@angular/build:application',
        );
        expect(await adapterContext.getTargetOptions(buildTarget)).not.toHaveProperty('ngDoc');
        yield { success: true, baseUrl: 'http://localhost:4311/' };
      })();
    };
    const outputs = await collect(
      runModernDevServer(
        { buildTarget: 'docs:build:development', port: 4311, ngDoc: { config: 'serve.ts' } },
        h.context,
        deps.dependencies,
      ),
    );
    expect(outputs).toEqual([{ success: true, baseUrl: 'http://localhost:4311/' }]);
    expect(deps.devServerCalls[0]?.options).toEqual({
      buildTarget: 'docs:build:development',
      port: 4311,
    });
    expect(deps.devServerCalls[0]?.extensions).toHaveProperty('indexHtmlTransformer');
    expect(deps.sessionOptions[0]).toHaveProperty('configFile', path.join(root, 'serve.ts'));
    expect(deps.sessions[0]?.modes).toEqual(['development']);
  });

  it('turns thrown setup and host errors into failed builder outputs and still tears down', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root);
    deps.dependencies.buildApplication = () => {
      throw new Error('host exploded');
    };
    expect(
      await collect(runModernApplication(applicationOptions(root), h.context, deps.dependencies)),
    ).toEqual([{ success: false, error: '[NGDOC_APPLICATION] host exploded' }]);
    expect(deps.sessions[0]?.disposals).toBe(1);

    const bad = dependencyHarness(root);
    bad.dependencies.createSession = () => {
      throw new Error('bootstrap exploded');
    };
    expect(
      await collect(runModernApplication(applicationOptions(root), h.context, bad.dependencies)),
    ).toEqual([{ success: false, error: '[NGDOC_APPLICATION] bootstrap exploded' }]);
    expect(
      await collect(
        runModernDevServer({ buildTarget: 'docs:missing' }, h.context, bad.dependencies),
      ),
    ).toEqual([
      expect.objectContaining({ success: false, error: expect.stringContaining('browser') }),
    ]);
    expect(
      await collect(runModernApplication({ ngDoc: {} } as never, h.context, bad.dependencies)),
    ).toEqual([
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('[NGDOC_APPLICATION] browser'),
      }),
    ]);
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    h.targetOptions.set(
      targetKey(buildTarget),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    const hostFailure = dependencyHarness(root);
    hostFailure.dependencies.executeDevServer = () => ({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error('serve exploded')) }),
    });
    expect(
      await collect(
        runModernDevServer(
          { buildTarget: 'docs:build:development' },
          h.context,
          hostFailure.dependencies,
        ),
      ),
    ).toEqual([{ success: false, error: '[NGDOC_DEV_SERVER] serve exploded' }]);
    expect(hostFailure.sessions[0]?.watchDisposals).toBe(1);
  });

  it('does not swallow teardown failure after forwarding a host result', async () => {
    const root = temporary();
    const h = context(root);
    const deps = dependencyHarness(root);
    const session = new FakeSession(success(root));
    session.dispose = async () => {
      throw new Error('dispose exploded');
    };
    deps.dependencies.createSession = () => session;
    await expect(
      collect(runModernApplication(applicationOptions(root), h.context, deps.dependencies)),
    ).rejects.toThrow('dispose exploded');
    expect(h.logs).toContain('error:[NGDOC_ADAPTER_DISPOSE] dispose exploded');
    // Architect's teardown reuses the same settled disposal.
    await expect(h.teardowns[0]?.()).rejects.toThrow('dispose exploded');
  });
});

describe('public builder entries and schema merge', () => {
  it('exports Architect builders backed by the public API adapters', () => {
    const builderSymbol = Symbol.for('@angular-devkit/architect:builder');
    expect((applicationBuilder as unknown as Record<symbol, unknown>)[builderSymbol]).toBe(true);
    expect((devServerBuilder as unknown as Record<symbol, unknown>)[builderSymbol]).toBe(true);
  });

  it('merges with installed Angular schemas and retains unknown-option rejection', async () => {
    const merge = createRequire(import.meta.url)('lodash/merge') as (
      object: Record<string, unknown>,
      ...sources: Array<Record<string, unknown>>
    ) => Record<string, unknown>;
    const registry = new json.schema.CoreSchemaRegistry();
    for (const builder of ['application', 'dev-server'] as const) {
      const native = JSON.parse(
        fs.readFileSync(
          path.join(
            process.cwd(),
            'node_modules/@angular/build/src/builders',
            builder,
            'schema.json',
          ),
          'utf8',
        ),
      );
      const extension = JSON.parse(
        fs.readFileSync(path.join(import.meta.dirname, '..', builder, 'schema.json'), 'utf8'),
      );
      const validate = await registry.compile(
        merge({}, native, extension) as unknown as json.schema.JsonSchema,
      );
      const valid =
        builder === 'application'
          ? {
              tsConfig: 'tsconfig.json',
              browser: 'src/main.ts',
              baseHref: '/docs/',
              ngDoc: { config: 'ng-doc.ts' },
            }
          : { buildTarget: 'docs:build', port: 4311, ngDoc: { config: 'ng-doc.ts' } };
      expect((await validate(valid as unknown as json.JsonValue)).success).toBe(true);
      expect(
        (await validate({ ...valid, arbitraryTypo: true } as unknown as json.JsonValue)).success,
      ).toBe(false);
      expect(
        (await validate({ ...valid, ngDoc: { typo: true } } as unknown as json.JsonValue)).success,
      ).toBe(false);
      expect(
        (
          await validate({
            ...valid,
            ngDoc: { config: 'ng-doc.ts', progress: 'plain' },
          } as unknown as json.JsonValue)
        ).success,
      ).toBe(true);
      expect(
        (await validate({ ...valid, ngDoc: { progress: 'json' } } as unknown as json.JsonValue))
          .success,
      ).toBe(false);
    }
  });
});

describe('NgDoc progress in the Angular builders', () => {
  const env = process.env['NGDOC_PROGRESS'];
  afterEach(() => {
    if (env === undefined) delete process.env['NGDOC_PROGRESS'];
    else process.env['NGDOC_PROGRESS'] = env;
  });

  /** A real session over a stub compiler, so progress events flow as in a real build. */
  function progressServices(root: string, page: string, commits: string[] = []) {
    const services: BuildSessionServices = {
      compiler: {
        async compile(request: CompilationRequest) {
          const body = fs.readFileSync(page, 'utf8');
          return {
            candidate: snapshot(root, { revision: `${request.generation}:${body}` }),
            dependencies: [
              {
                kind: 'content',
                path: page,
                digest: createHash('sha256').update(body).digest('hex'),
              },
            ],
            diagnostics: body.includes('warn')
              ? [{ code: 'PAGE_WARNING', severity: 'warning', stage: 'content', message: 'w' }]
              : [],
            whyRebuilt: [],
          };
        },
        async dispose() {},
      },
      committer: {
        async commit(request: Parameters<BuildSessionServices['committer']['commit']>[0]) {
          commits.push(request.candidate.revision);
          return {
            status: 'committed',
            manifest: {
              schemaVersion: 1,
              projectId: request.candidate.projectId,
              generation: request.generation,
              revision: request.candidate.revision,
              files: [{ path: 'page.ts', ownerId: 'page', digest: '', role: 'content' }],
            },
            written: ['page.ts'],
            removed: [],
            diagnostics: [],
          };
        },
        async dispose() {},
      },
    };
    return services;
  }

  it('prints the build summary after its diagnostics, before the Angular build runs', async () => {
    process.env['NGDOC_PROGRESS'] = 'plain';
    const root = fs.realpathSync(temporary());
    const page = path.join(root, 'docs', 'page.md');
    fs.mkdirSync(path.dirname(page), { recursive: true });
    fs.writeFileSync(page, 'warn');
    const h = context(root);
    const deps = dependencyHarness(root);
    deps.dependencies.createSession = (options) =>
      createBuildSession(progressServices(root, page), { batchDelayMs: 0, ...options.session });
    const buildApplication = deps.dependencies.buildApplication;
    deps.dependencies.buildApplication = (...args) => {
      h.logs.push('info:<angular build>');
      return buildApplication(...args);
    };
    await collect(runModernApplication(applicationOptions(root), h.context, deps.dependencies));
    const ngDoc = h.logs.filter((line) => /NgDoc|PAGE_WARNING|angular build/.test(line));
    expect(ngDoc).toEqual([
      'info:NgDoc: generating documentation for docs (production)',
      // The candidate has no artifacts, so the full commit compares no outputs.
      'info:NgDoc: writing 0 files',
      'warn:[PAGE_WARNING] w',
      expect.stringMatching(
        /^info:NgDoc: OK generated 0 pages in \d+\.\ds; 1 file written; 1 warning$/,
      ),
      'info:<angular build>',
    ]);
  });

  it('keeps only result lines once the host runs, and honours progress: false and ngDoc.progress', async () => {
    delete process.env['NGDOC_PROGRESS'];
    const root = fs.realpathSync(temporary());
    const page = path.join(root, 'docs', 'page.md');
    fs.mkdirSync(path.dirname(page), { recursive: true });
    fs.writeFileSync(page, 'initial');
    const buildTarget = { project: 'docs', target: 'build', configuration: 'development' };
    const h = context(root);
    h.builders.set(targetKey(buildTarget), '@ng-doc/builder:modern-application');
    h.targetOptions.set(targetKey(buildTarget), {
      ...(applicationOptions(root) as unknown as json.JsonObject),
      progress: false,
    });
    const deps = dependencyHarness(root);
    deps.dependencies.createSession = (options) =>
      createBuildSession(progressServices(root, page), { batchDelayMs: 0, ...options.session });
    let emit!: (events: Array<{ kind: 'update'; path: string }>) => void;
    deps.dependencies.createEventSource = () => ({
      async subscribe(listener: (events: Array<{ kind: 'update'; path: string }>) => void) {
        emit = listener;
        return { dispose: async () => {} };
      },
    });
    let release!: () => void;
    deps.dependencies.executeDevServer = servingUntil(
      new Promise((resolve) => (release = resolve)),
    );
    const iterator = runModernDevServer(
      { buildTarget: 'docs:build:development' },
      h.context,
      deps.dependencies,
    )[Symbol.asyncIterator]();
    await iterator.next();
    // `progress: false`: the summary only, no progress lines.
    expect(h.logs.filter((line) => line.includes('NgDoc'))).toEqual([
      expect.stringMatching(/^info:NgDoc: OK generated 0 pages in /),
    ]);
    fs.writeFileSync(page, 'edited');
    emit([{ kind: 'update', path: page }]);
    await vi.waitFor(() => expect(h.logs.filter((line) => line.includes('NgDoc'))).toHaveLength(2));
    expect(h.logs.filter((line) => line.includes('NgDoc')).at(-1)).toMatch(
      /^info:NgDoc: updated 1 file in \d+\.\ds$/,
    );
    release();
    expect(await iterator.next()).toEqual({ done: true, value: undefined });

    // An explicit ngDoc.progress wins over the application's `progress: false`; `off` is silent.
    h.logs.length = 0;
    const quiet = dependencyHarness(root);
    quiet.dependencies.createSession = (options) =>
      createBuildSession(progressServices(root, page), { batchDelayMs: 0, ...options.session });
    await collect(
      runModernApplication(
        { ...applicationOptions(root), ngDoc: { progress: 'off' } },
        h.context,
        quiet.dependencies,
      ),
    );
    expect(h.logs.filter((line) => line.includes('NgDoc'))).toEqual([]);
  });

  it('reports the first build to Architect: status per step and progress at most once a second', () => {
    process.env['NGDOC_PROGRESS'] = 'summary';
    const root = temporary();
    const h = context(root);
    const progress = createAngularProgress(h.context, { project: 'docs' })!;
    const start = (generation: number, trigger: 'build' | 'watch'): ProgressEvent => ({
      kind: 'progress-started',
      generation,
      seq: 0,
      trigger,
      mode: 'development',
      changes: 0,
      elapsedMs: 0,
    });
    const settle = (generation: number): ProgressEvent => ({
      kind: 'progress-settled',
      generation,
      seq: 4,
      status: 'success',
      elapsedMs: 100,
      phases: {},
      counts: { pages: 1, rebuilt: 1, errors: 0, warnings: 0 },
    });
    progress.sink(start(1, 'build'));
    progress.sink({
      kind: 'progress',
      generation: 1,
      seq: 1,
      phase: 'commit',
      state: 'start',
      completed: 0,
      total: 4,
      elapsedMs: 10,
    });
    // A count within the same step does not report a new status.
    progress.sink({
      kind: 'progress',
      generation: 1,
      seq: 2,
      phase: 'commit',
      state: 'advance',
      completed: 2,
      elapsedMs: 20,
    });
    progress.sink({
      kind: 'progress-activity',
      activity: 'warming-up',
      state: 'start',
      elapsedMs: 0,
    });
    progress.sink(settle(1));
    progress.release(1);
    progress.sink(start(2, 'watch'));
    progress.sink(settle(2));
    progress.dispose();
    const reportStatus = h.context.reportStatus as unknown as ReturnType<typeof vi.fn>;
    const reportProgress = h.context.reportProgress as unknown as ReturnType<typeof vi.fn>;
    expect(reportStatus.mock.calls).toEqual([
      ['NgDoc: generating documentation'],
      ['NgDoc: writing 4 files'],
    ]);
    // The first call, then none within the second, then the settle.
    expect(reportProgress.mock.calls).toEqual([
      [0, 1000],
      [1, 1],
    ]);
    process.env['NGDOC_PROGRESS'] = 'off';
    expect(createAngularProgress(h.context, { project: 'docs' })).toBeUndefined();
    // A logger that throws for progress lines stops progress with one warning.
    process.env['NGDOC_PROGRESS'] = 'plain';
    const broken = context(root);
    broken.context.logger.info = () => {
      throw new Error('logger closed');
    };
    const failing = createAngularProgress(broken.context, { project: 'docs' })!;
    failing.sink(start(3, 'build'));
    failing.sink(start(4, 'build'));
    failing.dispose();
    expect(broken.logs).toEqual([
      'warn:[SESSION_PROGRESS_FAILED] Progress reporting failed and was skipped: logger closed',
    ]);
  });

  it('reports a compiler step to Architect with its total, not the count at its start', () => {
    process.env['NGDOC_PROGRESS'] = 'summary';
    const h = context(temporary());
    const progress = createAngularProgress(h.context, { project: 'docs' })!;
    progress.sink({
      kind: 'progress-started',
      generation: 1,
      seq: 0,
      trigger: 'build',
      mode: 'production',
      changes: 0,
      elapsedMs: 0,
    });
    progress.sink({
      kind: 'progress',
      generation: 1,
      seq: 1,
      phase: 'render',
      state: 'start',
      completed: 0,
      total: 445,
      elapsedMs: 10,
    });
    progress.dispose();
    const reportStatus = h.context.reportStatus as unknown as ReturnType<typeof vi.fn>;
    expect(reportStatus.mock.calls.at(-1)).toEqual(['NgDoc: [2/4] rendering 445 pages']);
  });

  it('validates ngDoc.progress and lets the dev server override its build target', async () => {
    const root = temporary();
    const h = context(root);
    await expect(
      resolveApplication(
        { ...applicationOptions(root), ngDoc: { progress: 'json' as never } },
        h.context,
      ),
    ).rejects.toThrow('ngDoc.progress must be auto, live, plain, verbose, summary or off.');
    expect(
      (
        await resolveApplication(
          { ...applicationOptions(root), ngDoc: { progress: 'plain' } },
          h.context,
        )
      ).progress,
    ).toBe('plain');
    const buildTarget = { project: 'docs', target: 'build' };
    h.targetOptions.set(targetKey(buildTarget), {
      ...(applicationOptions(root) as unknown as json.JsonObject),
      ngDoc: { progress: 'plain' },
    });
    expect(
      (await resolveDevServerApplication({ buildTarget: 'docs:build' }, h.context)).progress,
    ).toBe('plain');
    expect(
      (
        await resolveDevServerApplication(
          { buildTarget: 'docs:build', ngDoc: { progress: 'summary' } },
          h.context,
        )
      ).progress,
    ).toBe('summary');
    h.targetOptions.set(
      targetKey(buildTarget),
      applicationOptions(root) as unknown as json.JsonObject,
    );
    expect(
      (await resolveDevServerApplication({ buildTarget: 'docs:build' }, h.context)).progress,
    ).toBeUndefined();
  });
});
