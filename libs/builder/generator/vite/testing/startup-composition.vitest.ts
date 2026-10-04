import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OutputManifest } from '../../contracts';
import { composeAngularPlugins } from '../angular-composition';
import { HostUpdateCoordinator } from '../host-updates';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const call = (hook: any) => (typeof hook === 'function' ? hook : hook.handler);
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-startup-coverage-'));
  roots.push(root);
  const files = Array.from({ length: 24 }, (_, i) =>
    path.join(root, `page-${i}${i % 2 ? '.d.mts' : '.ts'}`),
  );
  const bytes = 'export const value: number = 1;\n';
  await Promise.all(files.map((file) => writeFile(file, bytes)));
  const manifest = {
    schemaVersion: 1,
    projectId: 'startup',
    revision: 'initial',
    generation: 1,
    files: files.map((file) => ({
      path: path.basename(file),
      digest: createHash('sha256').update(bytes).digest('hex'),
      ownerId: 'startup-owner',
      role: 'angular',
    })),
  } as OutputManifest;
  const coordinator = new HostUpdateCoordinator(vi.fn(), vi.fn());
  coordinator.seed(root, manifest);
  const entered = gate(),
    release = gate();
  const hot = vi.fn(async (_ctx: HmrContext) => {});
  const ack = vi.fn(async (...args: Parameters<HostUpdateCoordinator['acknowledge']>) =>
    coordinator.acknowledge(...args),
  );
  const diagnostic = vi.fn();
  const composition = composeAngularPlugins(
    [
      {
        name: '@analogjs/vite-plugin-angular',
        async buildStart() {
          entered.resolve();
          await release.promise;
        },
        handleHotUpdate: hot,
        transform() {
          return { code: 'class App {}; App.ɵcmp = {};' };
        },
      } as Plugin,
    ],
    files[0]!,
    {
      initialize: async () => {},
      initialCompilationInventory: () => coordinator.initialCompilationInventory(),
      start: (file, read) => coordinator.begin(file, 'update', read, false),
      acknowledge: ack,
      diagnostic: (ticket, error) => {
        diagnostic(ticket, error);
        coordinator.diagnostic(ticket, error);
      },
      committed: (ticket) => coordinator.committed(ticket),
      settle: (ticket) => coordinator.settle(ticket),
      fail: vi.fn(),
    },
  );
  const wrapped = composition.plugins[0]!;
  const transformRequest = vi.fn(async () => call(wrapped.transform)('', files[0]));
  const server = {
    environments: {
      client: {
        moduleGraph: { ensureEntryFromUrl: async () => ({}), invalidateModule() {} },
        transformRequest,
      },
    },
  } as unknown as ViteDevServer;
  composition.attachServer(server);
  const context = (file: string): HmrContext => ({
    file,
    read: () => readFile(file, 'utf8'),
    timestamp: Date.now(),
    modules: [],
    server,
  });
  const observe = (ctx: HmrContext) => composition.observeStartupUpdate(ctx.file, ctx.read);
  const build = () => call(wrapped.buildStart)();
  const update = (ctx: HmrContext) => call(wrapped.handleHotUpdate)(ctx);
  return {
    root,
    files,
    bytes,
    manifest,
    coordinator,
    composition,
    hot,
    ack,
    diagnostic,
    entered,
    release,
    transformRequest,
    context,
    observe,
    build,
    update,
  };
}

