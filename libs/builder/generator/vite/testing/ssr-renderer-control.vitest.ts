import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type HotPayload,
  type ViteDevServer,
  type WatchOptions,
  createServer,
  createServerModuleRunner,
  createServerModuleRunnerTransport,
} from 'vite';
import type { ModuleRunner } from 'vite/module-runner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderSsrControlModule } from '../ssr-renderer-control';
import { SSR_RENDER_CONTROL_EVENT, SSR_RENDER_PROTOCOL_VERSION } from '../ssr-renderer-protocol';

const roots: string[] = [];
const servers: ViteDevServer[] = [];
const runners: ModuleRunner[] = [];
const observers: Array<ReturnType<typeof createServerModuleRunnerTransport>> = [];

afterEach(async () => {
  for (const runner of runners.splice(0)) await runner.close();
  for (const observer of observers.splice(0)) observer.disconnect?.();
  for (const server of servers.splice(0)) await server.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(watch?: WatchOptions) {
  const temporary = path.resolve(import.meta.dirname, '../../../../../tmp');
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(path.join(temporary, 'ng-doc-ssr-control-'));
  roots.push(root);
  await writeFile(path.join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  const control = path.join(root, 'control.mjs');
  const epoch = randomUUID();
  const source = (revision: string) =>
    `${renderSsrControlModule(epoch)}\nexport const testRevision = ${JSON.stringify(revision)};\n`;
  await writeFile(control, source('one'));
  const unaccepted = path.join(root, 'unaccepted-entry.mjs');
  const entrySource = (revision: string) =>
    `export const testRevision = ${JSON.stringify(revision)};\n`;
  await writeFile(unaccepted, entrySource('one'));
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, ...(watch ? { watch } : {}) },
  });
  servers.push(server);
  await server.listen();
  // createServer does not wait for the watcher's initial scan, and an edit made before the scan
  // watched a file is never reported: on a loaded runner the edits below could precede it.
  await nativelyWatched(server, root, [control, unaccepted]);
  const runner = await createServerModuleRunner(server.environments.ssr);
  runners.push(runner);
  const mutations: HotPayload[] = [];
  const observer = createServerModuleRunnerTransport({ channel: server.environments.ssr.hot });
  observers.push(observer);
  observer.connect?.({
    onMessage(payload: HotPayload) {
      mutations.push(payload);
    },
    onDisconnection() {},
  });
  const moduleId = '/control.mjs';
  const controlModule = async () =>
    runner.import<{
      waitForNgDocSsrFence(sequence: number, signal?: AbortSignal): Promise<number>;
      testRevision: string;
    }>(moduleId);
  const fence = (sequence: number, eventEpoch: string = epoch) =>
    server.environments.ssr.hot.send({
      type: 'custom',
      event: SSR_RENDER_CONTROL_EVENT,
      data: { version: SSR_RENDER_PROTOCOL_VERSION, epoch: eventEpoch, sequence },
    });
  return {
    control,
    controlModule,
    epoch,
    fence,
    source,
    runner,
    unaccepted,
    entrySource,
    mutations,
  };
}

/**
 * Resolves once chokidar has a native listener for every file of the initial scan. Its `ready`
 * event is enough for FSEvents only: the `fs.watch` backend (Linux) counts each missing path it
 * was given twice, and Vite gives it the missing `.env` files, so there `ready` is emitted before
 * the root is even read. chokidar records a path's closer right after attaching the path's
 * listener: with `fs.watch` one per file, with FSEvents one for the root, whose stream reports
 * every file below it.
 * @param server - The dev server.
 * @param root - Its root.
 * @param files - Files of the root that the test edits.
 */
async function nativelyWatched(
  server: ViteDevServer,
  root: string,
  files: readonly string[],
): Promise<void> {
  const watcher = server.watcher as ViteDevServer['watcher'] & {
    _readyEmitted?: boolean;
    _closers: ReadonlyMap<string, unknown>;
    options: { useFsEvents?: boolean };
  };
  if (!watcher._readyEmitted) await new Promise((resolve) => watcher.once('ready', resolve));
  const targets = watcher.options.useFsEvents ? [root] : [root, ...files];
  await vi.waitFor(
    () => expect(targets.filter((target) => !watcher._closers.has(target))).toEqual([]),
    { timeout: 10_000 },
  );
}

async function remainsPending<T>(promise: Promise<T>): Promise<void> {
  const outcome = await Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled',
    ),
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 30)),
  ]);
  expect(outcome).toBe('pending');
}

