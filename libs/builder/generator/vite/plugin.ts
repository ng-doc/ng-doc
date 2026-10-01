import path from 'node:path';
import type {
  ConfigEnv,
  EnvironmentModuleNode,
  HotUpdateOptions,
  Logger,
  Plugin,
  ResolvedConfig,
  Rollup,
  UserConfig,
  ViteDevServer,
} from 'vite';

import { publishesManifest } from '../artifacts';
import { createGeneratorBuildSession } from '../bootstrap';
import type {
  BuildResult,
  BuildSession,
  Diagnostic,
  PublishedGeneratorConfiguration,
} from '../contracts';
import { flagOff, VITE_BUILD_HANDOFF_FLAG } from '../kernel/flags';
import type { HostProgress } from '../progress/host';
import { assertAngularCompatibility } from './angular-compatibility';
import { composeAngularPlugins } from './angular-composition';
import { boundServerClose } from './bounded-close';
import { requirePublishedConfiguration } from './configuration';
import { diagnosticText, hostDiagnostic } from './diagnostics';
import type { HostUpdateTicket } from './host-updates';
import { acquireOutputLease } from './lease';
import { ViteAdapterLifecycle } from './lifecycle';
import {
  type NgDocVitePluginOptions,
  assertThemeModules,
  CacheRootWatchIgnore,
  generatorWithTags,
  resolveOptions,
  staticViteConfig,
} from './options';
import { OUTPUT_WATCH_ATTACH_TIMEOUT_MS, watchOutputRoot } from './output-watch';
import type { NgDocGenerationHandoff } from './production';
import { createViteProgress, withProgress } from './progress';
import { OwnedSsrRenderer } from './ssr-renderer';
import { SSR_RENDER_CONTROL_ID } from './ssr-renderer-protocol';
import { transformNgDocIndex } from './theme-index';
import { NGDOC_VITE_WATCHER, ViteFileEventSource } from './vite-event-source';

interface Initialized {
  /** Absent when a production build publishes the generation of an earlier build (a handoff). */
  session?: BuildSession;
  initial: Extract<BuildResult, { status: 'success' }>;
  configuration: PublishedGeneratorConfiguration;
  lifecycle: ViteAdapterLifecycle;
}

function wantsHtml(request: { headers: { accept?: string | string[] } }): boolean {
  const accept = request.headers.accept;
  return (Array.isArray(accept) ? accept.join(',') : accept)?.includes('text/html') ?? false;
}

/** Logs diagnostics through the Vite logger by severity; a failing logger is ignored. */
function logDiagnostics(logger: Logger | undefined, diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const text = diagnosticText(diagnostic);
    logSafely(() => {
      if (diagnostic.severity === 'error') logger?.error(text);
      else if (diagnostic.severity === 'warning') logger?.warn(text);
      else logger?.info(text);
    });
  }
}

function logSafely(write: () => void): void {
  try {
    write();
  } catch {
    // A failing host logger must not turn a completed close into a failed one.
  }
}

const ANALOG_COMPILER_TRIGGER = /\.[cm]?ts(?![a-z])|\.(?:html?|css|less|sass|scss)$/;

