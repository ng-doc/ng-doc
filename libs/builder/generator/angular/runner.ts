import type { DevServerBuilderOptions, DevServerBuilderOutput } from '@angular/build';
import type { BuilderContext, BuilderOutput } from '@angular-devkit/architect';
import path from 'node:path';

import type {
  BuildEvent,
  BuildResult,
  BuildSession,
  Diagnostic,
  PublishedGeneratorConfiguration,
  WatchHandle,
} from '../contracts';
import type { HostProgress } from '../progress/host';
import { filterFileEvents, WatchInputFilter } from '../session/watch-input-filter';
import {
  angularOutputRoots,
  createDevServerContext,
  requirePublishedConfiguration,
  resolveApplication,
  resolveDevServerApplication,
  withGeneratedAssets,
} from './options';
import { createAngularProgress, withProgress } from './progress';
import type {
  AngularAdapterDependencies,
  IndexHtmlTransformer,
  ModernApplicationBuilderOptions,
  ModernDevServerBuilderOptions,
  ResolvedAngularApplication,
} from './types';

/** How long the disposal waits for each teardown the Angular host registered. */
const HOST_TEARDOWN_TIMEOUT_MS = 10_000;

type HostStart = (
  application: ResolvedAngularApplication,
  configuration: PublishedGeneratorConfiguration,
  indexHtmlTransformer: IndexHtmlTransformer,
  context: BuilderContext,
) => AsyncIterable<BuilderOutput>;

function errorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return 'Unknown adapter error';
  }
}

function failureOutput(message: string): BuilderOutput {
  return { success: false, error: message };
}

