import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';

import { ANGULAR_SHARED_PASS_FLAG, ANGULAR_STRUCTURAL_PASS_FLAG, flagOff } from '../kernel/flags';
import {
  type HostUpdateTicket,
  type InitialCompilationInventory,
  type PhysicalState,
  observePhysicalState,
  observePhysicalVersion,
} from './host-updates';

const COMPILER_PLUGIN = '@analogjs/vite-plugin-angular';
const FAST_COMPILER_PLUGIN = '@analogjs/vite-plugin-angular-fast-compile';
const COMPILER_TYPESCRIPT = /\.[cm]?ts(?![a-z])/;
const COMPILER_RESOURCE = /\.(?:html?|css|less|sass|scss)$/;
const ANGULAR_EMISSION = /(?:\.ɵcmp\s*=|ɵɵdefineComponent|static\s+\{\s*this\.ɵcmp)/;

/**
 * Whether a hot update is for a global style sheet or for a Sass file only global sheets use:
 * every module of the file reaches, through style sheets alone, only virtual importers (ids
 * starting with a NUL character, such as the application's browser entry). A component style
 * sheet is served with a query (`?direct&ngcomp`) or imported by the component's TypeScript, so
 * neither it nor a partial it uses ever matches.
 * @param context - The hot update.
 * @returns Whether only global style sheets depend on the file.
 */
export function globalStyleSheet(context: Pick<HmrContext, 'file' | 'modules'>): boolean {
  if (!COMPILER_RESOURCE.test(context.file) || context.modules.length === 0) return false;

  const seen = new Set<unknown>();
  let virtual = false;
  const global = (module: HmrContext['modules'][number]): boolean => {
    if (seen.has(module)) return true;
    seen.add(module);

    const id = module.id ?? module.url;

    if (id.startsWith('\0')) {
      virtual = true;
      return true;
    }
    if (id.includes('?') || !COMPILER_RESOURCE.test(id)) return false;

    const importers = [...module.importers];

    return importers.length > 0 && importers.every(global);
  };

  return context.modules.every(global) && virtual;
}

type HookObject<Handler> = { handler: Handler } & Record<string, unknown>;
type LegacyHotHandler = (this: unknown, context: HmrContext) => unknown;
type TransformHandler = (this: unknown, code: string, id: string, ...rest: unknown[]) => unknown;
type BuildStartHandler = (this: unknown, ...args: unknown[]) => unknown;

/**
 * The hot-update context NgDoc's patched Analog compiler reads: `ngDocCompanionFiles` join the
 * pass of `file`, and the compiler sets `ngDocCompanionPass` to that pass when it took them. A
 * compiler that does not set it did not compile them.
 */
interface CompanionHmrContext extends HmrContext {
  ngDocCompanionFiles?: readonly string[];
  ngDocCompanionPass?: Promise<unknown>;
}

/**
 * The hooks NgDoc's patched Analog compiler exposes as `api.ngDocHost` (the
 * `generation-claimed-filesystem-*` changes): a claimed add or unlink event invalidates the
 * compiler's caches at once and joins its next pass instead of starting one, and `passes` counts
 * its passes.
 */
export interface AnalogHostHooks {
  claimFilesystemChange?: (file: string) => boolean;
  readonly passes: number;
}

/**
 * The patched compiler's hooks, when it exposes them.
 * @param compiler The Analog compiler plugin.
 */
export function analogHostHooks(compiler: Plugin | undefined): AnalogHostHooks | undefined {
  const hooks: unknown = compiler?.api?.ngDocHost;
  return hooks && typeof hooks === 'object' && typeof (hooks as AnalogHostHooks).passes === 'number'
    ? (hooks as AnalogHostHooks)
    : undefined;
}

interface ProbeAttempt {
  readonly id: number;
  traversed: boolean;
  emitted: boolean;
}

export interface AngularCompositionBridge {
  initialize(): Promise<void>;
  initialCompilationInventory?(): InitialCompilationInventory | undefined;
  start(file: string, read: () => string | Promise<string>): HostUpdateTicket;
  /** Other TypeScript outputs to compile in this ready ticket's pass (see compilerCompanions). */
  companions?(ticket: HostUpdateTicket): string[];
  /** A mark of the diagnostics recorded so far (see HostUpdateCoordinator.diagnosticMark). */
  diagnosticMark?(): number;
  /**
   * Whether the add or unlink event of `file` joins the pass of its generation (a generated output
   * or a watched description module).
   */
  claimsFilesystemChange?(file: string): boolean;
  acknowledge(
    ticket: HostUpdateTicket,
    resourceWitness: boolean,
    compilerPass?: boolean,
    recoverBefore?: number,
  ): Promise<void>;
  diagnostic(ticket: HostUpdateTicket, error: Error): void;
  committed(ticket: HostUpdateTicket): Promise<void>;
  settle(ticket: HostUpdateTicket): Promise<void>;
  fail(error: Error): void;
}

export interface AngularComposition {
  readonly plugins: Plugin[];
  attachServer(server: ViteDevServer): void;
  observeStartupUpdate(file: string, read: () => string | Promise<string>): void;
  preflight(): Promise<void>;
  dispose(): Promise<void>;
}

function error(code: string, message: string, cause?: unknown): Error {
  return Object.assign(
    new Error(`[${code}] ${message}`, cause === undefined ? undefined : { cause }),
    {
      code,
    },
  );
}

function handlerOf<Handler>(hook: Handler | HookObject<Handler>): Handler {
  return (typeof hook === 'function' ? hook : (hook as HookObject<Handler>).handler) as Handler;
}

function replaceHandler<Handler>(
  hook: Handler | HookObject<Handler>,
  handler: Handler,
): Handler | HookObject<Handler> {
  return typeof hook === 'function' ? handler : { ...hook, handler };
}

function emittedCode(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'code' in value && typeof value.code === 'string') {
    return value.code;
  }
  return undefined;
}

