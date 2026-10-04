import type { HotPayload } from 'vite';
import {
  type ModuleRunnerTransportHandlers,
  createNodeImportMeta,
  ModuleRunner,
} from 'vite/module-runner';

import {
  type NgDocSsrRequest,
  type ParentToRendererMessage,
  type RendererToParentMessage,
  type SsrRenderLimits,
  isParentToRendererMessage,
  messageBytes,
  serializeError,
  SSR_RENDER_CONTROL_ID,
  SSR_RENDER_MAX_MESSAGE_BYTES,
  SSR_RENDER_PROTOCOL_VERSION,
  validateEntry,
  validateRequest,
} from './ssr-renderer-protocol';

export interface SsrRendererProcessPort {
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'disconnect', listener: () => void): unknown;
  send?(message: RendererToParentMessage, callback?: (error: Error | null) => void): boolean;
  disconnect?(): void;
}

interface RenderOperation {
  readonly controller: AbortController;
  readonly settlement: Promise<void>;
}

interface ControlModule {
  waitForNgDocSsrFence(sequence: number, signal?: AbortSignal): Promise<number>;
}

interface RenderModule {
  render?: (request: NgDocSsrRequest, options: { signal: AbortSignal }) => unknown;
}

function deadline<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    timer.unref();
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Runs only in the owned SSR child process. */
export function runSsrRendererRuntime(port: SsrRendererProcessPort): void {
  let epoch: string | undefined;
  let entry: string | undefined;
  let limits: SsrRenderLimits | undefined;
  let runner: ModuleRunner | undefined;
  let transportHandlers: ModuleRunnerTransportHandlers | undefined;
  let closingAdmission = false;
  let transportClosed = false;
  let fatal = false;
  let closing: Promise<void> | undefined;
  const renders = new Map<number, RenderOperation>();

  const send = (message: RendererToParentMessage): Promise<void> => {
    if (messageBytes(message) > (limits?.maxMessageBytes ?? SSR_RENDER_MAX_MESSAGE_BYTES)) {
      return Promise.reject(new Error('[NGDOC_SSR_RENDER_MESSAGE] Child response is oversized.'));
    }
    return new Promise<void>((resolve, reject) => {
      if (!port.send) {
        reject(new Error('[NGDOC_SSR_RENDER_IPC] Parent IPC channel is unavailable.'));
        return;
      }
      try {
        port.send(message, (error) => (error ? reject(error) : resolve()));
      } catch (error) {
        reject(error);
      }
    });
  };

  const tagged = <T extends Omit<RendererToParentMessage, 'version' | 'epoch'>>(
    message: T,
  ): RendererToParentMessage =>
    ({
      ...message,
      version: SSR_RENDER_PROTOCOL_VERSION,
      epoch: epoch ?? 'uninitialized',
    }) as never;

  const fail = (error: unknown): void => {
    if (transportClosed || fatal) return;
    fatal = true;
    const disconnect = (): void => {
      try {
        port.disconnect?.();
      } catch {
        // The original terminal error remains authoritative; the parent owns termination/join.
      }
    };
    void send(tagged({ type: 'fatal', error: serializeError(error) })).then(disconnect, disconnect);
  };

  const start = async (message: Extract<ParentToRendererMessage, { type: 'start' }>) => {
    if (runner || epoch) throw new Error('[NGDOC_SSR_RENDER_PROTOCOL] Duplicate start message.');
    validateEntry(message.entry);
    if (message.controlId !== SSR_RENDER_CONTROL_ID) {
      throw new Error('[NGDOC_SSR_RENDER_PROTOCOL] Unsupported control module ID.');
    }
    epoch = message.epoch;
    entry = message.entry;
    limits = message.limits;
    const transport = {
      connect(handlers: ModuleRunnerTransportHandlers) {
        transportHandlers = handlers;
      },
      disconnect() {
        transportHandlers = undefined;
      },
      send(payload: HotPayload) {
        return send(tagged({ type: 'transport', payload }));
      },
    };
    runner = new ModuleRunner({
      transport,
      hmr: true,
      createImportMeta: createNodeImportMeta,
      sourcemapInterceptor: 'node',
    });
    await deadline(
      runner.import<ControlModule>(message.controlId),
      limits.startupDeadlineMs,
      '[NGDOC_SSR_RENDER_STARTUP_TIMEOUT] Control module startup deadline exceeded.',
    );
    await send(tagged({ type: 'ready' }));
  };

  const render = (message: Extract<ParentToRendererMessage, { type: 'render' }>): void => {
    if (!runner || !entry || !limits) {
      throw new Error('[NGDOC_SSR_RENDER_PROTOCOL] Render received before startup.');
    }
    if (renders.has(message.id)) {
      throw new Error('[NGDOC_SSR_RENDER_PROTOCOL] Duplicate render request ID.');
    }
    validateRequest(message.request, limits.maxDepth);
    const controller = new AbortController();
    const settlement = (async () => {
      try {
        const module = await runner!.import<RenderModule>(entry!);
        if (controller.signal.aborted || closingAdmission) {
          throw controller.signal.reason ?? new Error('[NGDOC_SSR_RENDER_ABORTED] Render aborted.');
        }
        if (typeof module.render !== 'function') {
          throw new TypeError(
            `[NGDOC_SSR_RENDER_EXPORT] ${entry} must export a named render(request, { signal }) function.`,
          );
        }
        const result = await module.render(message.request, { signal: controller.signal });
        if (typeof result !== 'string') {
          throw new TypeError('[NGDOC_SSR_RENDER_RESULT] render() must resolve to an HTML string.');
        }
        await send(tagged({ type: 'rendered', id: message.id, html: result }));
      } catch (error) {
        await send(tagged({ type: 'render-error', id: message.id, error: serializeError(error) }));
      } finally {
        renders.delete(message.id);
      }
    })();
    // Keep the real settlement for close/join while ensuring an IPC failure cannot float.
    void settlement.catch(() => {});
    renders.set(message.id, { controller, settlement });
  };

  const fence = async (message: Extract<ParentToRendererMessage, { type: 'fence' }>) => {
    if (!runner || !limits) {
      throw new Error('[NGDOC_SSR_RENDER_PROTOCOL] Fence received before startup.');
    }
    try {
      const control = await runner.import<ControlModule>(SSR_RENDER_CONTROL_ID);
      const controller = new AbortController();
      const waiting = control.waitForNgDocSsrFence(message.sequence, controller.signal);
      void waiting.catch(() => {});
      try {
        await send(tagged({ type: 'fence-ready', id: message.id, sequence: message.sequence }));
        await deadline(
          waiting,
          limits.fenceDeadlineMs,
          `[NGDOC_SSR_RENDER_FENCE_TIMEOUT] Fence ${message.sequence} deadline exceeded.`,
        );
      } finally {
        controller.abort(new Error('Fence waiter settled.'));
      }
      await send(tagged({ type: 'fenced', id: message.id, sequence: message.sequence }));
    } catch (error) {
      await send(tagged({ type: 'fence-error', id: message.id, error: serializeError(error) }));
    }
  };

  const close = (): Promise<void> => {
    if (closing) return closing;
    closingAdmission = true;
    closing = (async () => {
      for (const operation of renders.values()) operation.controller.abort();
      await Promise.allSettled([...renders.values()].map(({ settlement }) => settlement));
      await runner?.close();
      await send(tagged({ type: 'closed' }));
      transportClosed = true;
      port.disconnect?.();
    })();
    return closing;
  };

  const receive = async (raw: unknown): Promise<void> => {
    if (transportClosed || fatal) return;
    if (messageBytes(raw) > (limits?.maxMessageBytes ?? SSR_RENDER_MAX_MESSAGE_BYTES)) {
      throw new Error('[NGDOC_SSR_RENDER_MESSAGE] Parent message is oversized.');
    }
    if (!isParentToRendererMessage(raw)) {
      throw new Error('[NGDOC_SSR_RENDER_PROTOCOL] Invalid parent message.');
    }
    if (epoch && raw.epoch !== epoch) return;
    if (!epoch && raw.type !== 'start') {
      throw new Error('[NGDOC_SSR_RENDER_PROTOCOL] First message must start the runtime.');
    }
    switch (raw.type) {
      case 'start':
        if (closingAdmission) return;
        await start(raw);
        return;
      case 'hot':
        transportHandlers?.onMessage(raw.payload);
        return;
      case 'render':
        if (closingAdmission) {
          await send(
            tagged({
              type: 'render-error',
              id: raw.id,
              error: serializeError(new Error('[NGDOC_SSR_RENDER_DISPOSED] Runtime is closing.')),
            }),
          );
          return;
        }
        render(raw);
        return;
      case 'cancel':
        renders.get(raw.id)?.controller.abort();
        return;
      case 'fence':
        if (closingAdmission) return;
        await fence(raw);
        return;
      case 'close':
        await close();
    }
  };

  port.on('message', (message) => {
    void receive(message).catch(fail);
  });
  port.on('disconnect', () => {
    if (!transportClosed) void close().catch(() => {});
  });
}