export function createPlugin(options: NgDocVitePluginOptions): Plugin[] {
  const resolved = resolveOptions(options);
  const cacheWatch = new CacheRootWatchIgnore(resolved);
  let devServer: ViteDevServer | undefined;
  let vite: ResolvedConfig | undefined;
  let initialized: Promise<Initialized> | undefined;
  let active: Initialized | undefined;
  let pendingLifecycle: ViteAdapterLifecycle | undefined;
  let disposal: Promise<void> | undefined;
  // Settles once the SSR renderer and the lifecycle (session workers, watchers, lease) are released.
  let ownedRelease: Promise<unknown> | undefined;
  let terminal = false;
  let progress: HostProgress | undefined;
  const hostUpdates = new WeakMap<object, HostUpdateTicket>();
  const ssrRenderer = new OwnedSsrRenderer();
  /** The production pipeline's shared generation (see `NgDocGenerationHandoff`), if any. */
  let handoff: NgDocGenerationHandoff | undefined;

  const initialize = (mode: 'development' | 'production'): Promise<Initialized> => {
    if (terminal) return Promise.reject(new Error('[NGDOC_VITE_DISPOSED] Plugin is disposed.'));
    if (initialized) return initialized;
    initialized = (async () => {
      const lease = acquireOutputLease(
        resolved.leaseIdentity,
        resolved.generator.defaults.outputRoot,
      );
      // One reporter per session: a retried initialization gets a new one.
      const reporter = (progress = createViteProgress({
        logger: () => devServer?.config.logger ?? vite?.logger,
        ...(resolved.progress ? { option: resolved.progress } : {}),
        ...(vite?.logLevel ? { logLevel: vite.logLevel } : {}),
        generator: resolved.generator,
      }));
      const lifecycle = new ViteAdapterLifecycle(lease, reporter);
      pendingLifecycle = lifecycle;
      try {
        const generator = generatorWithTags(resolved.generator, vite?.mode ?? mode);
        const session = createGeneratorBuildSession(withProgress(generator, reporter), {
          admitConfiguration(configuration: Readonly<PublishedGeneratorConfiguration>) {
            assertThemeModules(resolved, configuration);
            // Before the committer writes: stop ignoring a cache root that now contains the
            // published output, and make the watcher (re)scan it.
            if (cacheWatch.admit(configuration) && cacheWatch.cacheRoot) {
              devServer?.watcher.add(cacheWatch.cacheRoot);
            }
            lifecycle.admit(configuration);
          },
        });
        lifecycle.attachSession(session);
        const built = await session.buildOnce({ mode });
        // The initial result's diagnostics come first, then its summary (which counts them); a
        // result that fails to publish here gets the failure line instead.
        let published = false;
        let initial: Extract<BuildResult, { status: 'success' }>;
        let configuration: PublishedGeneratorConfiguration;
        try {
          reporter?.interrupt();
          logDiagnostics(devServer?.config.logger ?? vite?.logger, built.diagnostics);
          initial = lifecycle.acceptInitial(built);
          if (terminal) throw new Error('[NGDOC_VITE_DISPOSED] Plugin is disposed.');
          configuration = requirePublishedConfiguration(initial.snapshot);
          assertThemeModules(resolved, configuration);
          lifecycle.publish(initial, configuration);
          published = true;
        } finally {
          reporter?.release(built.generation, !published);
        }
        active = { session, initial, configuration, lifecycle };
        pendingLifecycle = undefined;
        return active;
      } catch (error) {
        await lifecycle.dispose().catch(() => {});
        initialized = undefined;
        if (pendingLifecycle === lifecycle) pendingLifecycle = undefined;
        reporter?.dispose();
        if (progress === reporter) progress = undefined;
        throw error;
      }
    })();
    return initialized;
  };

  /** What a build must share with another to publish its generation: the generator options. */
  const generationKey = (): string | undefined => {
    try {
      return JSON.stringify(generatorWithTags(resolved.generator, vite?.mode ?? 'production'));
    } catch {
      return undefined;
    }
  };

  /**
   * A production build: generates, or publishes the generation an earlier build of the same
   * pipeline recorded with the same generator options (`NGDOC_VITE_BUILD_HANDOFF=0` always
   * generates). That build committed the output and released its lease at its end; this one
   * takes the lease again and publishes the recorded result only while the output root still
   * publishes its manifest, since another writer may have committed in between. Otherwise it
   * generates, as without a handoff.
   */
  const initializeBuild = async (): Promise<void> => {
    const key = handoff && !flagOff(VITE_BUILD_HANDOFF_FLAG) ? generationKey() : undefined;
    const recorded = key !== undefined ? handoff?.recorded : undefined;
    if (recorded?.key === key && recorded && !terminal && !initialized) {
      const lifecycle = new ViteAdapterLifecycle(
        acquireOutputLease(resolved.leaseIdentity, resolved.generator.defaults.outputRoot),
      );
      let current = false;
      try {
        current = await publishesManifest(
          recorded.configuration.outputRoot,
          recorded.result.manifest,
        );
        if (current && !terminal) {
          assertThemeModules(resolved, recorded.configuration);
          lifecycle.publish(recorded.result, recorded.configuration);
          active = { initial: recorded.result, configuration: recorded.configuration, lifecycle };
          initialized = Promise.resolve(active);
          return;
        }
      } catch (error) {
        await lifecycle.dispose().catch(() => {});
        throw error;
      }
      await lifecycle.dispose();
    }
    const state = await initialize('production');
    if (handoff && key !== undefined) {
      handoff.recorded = { key, result: state.initial, configuration: state.configuration };
    }
  };

  const dispose = async (): Promise<void> => {
    if (disposal) return disposal;
    terminal = true;
    progress?.dispose();
    const current = active?.lifecycle ?? pendingLifecycle;
    const initialization = initialized;
    const initializationSettled = initialization?.catch(() => undefined);
    active = undefined;
    disposal = (async () => {
      let cleanupError: unknown;
      const rendererCleanup = ssrRenderer.close();
      const lifecycleCleanup = current?.dispose();
      void lifecycleCleanup?.catch(() => {});
      ownedRelease = Promise.allSettled([rendererCleanup, lifecycleCleanup]);
      try {
        await rendererCleanup;
      } catch (error) {
        cleanupError = error;
      }
      try {
        await lifecycleCleanup;
      } catch (error) {
        cleanupError ??= error;
      }
      try {
        await angularComposition.dispose();
      } catch (error) {
        cleanupError ??= error;
      }
      await initializationSettled;
      if (cleanupError) throw cleanupError;
    })();
    return disposal;
  };

  const angularComposition = composeAngularPlugins(
    resolved.angularPlugins,
    resolved.angularComponentProbe,
    {
      async initialize() {
        await initialize('development');
      },
      initialCompilationInventory() {
        return (active?.lifecycle ?? pendingLifecycle)?.initialCompilationInventory();
      },
      start(file: string, read: () => string | Promise<string>) {
        const lifecycle = active?.lifecycle ?? pendingLifecycle;
        if (!lifecycle) throw new Error('[NGDOC_VITE_ADMISSION] Generator is not initialized.');
        return lifecycle.hostUpdateStarted(file, 'update', read);
      },
      companions(ticket: HostUpdateTicket) {
        return (active?.lifecycle ?? pendingLifecycle)?.hostUpdateCompanions(ticket) ?? [];
      },
      diagnosticMark() {
        return (active?.lifecycle ?? pendingLifecycle)?.hostDiagnosticMark() ?? 0;
      },
      claimsFilesystemChange(file: string) {
        return (active?.lifecycle ?? pendingLifecycle)?.hostClaimsFilesystemChange(file) ?? false;
      },
      acknowledge(
        ticket: HostUpdateTicket,
        resourceWitness: boolean,
        compilerPass: boolean | undefined,
        recoverBefore?: number,
      ) {
        return (
          (active?.lifecycle ?? pendingLifecycle)?.hostUpdateAcknowledged(
            ticket,
            resourceWitness,
            compilerPass,
            recoverBefore,
          ) ?? Promise.reject(new Error('[NGDOC_VITE_DISPOSED] Plugin is disposed.'))
        );
      },
      diagnostic(ticket: HostUpdateTicket, error: Error) {
        (active?.lifecycle ?? pendingLifecycle)?.hostUpdateDiagnostic(ticket, error);
      },
      committed(ticket: HostUpdateTicket) {
        return (
          (active?.lifecycle ?? pendingLifecycle)?.hostUpdateCommitted(ticket) ?? Promise.resolve()
        );
      },
      settle(ticket: HostUpdateTicket) {
        return (
          (active?.lifecycle ?? pendingLifecycle)?.hostUpdateSettled(ticket) ?? Promise.resolve()
        );
      },
      fail(error: Error) {
        (active?.lifecycle ?? pendingLifecycle)?.hostUpdateFailed(error);
      },
    },
  );
  // Shape validation above is synchronous; no generator lease or filesystem work has started.
  assertAngularCompatibility(resolved.angularPlugins);

  const primary: Plugin = {
    name: '@ng-doc/vite',
    api: {
      ngDocSsrRenderer: Object.freeze({
        schemaVersion: 1,
        select: (entry: string) => ssrRenderer.select(entry),
      }),
    },
    enforce: 'pre',
    config(config: UserConfig, environment: ConfigEnv) {
      if (environment.command === 'serve' && config.server?.watch === null) {
        throw new Error(
          '[NGDOC_VITE_WATCH_DISABLED] NgDoc development requires Vite filesystem watching.',
        );
      }
      if (environment.command === 'serve' && config.server?.hmr === false) {
        throw new Error(
          '[NGDOC_VITE_HMR_DISABLED] NgDoc development requires Vite hot-update hooks.',
        );
      }
      if (environment.command === 'build' && config.build?.watch) {
        throw new Error(
          '[NGDOC_VITE_BUILD_WATCH] Vite build watch is unsupported; use the development server.',
        );
      }
      return staticViteConfig(resolved, path.resolve(config.root ?? process.cwd()), cacheWatch);
    },
    configResolved(config: ResolvedConfig) {
      vite = config;
      cacheWatch.confirmRoot(config.root);
      const shared = (config.plugins ?? [])
        .map((plugin) => plugin.api?.ngDocGeneration as NgDocGenerationHandoff | undefined)
        .filter((value) => value?.schemaVersion === 1);
      handoff = shared.length === 1 ? shared[0] : undefined;
    },
    hotUpdate: {
      order: 'pre',
      async handler(context: HotUpdateOptions) {
        if (this.environment.name === 'client' && context.type === 'update') {
          angularComposition.observeStartupUpdate(context.file, context.read);
        }
        const lifecycle = active?.lifecycle ?? pendingLifecycle;
        const ticket =
          this.environment.name === 'client' && context.type !== 'update'
            ? lifecycle?.hostUpdateStarted(context.file, context.type, context.read)
            : undefined;
        if (ticket) hostUpdates.set(context, ticket);
        // Vite installs its watcher-to-HMR bridge before configureServer hooks. Gate every early
        // update that can reach Analog's TypeScript/resource compiler. Creates/deletes and other
        // extensions do not invoke its pinned legacy handleHotUpdate hook.
        const initialization =
          context.type === 'update' && ANALOG_COMPILER_TRIGGER.test(context.file)
            ? initialize('development')
            : undefined;
        // Attach handlers to both promises immediately. Startup can exceed the steady-state host
        // deadline, and a buffered ticket must never reject unobserved while initialization runs.
        await Promise.all([initialization, ticket?.ready]);
      },
    },
    async configureServer(server: ViteDevServer) {
      let state: Initialized | undefined;
      try {
        devServer = server;
        boundServerClose(server, {
          dispose,
          released: () => ownedRelease ?? Promise.resolve(),
          warn: (message) => logSafely(() => server.config.logger.warn(message)),
          error: (message) => logSafely(() => server.config.logger.error(message)),
        });
        angularComposition.attachServer(server);
        const watching = server.config.server.watch !== null;
        const source = new ViteFileEventSource(server.watcher, resolved.maxExternalWatchTargets, {
          workspaceRoot: resolved.generator.workspaceRoot,
          // Vite watches its root recursively, unless watching is off altogether.
          watchedRoots: watching ? [server.config.root] : [],
          watchMissingPaths: watching,
        });
        source.excludeOwned(
          resolved.generator.defaults.outputRoot,
          resolved.generator.defaults.cacheRoot,
        );
        const initialization = initialize('development');
        try {
          pendingLifecycle?.attachServer(server, source);
        } catch (error) {
          // A synchronous initialization failure has already disposed the pending lifecycle, so
          // attaching fails too. Report the initialization failure, which is the cause.
          await initialization;
          throw error;
        }
        state = await initialization;
        source.excludeOwned(state.configuration.outputRoot, state.configuration.cacheRoot);
        state.lifecycle.attachServer(server, source);
        // Before the watch starts, so that the watcher reports every output a commit writes.
        if (watching) {
          const outputWatch = await watchOutputRoot(
            server.watcher,
            server.config.root,
            state.configuration.outputRoot,
            state.initial.manifest.files.map((file) => file.path),
            { disposed: () => terminal },
          );
          if (outputWatch === 'timeout') {
            const warning = diagnosticText({
              ...hostDiagnostic(
                NGDOC_VITE_WATCHER,
                `The watcher did not attach to the generated output ${state.configuration.outputRoot} ` +
                  `within ${OUTPUT_WATCH_ATTACH_TIMEOUT_MS / 1000} s. An edit that writes a ` +
                  'generated file Vite has not served yet may not reload the browser; restart ' +
                  'Vite if an update does not settle.',
              ),
              severity: 'warning',
            });
            logSafely(() => server.config.logger.warn(warning));
          }
        }
        await source.seed(state.initial.generation, state.initial.watchInputs);
        const observer = state.lifecycle.observer((result) =>
          result.status === 'success' ? requirePublishedConfiguration(result.snapshot) : undefined,
        );
        if (!state.session) throw new Error('[NGDOC_VITE_ADMISSION] Generator has no session.');
        const watch = await state.session.watch(source, observer);
        state.lifecycle.attachWatch(watch);
        state.lifecycle.acceptInitial(await watch.initial);
        await state.lifecycle.settled();
        if (state.lifecycle.failure) throw state.lifecycle.failure;
        if (!state.lifecycle.configuration) {
          throw new Error('[NGDOC_VITE_CONFIGURATION] Watch produced no current configuration.');
        }
        server.middlewares.use(state.lifecycle.assets.middleware(server.config.base));
        server.middlewares.use((request, response, next) => {
          if (!state?.lifecycle.failure || !wantsHtml(request)) {
            next();
            return;
          }
          response.statusCode = 500;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(state.lifecycle.failure.message);
        });
        ssrRenderer.attach(server);
        server.httpServer?.once('close', () => void dispose().catch(() => {}));
        // Vite prints its banner and its own lines next: no more redraw, timestamped lines only.
        progress?.setForeign('notices');
      } catch (error) {
        await dispose().catch(() => {});
        throw error;
      }
    },
    buildStart: {
      order: 'pre',
      sequential: true,
      async handler() {
        if (vite?.command === 'build') await initializeBuild();
      },
    },
    resolveId(source: string) {
      if (source === SSR_RENDER_CONTROL_ID) return source;
      if (source.startsWith('virtual:ng-doc/') || source.startsWith('/@ng-doc/virtual/')) {
        throw new Error(
          `[NGDOC_VIRTUAL_TRANSPORT] ${source}: the virtual content mode was removed; import the generated files instead.`,
        );
      }
      if (source !== resolved.generatedAlias) return null;
      const configuration = active?.lifecycle.configuration;
      if (!configuration) {
        throw new Error(
          '[NGDOC_VITE_ADMISSION] Generated modules were requested before generation.',
        );
      }
      return `${configuration.outputRoot}/index.ts`;
    },
    load(id: string) {
      return ssrRenderer.controlModule(id) ?? null;
    },
    transformIndexHtml: { order: 'pre', handler: transformNgDocIndex },
    async generateBundle(_output: Rollup.NormalizedOutputOptions, bundle: Rollup.OutputBundle) {
      if (vite?.command === 'build' && active) await active.lifecycle.assets.emit(this, bundle);
    },
    async buildEnd(error: Error | undefined) {
      if (error) await dispose();
    },
    closeBundle: dispose,
  };

  const completion: Plugin = {
    name: '@ng-doc/vite:host-completion',
    enforce: 'post',
    buildStart: {
      order: 'post',
      sequential: true,
      async handler() {
        if (vite?.command === 'serve' && this.environment.name === 'client') {
          await angularComposition.preflight();
        }
      },
    },
    hotUpdate: {
      order: 'post',
      async handler(context: HotUpdateOptions) {
        if (this.environment.name !== 'client') return;
        const ticket = hostUpdates.get(context);
        if (ticket) {
          hostUpdates.delete(context);
          await (active?.lifecycle ?? pendingLifecycle)?.hostUpdateCompleted(ticket);
        }
        if (!(active?.lifecycle ?? pendingLifecycle)?.hostUpdateAnnounced(context.read)) return;
        // A committed generated output: the adapter already sent this generation's full reload
        // when its host obligations settled. Invalidate exactly as Vite's own reload path does,
        // but leave the browser notification to the adapter, so an edit reloads once.
        const invalidated = new Set<EnvironmentModuleNode>();
        for (const module of context.modules) {
          this.environment.moduleGraph.invalidateModule(
            module,
            invalidated,
            context.timestamp,
            true,
          );
        }
        return [];
      },
    },
  };

  return [primary, ...angularComposition.plugins, completion];
}