/**
 * The id Analog keys its per-file maps with: forward slashes, as Vite normalizes ids. A resolved
 * Windows path would miss them and compile a companion from stale bytes.
 */
export function analogFileId(file: string): string {
  return path.posix.normalize(file.replace(/\\/g, '/'));
}

function probeUrl(file: string): string {
  return `/@fs/${encodeURI(file.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

function normalizeTransformId(id: string): string {
  return path.resolve(id.replace(/\?.*$/, ''));
}

class CompilerAdmission {
  private locked = false;
  private waiters: Array<{
    resolve(release: () => void): void;
    reject(error: Error): void;
  }> = [];
  private terminal?: Error;
  private drainedResolve: (() => void) | undefined;
  private drained = Promise.resolve();

  acquire(): Promise<() => void> {
    if (this.terminal) return Promise.reject(this.terminal);
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.advance();
    });
  }

  poison(reason: unknown): Error {
    const failure =
      reason instanceof Error
        ? error(
            'NGDOC_VITE_ANGULAR_RESTART_REQUIRED',
            `Angular compiler admission failed; recreate Vite with a fresh Angular plugin instance. ${reason.message}`,
            reason,
          )
        : error(
            'NGDOC_VITE_ANGULAR_RESTART_REQUIRED',
            'Angular compiler admission failed; recreate Vite with a fresh Angular plugin instance.',
            reason,
          );
    this.terminal ??= failure;
    this.rejectWaiters();
    return this.terminal;
  }

  async dispose(): Promise<void> {
    this.terminal ??= error('NGDOC_VITE_DISPOSED', 'Angular compiler admission is disposed.');
    this.rejectWaiters();
    await this.drained;
  }

  private advance(): void {
    if (this.locked || this.terminal) return;
    const waiter = this.waiters.shift();
    if (!waiter) return;
    this.locked = true;
    this.drained = new Promise<void>((resolve) => {
      this.drainedResolve = resolve;
    });
    let released = false;
    waiter.resolve(() => {
      if (released) return;
      released = true;
      this.locked = false;
      this.drainedResolve?.();
      this.drainedResolve = undefined;
      this.advance();
    });
  }

  private rejectWaiters(): void {
    if (!this.terminal) return;
    for (const waiter of this.waiters.splice(0)) waiter.reject(this.terminal);
    if (!this.locked) this.drainedResolve?.();
  }
}

/** Owns the supported Analog compiler hooks while retaining the complete factory result. */
export function composeAngularPlugins(
  angularPlugins: readonly Plugin[],
  componentProbe: string,
  bridge: AngularCompositionBridge,
): AngularComposition {
  if (angularPlugins.some((plugin) => plugin.name === FAST_COMPILER_PLUGIN)) {
    throw error('NGDOC_VITE_ANGULAR_COMPOSITION', 'Analog fastCompile mode is unsupported.');
  }
  const compilerIndexes = angularPlugins.flatMap((plugin, index) =>
    plugin.name === COMPILER_PLUGIN ? [index] : [],
  );
  if (compilerIndexes.length !== 1) {
    throw error(
      'NGDOC_VITE_ANGULAR_COMPOSITION',
      `Expected exactly one ${COMPILER_PLUGIN} plugin; received ${compilerIndexes.length}.`,
    );
  }
  const compilerIndex = compilerIndexes[0]!;
  const compiler = angularPlugins[compilerIndex]!;
  if (!compiler.handleHotUpdate || !compiler.transform || !compiler.buildStart) {
    throw error(
      'NGDOC_VITE_ANGULAR_COMPOSITION',
      'The supported Analog compiler plugin must expose buildStart, handleHotUpdate and transform hooks.',
    );
  }

  const originalHot = handlerOf(
    compiler.handleHotUpdate as LegacyHotHandler | HookObject<LegacyHotHandler>,
  );
  const originalTransform = handlerOf(
    compiler.transform as TransformHandler | HookObject<TransformHandler>,
  );
  const originalBuildStart = handlerOf(
    compiler.buildStart as BuildStartHandler | HookObject<BuildStartHandler>,
  );
  const admission = new CompilerAdmission();
  let server: ViteDevServer | undefined;
  let buildStarted = false;
  let buildCompleted = false;
  let signalBuild!: () => void;
  const buildReturned = new Promise<void>((resolve) => {
    signalBuild = resolve;
  });
  let preflightPromise: Promise<void> | undefined;
  let canonicalProbe: string | undefined;
  let currentProbe: ProbeAttempt | undefined;
  let probeSequence = 0;
  let disposed = false;
  let startupOpen = true;
  const startupEvents = new WeakMap<
    () => string | Promise<string>,
    {
      path: string;
      version: string | undefined;
      sequence: number;
    }
  >();
  let initialInventory: InitialCompilationInventory | undefined;
  let startupSequence = 0;
  let captureSequence = 0;
  const initialStates = new Map<string, PhysicalState>();
  // Read once: a composition keeps one policy for its whole server lifetime.
  const sharedPasses = !flagOff(ANGULAR_SHARED_PASS_FLAG);
  /**
   * Physical states a successful shared pass compiled (its own file and its companions), by path.
   * They are kept until a pass fails: a watcher under load may report one write twice, or a
   * created output as changed, and every such report of the same bytes is covered.
   */
  const compiledStates = new Map<string, PhysicalState>();
  // A commit that creates or deletes generated modules also rewrites the module that imports
  // them (`routes.ts` for a page added, renamed or deleted), and that update takes the
  // generation's pass; a description module added or deleted starts such a generation. Analog
  // would compile the program once more on their add and unlink events, before that importer is
  // rewritten: the compiler claims them instead, so they join the generation's pass (see
  // `ViteAdapterLifecycle.hostClaimsFilesystemChange`). Read once, like the shared pass.
  const hooks = flagOff(ANGULAR_STRUCTURAL_PASS_FLAG) ? undefined : analogHostHooks(compiler);
  if (hooks)
    hooks.claimFilesystemChange = (file: string) =>
      !disposed && bridge.claimsFilesystemChange?.(file) === true;

  const captureInitialCompilation = async (): Promise<void> => {
    captureSequence = startupSequence;
    initialInventory = bridge.initialCompilationInventory?.();
    const files = initialInventory?.files ?? [];
    let cursor = 0;
    // Bound filesystem concurrency even for the full self-documenting application.
    await Promise.all(
      Array.from({ length: Math.min(16, files.length) }, async () => {
        while (cursor < files.length && !disposed) {
          const file = files[cursor++]!;
          const state = await observePhysicalState(file.path).catch(() => undefined);
          if (state?.digest === file.digest) initialStates.set(path.resolve(file.path), state);
        }
      }),
    );
  };

  const coveredByInitialCompilation = async (context: HmrContext): Promise<boolean> => {
    const event = startupEvents.get(context.read);
    startupEvents.delete(context.read);
    const file = path.resolve(context.file);
    const captured = initialStates.get(file);
    if (!event || event.path !== file || !captured || !initialInventory?.isCurrent()) return false;
    // Earlier events may describe a replaced version: the full pass started after that event.
    // Events admitted during capture/the pass need their exact version represented in the pass.
    if (event.sequence > captureSequence && event.version !== captured.version) return false;
    const current = await observePhysicalState(file).catch(() => undefined);
    return (
      !disposed &&
      initialInventory.isCurrent() &&
      current?.version === captured.version &&
      current.digest === captured.digest
    );
  };

  /**
   * Whether an earlier successful shared pass (one this file started or joined as a companion)
   * compiled its current bytes. The states were read before that pass started, and every version
   * change (a rewrite, a replacement, an A-B-A) moves the physical version, so equal state means
   * the current file is exactly what the pass read. Its own pass would recompile the same program.
   */
  const coveredByCompanionPass = async (context: HmrContext): Promise<boolean> => {
    const file = path.resolve(context.file);
    const covered = compiledStates.get(file);
    if (!covered) return false;
    const current = await observePhysicalState(file).catch(() => undefined);
    return !disposed && current?.version === covered.version && current.digest === covered.digest;
  };

  /**
   * Read before the pass starts: the pass reads these files later, never earlier. Keyed by the
   * resolved path, as hot updates are looked up.
   */
  const captureCompanions = async (files: readonly string[]) => {
    const observed: Array<readonly [string, PhysicalState | undefined]> = [];
    let cursor = 0;
    // The same bound as the initial inventory capture.
    await Promise.all(
      Array.from({ length: Math.min(16, files.length) }, async () => {
        while (cursor < files.length) {
          const file = path.resolve(files[cursor++]!);
          observed.push([file, await observePhysicalState(file).catch(() => undefined)]);
        }
      }),
    );
    const states = new Map<string, PhysicalState>();
    for (const [file, state] of observed.sort(([left], [right]) => (left < right ? -1 : 1))) {
      if (state?.digest !== undefined) states.set(file, state);
    }
    return states;
  };

  const runProbe = async (): Promise<void> => {
    if (disposed) throw error('NGDOC_VITE_DISPOSED', 'Angular composition is disposed.');
    if (!server) throw error('NGDOC_VITE_ANGULAR_PROBE', 'Vite development server is unavailable.');
    let physical: string;
    try {
      physical = canonicalProbe ?? (await realpath(componentProbe));
      canonicalProbe = physical;
      const file = await stat(physical);
      if (!file.isFile()) {
        throw new Error('path is not a regular file');
      }
      await readFile(physical, 'utf8');
    } catch (cause) {
      throw error(
        'NGDOC_VITE_ANGULAR_PROBE',
        `Unable to read angularComponentProbe ${componentProbe}.`,
        cause,
      );
    }
    const client = server.environments.client;
    await client.depsOptimizer?.init();
    if (disposed) throw error('NGDOC_VITE_DISPOSED', 'Angular composition is disposed.');
    const url = probeUrl(physical);
    const node = await client.moduleGraph.ensureEntryFromUrl(url);
    if (disposed) throw error('NGDOC_VITE_DISPOSED', 'Angular composition is disposed.');
    const attempt: ProbeAttempt = { id: ++probeSequence, traversed: false, emitted: false };
    currentProbe = attempt;
    try {
      client.moduleGraph.invalidateModule(node);
      if (disposed) throw error('NGDOC_VITE_DISPOSED', 'Angular composition is disposed.');
      const request = client.transformRequest(url);
      const result = await request;
      if (disposed) throw error('NGDOC_VITE_DISPOSED', 'Angular composition is disposed.');
      if (
        !attempt.traversed ||
        !attempt.emitted ||
        !result ||
        !ANGULAR_EMISSION.test(result.code)
      ) {
        throw error(
          'NGDOC_VITE_ANGULAR_PROBE',
          `Angular did not freshly compile the component probe ${physical}.`,
        );
      }
    } finally {
      if (currentProbe === attempt) currentProbe = undefined;
    }
  };

  const wrappedBuildStart: BuildStartHandler = async function (...args: unknown[]) {
    buildStarted = true;
    try {
      if (server) await captureInitialCompilation();
      if (disposed) throw error('NGDOC_VITE_DISPOSED', 'Angular composition is disposed.');
      const result = await Reflect.apply(originalBuildStart, this, args);
      buildCompleted = true;
      signalBuild();
      return result;
    } catch (cause) {
      signalBuild();
      throw admission.poison(cause);
    }
  };

  const wrappedTransform: TransformHandler = async function (
    code: string,
    id: string,
    ...rest: unknown[]
  ) {
    const candidate = currentProbe;
    const transformPath = normalizeTransformId(id);
    const transformIdentity = candidate
      ? await realpath(transformPath).catch(() => transformPath)
      : transformPath;
    const attempt = candidate && canonicalProbe === transformIdentity ? candidate : undefined;
    const result = await Reflect.apply(originalTransform, this, [code, id, ...rest]);
    if (attempt) {
      attempt.traversed = true;
      attempt.emitted = ANGULAR_EMISSION.test(emittedCode(result) ?? '');
    }
    return result;
  };

  const wrappedHot: LegacyHotHandler = async function (context: HmrContext) {
    await bridge.initialize();
    const ticket = bridge.start(context.file, context.read);
    if (globalStyleSheet(context)) {
      // Analog recompiles the importers of a changed style sheet, and a global sheet's only
      // importer is a virtual module (the application's browser entry), which is no compiler
      // input: the pass fails and poisons the compiler. No component uses the sheet, so the
      // compiler has nothing to do; Vite updates it, as a CSS module accepts its own updates.
      await bridge.acknowledge(ticket, false);
      await bridge.settle(ticket);
      return context.modules;
    }
    const compilerTrigger =
      COMPILER_TYPESCRIPT.test(context.file) || COMPILER_RESOURCE.test(context.file);
    if (!compilerTrigger) {
      const result = await Reflect.apply(originalHot, this, [context]);
      await bridge.acknowledge(ticket, false);
      await bridge.settle(ticket);
      return result;
    }
    await preflight();
    const resource = COMPILER_RESOURCE.test(context.file);
    if (resource) await bridge.committed(ticket);
    else await ticket.ready;
    const release = await admission.acquire();
    let result: unknown;
    try {
      if (
        !resource &&
        ((await coveredByInitialCompilation(context)) || (await coveredByCompanionPass(context)))
      ) {
        // A successful earlier pass (the initial full pass, or the pass this file joined as a
        // companion) already compiled these exact bytes. This is not a new compiler pass and must
        // never clear a later recoverable diagnostic.
        await bridge.acknowledge(ticket, false);
      } else {
        // Every Analog pass analyzes and type-checks the whole program, whatever changed. The
        // other TypeScript outputs of the same generation join this pass, so a title edit that
        // rewrites the page, routes and context modules costs one pass instead of one per file.
        const companions =
          sharedPasses && !resource
            ? await captureCompanions(bridge.companions?.(ticket) ?? [])
            : new Map<string, PhysicalState>();
        const hotContext: CompanionHmrContext =
          companions.size > 0
            ? { ...context, ngDocCompanionFiles: [...companions.keys()].map(analogFileId) }
            : context;
        // Read before the pass too: a confirmed pass compiled this file's bytes as well.
        const own =
          companions.size > 0
            ? await observePhysicalState(path.resolve(context.file)).catch(() => undefined)
            : undefined;
        // Admission serializes passes, so every diagnostic recorded now came from an earlier one.
        const mark = companions.size > 0 ? bridge.diagnosticMark?.() : undefined;
        result = await Reflect.apply(originalHot, this, [hotContext]);
        let recoverBefore: number | undefined;
        if (hotContext.ngDocCompanionPass) {
          await hotContext.ngDocCompanionPass;
          for (const [file, state] of companions) compiledStates.set(file, state);
          if (own?.digest !== undefined) compiledStates.set(path.resolve(context.file), own);
          // The pass read its companions afresh and checked the whole program, so it repairs
          // every earlier diagnostic, including those of hooks admitted after this one's token.
          recoverBefore = mark;
        }
        if (resource) await runProbe();
        if (recoverBefore === undefined) await bridge.acknowledge(ticket, resource, true);
        else await bridge.acknowledge(ticket, resource, true, recoverBefore);
      }
    } catch (cause) {
      // A failed pass may have left any file stale: companions compile on their own again.
      compiledStates.clear();
      if (
        cause instanceof Error &&
        'code' in cause &&
        cause.code === 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC'
      ) {
        bridge.diagnostic(ticket, cause);
        throw cause;
      }
      const failure = admission.poison(cause);
      bridge.fail(failure);
      throw cause;
    } finally {
      release();
    }
    await bridge.settle(ticket);
    return result;
  };

  const wrappedCompiler: Plugin = {
    ...compiler,
    buildStart: replaceHandler(
      compiler.buildStart as BuildStartHandler | HookObject<BuildStartHandler>,
      wrappedBuildStart,
    ) as Plugin['buildStart'],
    handleHotUpdate: replaceHandler(
      compiler.handleHotUpdate as LegacyHotHandler | HookObject<LegacyHotHandler>,
      wrappedHot,
    ) as Plugin['handleHotUpdate'],
    transform: replaceHandler(
      compiler.transform as TransformHandler | HookObject<TransformHandler>,
      wrappedTransform,
    ) as Plugin['transform'],
  };
  const plugins = angularPlugins.map((plugin, index) =>
    index === compilerIndex ? wrappedCompiler : plugin,
  );

  const preflight = (): Promise<void> => {
    if (preflightPromise) return preflightPromise;
    preflightPromise = (async () => {
      await buildReturned;
      if (!buildStarted || !buildCompleted) {
        throw error(
          'NGDOC_VITE_ANGULAR_STARTUP',
          'Angular buildStart must complete before the component probe.',
        );
      }
      try {
        await runProbe();
        startupOpen = false;
      } catch (cause) {
        if (disposed) throw cause;
        const failure = admission.poison(cause);
        bridge.fail(failure);
        throw failure;
      }
    })();
    return preflightPromise;
  };

  return {
    plugins,
    attachServer(value: ViteDevServer) {
      server = value;
    },
    observeStartupUpdate(file: string, read: () => string | Promise<string>) {
      if (!startupOpen || disposed || !COMPILER_TYPESCRIPT.test(file)) return;
      // Vite's public client and legacy contexts share this exact per-event read function.
      startupEvents.set(read, {
        path: path.resolve(file),
        version: observePhysicalVersion(file),
        sequence: ++startupSequence,
      });
    },
    preflight,
    async dispose() {
      disposed = true;
      startupOpen = false;
      if (hooks) hooks.claimFilesystemChange = undefined;
      initialStates.clear();
      compiledStates.clear();
      signalBuild();
      await Promise.allSettled([admission.dispose(), preflightPromise]);
    },
  };
}
