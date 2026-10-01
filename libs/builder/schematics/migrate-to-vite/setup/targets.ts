import { JsonRecord, WorkspaceTarget } from './workspace';

/** The builder that runs the production build (browser, server bundle, prerender). */
export const VITE_APPLICATION_BUILDER = '@ng-doc/builder:vite-application';
/** The builder that runs the Vite development server. */
export const VITE_DEV_SERVER_BUILDER = '@ng-doc/builder:vite-dev-server';

/** The options of the production build target beyond `configFile` and `outputPath`. */
export interface NgDocViteBuildTargetOptions {
  ssr?: boolean;
  prerender?: boolean;
  routes?: string[];
  discoverRoutes?: boolean;
}

/** What the two Vite targets are made of. */
export interface NgDocViteTargetsInput {
  /** The Vite configuration file, workspace-relative. */
  configFile: string;
  outputPath: string;
  /** Build configuration names; each becomes a configuration that sets the Vite `mode`. */
  modes: string[];
  defaultConfiguration?: string;
  build?: NgDocViteBuildTargetOptions;
  /** Build flags a configuration changes, by configuration name. */
  buildConfigurations?: { [configuration: string]: NgDocViteBuildTargetOptions };
  /** The Vite mode of the build target's plain options (default: the builder's `production`). */
  buildMode?: string;
  /** Serve configuration name to Vite mode. */
  serveModes: { [configuration: string]: string };
  /** The mode of the serve target's plain options, when its build target names one. */
  serveMode?: string;
  serveDefaultConfiguration?: string;
  host?: string;
  port?: number;
  /** The key of the builder in the workspace file: `builder` (angular.json) or `executor` (Nx). */
  builderKey: 'builder' | 'executor';
  /** Target-level keys kept from the targets being replaced (Nx `dependsOn`, `outputs`, ...). */
  keepBuild?: JsonRecord;
  keepServe?: JsonRecord;
}

function withoutUndefined(value: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

/**
 * The `vite-application` and `vite-dev-server` targets of a project. Every build configuration
 * keeps its name and selects the Vite mode of the same name, which the generated configuration
 * reads its per-configuration settings from.
 */
export function createNgDocViteTargets(input: NgDocViteTargetsInput): {
  build: WorkspaceTarget;
  serve: WorkspaceTarget;
} {
  const configurations = (
    modes: { [name: string]: string },
    extra: { [name: string]: NgDocViteBuildTargetOptions } = {},
  ) =>
    Object.keys(modes).length
      ? Object.fromEntries(
          Object.entries(modes).map(([name, mode]) => [name, { mode, ...(extra[name] ?? {}) }]),
        )
      : undefined;
  const build = withoutUndefined({
    ...(input.keepBuild ?? {}),
    [input.builderKey]: VITE_APPLICATION_BUILDER,
    options: withoutUndefined({
      configFile: input.configFile,
      outputPath: input.outputPath,
      mode: input.buildMode,
      ...(input.build ?? {}),
    }),
    configurations: configurations(
      Object.fromEntries(input.modes.map((mode) => [mode, mode])),
      input.buildConfigurations,
    ),
    defaultConfiguration: input.defaultConfiguration,
  }) as WorkspaceTarget;
  const serve = withoutUndefined({
    ...(input.keepServe ?? {}),
    [input.builderKey]: VITE_DEV_SERVER_BUILDER,
    options: withoutUndefined({
      configFile: input.configFile,
      mode: input.serveMode,
      host: input.host,
      port: input.port,
    }),
    configurations: configurations(input.serveModes),
    defaultConfiguration: input.serveDefaultConfiguration,
  }) as WorkspaceTarget;
  return { build, serve };
}