// chokidar picks FSEvents where it can (macOS), else `fs.watch` (Linux): both backends run here.
describe.each([
  { backend: 'the default', watch: undefined },
  { backend: 'the fs.watch', watch: { useFsEvents: false, usePolling: false } },
])('SSR renderer public HMR fence control ($backend backend)', ({ watch }) => {
  it('acknowledges only the requested finite sequence after prior public HMR delivery', async () => {
    const { controlModule, epoch, fence } = await fixture(watch);
    const control = await controlModule();
    const waiting = control.waitForNgDocSsrFence(2);

    fence(9, 'wrong-epoch');
    await remainsPending(waiting);
    fence(1, epoch);
    await remainsPending(waiting);
    fence(2, epoch);
    await expect(waiting).resolves.toBe(2);
  }, 30_000);

  it('keeps multiple waiters ordered and rejects invalid sequence inputs', async () => {
    const { controlModule, fence } = await fixture(watch);
    const control = await controlModule();
    const one = control.waitForNgDocSsrFence(1);
    const two = control.waitForNgDocSsrFence(2);
    const three = control.waitForNgDocSsrFence(3);

    await expect(control.waitForNgDocSsrFence(-1)).rejects.toThrow(
      'Invalid NgDoc SSR fence sequence',
    );
    await expect(control.waitForNgDocSsrFence(1.5)).rejects.toThrow(
      'Invalid NgDoc SSR fence sequence',
    );
    fence(2);
    await expect(one).resolves.toBe(2);
    await expect(two).resolves.toBe(2);
    await remainsPending(three);
    fence(3);
    await expect(three).resolves.toBe(3);
  }, 30_000);

  it('cleans up aborted fence waiters before and after registration', async () => {
    const { controlModule, fence } = await fixture(watch);
    const control = await controlModule();
    const before = new AbortController();
    const beforeReason = new Error('aborted before wait');
    before.abort(beforeReason);
    await expect(control.waitForNgDocSsrFence(6, before.signal)).rejects.toBe(beforeReason);

    const after = new AbortController();
    const afterReason = new Error('aborted after wait');
    const cancelled = control.waitForNgDocSsrFence(7, after.signal);
    after.abort(afterReason);
    await expect(cancelled).rejects.toBe(afterReason);
    fence(7);
    await expect(control.waitForNgDocSsrFence(7)).resolves.toBe(7);
  }, 30_000);

  it('rebinds after a real self-accepted control-file update in the same public module runner', async () => {
    const { control, controlModule, fence, source } = await fixture(watch);
    expect((await controlModule()).testRevision).toBe('one');

    await writeFile(control, source('two'));
    await vi.waitFor(
      async () => {
        expect((await controlModule()).testRevision).toBe('two');
      },
      { timeout: 10_000 },
    );

    const waiting = (await controlModule()).waitForNgDocSsrFence(4);
    fence(4);
    await expect(waiting).resolves.toBe(4);
  }, 30_000);

  it('handles a real unaccepted full reload and retains a working control binding in the same runner', async () => {
    const { controlModule, entrySource, fence, mutations, runner, unaccepted } =
      await fixture(watch);
    expect(
      (await runner.import<{ testRevision: string }>('/unaccepted-entry.mjs')).testRevision,
    ).toBe('one');

    await writeFile(unaccepted, entrySource('two'));
    await vi.waitFor(
      () => {
        expect(mutations.some((payload) => payload.type === 'full-reload')).toBe(true);
      },
      { timeout: 10_000 },
    );
    await vi.waitFor(
      async () => {
        expect(
          (await runner.import<{ testRevision: string }>('/unaccepted-entry.mjs')).testRevision,
        ).toBe('two');
      },
      { timeout: 10_000 },
    );

    const waiting = (await controlModule()).waitForNgDocSsrFence(5);
    fence(5);
    await expect(waiting).resolves.toBe(5);
  }, 30_000);

  it('does not acknowledge a fence from a full-reload receipt while real entry evaluation is held', async () => {
    const { controlModule, entrySource, fence, mutations, runner, unaccepted } =
      await fixture(watch);
    expect(
      (await runner.import<{ testRevision: string }>('/unaccepted-entry.mjs')).testRevision,
    ).toBe('one');
    const gateKey = `__ngDocSsrControlGate_${randomUUID()}`;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (globalThis as Record<string, unknown>)[gateKey] = gate;
    const heldSource = `${entrySource('held')}\nawait globalThis[${JSON.stringify(gateKey)}];\n`;
    let importing: Promise<{ testRevision: string }> | undefined;
    try {
      await writeFile(unaccepted, heldSource);
      await vi.waitFor(
        () => {
          expect(mutations.some((payload) => payload.type === 'full-reload')).toBe(true);
        },
        { timeout: 10_000 },
      );
      importing = runner.import<{ testRevision: string }>('/unaccepted-entry.mjs');
      const waiting = (await controlModule()).waitForNgDocSsrFence(8);
      fence(8);
      await remainsPending(waiting);

      release();
      await expect(importing).resolves.toMatchObject({ testRevision: 'held' });
      await expect(waiting).resolves.toBe(8);
    } finally {
      release();
      delete (globalThis as Record<string, unknown>)[gateKey];
      await importing?.catch(() => {});
    }
  }, 30_000);
});
