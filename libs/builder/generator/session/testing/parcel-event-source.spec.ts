import * as parcel from '@parcel/watcher';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { BuildEvent, Diagnostic } from '../../contracts';
import { createBuildSession } from '../build-session';
import { createParcelEventSource, nativeWatcherBackend } from '../parcel-event-source';
import { committed, compilation, deferred, harness, hostJoin, until } from './support';

describe('Parcel FileEventSource', () => {
  it('normalizes/filter events, contains callback faults and closes exactly once', async () => {
    const root = process.cwd();
    let callback!: parcel.SubscribeCallback;
    const unsubscribe = vi.fn(async () => {});
    const native = vi.fn(
      async (_root: string, listener: parcel.SubscribeCallback, _options?: parcel.Options) => {
        callback = listener;
        return { unsubscribe };
      },
    );
    const events = vi.fn();
    const errors = vi.fn();
    const subscription = await createParcelEventSource(root, {}, native).subscribe(events, errors);
    expect(native.mock.calls[0][2]).toStrictEqual({
      ...(nativeWatcherBackend() ? { backend: nativeWatcherBackend() } : {}),
      ignore: ['**/node_modules/**', '.idea', '**/.DS_Store'],
    });
    callback(null, [
      { type: 'update', path: join(root, 'page.md') },
      { type: 'delete', path: `${root}-other/page.md` },
      { type: 'create', path: resolve(root, '../other.md') },
    ]);
    // Parcel reports native paths; the source emits the engine's spelling.
    expect(events).toHaveBeenCalledWith([{ kind: 'update', path: hostJoin(root, 'page.md') }]);
    callback(null, []);
    expect(events).toHaveBeenCalledTimes(1);
    callback(new Error('native failure'), []);
    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WATCHER_ERROR', message: 'native failure' }),
    );
    events.mockImplementationOnce(() => {
      throw new Error('listener failed');
    });
    callback(null, [{ type: 'update', path: join(root, 'page.md') }]);
    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WATCHER_LISTENER_FAILED', message: 'listener failed' }),
    );
    errors.mockImplementationOnce(() => {
      throw new Error('error listener failed');
    });
    expect(() => callback(new Error('another failure'), [])).not.toThrow();
    events.mockImplementationOnce(() => {
      throw 'unknown';
    });
    callback(null, [{ type: 'delete', path: join(root, 'page.md') }]);
    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'WATCHER_LISTENER_FAILED',
        message: 'Watcher listener failed',
      }),
    );
    const disposing = subscription.dispose();
    expect(subscription.dispose()).toBe(disposing);
    await disposing;
    callback(null, [{ type: 'create', path: join(root, 'late.md') }]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(events).toHaveBeenCalledTimes(3);
  });

  it('names the native backend where @parcel/watcher would probe for Watchman first', () => {
    // The probe leaves an unreaped shell in the host's process group when Watchman is missing.
    expect(nativeWatcherBackend('linux')).toBe('inotify');
    expect(nativeWatcherBackend('android')).toBe('inotify');
    // FSEvents is chosen before the probe; Windows has no zombies to leave.
    expect(nativeWatcherBackend('darwin')).toBeUndefined();
    expect(nativeWatcherBackend('win32')).toBeUndefined();
    expect(nativeWatcherBackend()).toBe(nativeWatcherBackend(process.platform));
  });

  it('forwards custom ignore/backend options and unsubscribe rejection', async () => {
    const native = vi.fn(
      async (_root: string, _listener: parcel.SubscribeCallback, _options?: parcel.Options) => ({
        unsubscribe: async () => {
          throw new Error('unsubscribe failed');
        },
      }),
    );
    const subscription = await createParcelEventSource(
      process.cwd(),
      { ignore: ['generated'], backend: 'brute-force' },
      native,
    ).subscribe(
      () => {},
      () => {},
    );
    expect(native.mock.calls[0][2]).toEqual({
      ignore: ['generated', '.idea', '**/.DS_Store'],
      backend: 'brute-force',
    });
    await expect(subscription.dispose()).rejects.toThrow('unsubscribe failed');
  });

  it('forwards a regular expression ignore unchanged', async () => {
    const native = vi.fn(
      async (_root: string, _listener: parcel.SubscribeCallback, _options?: parcel.Options) => ({
        unsubscribe: async () => {},
      }),
    );
    const generated = /[\\/]generated[\\/]/;
    const subscription = await createParcelEventSource(
      process.cwd(),
      { ignore: [generated, join(process.cwd(), 'out')] },
      native,
    ).subscribe(
      () => {},
      () => {},
    );
    const ignore = native.mock.calls[0][2]?.ignore ?? [];
    expect(ignore[0]).toBe(generated);
    expect(ignore.slice(2)).toEqual(['.idea', '**/.DS_Store']);
    await subscription.dispose();
  });

  it('never reports the root .idea directory or .DS_Store files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ng-doc-metadata-'));
    try {
      await mkdir(join(root, '.idea'));
      await mkdir(join(root, 'docs/.idea'), { recursive: true });
      const seen: string[] = [];
      // A caller that already lists one of the defaults does not get it twice.
      const subscription = await createParcelEventSource(root, {
        ignore: ['**/node_modules/**', '.idea'],
      }).subscribe(
        (events) => seen.push(...events.map((event) => event.path)),
        () => {},
      );
      try {
        await writeFile(join(root, '.idea/workspace.xml'), '<project/>');
        await writeFile(join(root, '.DS_Store'), 'finder');
        await mkdir(join(root, 'docs'), { recursive: true });
        await writeFile(join(root, 'docs/.DS_Store'), 'finder');
        // Only the watched root's .idea is IDE metadata; a nested one is reported as usual.
        await writeFile(join(root, 'docs/.idea/page.md'), 'nested');
        await writeFile(join(root, 'docs/page.md'), 'page');
        await until(
          () =>
            seen.some((file) => file.endsWith('/docs/page.md')) &&
            seen.some((file) => file.endsWith('/docs/.idea/page.md')),
          10_000,
        );
        await new Promise((done) => setTimeout(done, 300));
        expect(seen.filter((file) => file.includes('.DS_Store'))).toEqual([]);
        expect(seen.filter((file) => file.startsWith(hostJoin(root, '.idea')))).toEqual([]);
      } finally {
        await subscription.dispose();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('contains async consumer rejections including a late rejection after disposal', async () => {
    let callback!: parcel.SubscribeCallback;
    const native = async (_root: string, listener: parcel.SubscribeCallback) => {
      callback = listener;
      return { unsubscribe: async () => {} };
    };
    const late = deferred<void>();
    const listener = vi.fn(async (): Promise<void> => {
      throw new Error('async listener');
    });
    const errors = vi.fn(async () => {
      throw new Error('async diagnostic');
    });
    const subscription = await createParcelEventSource(process.cwd(), {}, native).subscribe(
      listener,
      errors,
    );
    callback(null, [{ type: 'update', path: join(process.cwd(), 'page.md') }]);
    await until(() => errors.mock.calls.length === 1);
    listener.mockImplementationOnce(() => late.promise);
    callback(null, [{ type: 'update', path: join(process.cwd(), 'page.md') }]);
    await subscription.dispose();
    late.reject(new Error('late listener'));
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('watches real create/update/delete/rename and editor saves, then stops/restarts cleanly', async () => {
    const root = await mkdtemp(join(tmpdir(), '.ng-doc-session-'));
    const generated = join(root, '.generated');
    const output = join(generated, 'observed.json');
    await mkdir(generated);
    await writeFile(join(root, 'page.md'), 'initial');
    const h = harness();
    const firstRead = deferred<void>();
    const releaseFirst = deferred<void>();
    let holdFirst = true;
    let opened = 0;
    let closed = 0;
    const subscribe: typeof parcel.subscribe = async (...args) => {
      const subscription = await parcel.subscribe(...args);
      opened++;
      return {
        unsubscribe: async () => {
          await subscription.unsubscribe();
          closed++;
        },
      };
    };
    const source = createParcelEventSource(root, { ignore: [generated] }, subscribe);
    // This source-only integration compiler reads actual files. It does not implement NgDoc
    // content rendering; the test observes event-to-committed-output lifecycle, not page parity.
    h.compile.mockImplementation(async () => {
      const files: Record<string, string> = {};
      for (const file of (await readdir(root)).filter((file) => file.endsWith('.md')).sort()) {
        files[file] = await readFile(join(root, file), 'utf8');
      }
      if (holdFirst) {
        holdFirst = false;
        firstRead.resolve();
        await releaseFirst.promise;
      }
      return compilation(JSON.stringify(files));
    });
    h.commit.mockImplementation(async (request, guard, signal) => {
      if (signal.aborted || !guard.isCurrent(request.generation))
        return { status: 'stale', diagnostics: [] };
      await writeFile(output, request.candidate.revision);
      return committed(request);
    });
    const events: BuildEvent[] = [];
    const diagnostics: Diagnostic[] = [];
    const session = createBuildSession(h.services, {
      batchDelayMs: 5,
      onDiagnostic: (error) => diagnostics.push(error),
    });
    async function expectFiles(files: Record<string, string>) {
      await until(
        () =>
          session.inspect().lastGoodRevision === JSON.stringify(files) &&
          !session.inspect().building,
        10000,
      );
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(files);
    }
    try {
      await expect(
        createParcelEventSource(join(root, 'missing')).subscribe(
          () => {},
          () => {},
        ),
      ).rejects.toBeDefined();
      const watch = await session.watch(source, (event) => events.push(event));
      await firstRead.promise;
      await writeFile(join(root, 'page.md'), 'updated');
      await until(() => h.compile.mock.calls[0][1].aborted, 10000);
      releaseFirst.resolve();
      expect(await watch.initial).toMatchObject({
        status: 'success',
        snapshot: { revision: JSON.stringify({ 'page.md': 'updated' }) },
      });
      await expectFiles({ 'page.md': 'updated' });
      expect(h.commit.mock.calls[0][0].candidate.revision).toBe(
        JSON.stringify({ 'page.md': 'updated' }),
      );
      await writeFile(join(root, 'added.md'), 'created');
      await expectFiles({ 'added.md': 'created', 'page.md': 'updated' });
      await rename(join(root, 'added.md'), join(root, 'renamed.md'));
      await expectFiles({ 'page.md': 'updated', 'renamed.md': 'created' });
      await rm(join(root, 'renamed.md'));
      await expectFiles({ 'page.md': 'updated' });
      await writeFile(join(root, 'editor-save.tmp'), 'atomic-save');
      await rename(join(root, 'editor-save.tmp'), join(root, 'page.md'));
      await expectFiles({ 'page.md': 'atomic-save' });
      await rm(join(root, 'page.md'));
      await writeFile(join(root, 'page.md'), 'recreated');
      await expectFiles({ 'page.md': 'recreated' });
      await watch.dispose();
      expect(opened).toBe(1);
      expect(closed).toBe(1);
      await writeFile(join(root, 'page.md'), 'after-stop');
      const restarted = await session.watch(source, (event) => events.push(event));
      expect((await restarted.initial).status).toBe('success');
      await expectFiles({ 'page.md': 'after-stop' });
      await restarted.dispose();
      expect(opened).toBe(2);
      expect(closed).toBe(2);
      expect(diagnostics).toEqual([]);
      const changes = events.flatMap((event) => (event.kind === 'started' ? event.changes : []));
      expect(changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'create', path: hostJoin(root, 'added.md') }),
          expect.objectContaining({ kind: 'delete', path: hostJoin(root, 'added.md') }),
          expect.objectContaining({ kind: 'create', path: hostJoin(root, 'renamed.md') }),
          expect.objectContaining({ kind: 'delete', path: hostJoin(root, 'renamed.md') }),
        ]),
      );
      expect(changes.some((change) => change.path.startsWith(hostJoin(generated)))).toBe(false);
    } finally {
      releaseFirst.resolve();
      await session.dispose();
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});
