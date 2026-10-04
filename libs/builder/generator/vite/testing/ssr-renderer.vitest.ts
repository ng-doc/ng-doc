import { build } from 'esbuild';
import { statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type HotPayload,
  type Plugin,
  type ViteDevServer,
  createServer,
  createServerModuleRunnerTransport,
  HmrContext,
} from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNgDocVitePlugin } from '..';
import { qualifyAngularPlugins } from '../angular-compatibility';
import {
  type NgDocViteSsrRenderer,
  type SsrRendererOwnerOptions,
  getNgDocViteSsrRenderer,
  OwnedSsrRenderer,
} from '../ssr-renderer';
import { renderSsrControlModule } from '../ssr-renderer-control';
import {
  DEFAULT_SSR_RENDER_LIMITS,
  SSR_RENDER_CONTROL_ID,
  SSR_RENDER_PROTOCOL_VERSION,
} from '../ssr-renderer-protocol';

const roots: string[] = [];
const servers: ViteDevServer[] = [];
const renderers: NgDocViteSsrRenderer[] = [];
const observers: Array<ReturnType<typeof createServerModuleRunnerTransport>> = [];

afterEach(async () => {
  for (const observer of observers.splice(0)) await observer.disconnect?.();
  const cleanup = await Promise.allSettled([
    ...renderers.splice(0).map((renderer) => renderer.close()),
    ...servers.splice(0).map((server) => server.close()),
    ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ]);
  const failures = cleanup.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length) throw new AggregateError(failures, 'SSR renderer fixture cleanup failed.');
});

async function fixture() {
  const temporary = path.resolve(import.meta.dirname, '../../../../../tmp');
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(path.join(temporary, 'ng-doc-ssr-renderer-'));
  roots.push(root);
  await writeFile(path.join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  const child = path.join(root, 'renderer-child.mjs');
  await build({
    entryPoints: [path.resolve(import.meta.dirname, '../ssr-renderer-entry.ts')],
    outfile: child,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  const entry = path.join(root, 'entry.mjs');
  const source = (version: string) => `
import { appendFile } from 'node:fs/promises';
export async function render(request, { signal }) {
  const wait = request.data?.wait ?? 0;
  const label = request.data?.label;
  const log = request.data?.log;
  if (label && log) await appendFile(log, label + ':start\\n');
  if (wait) await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, wait);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      if (request.data?.settleDelay) setTimeout(resolve, request.data.settleDelay);
      else reject(signal.reason);
    }, { once: true });
  });
  if (label && log) await appendFile(log, label + ':settle\\n');
  if (request.data?.fail) throw new Error('fixture render failure');
  if (request.data?.nonString) return 42;
  return JSON.stringify({ version: ${JSON.stringify(version)}, url: request.url, document: request.document });
}
`;
  await writeFile(entry, source('ONE'));

  const control: Plugin = {
    name: 'ssr-renderer-test-control',
    resolveId(id: string) {
      return id === SSR_RENDER_CONTROL_ID ? id : null;
    },
    load(id: string) {
      return owner.controlModule(id) ?? null;
    },
  };
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [control],
    server: { host: '127.0.0.1', port: 0 },
  });
  servers.push(server);
  await server.listen();
  const owner: OwnedSsrRenderer = new OwnedSsrRenderer({
    entryUrl: pathToFileURL(child),
    limits: {
      ...DEFAULT_SSR_RENDER_LIMITS,
      maxActive: 1,
      maxQueued: 1,
      requestDeadlineMs: 5_000,
      startupDeadlineMs: 5_000,
      fenceDeadlineMs: 5_000,
      closeDeadlineMs: 1_000,
    },
  });
  owner.attach(server);
  const renderer = owner.select('/entry.mjs');
  renderers.push(renderer);

  // Vite's watcher reports a change, Vite invalidates the entry, then it sends the SSR payload. Each
  // invalidation records the entry's stat when it happened: once a payload follows an invalidation
  // that saw the written file, the next render imports the written bytes, whatever late reports
  // of earlier writes are still on their way.
  const graph = server.environments.ssr.moduleGraph;
  const onFileChange = graph.onFileChange.bind(graph);
  const invalidations: Array<string | undefined> = [];
  graph.onFileChange = (file: string) => {
    if (path.resolve(file) === entry) invalidations.push(statVersion(entry));
    onFileChange(file);
  };
  let reloaded: { payload: HotPayload; through: number } | undefined;
  const waiters = new Set<() => void>();
  const changed = () => {
    for (const waiter of waiters) waiter();
  };
  const observer = createServerModuleRunnerTransport({ channel: server.environments.ssr.hot });
  observers.push(observer);
  observer.connect?.({
    onMessage(payload: HotPayload) {
      if (payload.type !== 'update' && payload.type !== 'full-reload' && payload.type !== 'prune') {
        return;
      }
      reloaded = { payload, through: invalidations.length };
      changed();
    },
    onDisconnection() {},
  });
  /** Resolves on the next payload, or after `milliseconds`. */
  const next = (milliseconds: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, milliseconds);
      function done() {
        clearTimeout(timer);
        waiters.delete(done);
        resolve();
      }
      waiters.add(done);
    });
  /**
   * Writes the entry and resolves with the first payload that follows an invalidation which saw
   * the written file, as Vite's own watcher reports it.
   * @param bytes The entry's new content.
   */
  const mutation = async (bytes: string): Promise<HotPayload> => {
    const before = invalidations.length;
    await writeFile(entry, bytes);
    for (;;) {
      const written = statVersion(entry);
      const seen = invalidations.findIndex((stat, index) => index >= before && stat === written);
      if (seen >= 0 && reloaded && reloaded.through > seen) return reloaded.payload;
      if (seen < 0 && !throttled(server.watcher, entry) && (await reportMissed())) {
        // chokidar drops a change of a path within 50 ms of the last one it reported (a late
        // report of an earlier write can open that window), and never reports it afterwards.
        // The same bytes are written again once the window is closed: a new write, reported.
        await writeFile(entry, bytes);
        continue;
      }
      await next(50);
    }
    /** Whether no invalidation saw the written file although the watcher had time to report it. */
    async function reportMissed(): Promise<boolean> {
      const written = statVersion(entry);
      await next(250);
      return (
        statVersion(entry) === written &&
        !invalidations.some((stat, index) => index >= before && stat === written) &&
        !throttled(server.watcher, entry)
      );
    }
  };

  return { root, entry, source, owner, renderer, observer, mutation };
}