function failedBuild(result: BuildResult, fallback: string): BuilderOutput {
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const message = (errors.length ? errors : result.diagnostics)
    .map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`)
    .join('; ');
  return failureOutput(message || fallback);
}

function logDiagnostics(context: BuilderContext, diagnostics: readonly Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const message = `[${diagnostic.code}] ${diagnostic.message}`;
    if (diagnostic.severity === 'error') context.logger.error(message);
    else if (diagnostic.severity === 'warning') context.logger.warn(message);
    else context.logger.info(message);
  }
}

/** Angular's watcher skips dot-prefixed directories, so it would never see generated assets there. */
function hiddenOutputFailure(workspaceRoot: string, outputRoot: string): string | undefined {
  const relative = path.relative(workspaceRoot, outputRoot);
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') return;
  const hidden = relative.split(path.sep).find((segment) => segment.startsWith('.'));
  if (!hidden) return;
  return `[NGDOC_ANGULAR_HIDDEN_OUTPUT] Angular watch excludes generated assets below the hidden workspace directory "${hidden}". Configure the NgDoc output root without dot-prefixed directory segments below ${workspaceRoot}.`;
}

/**
 * Generator outputs waiting to be merged into the Angular host's stream. Results are queued only
 * once the host runs; an error diagnostic of the watch (it can no longer regenerate) is fatal.
 */
class GeneratorOutputs {
  live = false;
  fatal?: BuilderOutput;
  /** The newest regeneration failure, until a generation succeeds. */
  failure?: BuilderOutput;
  private readonly queued: BuilderOutput[] = [];
  private wake?: () => void;

  push(output: BuilderOutput): void {
    this.queued.push(output);
    this.wake?.();
  }

  next(): Promise<void> {
    if (this.queued.length) return Promise.resolve();
    return new Promise((resolve) => (this.wake = resolve));
  }

  drain(): BuilderOutput[] {
    this.wake = undefined;
    return this.queued.splice(0);
  }
}

function observer(
  context: BuilderContext,
  outputs: GeneratorOutputs,
  progress: HostProgress | undefined,
  inputs: WatchInputFilter,
): (event: BuildEvent) => void {
  return (event) => {
    if (event.kind === 'started') inputs.started();
    // The live line (before the Angular host starts) is cleared before any log line.
    if (event.kind !== 'started') progress?.interrupt();
    if (event.kind === 'diagnostic') {
      logDiagnostics(context, [event.diagnostic]);
      if (event.diagnostic.severity === 'error' && !outputs.fatal) {
        outputs.fatal = failureOutput(`[${event.diagnostic.code}] ${event.diagnostic.message}`);
        outputs.push(outputs.fatal);
      }
    } else if (event.kind === 'result') {
      // The filter retains rejected changes while a generation may record new inputs, and
      // replays the ones its result admits (see WatchInputFilter).
      inputs.observe(event.result);
      if (outputs.live) {
        logDiagnostics(context, event.result.diagnostics);
        if (event.result.status === 'failure') {
          outputs.failure = failedBuild(event.result, 'NgDoc regeneration failed');
          outputs.push(outputs.failure);
        } else {
          outputs.failure = undefined;
        }
      }
      // After the result's diagnostics: its progress line refers to them.
      progress?.release(event.result.generation);
    }
  };
}

/**
 * One builder run: generate, then (in watch mode) keep regenerating from a plain workspace watcher
 * while the Angular host runs in this process on the written files. Generator failures become
 * failed builder outputs between the host's own; a fatal watch error ends the run.
 */
async function* run(
  context: BuilderContext,
  dependencies: AngularAdapterDependencies,
  failureCode: string,
  resolve: () => Promise<ResolvedAngularApplication>,
  watch: boolean,
  startHost: HostStart,
): AsyncGenerator<BuilderOutput> {
  let session: BuildSession | undefined;
  let handle: WatchHandle | undefined;
  let host: AsyncIterator<BuilderOutput> | undefined;
  let progress: HostProgress | undefined;
  let disposal: Promise<void> | undefined;
  // Architect runs a builder's teardowns only when it is stopped before the run completes, so the
  // Angular host's teardowns are kept here and run by this run's own disposal: after a fatal
  // generator error or a failed start as well as on a stop.
  const hostTeardowns: Array<() => unknown> = [];
  const hostContext = new Proxy(context, {
    get(target: BuilderContext, property: string | symbol) {
      if (property === 'addTeardown') {
        return (teardown: () => unknown) => {
          if (!disposal) hostTeardowns.push(teardown);
          else
            void Promise.resolve()
              .then(teardown)
              .catch(() => {});
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const dispose = () =>
    (disposal ??= (async () => {
      const errors: unknown[] = [];
      const attempt = async (step: () => unknown) => {
        try {
          await step();
        } catch (error) {
          errors.push(error);
        }
      };
      // Nested Angular builders register after their host: the newest teardown runs first. A
      // teardown that never settles must not keep the generator's watch and workers alive.
      const limit = dependencies.hostTeardownTimeoutMs ?? HOST_TEARDOWN_TIMEOUT_MS;
      for (const teardown of hostTeardowns.splice(0).reverse()) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const expired = new Promise<'expired'>((resolve) => {
          timer = setTimeout(() => resolve('expired'), limit);
        });
        const settled = await Promise.race([attempt(teardown), expired]);
        clearTimeout(timer);
        if (settled === 'expired') {
          context.logger.warn(
            `[NGDOC_ANGULAR_TEARDOWN_TIMEOUT] An Angular teardown did not finish within ${limit} ms.`,
          );
        }
      }
      await attempt(() => handle?.dispose());
      await attempt(() => session?.dispose());
      if (errors.length > 1) throw new AggregateError(errors, 'Angular adapter teardown failed');
      if (errors.length) throw errors[0];
    })().catch((error: unknown) => {
      context.logger.error(`[NGDOC_ADAPTER_DISPOSE] ${errorMessage(error)}`);
      throw error;
    }));
  context.addTeardown(dispose);
  const outputs = new GeneratorOutputs();
  try {
    const application = await resolve();
    // A stop during startup: nothing more starts, and the disposal already released the rest.
    if (disposal) return;
    progress = createAngularProgress(context, {
      ...(application.progress ? { option: application.progress } : {}),
      ...(application.options.progress === false ? { angularProgress: false } : {}),
      project: application.projectId,
    });
    session = dependencies.createSession(withProgress(application.bootstrap, progress));
    const initial = await session.buildOnce({ mode: watch ? 'development' : 'production' });
    if (disposal) return;
    progress?.interrupt();
    logDiagnostics(context, initial.diagnostics);
    progress?.release(initial.generation);
    if (initial.status !== 'success') {
      yield failedBuild(initial, 'Initial NgDoc generation failed');
      return;
    }
    let configuration = requirePublishedConfiguration(initial.snapshot);
    if (watch) {
      const root = application.bootstrap.workspaceRoot;
      const hidden = hiddenOutputFailure(root, configuration.outputRoot);
      if (hidden) {
        context.logger.error(hidden);
        yield failureOutput(hidden);
        return;
      }
      const ignore = [
        '**/node_modules/**',
        '**/.git/**',
        '**/.angular/**',
        '**/.nx/**',
        configuration.outputRoot,
        configuration.cacheRoot,
        ...angularOutputRoots(application.options, root, application.projectId),
      ];
      // The native watcher is recursive over the workspace. Only recorded generator inputs may
      // start or supersede a generation (as in the Vite adapter); unrelated writes such as editor
      // state, coverage or other builds are dropped before they reach the session.
      const inputs = new WatchInputFilter({ root });
      inputs.observe(initial);
      const source = filterFileEvents(dependencies.createEventSource(root, { ignore }), inputs);
      handle = await session.watch(source, observer(context, outputs, progress, inputs));
      // A disposal that ran while the watch started could not see its handle.
      if (disposal) return void (await handle.dispose());
      const reconciled = await handle.initial;
      if (disposal) return;
      progress?.interrupt();
      logDiagnostics(context, reconciled.diagnostics);
      if (reconciled.status !== 'success') {
        yield failedBuild(reconciled, 'Initial NgDoc watch reconciliation failed');
        return;
      }
      configuration = requirePublishedConfiguration(reconciled.snapshot);
    }
    const transformer = await dependencies.createIndexHtmlTransformer();
    if (disposal) return;
    if (outputs.fatal) {
      yield outputs.fatal;
      return;
    }
    outputs.drain();
    outputs.live = true;
    // Angular's own output owns the terminal from here: NgDoc prints result lines only.
    progress?.setForeign('summaries');
    host = startHost(application, configuration, transformer, hostContext)[Symbol.asyncIterator]();
    let hostNext = host.next();
    while (true) {
      const next = await Promise.race([hostNext, outputs.next().then(() => undefined)]);
      if (next?.done) return;
      if (next) {
        const failure = outputs.failure;
        yield next.value;
        // A native success does not hide a regeneration failure that is still current.
        if (next.value.success && failure && outputs.failure === failure) yield failure;
        hostNext = host.next();
      }
      for (const output of outputs.drain()) {
        yield output;
        if (output === outputs.fatal) return;
      }
    }
  } catch (error) {
    const message = `[${failureCode}] ${errorMessage(error)}`;
    context.logger.error(message);
    yield failureOutput(message);
  } finally {
    progress?.dispose();
    // Angular's iterator can be inside a pending next() that only its own teardown ends, and
    // Architect runs that teardown when it stops the run: its return is requested, not awaited.
    if (host)
      void Promise.resolve()
        .then(() => host?.return?.())
        .catch(() => {});
    await dispose();
  }
}

export function runModernApplication(
  options: ModernApplicationBuilderOptions,
  context: BuilderContext,
  dependencies: AngularAdapterDependencies,
): AsyncGenerator<BuilderOutput> {
  return run(
    context,
    dependencies,
    'NGDOC_APPLICATION',
    () => resolveApplication(options, context),
    options.watch === true,
    (application, configuration, indexHtmlTransformer, hostContext) =>
      dependencies.buildApplication(
        withGeneratedAssets(
          application.options,
          configuration,
          application.bootstrap.workspaceRoot,
          application.projectId,
        ),
        hostContext,
        { indexHtmlTransformer },
      ),
  );
}

export function runModernDevServer(
  options: ModernDevServerBuilderOptions,
  context: BuilderContext,
  dependencies: AngularAdapterDependencies,
): AsyncGenerator<DevServerBuilderOutput | BuilderOutput> {
  const { ngDoc: _ngDoc, ...devServerOptions } = options;
  return run(
    context,
    dependencies,
    'NGDOC_DEV_SERVER',
    () => resolveDevServerApplication(options, context),
    true,
    (application, configuration, indexHtmlTransformer, hostContext) =>
      dependencies.executeDevServer(
        devServerOptions as DevServerBuilderOptions,
        createDevServerContext(hostContext, application, configuration),
        { indexHtmlTransformer },
      ),
  );
}
