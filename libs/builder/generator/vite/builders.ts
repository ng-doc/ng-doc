import type { BuilderContext, BuilderOutput } from '@angular-devkit/architect';
import path from 'node:path';
import { Observable } from 'rxjs';
import { type InlineConfig, type ViteDevServer, createServer as viteCreateServer } from 'vite';

import { type NgDocViteBuildOptions, buildNgDocViteApplication } from './production';

/** Options of `@ng-doc/builder:vite-application`. Paths are relative to the workspace root. */
export interface NgDocViteApplicationBuilderOptions {
  configFile: string;
  outputPath: string;
  mode?: string;
  ssr?: boolean;
  prerender?: boolean;
  routes?: string[];
  discoverRoutes?: boolean;
  routeTimeout?: number;
}

/** Options of `@ng-doc/builder:vite-dev-server`. Paths are relative to the workspace root. */
export interface NgDocViteDevServerBuilderOptions {
  configFile: string;
  mode?: string;
  host?: string;
  port?: number;
}

type Context = Pick<BuilderContext, 'workspaceRoot' | 'logger'>;

/** @internal Injectable host ports for tests. */
export interface NgDocViteBuilderDependencies {
  build(options: NgDocViteBuildOptions): Promise<unknown>;
  createServer(config: InlineConfig): Promise<ViteDevServer>;
}

const defaultDependencies: NgDocViteBuilderDependencies = {
  build: (options) => buildNgDocViteApplication(options),
  createServer: viteCreateServer,
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the production build (browser, server, prerender) of a Vite + NgDoc application.
 */
export async function runViteApplicationBuilder(
  options: NgDocViteApplicationBuilderOptions,
  context: Context,
  dependencies: NgDocViteBuilderDependencies = defaultDependencies,
  signal?: AbortSignal,
): Promise<BuilderOutput> {
  const resolve = (value: string) => path.resolve(context.workspaceRoot, value);
  try {
    await dependencies.build({
      configFile: resolve(options.configFile),
      outputPath: resolve(options.outputPath),
      mode: options.mode ?? 'production',
      ...(options.ssr === undefined ? {} : { ssr: options.ssr }),
      ...(options.prerender === undefined ? {} : { prerender: options.prerender }),
      ...(options.routes ? { routes: options.routes } : {}),
      ...(options.discoverRoutes === undefined ? {} : { discoverRoutes: options.discoverRoutes }),
      ...(options.routeTimeout === undefined ? {} : { routeTimeoutMs: options.routeTimeout }),
      log: (line) => context.logger.info(line),
      ...(signal ? { signal } : {}),
    });
    return { success: true };
  } catch (error) {
    context.logger.error(message(error));
    return { success: false, error: message(error) };
  }
}

/**
 * The production build as Architect runs it: stopping the builder aborts the build, which stops
 * the prerender child process.
 */
export function viteApplicationBuilderOutputs(
  options: NgDocViteApplicationBuilderOptions,
  context: Context,
  dependencies: NgDocViteBuilderDependencies = defaultDependencies,
): Observable<BuilderOutput> {
  return new Observable<BuilderOutput>((subscriber) => {
    const controller = new AbortController();
    void runViteApplicationBuilder(options, context, dependencies, controller.signal).then(
      (output) => {
        subscriber.next(output);
        subscriber.complete();
      },
    );
    return () => controller.abort();
  });
}

/**
 * Starts the Vite development server of the application and keeps it running until Architect
 * stops the builder, which closes the server (and with it NgDoc's watch session).
 */
export function runViteDevServerBuilder(
  options: NgDocViteDevServerBuilderOptions,
  context: Context,
  dependencies: NgDocViteBuilderDependencies = defaultDependencies,
): Observable<BuilderOutput> {
  return new Observable<BuilderOutput>((subscriber) => {
    let server: ViteDevServer | undefined;
    let stopped = false;
    const close = () => server?.close().catch((error) => context.logger.error(message(error)));
    void (async () => {
      try {
        server = await dependencies.createServer({
          configFile: path.resolve(context.workspaceRoot, options.configFile),
          mode: options.mode ?? 'development',
          server: {
            ...(options.host === undefined ? {} : { host: options.host }),
            ...(options.port === undefined ? {} : { port: options.port }),
          },
        });
        if (stopped) {
          await close();
          return;
        }
        await server.listen();
        server.printUrls();
        const baseUrl = server.resolvedUrls?.local[0];
        subscriber.next({ success: true, ...(baseUrl ? { baseUrl } : {}) });
      } catch (error) {
        context.logger.error(message(error));
        await close();
        subscriber.next({ success: false, error: message(error) });
        subscriber.complete();
      }
    })();
    return () => {
      stopped = true;
      void close();
    };
  });
}
