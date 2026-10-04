import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BoundedCloseOptions, boundServerClose, HOST_CLOSE_BOUND_MS } from '../bounded-close';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const never = () => new Promise<never>(() => {});

function harness(
  hostClose: () => Promise<void>,
  overrides: Partial<BoundedCloseOptions> = {},
): {
  server: { close(): Promise<void> };
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  host: ReturnType<typeof vi.fn>;
} {
  const host = vi.fn(hostClose);
  const server = { close: host as () => Promise<void> };
  const warn = vi.fn();
  const error = vi.fn();
  boundServerClose(server, {
    dispose: async () => {},
    released: async () => {},
    warn,
    error,
    ...overrides,
  });
  return { server, warn, error, host };
}

async function settle(promise: Promise<unknown>): Promise<'resolved' | 'rejected' | 'pending'> {
  let state: 'resolved' | 'rejected' | 'pending' = 'pending';
  promise.then(
    () => (state = 'resolved'),
    () => (state = 'rejected'),
  );
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  return state;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('boundServerClose', () => {
  it('passes a prompt close through once and reuses it for repeated calls', async () => {
    const { server, warn, host } = harness(async () => {});
    const first = server.close();
    expect(server.close()).toBe(first);
    await first;
    expect(host).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves a never-settling Vite close after the bound with one diagnostic', async () => {
    vi.useFakeTimers();
    const { server, warn, error } = harness(never);
    const closing = server.close();
    await vi.advanceTimersByTimeAsync(HOST_CLOSE_BOUND_MS - 1);
    expect(await settle(closing)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await closing;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(
      /^\[NGDOC_VITE_CLOSE_TIMEOUT\] Vite's server\.close\(\) did not settle within 5000 ms/,
    );
    expect(error).not.toHaveBeenCalled();
    await server.close();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never resolves before NgDoc released its own resources, and starts the bound afterwards', async () => {
    vi.useFakeTimers();
    const released = deferred();
    const host = deferred();
    const order: string[] = [];
    const { server, warn } = harness(() => host.promise, {
      dispose: async () => void order.push('dispose'),
      released: () => {
        order.push('released');
        return released.promise;
      },
      boundMs: 20,
    });
    const closing = server.close();
    await vi.advanceTimersByTimeAsync(100);
    expect(await settle(closing)).toBe('pending');
    released.resolve();
    await vi.advanceTimersByTimeAsync(10);
    host.resolve();
    await closing;
    expect(order).toEqual(['dispose', 'released']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('names a pending NgDoc disposal and logs its later failure', async () => {
    vi.useFakeTimers();
    const disposal = deferred();
    const { server, warn, error } = harness(async () => {}, {
      dispose: () => disposal.promise,
      boundMs: 10,
    });
    const closing = server.close();
    await vi.advanceTimersByTimeAsync(10);
    await closing;
    expect(warn.mock.calls[0]![0]).toContain("NgDoc's disposal did not settle within 10 ms");
    disposal.reject(new Error('late cleanup failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledWith(
      '[NGDOC_VITE_CLOSE] NgDoc disposal failed after the close bound: late cleanup failure',
    );
  });

  it('logs a late Vite close failure and still reports a settled NgDoc failure', async () => {
    vi.useFakeTimers();
    const host = deferred();
    const { server, error } = harness(() => host.promise, {
      dispose: async () => {
        throw new Error('cleanup failed');
      },
      boundMs: 10,
    });
    const closing = server.close();
    const outcome = expect(closing).rejects.toThrow('cleanup failed');
    await vi.advanceTimersByTimeAsync(10);
    await outcome;
    host.reject('socket error');
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledWith(
      "[NGDOC_VITE_CLOSE] Vite's server.close() failed after the close bound: socket error",
    );
  });

  it('rethrows a settled Vite close failure after a timed-out NgDoc disposal', async () => {
    vi.useFakeTimers();
    const { server, warn } = harness(() => Promise.reject(new Error('close failed')), {
      dispose: never,
      boundMs: 10,
    });
    const closing = server.close();
    const outcome = expect(closing).rejects.toThrow('close failed');
    await vi.advanceTimersByTimeAsync(10);
    await outcome;
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rethrows failures within the bound, NgDoc disposal first', async () => {
    const both = harness(() => Promise.reject(new Error('close failed')), {
      dispose: async () => {
        throw new Error('cleanup failed');
      },
      released: async () => {
        throw new Error('cleanup failed');
      },
    });
    await expect(both.server.close()).rejects.toThrow('cleanup failed');
    const synchronous = harness(() => {
      throw new Error('close threw');
    });
    await expect(synchronous.server.close()).rejects.toThrow('close threw');
    expect(both.warn).not.toHaveBeenCalled();
    expect(synchronous.warn).not.toHaveBeenCalled();
  });
});
