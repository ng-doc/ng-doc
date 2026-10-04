import { type ChildProcess, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  type HotPayload,
  type Plugin,
  type ViteDevServer,
  createServerModuleRunnerTransport,
} from 'vite';

import { killWindowsProcessTree } from '../bootstrap/process-tree';
import { renderSsrControlModule } from './ssr-renderer-control';
import {
  type NgDocSsrRequest,
  type ParentToRendererMessage,
  type SsrRenderLimits,
  DEFAULT_SSR_RENDER_LIMITS,
  isRendererToParentMessage,
  messageBytes,
  reviveError,
  SSR_RENDER_CONTROL_EVENT,
  SSR_RENDER_CONTROL_ID,
  SSR_RENDER_MAX_MESSAGE_BYTES,
  SSR_RENDER_PROTOCOL_VERSION,
  validateEntry,
  validateRequest,
} from './ssr-renderer-protocol';

export type { NgDocSsrJsonValue, NgDocSsrRequest } from './ssr-renderer-protocol';

export interface NgDocViteSsrRenderer {
  render(request: NgDocSsrRequest, options?: { readonly signal?: AbortSignal }): Promise<string>;
  close(): Promise<void>;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface RenderJob {
  readonly id: number;
  readonly request: NgDocSsrRequest;
  readonly result: Deferred<string>;
  readonly signal?: AbortSignal;
  abort?: () => void;
  timer?: NodeJS.Timeout;
  settlementTimer?: NodeJS.Timeout;
  sent: boolean;
  callerSettled: boolean;
}

interface FenceJob {
  readonly sequence: number;
  readonly result: Deferred<void>;
  timer: NodeJS.Timeout;
}

interface ChildRuntime {
  readonly child: ChildProcess;
  readonly epoch: string;
  readonly exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  readonly ready: Deferred<void>;
  readonly closed: Deferred<void>;
}

export interface SsrRendererOwnerOptions {
  readonly limits?: SsrRenderLimits;
  readonly entryUrl?: URL;
  readonly epoch?: () => string;
  /** @internal Test port: the platform whose process supervision the owner uses. */
  readonly platform?: NodeJS.Platform;
  /** @internal Test port: ends a Windows process tree (`taskkill /T /F`). */
  readonly killTree?: (pid: number) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function timer(milliseconds: number, callback: () => void): NodeJS.Timeout {
  const value = setTimeout(callback, milliseconds);
  value.unref();
  return value;
}

function rendererError(code: string, message: string): Error {
  return new Error(`[${code}] ${message}`);
}

function mutatesModules(payload: HotPayload): boolean {
  return payload.type !== 'connected' && payload.type !== 'custom' && payload.type !== 'ping';
}

/** One process-isolated SSR renderer owned by one NgDoc Vite plugin. */
export class OwnedSsrRenderer implements NgDocViteSsrRenderer {
  private readonly limits: SsrRenderLimits;
  private readonly entryUrl: URL;
  private readonly createEpoch: () => string;
  /**
   * Windows has no process groups: the renderer is not detached (a detached child gets a console
   * of its own there) and is ended together with everything it started while it is alive.
   */
  private readonly windows: boolean;
  private readonly killTree: (pid: number) => void;
  private server?: ViteDevServer;
  private entry?: string;
  private runtime?: ChildRuntime;
  private serverTransport?: ReturnType<typeof createServerModuleRunnerTransport>;
  private starting?: Promise<ChildRuntime>;
  private terminating?: Promise<void>;
  private failure?: Error;
  private disposed = false;
  private disposal?: Promise<void>;
  private sequence = 0;
  private observedHotSequence = 0;
  private fencedHotSequence = 0;
  private fenceChain: Promise<void> = Promise.resolve();
  private readonly fences = new Map<number, FenceJob>();
  private readonly active = new Map<number, RenderJob>();
  private readonly queue: RenderJob[] = [];

  constructor(options: SsrRendererOwnerOptions = {}) {
    this.limits = options.limits ?? DEFAULT_SSR_RENDER_LIMITS;
    this.entryUrl = options.entryUrl ?? new URL('./ssr-renderer-entry.js', import.meta.url);
    this.createEpoch = options.epoch ?? randomUUID;
    this.windows = (options.platform ?? process.platform) === 'win32';
    this.killTree = options.killTree ?? ((pid) => void killWindowsProcessTree(pid));
  }

