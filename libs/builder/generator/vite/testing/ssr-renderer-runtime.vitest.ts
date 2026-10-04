import type { HotPayload } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererToParentMessage } from '../ssr-renderer-protocol';

const runnerMock = vi.hoisted(() => ({
  close: vi.fn(async () => {}),
  handlers: undefined as
    | { onMessage(payload: HotPayload): void; onDisconnection(): void }
    | undefined,
  importer: vi.fn<(id: string) => Promise<Record<string, unknown>>>(),
  sent: vi.fn(),
}));

vi.mock('vite/module-runner', () => ({
  createNodeImportMeta: vi.fn(),
  ModuleRunner: class {
    constructor(options: {
      transport: {
        connect(handlers: { onMessage(payload: HotPayload): void; onDisconnection(): void }): void;
        send(payload: HotPayload): Promise<void>;
      };
    }) {
      options.transport.connect({
        onMessage: (payload) => runnerMock.handlers?.onMessage(payload),
        onDisconnection: () => runnerMock.handlers?.onDisconnection(),
      });
      runnerMock.sent.mockImplementation((payload) => options.transport.send(payload));
    }
    import(id: string) {
      return runnerMock.importer(id);
    }
    close() {
      return runnerMock.close();
    }
  },
}));

import {
  DEFAULT_SSR_RENDER_LIMITS,
  SSR_RENDER_CONTROL_ID,
  SSR_RENDER_PROTOCOL_VERSION,
} from '../ssr-renderer-protocol';
import { type SsrRendererProcessPort, runSsrRendererRuntime } from '../ssr-renderer-runtime';

class TestPort implements SsrRendererProcessPort {
  readonly messages: RendererToParentMessage[] = [];
  disconnected = false;
  failNextSend = false;
  throwNextSend = false;
  throwDisconnect = false;
  private message?: (message: unknown) => void;
  private disconnectListener?: () => void;

  on(event: 'message' | 'disconnect', listener: ((message: unknown) => void) | (() => void)) {
    if (event === 'message') this.message = listener as (message: unknown) => void;
    else this.disconnectListener = listener as () => void;
  }

  send(message: RendererToParentMessage, callback?: (error: Error | null) => void): boolean {
    if (this.throwNextSend) {
      this.throwNextSend = false;
      throw new Error('injected synchronous IPC failure');
    }
    if (this.failNextSend) {
      this.failNextSend = false;
      queueMicrotask(() => callback?.(new Error('injected IPC send failure')));
      return true;
    }
    this.messages.push(message);
    queueMicrotask(() => callback?.(null));
    return true;
  }

  emit(message: unknown): void {
    this.message?.(message);
  }

  disconnectNow(): void {
    this.disconnectListener?.();
  }

  disconnect(): void {
    if (this.throwDisconnect) throw new Error('injected disconnect failure');
    this.disconnected = true;
  }
}

const epoch = 'runtime-epoch';
const tagged = <T extends Record<string, unknown>>(message: T) => ({
  version: SSR_RENDER_PROTOCOL_VERSION,
  epoch,
  ...message,
});

const start = (port: TestPort, limits = DEFAULT_SSR_RENDER_LIMITS) => {
  port.emit(
    tagged({
      type: 'start',
      entry: '/entry.mjs',
      controlId: SSR_RENDER_CONTROL_ID,
      limits,
    }),
  );
};

beforeEach(() => {
  runnerMock.close.mockClear();
  runnerMock.importer.mockReset();
  runnerMock.sent.mockReset();
  runnerMock.handlers = {
    onMessage: vi.fn(),
    onDisconnection: vi.fn(),
  };
});