describe('initial full Angular compilation coverage', () => {
  it('coalesces a full owned TS/declaration burst only after the actual initial pass and fresh probe', async () => {
    const f = await setup();
    const contexts = f.files.map(f.context);
    contexts.forEach(f.observe);
    const running = f.build();
    await f.entered.promise;
    const updates = contexts.map(f.update);
    const all = Promise.all(updates);
    await Promise.resolve();
    expect(f.ack).not.toHaveBeenCalled();
    expect(f.transformRequest).not.toHaveBeenCalled();
    f.release.resolve();
    await running;
    await all;
    expect(f.transformRequest).toHaveBeenCalledOnce();
    expect(f.hot).not.toHaveBeenCalled();
    expect(f.ack).toHaveBeenCalledTimes(24);
    expect(f.ack.mock.calls.every((args) => args[2] === undefined)).toBe(true);
    await f.composition.dispose();
    f.coordinator.dispose();
  });
  it('covers an older queued version replaced before the initial full pass starts', async () => {
    const f = await setup();
    const ctx = f.context(f.files[1]!);
    f.observe(ctx);
    await writeFile(ctx.file, f.bytes);
    const running = f.build();
    await f.entered.promise;
    f.release.resolve();
    await running;
    await f.update(ctx);
    expect(f.hot).not.toHaveBeenCalled();
    await f.composition.dispose();
    f.coordinator.dispose();
  });
  it.each(['change', 'aba', 'new-event', 'new-manifest'] as const)(
    'never reuses initial coverage for %s',
    async (mode) => {
      const f = await setup();
      let ctx = f.context(f.files[1]!);
      f.observe(ctx);
      const running = f.build();
      await f.entered.promise;
      if (mode === 'change' || mode === 'aba') {
        await writeFile(ctx.file, 'export const value: number = 2;\n');
        if (mode === 'aba') await writeFile(ctx.file, f.bytes);
      }
      if (mode === 'new-event') ctx = f.context(ctx.file); // A different native event has a different read identity.
      if (mode === 'new-manifest')
        f.coordinator.seed(f.root, {
          ...f.manifest,
          generation: 2,
          files: f.manifest.files.map((file) => ({ ...file, ownerId: 'replacement-owner' })),
        });
      f.release.resolve();
      await running;
      await f.update(ctx);
      expect(f.hot).toHaveBeenCalledOnce();
      expect(f.ack).toHaveBeenCalledWith(expect.anything(), false, true);
      await f.composition.dispose();
      f.coordinator.dispose();
    },
  );
  it.each([false, true])(
    'checks the exact version of an event admitted during the initial pass (changed=%s)',
    async (changed) => {
      const f = await setup();
      const running = f.build();
      await f.entered.promise;
      if (changed) await writeFile(f.files[1]!, f.bytes + '// changed during compilation');
      const ctx = f.context(f.files[1]!);
      f.observe(ctx);
      f.release.resolve();
      await running;
      await f.update(ctx);
      expect(f.hot).toHaveBeenCalledTimes(changed ? 1 : 0);
      await f.composition.dispose();
      f.coordinator.dispose();
    },
  );
  it('preserves a later diagnostic when an older covered event finally acknowledges', async () => {
    const f = await setup();
    const old = f.context(f.files[1]!);
    f.observe(old);
    const running = f.build();
    await f.entered.promise;
    f.release.resolve();
    await running;
    await f.composition.preflight();
    // A no-op publication changes generation, but not the compiled physical inventory.
    f.coordinator.seed(f.root, { ...f.manifest, generation: 2 });
    const failure = Object.assign(new Error('later compiler diagnostic'), {
      code: 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC',
    });
    f.hot.mockRejectedValueOnce(failure);
    await expect(f.update(f.context(f.files[2]!))).rejects.toBe(failure);
    expect(f.coordinator.blockerCount()).toBe(1);
    // Do not wait for settlement: it correctly remains blocked by the newer diagnosis.
    const delayed = f.update(old);
    const observed = delayed.then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(f.ack).toHaveBeenCalledWith(expect.anything(), false));
    expect(f.coordinator.blockerCount()).toBe(1);
    expect(f.hot).toHaveBeenCalledOnce();
    await f.update(f.context(f.files[2]!));
    await observed;
    expect(f.coordinator.blockerCount()).toBe(0);
    await f.composition.dispose();
    f.coordinator.dispose();
  });
  it('keeps post-ready TS/resource diagnostics and repair on the original compiler path', async () => {
    const f = await setup();
    const running = f.build();
    await f.entered.promise;
    f.release.resolve();
    await running;
    await f.composition.preflight();
    const failure = Object.assign(new Error('type error'), {
      code: 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC',
    });
    f.hot.mockRejectedValueOnce(failure);
    const ctx = f.context(f.files[1]!);
    f.observe(ctx);
    await expect(f.update(ctx)).rejects.toBe(failure);
    expect(f.diagnostic).toHaveBeenCalledOnce();
    await f.update(f.context(ctx.file));
    expect(f.coordinator.blockerCount()).toBe(0);
    const html = path.join(f.root, 'external.html');
    await writeFile(html, '<p>changed</p>');
    await f.update(f.context(html));
    expect(f.hot).toHaveBeenCalledTimes(3);
    expect(f.ack).toHaveBeenLastCalledWith(expect.anything(), true, true);
    await f.composition.dispose();
    f.coordinator.dispose();
  });
});