  select(entry: string): NgDocViteSsrRenderer {
    validateEntry(entry);
    if (this.entry && this.entry !== entry) {
      throw rendererError(
        'NGDOC_SSR_RENDER_ENTRY_CONFLICT',
        `This plugin already owns the SSR renderer entry ${this.entry}.`,
      );
    }
    this.entry = entry;
    return this;
  }

  attach(server: ViteDevServer): void {
    if (this.server && this.server !== server) {
      throw rendererError(
        'NGDOC_SSR_RENDER_SERVER',
        'An SSR renderer cannot be reattached to another Vite server.',
      );
    }
    this.server = server;
  }

  controlModule(id: string): string | undefined {
    if (id !== SSR_RENDER_CONTROL_ID) return undefined;
    const epoch = this.runtime?.epoch;
    if (!epoch) {
      throw rendererError(
        'NGDOC_SSR_RENDER_CONTROL',
        'The SSR control module was requested without an active renderer runtime.',
      );
    }
    return renderSsrControlModule(epoch);
  }

  render(
    request: NgDocSsrRequest,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<string> {
    if (this.disposed) {
      return Promise.reject(
        rendererError('NGDOC_SSR_RENDER_DISPOSED', 'SSR renderer is disposed.'),
      );
    }
    if (this.failure) return Promise.reject(this.failure);
    if (!this.entry) {
      return Promise.reject(
        rendererError('NGDOC_SSR_RENDER_ENTRY', 'Select a fixed SSR render entry first.'),
      );
    }
    try {
      validateRequest(request, this.limits.maxDepth);
      const snapshot = structuredClone(request);
      const envelope = {
        version: SSR_RENDER_PROTOCOL_VERSION,
        epoch: '0'.repeat(36),
        type: 'render',
        id: Number.MAX_SAFE_INTEGER,
        request: snapshot,
      };
      if (messageBytes(envelope) > this.limits.maxMessageBytes) {
        throw rendererError(
          'NGDOC_SSR_RENDER_MESSAGE',
          `Render request exceeds ${this.limits.maxMessageBytes} bytes.`,
        );
      }
      const signal = options.signal;
      if (signal?.aborted) {
        throw signal.reason ?? rendererError('NGDOC_SSR_RENDER_ABORTED', 'Render aborted.');
      }
      if (!this.server) {
        throw rendererError(
          'NGDOC_SSR_RENDER_ADMISSION',
          'SSR renderer requires a ready Vite server.',
        );
      }
      if (this.active.size + this.queue.length >= this.limits.maxActive + this.limits.maxQueued) {
        throw rendererError('NGDOC_SSR_RENDER_QUEUE_FULL', 'SSR render queue is full.');
      }
      const job: RenderJob = {
        id: ++this.sequence,
        request: snapshot,
        result: deferred<string>(),
        ...(signal ? { signal } : {}),
        sent: false,
        callerSettled: false,
      };
      job.abort = () => this.abort(job, signal?.reason);
      signal?.addEventListener('abort', job.abort, { once: true });
      this.queue.push(job);
      this.pump();
      return job.result.promise;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  close(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.closeOwnedRuntime();
    return this.disposal;
  }

  private pump(): void {
    while (!this.disposed && !this.failure && this.active.size < this.limits.maxActive) {
      const job = this.queue.shift();
      if (!job) return;
      this.active.set(job.id, job);
      void this.start(job);
    }
  }

  private async start(job: RenderJob): Promise<void> {
    try {
      const runtime = await this.ensureRuntime();
      try {
        await this.ensureFenced(runtime);
      } catch (error) {
        this.fail(error);
        throw error;
      }
      if (job.callerSettled || this.disposed) {
        this.finish(job);
        return;
      }
      job.sent = true;
      this.send({
        type: 'render',
        version: SSR_RENDER_PROTOCOL_VERSION,
        epoch: runtime.epoch,
        id: job.id,
        request: job.request,
      });
      job.timer = timer(this.limits.requestDeadlineMs, () => {
        this.abort(
          job,
          rendererError('NGDOC_SSR_RENDER_TIMEOUT', 'SSR render request deadline exceeded.'),
        );
      });
    } catch (error) {
      if (!job.callerSettled) {
        job.callerSettled = true;
        job.result.reject(error);
      }
      this.finish(job);
    }
  }

  private abort(job: RenderJob, reason?: unknown): void {
    if (job.callerSettled) return;
    job.callerSettled = true;
    job.result.reject(
      reason ?? rendererError('NGDOC_SSR_RENDER_ABORTED', 'SSR render request was aborted.'),
    );
    if (!job.sent) {
      const queued = this.queue.indexOf(job);
      if (queued >= 0) this.queue.splice(queued, 1);
      if (this.active.has(job.id)) this.finish(job);
      return;
    }
    const runtime = this.runtime;
    if (runtime) {
      try {
        this.send({
          type: 'cancel',
          version: SSR_RENDER_PROTOCOL_VERSION,
          epoch: runtime.epoch,
          id: job.id,
        });
      } catch (error) {
        this.fail(error);
      }
    }
    job.settlementTimer ??= timer(this.limits.closeDeadlineMs, () => {
      this.fail(
        rendererError(
          'NGDOC_SSR_RENDER_CANCEL_TIMEOUT',
          `Cancelled render ${job.id} did not settle; the owned runtime was terminated.`,
        ),
      );
    });
  }

  private finish(job: RenderJob): void {
    clearTimeout(job.timer);
    clearTimeout(job.settlementTimer);
    job.signal?.removeEventListener('abort', job.abort!);
    this.active.delete(job.id);
    this.pump();
  }

  private ensureRuntime(): Promise<ChildRuntime> {
    if (this.starting) return this.starting;
    if (this.runtime) return Promise.resolve(this.runtime);
    if (this.failure) return Promise.reject(this.failure);
    if (this.disposed) {
      return Promise.reject(
        rendererError('NGDOC_SSR_RENDER_DISPOSED', 'SSR renderer is disposed.'),
      );
    }
    const server = this.server!;
    const environment = server.environments.ssr;
    if (!environment || server.config.server.hmr === false) {
      return Promise.reject(
        rendererError(
          'NGDOC_SSR_RENDER_HMR_ENVIRONMENT',
          'Configure an SSR environment with the public Vite HMR channel.',
        ),
      );
    }
    const epoch = this.createEpoch();
    const ready = deferred<void>();
    const closed = deferred<void>();
    let child: ChildProcess;
    try {
      child = fork(fileURLToPath(this.entryUrl), [], {
        detached: !this.windows,
        env: process.env,
        execArgv: [],
        serialization: 'advanced',
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
    } catch (error) {
      return Promise.reject(error);
    }
    const exited = deferred<{ code: number | null; signal: NodeJS.Signals | null }>();
    const exit = exited.promise;
    child.once('exit', (code, signal) => exited.resolve({ code, signal }));
    const runtime: ChildRuntime = { child, epoch, exit, ready, closed };
    child.on('message', (message) => {
      try {
        this.receive(runtime, message);
      } catch (error) {
        this.fail(error);
      }
    });
    child.once('error', (error) => {
      if (!child.pid) exited.resolve({ code: null, signal: null });
      this.fail(error);
    });
    child.once('disconnect', () => {
      if (!this.disposed && !this.failure) {
        this.fail(rendererError('NGDOC_SSR_RENDER_IPC', 'SSR renderer IPC disconnected.'));
      }
    });
    void exit.then(({ code, signal }) => {
      if (!this.disposed && !this.failure) {
        this.fail(
          rendererError(
            'NGDOC_SSR_RENDER_EXIT',
            `SSR renderer exited unexpectedly (code=${String(code)}, signal=${String(signal)}).`,
          ),
        );
      }
    });
    const startupTimer = timer(this.limits.startupDeadlineMs, () => {
      ready.reject(
        rendererError(
          'NGDOC_SSR_RENDER_STARTUP_TIMEOUT',
          'SSR renderer startup deadline exceeded.',
        ),
      );
      this.fail(rendererError('NGDOC_SSR_RENDER_STARTUP_TIMEOUT', 'SSR renderer startup failed.'));
    });
    this.runtime = runtime;
    this.starting = ready.promise
      .then(() => runtime)
      .finally(() => {
        clearTimeout(startupTimer);
        this.starting = undefined;
      });
    try {
      this.serverTransport = createServerModuleRunnerTransport({ channel: environment.hot });
      // Start is the child's first frame. Vite transport.connect synchronously emits `connected`.
      this.send({
        type: 'start',
        version: SSR_RENDER_PROTOCOL_VERSION,
        epoch,
        entry: this.entry!,
        controlId: SSR_RENDER_CONTROL_ID,
        limits: this.limits,
      });
      this.serverTransport.connect?.({
        onMessage: (payload) => {
          if (mutatesModules(payload)) this.observedHotSequence++;
          try {
            this.send({
              type: 'hot',
              version: SSR_RENDER_PROTOCOL_VERSION,
              epoch,
              payload,
            });
          } catch (error) {
            this.fail(error);
          }
        },
        onDisconnection: () =>
          this.fail(
            rendererError('NGDOC_SSR_RENDER_TRANSPORT', 'Vite SSR HMR transport disconnected.'),
          ),
      });
    } catch (error) {
      clearTimeout(startupTimer);
      this.failure = error instanceof Error ? error : new Error(String(error));
      ready.reject(this.failure);
      void this.terminateRuntime().catch(() => {});
      return this.starting;
    }
    return this.starting;
  }

  private ensureFenced(runtime: ChildRuntime): Promise<void> {
    this.fenceChain = this.fenceChain
      .catch(() => {})
      .then(async () => {
        if (this.disposed) {
          throw rendererError('NGDOC_SSR_RENDER_DISPOSED', 'SSR renderer is disposed.');
        }
        if (this.failure) throw this.failure;
        if (runtime !== this.runtime) {
          throw rendererError('NGDOC_SSR_RENDER_EPOCH', 'SSR renderer runtime was superseded.');
        }
        const sequence = this.observedHotSequence;
        if (sequence <= this.fencedHotSequence) return;
        const id = ++this.sequence;
        const result = deferred<void>();
        const fence: FenceJob = {
          sequence,
          result,
          timer: timer(this.limits.fenceDeadlineMs, () => {
            result.reject(
              rendererError(
                'NGDOC_SSR_RENDER_FENCE_TIMEOUT',
                `Fence ${sequence} deadline exceeded.`,
              ),
            );
          }),
        };
        this.fences.set(id, fence);
        const settlement = result.promise.finally(() => {
          clearTimeout(fence.timer);
          this.fences.delete(id);
        });
        void settlement.catch(() => {});
        try {
          this.send({
            type: 'fence',
            version: SSR_RENDER_PROTOCOL_VERSION,
            epoch: runtime.epoch,
            id,
            sequence,
          });
        } catch (error) {
          result.reject(error);
        }
        await settlement;
        this.fencedHotSequence = Math.max(this.fencedHotSequence, sequence);
      });
    return this.fenceChain;
  }

  private receive(runtime: ChildRuntime, raw: unknown): void {
    if (runtime !== this.runtime) return;
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'epoch' in raw &&
      typeof raw.epoch === 'string' &&
      raw.epoch !== runtime.epoch
    ) {
      return;
    }
    if (messageBytes(raw) > this.limits.maxMessageBytes || !isRendererToParentMessage(raw)) {
      throw rendererError(
        'NGDOC_SSR_RENDER_PROTOCOL',
        'Child sent an invalid or oversized current-epoch message.',
      );
    }
    if (raw.epoch !== runtime.epoch) return;
    switch (raw.type) {
      case 'ready':
        runtime.ready.resolve(undefined);
        return;
      case 'transport':
        try {
          void Promise.resolve(this.serverTransport?.send?.(raw.payload)).catch((error) =>
            this.fail(error),
          );
        } catch (error) {
          this.fail(error);
        }
        return;
      case 'fence-ready': {
        const fence = this.fences.get(raw.id);
        if (!fence || fence.sequence !== raw.sequence) return;
        try {
          this.server!.environments.ssr.hot.send({
            type: 'custom',
            event: SSR_RENDER_CONTROL_EVENT,
            data: {
              version: SSR_RENDER_PROTOCOL_VERSION,
              epoch: runtime.epoch,
              sequence: raw.sequence,
            },
          });
        } catch (error) {
          fence.result.reject(error);
          this.fail(error);
        }
        return;
      }
      case 'fenced': {
        const fence = this.fences.get(raw.id);
        if (fence?.sequence === raw.sequence) fence.result.resolve(undefined);
        return;
      }
      case 'fence-error':
        this.fences.get(raw.id)?.result.reject(reviveError(raw.error, 'NGDOC_SSR_RENDER_FENCE'));
        return;
      case 'rendered':
      case 'render-error': {
        const job = this.active.get(raw.id);
        if (!job) return;
        if (!job.callerSettled) {
          job.callerSettled = true;
          if (raw.type === 'rendered') job.result.resolve(raw.html);
          else job.result.reject(reviveError(raw.error));
        }
        this.finish(job);
        return;
      }
      case 'closed':
        runtime.closed.resolve(undefined);
        return;
      case 'fatal':
        this.fail(reviveError(raw.error, 'NGDOC_SSR_RENDER_CHILD'));
    }
  }

  private send(message: ParentToRendererMessage): void {
    if (messageBytes(message) > (this.limits?.maxMessageBytes ?? SSR_RENDER_MAX_MESSAGE_BYTES)) {
      throw rendererError('NGDOC_SSR_RENDER_MESSAGE', 'Parent message is oversized.');
    }
    const child = this.runtime?.child;
    if (!child?.connected || !child.send(message, (error) => error && this.fail(error))) {
      if (!child?.connected) {
        throw rendererError('NGDOC_SSR_RENDER_IPC', 'SSR renderer IPC channel is unavailable.');
      }
    }
  }

  private fail(error: unknown): void {
    if (this.failure || this.disposed) return;
    this.failure =
      error instanceof Error ? error : rendererError('NGDOC_SSR_RENDER_FAILURE', String(error));
    this.runtime?.ready.reject(this.failure);
    for (const fence of this.fences.values()) fence.result.reject(this.failure);
    for (const job of this.queue.splice(0)) {
      if (!job.callerSettled) job.result.reject(this.failure);
      job.callerSettled = true;
      job.signal?.removeEventListener('abort', job.abort!);
    }
    for (const job of this.active.values()) {
      if (!job.callerSettled) job.result.reject(this.failure);
      job.callerSettled = true;
    }
    void this.terminateRuntime().catch(() => {});
  }

  private async closeOwnedRuntime(): Promise<void> {
    const closingError = rendererError('NGDOC_SSR_RENDER_DISPOSED', 'SSR renderer is disposed.');
    for (const fence of this.fences.values()) fence.result.reject(closingError);
    for (const job of this.queue.splice(0)) {
      if (!job.callerSettled) job.result.reject(closingError);
      job.callerSettled = true;
      job.signal?.removeEventListener('abort', job.abort!);
    }
    for (const job of this.active.values()) this.abort(job, closingError);
    const runtime = this.runtime;
    if (this.failure) {
      await this.terminateRuntime();
      throw this.failure;
    }
    if (!runtime) {
      await this.terminating;
      if (this.failure) throw this.failure;
      return;
    }
    let forcedFailure: Error | undefined;
    try {
      this.send({
        type: 'close',
        version: SSR_RENDER_PROTOCOL_VERSION,
        epoch: runtime.epoch,
      });
      const gracefulResult = await Promise.race([
        Promise.all([runtime.closed.promise, runtime.exit]).then(([, exit]) => ({ exit })),
        new Promise<false>((resolve) => timer(this.limits.closeDeadlineMs, () => resolve(false))),
      ]);
      const groupGone =
        gracefulResult === false
          ? false
          : await this.waitForGroupExit(runtime.child, this.limits.closeDeadlineMs);
      if (
        gracefulResult === false ||
        gracefulResult.exit.code !== 0 ||
        gracefulResult.exit.signal !== null ||
        !groupGone
      ) {
        forcedFailure = rendererError(
          'NGDOC_SSR_RENDER_FORCED_CLOSE',
          gracefulResult !== false &&
            (gracefulResult.exit.code !== 0 || gracefulResult.exit.signal !== null)
            ? `SSR renderer acknowledged close but exited unsuccessfully (code=${String(gracefulResult.exit.code)}, signal=${String(gracefulResult.exit.signal)}).`
            : 'SSR renderer did not close and join within its graceful deadline.',
        );
      }
    } finally {
      await this.terminateRuntime();
    }
    if (forcedFailure) throw forcedFailure;
    if (this.failure) throw this.failure;
  }

  private terminateRuntime(): Promise<void> {
    if (this.terminating) return this.terminating;
    const runtime = this.runtime;
    if (!runtime) return Promise.resolve();
    this.terminating = (async () => {
      let cleanupError: unknown;
      try {
        await this.serverTransport?.disconnect?.();
      } catch (error) {
        cleanupError = error;
      }
      this.serverTransport = undefined;
      const child = runtime.child;
      try {
        if (child.exitCode === null || this.groupAlive(child)) {
          this.kill(child, 'SIGTERM');
          await Promise.all([
            Promise.race([
              runtime.exit.then(() => undefined),
              new Promise<void>((resolve) => timer(this.limits.closeDeadlineMs, resolve)),
            ]),
            this.waitForGroupExit(child, this.limits.closeDeadlineMs),
          ]);
        }
        if (child.exitCode === null || this.groupAlive(child)) this.kill(child, 'SIGKILL');
        await runtime.exit;
        if (!(await this.waitForGroupExit(child, this.limits.closeDeadlineMs))) {
          cleanupError ??= rendererError(
            'NGDOC_SSR_RENDER_DESCENDANTS',
            'SSR renderer exited but left an owned process-group descendant.',
          );
        }
      } catch (error) {
        cleanupError ??= error;
      } finally {
        runtime.ready.reject(
          this.failure ?? rendererError('NGDOC_SSR_RENDER_DISPOSED', 'SSR renderer stopped.'),
        );
        if (this.runtime === runtime) this.runtime = undefined;
        for (const job of [...this.active.values()]) this.finish(job);
      }
      if (cleanupError) throw cleanupError;
    })().finally(() => {
      this.terminating = undefined;
    });
    return this.terminating;
  }

  private kill(child: ChildProcess, signal: NodeJS.Signals): void {
    if (!child.pid) return;
    if (this.windows) {
      // No catchable SIGTERM and no group: end the tree while the renderer still links it, then
      // (on the second call) the renderer itself, in case taskkill could not. Once our child has
      // exited its pid may belong to another process, so nothing is killed by pid any more.
      if (!this.running(child)) return;
      if (signal === 'SIGKILL') child.kill('SIGKILL');
      else this.killTree(child.pid);
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      // ESRCH: the group is gone. EPERM: macOS answers it for a group whose members have all
      // exited but are not reaped yet (the renderer before Node reaps it), so nothing is left to
      // signal; `groupAlive` keeps such a group present until it is reaped.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH' && code !== 'EPERM') throw error;
    }
  }

  /** Our child itself, as Node tracks it: never a probe of a pid that may have been reused. */
  private running(child: ChildProcess): boolean {
    return child.exitCode === null && child.signalCode === null;
  }

  private groupAlive(child: ChildProcess): boolean {
    if (!child.pid) return false;
    // On Windows only the renderer itself, by its exit status: a descendant it left behind after
    // exiting is no longer linked to it, and a probe of its pid could see another process.
    if (this.windows) return this.running(child);
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') return false;
      // macOS: every member exited, and one is not reaped yet. It counts as present, so a join
      // waits (bounded by its deadline) until it is reaped rather than failing on the probe.
      if (code === 'EPERM') return true;
      throw error;
    }
  }

  private async waitForGroupExit(child: ChildProcess, milliseconds: number): Promise<boolean> {
    const deadline = Date.now() + milliseconds;
    while (this.groupAlive(child) && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    return !this.groupAlive(child);
  }
}

interface RendererPluginApi {
  readonly schemaVersion: 1;
  select(entry: string): NgDocViteSsrRenderer;
}

/** Pass the complete array returned by one createNgDocVitePlugin call. */
export function getNgDocViteSsrRenderer(
  plugins: readonly Plugin[],
  options: { readonly entry: string },
): NgDocViteSsrRenderer {
  const matches = plugins.filter(
    (plugin) => plugin.name === '@ng-doc/vite' && plugin.api?.ngDocSsrRenderer?.schemaVersion === 1,
  );
  const capability = matches[0]?.api.ngDocSsrRenderer as RendererPluginApi | undefined;
  if (matches.length !== 1 || typeof capability?.select !== 'function') {
    throw rendererError('NGDOC_SSR_RENDER_PLUGIN', 'Expected exactly one NgDoc SSR renderer.');
  }
  return capability.select(options.entry);
}
