import type {
  ApplicationBuilderOptions,
  DevServerBuilderOptions,
  DevServerBuilderOutput,
} from '@angular/build';
import type { BuilderContext, BuilderOutput } from '@angular-devkit/architect';

import type { GeneratorBootstrapOptions } from '../bootstrap';
import type { BuildSession, FileEventSource } from '../contracts';
import type { ProgressOptionSetting } from '../progress/settings';

export interface NgDocAngularOptions {
  config?: string;
  /** Build tags for `onlyForTags`; default: the Architect configuration name(s). */
  tags?: string[];
  /**
   * Generation progress: `auto` (default), `live`, `plain`, `verbose`, `summary` or `off`.
   * `NGDOC_PROGRESS` overrides it; the application option `progress: false` means `summary`.
   */
  progress?: ProgressOptionSetting;
}

export type ModernApplicationBuilderOptions = ApplicationBuilderOptions & {
  ngDoc?: NgDocAngularOptions;
};

export type ModernDevServerBuilderOptions = DevServerBuilderOptions & {
  ngDoc?: NgDocAngularOptions;
};

export type IndexHtmlTransformer = (content: string) => Promise<string>;

export interface ApplicationExtensions {
  indexHtmlTransformer?: IndexHtmlTransformer;
}

export interface DevServerExtensions {
  indexHtmlTransformer?: IndexHtmlTransformer;
}

export interface AngularAdapterDependencies {
  createSession(options: GeneratorBootstrapOptions): BuildSession;
  createEventSource(root: string, options: { ignore: string[] }): FileEventSource;
  createIndexHtmlTransformer(): Promise<IndexHtmlTransformer>;
  /** How long disposal waits for each Angular teardown (default 10 s); for tests. */
  hostTeardownTimeoutMs?: number;
  buildApplication(
    options: ApplicationBuilderOptions,
    context: BuilderContext,
    extensions?: ApplicationExtensions,
  ): AsyncIterable<BuilderOutput>;
  executeDevServer(
    options: DevServerBuilderOptions,
    context: BuilderContext,
    extensions?: DevServerExtensions,
  ): AsyncIterable<DevServerBuilderOutput>;
}

export interface ResolvedAngularApplication {
  projectId: string;
  options: ApplicationBuilderOptions;
  bootstrap: GeneratorBootstrapOptions;
  /** `ngDoc.progress`; the dev server's own value wins over its build target's. */
  progress?: ProgressOptionSetting;
}
