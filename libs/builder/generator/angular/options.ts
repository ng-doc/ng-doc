import type { ApplicationBuilderOptions } from '@angular/build';
import type { BuilderContext, Target } from '@angular-devkit/architect';
import { targetFromTargetString } from '@angular-devkit/architect';
import type { json } from '@angular-devkit/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { GeneratorBootstrapOptions } from '../bootstrap';
import type { ArtifactSnapshot, PublishedGeneratorConfiguration } from '../contracts';
import { type ProgressOptionSetting, isProgressSetting } from '../progress/settings';
import type {
  ModernApplicationBuilderOptions,
  ModernDevServerBuilderOptions,
  NgDocAngularOptions,
  ResolvedAngularApplication,
} from './types';

const MODERN_APPLICATION_BUILDERS = new Set([
  '@ng-doc/builder:modern-application',
  './dist/libs/builder:modern-application',
]);
const ANGULAR_APPLICATION_BUILDER = '@angular/build:application';
const GENERATED_ASSET_OUTPUT = 'assets/ng-doc';

function absolute(workspaceRoot: string, value: string): string {
  return path.resolve(workspaceRoot, value).replace(/\\/g, '/');
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function projectId(context: BuilderContext): string {
  return requiredString(context.target?.project, 'Architect target project');
}

function ngDocOptions(value: unknown): NgDocAngularOptions {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ngDoc must be an object.');
  }
  const { config, tags, progress } = value as {
    config?: unknown;
    tags?: unknown;
    progress?: unknown;
  };
  if (progress !== undefined && (!isProgressSetting(progress) || progress === 'json')) {
    throw new TypeError('ngDoc.progress must be auto, live, plain, verbose, summary or off.');
  }
  if (
    tags !== undefined &&
    (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string' || !tag.trim()))
  ) {
    throw new TypeError('ngDoc.tags must be an array of non-empty strings.');
  }
  return {
    ...(config === undefined ? {} : { config: requiredString(config, 'ngDoc.config') }),
    ...(tags === undefined ? {} : { tags: [...(tags as string[])] }),
    ...(progress === undefined ? {} : { progress: progress as ProgressOptionSetting }),
  };
}

/**
 * The build tags (`onlyForTags`): explicit `ngDoc.tags`, else the configuration name(s) of the
 * target, e.g. `production` or `development`. `a,b` gives both.
 *
 * The Angular CLI runs a target without `-c` with an empty `context.target.configuration`: the
 * `defaultConfiguration` it applies to the options never reaches the builder. So an empty name is
 * resolved from the workspace here; without one there are no tags.
 * @param context
 * @param ngDoc
 * @param target
 */
async function buildTags(
  context: BuilderContext,
  ngDoc: NgDocAngularOptions,
  target: Target | undefined,
): Promise<string[]> {
  if (ngDoc.tags) return ngDoc.tags;
  const name =
    target?.configuration || (target && (await defaultConfiguration(context, target))) || '';
  return name
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * The `defaultConfiguration` of a target, read from the workspace the way the CLIs declare it:
 * `angular.json` (`architect` or `targets`), or the project's Nx `project.json`. Undefined when
 * neither declares it or cannot be read.
 * @param context
 * @param target
 */
async function defaultConfiguration(
  context: BuilderContext,
  target: Target,
): Promise<string | undefined> {
  const readJson = async (file: string): Promise<Record<string, unknown> | undefined> => {
    try {
      const value: unknown = JSON.parse(await readFile(file, 'utf8'));
      return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  };
  const named = (targets: unknown): string | undefined => {
    const definition = (
      targets as Record<string, { defaultConfiguration?: unknown }> | undefined
    )?.[target.target];
    return typeof definition?.defaultConfiguration === 'string'
      ? definition.defaultConfiguration
      : undefined;
  };
  const workspace = await readJson(path.join(context.workspaceRoot, 'angular.json'));
  const project = (workspace?.projects as Record<string, Record<string, unknown>> | undefined)?.[
    target.project
  ];
  const fromWorkspace = named(project?.architect) ?? named(project?.targets);
  if (fromWorkspace !== undefined) return fromWorkspace;
  let root: unknown;
  try {
    root = (await context.getProjectMetadata(target.project))?.root;
  } catch {
    return undefined;
  }
  if (typeof root !== 'string') return undefined;
  const nx = await readJson(path.join(context.workspaceRoot, root, 'project.json'));
  return named(nx?.targets);
}

function inlineStyleLanguage(
  value: ApplicationBuilderOptions['inlineStyleLanguage'],
): 'CSS' | 'SCSS' | 'SASS' | 'LESS' {
  const normalized = String(value ?? 'css').toUpperCase();
  if (!['CSS', 'SCSS', 'SASS', 'LESS'].includes(normalized)) {
    throw new TypeError(`Unsupported inlineStyleLanguage: ${String(value)}`);
  }
  return normalized as 'CSS' | 'SCSS' | 'SASS' | 'LESS';
}

function bootstrapOptions(
  context: BuilderContext,
  project: string,
  options: ApplicationBuilderOptions,
  ngDoc: NgDocAngularOptions,
  tags: string[],
): GeneratorBootstrapOptions {
  const workspaceRoot = absolute(context.workspaceRoot, '.');
  const browser = requiredString(options.browser, 'browser');
  const tsConfig = requiredString(options.tsConfig, 'tsConfig');
  return {
    projectId: project,
    workspaceRoot,
    ...(ngDoc.config ? { configFile: absolute(workspaceRoot, ngDoc.config) } : {}),
    defaults: {
      docsRoot: path.dirname(absolute(workspaceRoot, browser)).replace(/\\/g, '/'),
      tsConfig: absolute(workspaceRoot, tsConfig),
      outputRoot: absolute(workspaceRoot, path.join('ng-doc', project)),
      cacheRoot: absolute(workspaceRoot, path.join('.cache', 'ng-doc', project)),
    },
    discovery: {
      inlineStyleLanguage: inlineStyleLanguage(options.inlineStyleLanguage),
      tags,
    },
  };
}

export function stripNgDocApplicationOptions(
  options: ModernApplicationBuilderOptions | json.JsonObject,
): ApplicationBuilderOptions {
  const { ngDoc: _ngDoc, ...angular } = options as ModernApplicationBuilderOptions;
  return structuredClone(angular);
}

export async function resolveApplication(
  options: ModernApplicationBuilderOptions,
  context: BuilderContext,
): Promise<ResolvedAngularApplication> {
  const project = projectId(context);
  const ngDoc = ngDocOptions(options.ngDoc);
  const angular = stripNgDocApplicationOptions(options);
  const tags = await buildTags(context, ngDoc, context.target);
  return {
    projectId: project,
    options: angular,
    bootstrap: bootstrapOptions(context, project, angular, ngDoc, tags),
    ...(ngDoc.progress ? { progress: ngDoc.progress } : {}),
  };
}

export async function resolveDevServerApplication(
  options: ModernDevServerBuilderOptions,
  context: BuilderContext,
): Promise<ResolvedAngularApplication> {
  const project = projectId(context);
  const target = targetFromTargetString(
    requiredString(options.buildTarget, 'buildTarget'),
    project,
    'build',
  );
  const targetOptions = await context.getTargetOptions(target);
  const targetNgDoc = ngDocOptions(targetOptions['ngDoc']);
  const overrideNgDoc = ngDocOptions(options.ngDoc);
  const angular = stripNgDocApplicationOptions(targetOptions);
  const selected = overrideNgDoc.config ? overrideNgDoc : targetNgDoc;
  const tags = overrideNgDoc.tags ?? targetNgDoc.tags;
  const progress = overrideNgDoc.progress ?? targetNgDoc.progress;
  const ngDoc = { ...selected, ...(tags ? { tags } : {}) };
  // The dev server builds its build target, so that target's configuration names the tags: the
  // one in `buildTarget`, else the build target's `defaultConfiguration`.
  return {
    projectId: project,
    options: angular,
    bootstrap: bootstrapOptions(
      context,
      project,
      angular,
      ngDoc,
      await buildTags(context, ngDoc, target),
    ),
    ...(progress ? { progress } : {}),
  };
}

function outputName(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
}

function isGeneratedAsset(
  value: unknown,
  workspaceRoot: string,
  project: string,
  generatedDirectory: string,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const asset = value as { glob?: unknown; input?: unknown; output?: unknown };
  if (asset.glob !== '**/*' || typeof asset.input !== 'string') return false;
  if (outputName(asset.output) !== GENERATED_ASSET_OUTPUT) return false;
  const input = absolute(workspaceRoot, asset.input);
  const legacySuffix = `/ng-doc/${project}/assets`;
  return input === generatedDirectory || input.endsWith(legacySuffix);
}

export function withGeneratedAssets(
  options: ApplicationBuilderOptions,
  configuration: PublishedGeneratorConfiguration,
  workspaceRoot: string,
  project: string,
): ApplicationBuilderOptions {
  const generatedDirectory = path
    .join(configuration.outputRoot, configuration.assetDirectory)
    .replace(/\\/g, '/');
  const assets = (options.assets ?? []).filter(
    (asset) => !isGeneratedAsset(asset, workspaceRoot, project, generatedDirectory),
  );
  return {
    ...structuredClone(options),
    assets: [
      ...assets,
      { glob: '**/*', input: generatedDirectory, output: GENERATED_ASSET_OUTPUT },
    ],
  };
}

export function requirePublishedConfiguration(
  snapshot: ArtifactSnapshot,
): PublishedGeneratorConfiguration {
  if (!snapshot.configuration) {
    throw new TypeError('Successful generator snapshot has no published configuration.');
  }
  return snapshot.configuration;
}

/** Angular's output folder: `outputPath`, or Angular's default `dist/<project>` without one. */
export function angularOutputRoots(
  options: ApplicationBuilderOptions,
  workspaceRoot: string,
  project: string,
): string[] {
  const outputPath = options.outputPath;
  if (typeof outputPath === 'string') return [absolute(workspaceRoot, outputPath)];
  if (outputPath && typeof outputPath === 'object' && 'base' in outputPath) {
    return [absolute(workspaceRoot, requiredString(outputPath.base, 'outputPath.base'))];
  }
  return [absolute(workspaceRoot, path.join('dist', project))];
}

export function createDevServerContext(
  context: BuilderContext,
  application: ResolvedAngularApplication,
  configuration: PublishedGeneratorConfiguration,
): BuilderContext {
  const getBuilderNameForTarget: BuilderContext['getBuilderNameForTarget'] = async (target) => {
    const name = await context.getBuilderNameForTarget(target);
    return MODERN_APPLICATION_BUILDERS.has(name) ? ANGULAR_APPLICATION_BUILDER : name;
  };
  const getTargetOptions: BuilderContext['getTargetOptions'] = async (target) => {
    const name = await context.getBuilderNameForTarget(target);
    if (!MODERN_APPLICATION_BUILDERS.has(name)) return context.getTargetOptions(target);
    const raw = await context.getTargetOptions(target);
    const angular = stripNgDocApplicationOptions(raw);
    return withGeneratedAssets(
      angular,
      configuration,
      application.bootstrap.workspaceRoot,
      application.projectId,
    ) as unknown as json.JsonObject;
  };
  return new Proxy(context, {
    get(target: BuilderContext, property: string | symbol) {
      if (property === 'getBuilderNameForTarget') return getBuilderNameForTarget;
      if (property === 'getTargetOptions') return getTargetOptions;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