/** A file's stat identity, or undefined when it cannot be stated. */
function statVersion(file: string): string | undefined {
  try {
    const state = statSync(file, { bigint: true });
    return `${state.ino}:${state.size}:${state.mtimeNs}:${state.ctimeNs}`;
  } catch {
    return undefined;
  }
}

/**
 * Whether chokidar (as bundled by Vite) is inside its 50 ms window after reporting a change of
 * `file`, in which it drops further changes of it.
 * @param watcher Vite's watcher.
 * @param file The file.
 */
function throttled(watcher: unknown, file: string): boolean {
  const state = (watcher as { _throttled?: Map<string, Map<string, unknown>> })._throttled;
  return state?.get('change')?.has(file) ?? false;
}

/** Kills a process the test may have left behind; one that already exited is fine. */
function killIfAlive(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

async function scriptedFixture(
  body: string,
  closeDeadlineMs: number = 100,
  supervision: Pick<SsrRendererOwnerOptions, 'platform' | 'killTree'> = {},
) {
  const temporary = path.resolve(import.meta.dirname, '../../../../../tmp');
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(path.join(temporary, 'ng-doc-ssr-scripted-'));
  roots.push(root);
  await writeFile(path.join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  const child = path.join(root, 'child.mjs');
  await writeFile(
    child,
    `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const version = ${SSR_RENDER_PROTOCOL_VERSION};
let epoch;
const reply = (message) => process.send?.({ version, epoch, ...message });
process.on('message', (message) => {
  if (message.type === 'start') { epoch = message.epoch; reply({ type: 'ready' }); return; }
  ${body}
});
`,
  );
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  servers.push(server);
  await server.listen();
  const owner = new OwnedSsrRenderer({
    entryUrl: pathToFileURL(child),
    limits: {
      ...DEFAULT_SSR_RENDER_LIMITS,
      startupDeadlineMs: 2_000,
      requestDeadlineMs: 2_000,
      fenceDeadlineMs: 2_000,
      closeDeadlineMs,
    },
    ...supervision,
  });
  owner.attach(server);
  return { renderer: owner.select('/entry.mjs'), server };
}

describe('isolated SSR renderer', () => {
  it('refuses the control module before a runtime exists and closes without one', async () => {
    const owner = new OwnedSsrRenderer({ platform: 'win32' });
    expect(owner.select('/main.server.ts')).toBe(owner);
    expect(() => owner.controlModule(SSR_RENDER_CONTROL_ID)).toThrow('NGDOC_SSR_RENDER_CONTROL');
    await expect(owner.close()).resolves.toBeUndefined();
  });

  describe('Windows supervision', () => {
    // These run on every platform with the Windows supervision selected: no detached group, the
    // renderer's own liveness, and a process-tree kill. On Windows itself they run natively.
    it('selects, renders and closes gracefully without a process group', async () => {
      const killTree = vi.fn();
      const { renderer } = await scriptedFixture(
        `
        if (message.type === 'render') reply({ type: 'rendered', id: message.id, html: '<p>win</p>' });
        if (message.type === 'close') { reply({ type: 'closed' }); process.exit(0); }
      `,
        1_000,
        { platform: 'win32', killTree },
      );
      await expect(
        renderer.render({ document: '', url: 'http://localhost/windows' }),
      ).resolves.toBe('<p>win</p>');
      await expect(renderer.close()).resolves.toBeUndefined();
      expect(killTree).not.toHaveBeenCalled();
    }, 10_000);

    it('ends the process tree of a renderer that ignores close', async () => {
      const killed: number[] = [];
      const { renderer } = await scriptedFixture(
        `if (message.type === 'render') reply({ type: 'rendered', id: message.id, html: '<p>ok</p>' });`,
        50,
        {
          platform: 'win32',
          killTree: (pid) => {
            killed.push(pid);
            process.kill(pid, 'SIGKILL');
          },
        },
      );
      await expect(
        renderer.render({ document: '', url: 'http://localhost/windows-forced' }),
      ).resolves.toBe('<p>ok</p>');
      await expect(renderer.close()).rejects.toThrow('NGDOC_SSR_RENDER_FORCED_CLOSE');
      expect(killed).toHaveLength(1);
      expect(() => process.kill(killed[0], 0)).toThrow(/ESRCH/);
    }, 10_000);

    it('never kills or probes the pid of a renderer that has exited, which may be reused', async () => {
      // Each kill or probe records whether our child was still running at that moment.
      const seen: Array<{ call: string; running: boolean }> = [];
      const state: { owner?: OwnedSsrRenderer } = {};
      const running = () => {
        const child = (
          state.owner as unknown as {
            runtime?: { child: import('node:child_process').ChildProcess };
          }
        )?.runtime?.child;
        return !!child && child.exitCode === null && child.signalCode === null;
      };
      const { renderer } = await scriptedFixture(
        `if (message.type === 'render') process.exit(3);`,
        50,
        { platform: 'win32', killTree: () => seen.push({ call: 'killTree', running: running() }) },
      );
      state.owner = renderer as OwnedSsrRenderer;
      const original = process.kill.bind(process);
      const probe = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
        seen.push({ call: `kill ${String(signal)}`, running: running() });
        return original(pid, signal);
      });
      try {
        await expect(
          renderer.render({ document: '', url: 'http://localhost/windows-exited' }),
        ).rejects.toThrow(/NGDOC_SSR_RENDER_(EXIT|IPC)/);
        await expect(renderer.close()).rejects.toThrow(/NGDOC_SSR_RENDER_(EXIT|IPC)/);
        expect(seen.filter((item) => !item.running)).toEqual([]);
        expect(seen.filter((item) => item.call !== 'killTree')).toEqual([]);
      } finally {
        probe.mockRestore();
      }
    }, 10_000);

    it('kills the renderer itself when the default tree kill cannot end it', async () => {
      // Outside Windows there is no taskkill: the default tree kill fails quietly and the owner
      // falls back to killing the renderer, which must still join.
      const { renderer } = await scriptedFixture(
        `if (message.type === 'render') reply({ type: 'rendered', id: message.id, html: '<p>ok</p>' });`,
        50,
        { platform: 'win32' },
      );
      await expect(
        renderer.render({ document: '', url: 'http://localhost/windows-default' }),
      ).resolves.toBe('<p>ok</p>');
      await expect(renderer.close()).rejects.toThrow('NGDOC_SSR_RENDER_FORCED_CLOSE');
    }, 10_000);
  });

  it('renders in one child and fences a full reload before re-importing the fresh entry', async () => {
    const { source, renderer, observer, mutation } = await fixture();
    await expect(
      renderer.render({ document: '<app></app>', url: 'http://localhost/one' }),
    ).resolves.toContain('"version":"ONE"');
    await expect(
      renderer.render({
        document: '<app></app>',
        url: 'http://localhost/failure',
        data: { fail: true },
      }),
    ).rejects.toThrow('fixture render failure');
    await expect(
      renderer.render({
        document: '<app></app>',
        url: 'http://localhost/non-string',
        data: { nonString: true },
      }),
    ).rejects.toThrow('HTML string');

    expect((await mutation(source('TWO'))).type).toBe('full-reload');
    await expect(
      renderer.render({ document: '<app></app>', url: 'http://localhost/two' }),
    ).resolves.toContain('"version":"TWO"');

    await mutation('export function render( {');
    await expect(
      renderer.render({ document: '<app></app>', url: 'http://localhost/broken' }),
    ).rejects.toThrow(/entry\.mjs|parse|Expected|Unexpected/i);

    await mutation(source('THREE'));
    await expect(
      renderer.render({ document: '<app></app>', url: 'http://localhost/three' }),
    ).resolves.toContain('"version":"THREE"');
    observer.disconnect?.();
  }, 30_000);

  it('rejects cancellation before dispatch without starting child work', async () => {
    const { renderer, observer } = await fixture();
    const controller = new AbortController();
    const pending = renderer.render(
      {
        document: '<app></app>',
        url: 'http://localhost/held',
        data: { wait: 10_000 },
      },
      { signal: controller.signal },
    );
    controller.abort(new Error('caller cancelled'));
    await expect(pending).rejects.toThrow('caller cancelled');
    await expect(
      renderer.render({ document: '<app></app>', url: 'http://localhost/healthy' }),
    ).resolves.toContain('/healthy');
    observer.disconnect?.();
  }, 30_000);

  it('retains an admitted cancelled slot until the child render actually settles', async () => {
    const { root, renderer, observer } = await fixture();
    const log = path.join(root, 'admission.log');
    const controller = new AbortController();
    const first = renderer.render(
      {
        document: '<app></app>',
        url: 'http://localhost/first',
        data: { wait: 10_000, settleDelay: 75, label: 'first', log },
      },
      { signal: controller.signal },
    );
    await vi.waitFor(async () => expect(await readFile(log, 'utf8')).toContain('first:start'));
    controller.abort(new Error('active caller cancelled'));
    await expect(first).rejects.toThrow('active caller cancelled');
    const second = renderer.render({
      document: '<app></app>',
      url: 'http://localhost/second',
      data: { label: 'second', log },
    });
    await expect(second).resolves.toContain('/second');
    expect(await readFile(log, 'utf8')).toBe(
      'first:start\nfirst:settle\nsecond:start\nsecond:settle\n',
    );
    observer.disconnect?.();
  }, 30_000);

  it('bounds active and queued renders and shares idempotent close settlement', async () => {
    const { root, renderer, observer } = await fixture();
    const log = path.join(root, 'queue.log');
    const controller = new AbortController();
    const first = renderer.render(
      {
        document: '',
        url: 'http://localhost/first',
        data: { wait: 10_000, label: 'first', log },
      },
      { signal: controller.signal },
    );
    await vi.waitFor(async () => expect(await readFile(log, 'utf8')).toContain('first:start'));
    const second = renderer.render({ document: '', url: 'http://localhost/second' });
    await expect(
      renderer.render({ document: '', url: 'http://localhost/overflow' }),
    ).rejects.toThrow('QUEUE_FULL');
    controller.abort(new Error('release queue'));
    await expect(first).rejects.toThrow('release queue');
    await expect(second).resolves.toContain('/second');
    const closing = renderer.close();
    expect(renderer.close()).toBe(closing);
    await closing;
    await expect(renderer.render({ document: '', url: 'http://localhost/late' })).rejects.toThrow(
      'DISPOSED',
    );
    observer.disconnect?.();
  }, 30_000);

  it('rejects invalid requests and divergent selection without starting a runtime', async () => {
    const owner = new OwnedSsrRenderer();
    const selected = owner.select('/one.ts');
    expect(owner.select('/one.ts')).toBe(selected);
    expect(() => owner.select('/two.ts')).toThrow('ENTRY_CONFLICT');
    const getter = { url: 'http://localhost/' } as Record<string, unknown>;
    Object.defineProperty(getter, 'document', { enumerable: true, get: () => '<app></app>' });
    await expect(selected.render(getter as never)).rejects.toThrow('REQUEST');
    await expect(selected.render({ document: '', url: 'relative/path' })).rejects.toThrow(
      'absolute HTTP',
    );
    await expect(selected.render({ document: '', url: 'http://localhost/' })).rejects.toThrow(
      'ADMISSION',
    );
    await selected.close();
  });

  it('fails closed on a malformed current-epoch child frame and joins the child', async () => {
    const { renderer } = await scriptedFixture(`
      if (message.type === 'render') {
        process.send?.({ version, epoch, type: 'not-a-frame' });
      }
      if (message.type === 'close') process.exit(0);
    `);
    await expect(
      renderer.render({ document: '', url: 'http://localhost/malformed' }),
    ).rejects.toThrow('NGDOC_SSR_RENDER_PROTOCOL');
    await expect(renderer.close()).rejects.toThrow('NGDOC_SSR_RENDER_PROTOCOL');
  }, 10_000);

  it('rejects a child-reported fatal error and preserves its cause', async () => {
    const { renderer } = await scriptedFixture(`
      if (message.type === 'render') {
        reply({ type: 'fatal', error: { name: 'Error', message: 'isolated fatal cause' } });
      }
      if (message.type === 'close') process.exit(0);
    `);
    await expect(renderer.render({ document: '', url: 'http://localhost/fatal' })).rejects.toThrow(
      'isolated fatal cause',
    );
    await expect(renderer.close()).rejects.toThrow('isolated fatal cause');
  }, 10_000);

  it('does not count a closed frame followed by nonzero exit as graceful', async () => {
    const { renderer } = await scriptedFixture(`
      if (message.type === 'render') reply({ type: 'rendered', id: message.id, html: '<p>ok</p>' });
      if (message.type === 'close') {
        reply({ type: 'closed' });
        setImmediate(() => process.exit(2));
      }
    `);
    await expect(renderer.render({ document: '', url: 'http://localhost/nonzero' })).resolves.toBe(
      '<p>ok</p>',
    );
    await expect(renderer.close()).rejects.toThrow(/FORCED_CLOSE|unsuccessfully/);
  }, 10_000);

  it('force-terminates, joins and reports a child that ignores close', async () => {
    const { renderer } = await scriptedFixture(
      `
      if (message.type === 'render') reply({ type: 'rendered', id: message.id, html: '<p>ok</p>' });
      // Deliberately ignore close to exercise the bounded TERM/KILL owner path.
    `,
      50,
    );
    await expect(renderer.render({ document: '', url: 'http://localhost/forced' })).resolves.toBe(
      '<p>ok</p>',
    );
    await expect(renderer.close()).rejects.toThrow('NGDOC_SSR_RENDER_FORCED_CLOSE');
  }, 10_000);

  // macOS answers EPERM, not ESRCH, for a group whose members have all exited while one is not
  // reaped yet. Under load that window is long enough for the owner's probes and kills to land in
  // it; here every group call answers EPERM from the TERM until Node reports the exit.
  it.skipIf(process.platform === 'win32')(
    'joins a renderer whose exited, unreaped group answers EPERM, and still reports the forced close',
    async () => {
      const { renderer } = await scriptedFixture(
        `
      if (message.type === 'render') reply({ type: 'rendered', id: message.id, html: '<p>ok</p>' });
    `,
        50,
      );
      await expect(
        renderer.render({ document: '', url: 'http://localhost/unreaped' }),
      ).resolves.toBe('<p>ok</p>');
      const original = process.kill.bind(process);
      let group: number | undefined;
      let unreaped = false;
      const answered: string[] = [];
      const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
        if (pid >= 0) return original(pid, signal);
        group ??= -pid;
        if (unreaped) {
          answered.push(`EPERM ${String(signal)}`);
          throw Object.assign(new Error('kill EPERM'), { code: 'EPERM', syscall: 'kill' });
        }
        const result = original(pid, signal);
        if (signal === 'SIGTERM') {
          // The renderer dies from it; until Node reaps it, its group answers EPERM.
          unreaped = true;
          void new Promise<void>((resolve) => {
            const poll = () => {
              try {
                original(-group!, 0);
              } catch (error) {
                // A real EPERM is the real unreaped window: keep polling.
                if ((error as NodeJS.ErrnoException).code === 'ESRCH') return resolve();
              }
              setTimeout(poll, 5);
            };
            poll();
          }).then(() => (unreaped = false));
        }
        return result;
      });
      try {
        await expect(renderer.close()).rejects.toThrow('NGDOC_SSR_RENDER_FORCED_CLOSE');
      } finally {
        kill.mockRestore();
      }
      expect(answered.length).toBeGreaterThan(0);
      expect(() => process.kill(-group!, 0)).toThrow(/ESRCH/);
    },
    10_000,
  );

  // Windows has no process groups: a descendant the renderer left running after it exited is no
  // longer linked to it, so this guarantee is POSIX-only (see the Windows supervision tests).
  it.skipIf(process.platform === 'win32')(
    'force-terminates an inherited process-group descendant after an acknowledged child close',
    async () => {
      const temporary = path.resolve(import.meta.dirname, '../../../../../tmp');
      await mkdir(temporary, { recursive: true });
      const descendantRoot = await mkdtemp(path.join(temporary, 'ngdoc-ssr-descendant-'));
      roots.push(descendantRoot);
      const pidFile = path.join(descendantRoot, 'descendant.pid');
      let descendant: number | undefined;
      const { renderer } = await scriptedFixture(
        `
      if (message.type === 'render') {
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], { stdio: 'ignore' });
        child.unref();
        writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
        reply({ type: 'rendered', id: message.id, html: '<p>ok</p>' });
      }
      if (message.type === 'close') {
        reply({ type: 'closed' });
        process.exit(0);
      }
    `,
        100,
      );
      try {
        await expect(
          renderer.render({ document: '', url: 'http://localhost/descendant' }),
        ).resolves.toBe('<p>ok</p>');
        await vi.waitFor(async () => {
          descendant = Number(await readFile(pidFile, 'utf8'));
          expect(Number.isSafeInteger(descendant) && descendant > 0).toBe(true);
          expect(() => process.kill(descendant!, 0)).not.toThrow();
        });
        await expect(renderer.close()).rejects.toThrow('NGDOC_SSR_RENDER_FORCED_CLOSE');
        await vi.waitFor(() => {
          expect(() => process.kill(descendant!, 0)).toThrow(/ESRCH/);
        });
      } finally {
        if (descendant) killIfAlive(descendant);
      }
    },
    15_000,
  );

  it('close rejects a held fence and prevents a serialized fence from restarting', async () => {
    const { renderer, server } = await scriptedFixture(
      `
      if (message.type === 'render') reply({ type: 'rendered', id: message.id, html: '<p>ok</p>' });
      // Deliberately hold fence requests until close tests terminal admission.
      if (message.type === 'close') {
        reply({ type: 'closed' });
        setImmediate(() => process.exit(0));
      }
    `,
      500,
    );
    await expect(renderer.render({ document: '', url: 'http://localhost/initial' })).resolves.toBe(
      '<p>ok</p>',
    );
    server.environments.ssr.hot.send({
      type: 'error',
      err: { message: 'prior update failed', stack: 'Error: prior update failed' },
    });
    const first = renderer.render({ document: '', url: 'http://localhost/fenced-one' });
    const second = renderer.render({ document: '', url: 'http://localhost/fenced-two' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const closing = renderer.close();
    await expect(first).rejects.toThrow('DISPOSED');
    await expect(second).rejects.toThrow('DISPOSED');
    await closing;
  }, 10_000);

  it('cleans a fence whose synchronous IPC send fails before awaiting it', async () => {
    const owner = new OwnedSsrRenderer({
      limits: { ...DEFAULT_SSR_RENDER_LIMITS, fenceDeadlineMs: 25 },
    });
    const internal = owner as any;
    const runtime = {
      epoch: 'fence-send-failure',
      child: {
        connected: true,
        send() {
          throw new Error('synchronous fence send failure');
        },
      },
    };
    internal.runtime = runtime;
    internal.observedHotSequence = 1;
    await expect(internal.ensureFenced(runtime)).rejects.toThrow('synchronous fence send failure');
    expect(internal.fences.size).toBe(0);
    internal.runtime = undefined;
    await owner.close();
  });

  it('preserves caller abort reason when cancel IPC throws and still joins terminal cleanup', async () => {
    const owner = new OwnedSsrRenderer({
      limits: { ...DEFAULT_SSR_RENDER_LIMITS, closeDeadlineMs: 25 },
    });
    const internal = owner as any;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<string>((_resolve, reject) => {
      rejectResult = reject;
    });
    const readyReject = vi.fn();
    const job = {
      id: 1,
      request: { document: '', url: 'http://localhost/' },
      result: { promise: result, resolve: vi.fn(), reject: rejectResult },
      sent: true,
      callerSettled: false,
    };
    const runtime = {
      epoch: 'cancel-send-failure',
      child: {
        connected: true,
        exitCode: 0,
        signalCode: null,
        send() {
          throw new Error('synchronous cancel send failure');
        },
      },
      exit: Promise.resolve({ code: 0, signal: null }),
      ready: { promise: Promise.resolve(), resolve: vi.fn(), reject: readyReject },
      closed: { promise: Promise.resolve(), resolve: vi.fn(), reject: vi.fn() },
    };
    internal.runtime = runtime;
    internal.active.set(job.id, job);
    const caller = expect(result).rejects.toThrow('caller abort remains authoritative');
    internal.abort(job, new Error('caller abort remains authoritative'));
    await caller;
    await vi.waitFor(() => expect(internal.runtime).toBeUndefined());
    expect(internal.failure).toMatchObject({ message: 'synchronous cancel send failure' });
    await expect(owner.close()).rejects.toThrow('synchronous cancel send failure');
  });

  it('keeps selection stable and rejects ambiguous plugin capabilities', () => {
    const selected = {} as NgDocViteSsrRenderer;
    const select = vi.fn(() => selected);
    const plugin = {
      name: '@ng-doc/vite',
      api: { ngDocSsrRenderer: { schemaVersion: 1, select } },
    } as unknown as Plugin;
    expect(getNgDocViteSsrRenderer([plugin], { entry: '/main.server.ts' })).toBe(selected);
    expect(select).toHaveBeenCalledWith('/main.server.ts');
    expect(() => getNgDocViteSsrRenderer([], { entry: '/main.server.ts' })).toThrow(
      'NGDOC_SSR_RENDER_PLUGIN',
    );
    expect(() => getNgDocViteSsrRenderer([plugin, plugin], { entry: '/main.server.ts' })).toThrow(
      'NGDOC_SSR_RENDER_PLUGIN',
    );
  });

  it('rejects a render before the generator is initialized', async () => {
    const plugins = createNgDocVitePlugin({
      analogLiveReload: true,
      angularPlugins: qualifyAngularPlugins([
        {
          name: '@analogjs/vite-plugin-angular',
          buildStart() {},
          handleHotUpdate(context: HmrContext) {
            return context.modules;
          },
          transform() {
            return { code: 'class AppComponent {}; AppComponent.ɵcmp = {};', map: null };
          },
        },
      ]),
      angularComponentProbe: '/workspace/app.component.ts',
      generator: {
        projectId: 'ssr-mode',
        workspaceRoot: '/workspace',
        defaults: {
          docsRoot: '/workspace/docs',
          tsConfig: '/workspace/tsconfig.json',
          outputRoot: '/workspace/generated',
          cacheRoot: '/workspace/cache',
        },
      },
    });
    const renderer = getNgDocViteSsrRenderer(plugins, { entry: '/main.server.ts' });
    await expect(
      renderer.render({ document: '<app></app>', url: 'http://localhost/' }),
    ).rejects.toThrow('ADMISSION');
    await (plugins[0] as Record<string, any>).closeBundle();
  });

  it('generates an epoch-scoped self-accepting control module', () => {
    const source = renderSsrControlModule('epoch-one');
    expect(source).toContain("Symbol.for('@ng-doc/vite:ssr-render-control')");
    expect(source).toContain('epoch-one');
    expect(source).toContain('import.meta.hot.accept()');
    expect(source).toContain('waitForNgDocSsrFence');
  });
});