describe('SSR renderer child runtime', () => {
  it('starts, relays HMR, renders, fences and closes without blocking transport messages', async () => {
    let fenceResolve!: (value: number) => void;
    runnerMock.importer.mockImplementation(async (id) =>
      id === SSR_RENDER_CONTROL_ID
        ? {
            waitForNgDocSsrFence: () =>
              new Promise<number>((resolve) => {
                fenceResolve = resolve;
              }),
          }
        : {
            render: async (request: { url: string }) => `<p>${request.url}</p>`,
          },
    );
    const port = new TestPort();
    runSsrRendererRuntime(port);
    start(port);
    await vi.waitFor(() => expect(port.messages.some(({ type }) => type === 'ready')).toBe(true));

    port.emit(tagged({ type: 'hot', payload: { type: 'connected' } }));
    port.emit(tagged({ type: 'hot', payload: { type: 'ping' } }));
    port.emit(tagged({ type: 'hot', payload: { type: 'custom', event: 'optional-data' } }));
    await vi.waitFor(() => expect(runnerMock.handlers?.onMessage).toHaveBeenCalledTimes(3));
    port.emit(
      tagged({
        type: 'render',
        id: 1,
        request: { document: '<app></app>', url: 'http://localhost/one' },
      }),
    );
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({ type: 'rendered', id: 1, html: '<p>http://localhost/one</p>' }),
      ),
    );

    port.emit(tagged({ type: 'fence', id: 2, sequence: 7 }));
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({ type: 'fence-ready', id: 2, sequence: 7 }),
      ),
    );
    fenceResolve(7);
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({ type: 'fenced', id: 2, sequence: 7 }),
      ),
    );
    port.emit(tagged({ type: 'close' }));
    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(runnerMock.close).toHaveBeenCalledOnce();
  });

  it('reports render failures and never invokes an export after cancellation during import', async () => {
    let resolveImport!: (module: Record<string, unknown>) => void;
    const render = vi.fn(async () => '<p>stale</p>');
    runnerMock.importer
      .mockResolvedValueOnce({ waitForNgDocSsrFence: async () => 0 })
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>((resolve) => {
            resolveImport = resolve;
          }),
      )
      .mockResolvedValueOnce({ render: async () => 42 });
    const port = new TestPort();
    runSsrRendererRuntime(port);
    start(port);
    await vi.waitFor(() => expect(port.messages.some(({ type }) => type === 'ready')).toBe(true));
    port.emit(
      tagged({
        type: 'render',
        id: 3,
        request: { document: '', url: 'http://localhost/cancelled' },
      }),
    );
    port.emit(tagged({ type: 'cancel', id: 3 }));
    resolveImport({ render });
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({ type: 'render-error', id: 3 }),
      ),
    );
    expect(render).not.toHaveBeenCalled();

    port.emit(
      tagged({
        type: 'render',
        id: 4,
        request: { document: '', url: 'http://localhost/not-string' },
      }),
    );
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({ type: 'render-error', id: 4 }),
      ),
    );
    port.emit(tagged({ type: 'close' }));
    await vi.waitFor(() => expect(port.disconnected).toBe(true));
  });

  it('cancels a control waiter when fence-ready IPC fails and returns a bounded fence error', async () => {
    let aborted = false;
    runnerMock.importer.mockResolvedValue({
      waitForNgDocSsrFence: (_sequence: number, signal: AbortSignal) =>
        new Promise<number>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    });
    const port = new TestPort();
    runSsrRendererRuntime(port);
    start(port);
    await vi.waitFor(() => expect(port.messages.some(({ type }) => type === 'ready')).toBe(true));
    port.failNextSend = true;
    port.emit(tagged({ type: 'fence', id: 5, sequence: 1 }));
    await vi.waitFor(() => expect(aborted).toBe(true));
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(expect.objectContaining({ type: 'fence-error', id: 5 })),
    );
  });

  it('fails closed on a malformed current-epoch message and disconnects after reporting', async () => {
    const port = new TestPort();
    runSsrRendererRuntime(port);
    port.emit(tagged({ type: 'render', id: -1, request: {} }));
    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(port.messages).toContainEqual(expect.objectContaining({ type: 'fatal' }));
  });

  it('times out startup, rejects duplicate starts and unsupported control IDs', async () => {
    runnerMock.importer.mockImplementation(() => new Promise(() => {}));
    const timeout = new TestPort();
    runSsrRendererRuntime(timeout);
    start(timeout, { ...DEFAULT_SSR_RENDER_LIMITS, startupDeadlineMs: 10 });
    await vi.waitFor(() => expect(timeout.disconnected).toBe(true));
    expect(timeout.messages).toContainEqual(expect.objectContaining({ type: 'fatal' }));

    runnerMock.importer.mockResolvedValue({ waitForNgDocSsrFence: async () => 0 });
    const duplicate = new TestPort();
    runSsrRendererRuntime(duplicate);
    start(duplicate);
    await vi.waitFor(() =>
      expect(duplicate.messages.some(({ type }) => type === 'ready')).toBe(true),
    );
    start(duplicate);
    await vi.waitFor(() => expect(duplicate.disconnected).toBe(true));

    const unsupported = new TestPort();
    runSsrRendererRuntime(unsupported);
    unsupported.emit(
      tagged({
        type: 'start',
        entry: '/entry.mjs',
        controlId: '/unsupported',
        limits: DEFAULT_SSR_RENDER_LIMITS,
      }),
    );
    await vi.waitFor(() => expect(unsupported.disconnected).toBe(true));
  });

  it('keeps hot invoke replies live and rejects missing exports and duplicate render IDs', async () => {
    let release!: () => void;
    runnerMock.importer
      .mockResolvedValueOnce({ waitForNgDocSsrFence: async () => 0 })
      .mockResolvedValueOnce({})
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>((resolve) => {
            release = () => resolve({ render: async () => '<p>ok</p>' });
          }),
      );
    const port = new TestPort();
    runSsrRendererRuntime(port);
    start(port);
    await vi.waitFor(() => expect(port.messages.some(({ type }) => type === 'ready')).toBe(true));
    await runnerMock.sent({ type: 'custom', event: 'vite:invoke', data: { id: 'send:1' } });
    await runnerMock.sent({ type: 'custom', event: 'optional-data' });
    expect(port.messages).toContainEqual(
      expect.objectContaining({
        type: 'transport',
        payload: expect.objectContaining({ event: 'vite:invoke' }),
      }),
    );
    expect(port.messages).toContainEqual(
      expect.objectContaining({
        type: 'transport',
        payload: { type: 'custom', event: 'optional-data' },
      }),
    );
    port.emit(
      tagged({
        type: 'render',
        id: 10,
        request: { document: '', url: 'http://localhost/missing' },
      }),
    );
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({ type: 'render-error', id: 10 }),
      ),
    );
    port.emit(
      tagged({ type: 'render', id: 11, request: { document: '', url: 'http://localhost/held' } }),
    );
    port.emit(
      tagged({
        type: 'render',
        id: 11,
        request: { document: '', url: 'http://localhost/duplicate' },
      }),
    );
    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    release();
  });

  it('keeps HMR available while close aborts work and rejects late renders', async () => {
    runnerMock.importer
      .mockResolvedValueOnce({ waitForNgDocSsrFence: async () => 0 })
      .mockResolvedValueOnce({
        render: (_request: unknown, { signal }: { signal: AbortSignal }) =>
          new Promise<string>((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
          ),
      });
    const port = new TestPort();
    runSsrRendererRuntime(port);
    start(port);
    await vi.waitFor(() => expect(port.messages.some(({ type }) => type === 'ready')).toBe(true));
    port.emit(
      tagged({ type: 'render', id: 12, request: { document: '', url: 'http://localhost/held' } }),
    );
    port.emit(tagged({ type: 'close' }));
    port.emit(tagged({ type: 'hot', payload: { type: 'connected' } }));
    port.emit(
      tagged({ type: 'render', id: 13, request: { document: '', url: 'http://localhost/late' } }),
    );
    await vi.waitFor(() => expect(port.disconnected).toBe(true));
    expect(port.messages).toContainEqual(expect.objectContaining({ type: 'render-error', id: 13 }));
    port.disconnectNow();
  });

  it('contains missing and synchronously throwing IPC reporters without a floating rejection', async () => {
    let listener!: (message: unknown) => void;
    let disconnected = false;
    runSsrRendererRuntime({
      on(event: 'message' | 'disconnect', next: ((message: unknown) => void) | (() => void)) {
        if (event === 'message') listener = next as (message: unknown) => void;
      },
      disconnect() {
        disconnected = true;
      },
    });
    listener(tagged({ type: 'render', id: -1, request: {} }));
    await vi.waitFor(() => expect(disconnected).toBe(true));

    runnerMock.importer.mockResolvedValue({ waitForNgDocSsrFence: async () => 0 });
    const throwing = new TestPort();
    runSsrRendererRuntime(throwing);
    throwing.throwNextSend = true;
    throwing.throwDisconnect = true;
    start(throwing);
    await vi.waitFor(() => expect(throwing.throwNextSend).toBe(false));
    throwing.emit(tagged({ type: 'close' }));
    await vi.waitFor(() => expect(throwing.messages.map(({ type }) => type)).toEqual(['fatal']));
  });
});
