import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs, { readFileSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { type FSWatcher, type ViteDevServer, createServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildResult, CompilationRequest, Diagnostic, WatchInputs } from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import { WATCHER_RESCAN } from '../../session/watch-signals';
import { acquireOutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';
import { metadataWatchIgnore, resolveOptions, staticViteConfig } from '../options';
import {
  MAX_LOST_WATCHES,
  MAX_RETAINED_REJECTIONS,
  ViteFileEventSource,
  WATCHER_ERROR_COALESCE_MS,
} from '../vite-event-source';
import { WatchInputRegistry } from '../watch-inputs';

/**
 * Vite host watcher parity with the Angular CLI host's hardened Parcel watcher.
 * The chokidar watcher is a stand-in EventEmitter; every other part (session, event source,
 * lifecycle, host-update coordination) is the real implementation.
 */

const temporary: string[] = [];
const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

class FakeWatcher extends EventEmitter {
  readonly added: string[] = [];
  readonly close = vi.fn(async () => {});
  readonly unwatch = vi.fn(async () => {});

  add(values: string | readonly string[]): this {
    this.added.push(...(typeof values === 'string' ? [values] : values));
    return this;
  }
}

async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-watch-recovery-'));
  temporary.push(root);
  return root;
}

/**
 * Runs every cleanup step in order, whatever an earlier step did. Without a `primary` failure it
 * rethrows the first cleanup failure (an AggregateError for several). When the test body already
 * failed (`primary`), it never throws: the body's own error propagates unchanged, with the cleanup
 * failures attached as `cleanupFailures` and logged, so a cleanup error cannot mask the assertion.
 */
async function cleanupAll(
  steps: ReadonlyArray<() => unknown>,
  primary?: { readonly error: unknown },
): Promise<void> {
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (!failures.length) return;
  if (primary) {
    // Attach only where possible: a frozen or non-extensible error must still propagate unchanged.
    try {
      if (
        primary.error !== null &&
        typeof primary.error === 'object' &&
        Object.isExtensible(primary.error)
      )
        Object.defineProperty(primary.error, 'cleanupFailures', {
          value: failures,
          configurable: true,
          enumerable: true,
          writable: true,
        });
    } catch {
      // A proxy or exotic error that refuses the property: the log below still reports the failures.
    }
    // Still visible in the report (stderr of the failed test), without replacing its error.
    console.error('Fixture cleanup also failed after the test failed:', ...failures);
    return;
  }
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(failures, 'Fixture cleanup failed');
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function configuration(root: string) {
  return {
    outputRoot: root,
    cacheRoot: path.join(root, 'cache'),
    assetDirectory: 'assets',
    themes: { light: 'github-light', dark: 'ayu-dark' },
    digest: digest(root),
  };
}

function snapshot(revision: string) {
  return { projectId: 'test', revision, artifacts: [], globalKeywords: [], remoteKeywords: [] };
}

/**
 * A C dev server without Vite: the real session, event source and lifecycle. `page` is always
 * read; `snippet` is read only while the page body contains "include". `hold` blocks the next
 * generation that reads the snippet until it is released.
 */
async function harness() {
  const root = await directory();
  const output = path.join(root, 'out');
  const page = path.join(root, 'docs/page.md');
  const snippet = path.join(root, 'snippets/snippet.md');
  await mkdir(path.dirname(page), { recursive: true });
  await mkdir(path.dirname(snippet), { recursive: true });
  await mkdir(output, { recursive: true });
  let gate: Promise<void> | undefined;
  let reading: (() => void) | undefined;
  const commits: string[] = [];
  const requests: CompilationRequest[] = [];
  const compile = vi.fn(async (request: CompilationRequest) => {
    requests.push(request);
    const body = await readFile(page, 'utf8');
    const dependencies = [{ kind: 'content' as const, path: page, digest: digest(body) }];
    let included = '';
    if (body.includes('include')) {
      included = await readFile(snippet, 'utf8');
      dependencies.push({ kind: 'content' as const, path: snippet, digest: digest(included) });
      const held = gate;
      gate = undefined;
      reading?.();
      reading = undefined;
      await held;
    }
    return {
      candidate: snapshot(`${request.generation}:${body}|${included}`),
      dependencies,
      diagnostics: [],
      whyRebuilt: [],
    };
  });
  const session = createBuildSession(
    {
      compiler: { compile, dispose: async () => {} },
      committer: {
        commit: async (request) => {
          commits.push(request.candidate.revision);
          return {
            status: 'committed',
            manifest: {
              schemaVersion: 1,
              projectId: 'test',
              generation: request.generation,
              revision: request.candidate.revision,
              files: [],
            },
            written: [],
            removed: [],
            diagnostics: [],
          };
        },
        dispose: async () => {},
      },
    },
    { batchDelayMs: 0 },
  );
  const watcher = new FakeWatcher();
  const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100);
  source.excludeOwned(output);
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const server = { config: { logger }, ws: { send: vi.fn() } } as unknown as ViteDevServer;
  const lifecycle = new ViteAdapterLifecycle(
    acquireOutputLease(`watch-recovery-${Date.now()}-${Math.random()}`, output),
  );
  lifecycle.attachServer(server, source);
  lifecycle.attachSession(session);
  const diagnostics: Diagnostic[] = [];
  const results: BuildResult[] = [];
  const observer = lifecycle.observer(() => configuration(output));
  const start = async () => {
    const built = await session.buildOnce({ mode: 'development' });
    expect(built.status).toBe('success');
    await source.seed(built.generation, built.watchInputs);
    const watch = await session.watch(source, (event) => {
      if (event.kind === 'diagnostic') diagnostics.push(event.diagnostic);
      if (event.kind === 'result') results.push(event.result);
      observer(event);
    });
    lifecycle.attachWatch(watch);
    await watch.initial;
  };
  /** Writes a file and reports it the way the Vite hotUpdate hook does. */
  const edit = async (file: string, body: string, kind: 'update' | 'create' = 'update') => {
    await writeFile(file, body);
    lifecycle.hostUpdateStarted(file, kind, () => body);
  };
  /** Arms the gate: the next generation that reads the snippet waits until `release`. */
  const hold = () => {
    let release!: () => void;
    gate = new Promise<void>((resolve) => (release = resolve));
    const read = new Promise<void>((resolve) => (reading = resolve));
    return { read, release };
  };
  const dispose = async () => {
    await lifecycle.settled();
    await lifecycle.dispose();
  };
  return {
    root,
    output,
    page,
    snippet,
    watcher,
    source,
    session,
    lifecycle,
    logger,
    commits,
    requests,
    compile,
    diagnostics,
    results,
    start,
    edit,
    hold,
    dispose,
  };
}

describe('Vite watcher parity: an edit to an input first recorded by the in-flight generation', () => {
  it('publishes the edit through the physical-registration reconcile', async () => {
    const h = await harness();
    await writeFile(h.page, 'v1');
    await writeFile(h.snippet, 'snippet v1');
    await h.start();
    expect(h.commits).toEqual(['1:v1|']);

    const held = h.hold();
    await h.edit(h.page, 'v2 include');
    await held.read;
    // Generation 2 has read snippet v1 and is still running: the snippet is not a recorded input
    // yet, so its edit is not forwarded to the session.
    await h.edit(h.snippet, 'snippet v2');
    held.release();
    await vi.waitFor(() => expect(h.commits).toContain('3:v2 include|snippet v2'), {
      timeout: 5_000,
    });
    expect(h.commits).toEqual(['1:v1|', '2:v2 include|snippet v1', '3:v2 include|snippet v2']);
    await h.dispose();
  }, 15_000);

  it('publishes the edit when the input was recorded before, dropped, and recorded again', async () => {
    const h = await harness();
    await writeFile(h.page, 'v1 include');
    await writeFile(h.snippet, 'snippet v1');
    await h.start();
    expect(h.commits).toEqual(['1:v1 include|snippet v1']);

    // Generation 2 no longer reads the snippet: it leaves the effective inputs, but it stays a
    // physical watch target (chokidar watches are never removed).
    await h.edit(h.page, 'v2');
    await vi.waitFor(() => expect(h.commits).toContain('2:v2|'), { timeout: 5_000 });
    await h.lifecycle.settled();

    const held = h.hold();
    await h.edit(h.page, 'v3 include');
    await held.read;
    await h.edit(h.snippet, 'snippet v2');
    held.release();
    await vi.waitFor(() => expect(h.commits).toContain('4:v3 include|snippet v2'), {
      timeout: 5_000,
    });
    await h.dispose();
  }, 15_000);
});

/** An error shaped exactly like the `fs` failures chokidar re-emits (Node's UVException). */
function fsError(code: string, syscall: string, target?: string): NodeJS.ErrnoException {
  return Object.assign(
    new Error(`${code}: simulated failure, ${syscall}${target ? ` '${target}'` : ''}`),
    { code, errno: -1, syscall, ...(target ? { path: target } : {}) },
  );
}

function inputs(files: string[], globs: WatchInputs['globs'] = []): WatchInputs {
  return { files, globs };
}

async function subscribed(seed?: WatchInputs) {
  const root = await directory();
  const watcher = new FakeWatcher();
  const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100);
  const output = path.join(root, 'out');
  source.excludeOwned(output);
  if (seed) await source.seed(1, seed);
  const diagnostics: Diagnostic[] = [];
  const subscription = await source.subscribe(
    () => {},
    (diagnostic) => diagnostics.push(diagnostic),
  );
  return { root, output, watcher, source, diagnostics, subscription };
}

/** Resolves once chokidar finished its initial scan (it emits 'ready' on the next tick). */
function watcherReady(watcher: FSWatcher): Promise<void> {
  if ((watcher as FSWatcher & { _readyEmitted?: boolean })._readyEmitted) return Promise.resolve();
  return new Promise((resolve) => watcher.once('ready', () => resolve()));
}

const flushed = () => new Promise((done) => setTimeout(done, WATCHER_ERROR_COALESCE_MS + 50));

describe('Vite watcher error classification (chokidar error events)', () => {
  it('turns recoverable fs failures on inputs into one coalesced WATCHER_RESCAN warning', async () => {
    const root = await directory();
    const page = path.join(root, 'docs/page.md');
    const docs = path.join(root, 'docs');
    const h = await subscribed(
      inputs([page], [{ root: path.join(root, 'api'), include: ['src/**/*.ts'], exclude: [] }]),
    );
    // stat of an input (fsevents add), scandir of its directory (nodefs read), a path below a
    // glob base that is not a member yet, and an awaitWriteFinish stat failure.
    h.watcher.emit('error', fsError('EMFILE', 'stat', page));
    h.watcher.emit('error', fsError('EMFILE', 'scandir', docs));
    h.watcher.emit('error', fsError('EIO', 'lstat', path.join(root, 'api/src/new-dir')));
    h.watcher.emit('error', fsError('EBUSY', 'open', page));
    expect(h.diagnostics).toEqual([]);
    await flushed();
    expect(h.diagnostics).toEqual([
      {
        code: WATCHER_RESCAN,
        severity: 'warning',
        stage: 'host',
        message: expect.stringContaining('(and 3 more)'),
        source: { path: page },
      },
    ]);
    expect(h.diagnostics[0].message).toContain('Re-observing every recorded input.');
    // A later burst is reported again: nothing is dropped after the first report.
    h.watcher.emit('error', fsError('ENFILE', 'stat', page));
    await flushed();
    expect(h.diagnostics.map((item) => item.code)).toEqual([WATCHER_RESCAN, WATCHER_RESCAN]);
    expect(h.diagnostics[1].message).not.toContain('more');
    await h.subscription.dispose();
  });

  it('keeps a lost native watch on an input fatal and a non-fs error fatal', async () => {
    const root = await directory();
    const page = path.join(root, 'docs/page.md');
    const h = await subscribed(inputs([page]));
    h.watcher.emit('error', fsError('ENOSPC', 'watch', path.dirname(page)));
    h.watcher.emit('error', fsError('EMFILE', 'watch'));
    h.watcher.emit('error', new Error('plugin emitted failure'));
    h.watcher.emit('error', Object.assign(new Error('odd code'), { code: 'ERR_SOMETHING' }));
    expect(h.diagnostics).toEqual([
      expect.objectContaining({
        code: 'NGDOC_VITE_WATCHER',
        severity: 'error',
        message: expect.stringContaining('fs.inotify.max_user_watches'),
      }),
      expect.objectContaining({ code: 'NGDOC_VITE_WATCHER', severity: 'error' }),
      {
        code: 'NGDOC_VITE_WATCHER',
        severity: 'error',
        stage: 'host',
        message: 'plugin emitted failure',
      },
      { code: 'NGDOC_VITE_WATCHER', severity: 'error', stage: 'host', message: 'odd code' },
    ]);
    await flushed();
    expect(h.diagnostics).toHaveLength(4);
    await h.subscription.dispose();
  });

  it('only warns about failures that cannot hide a recorded input', async () => {
    const root = await directory();
    const page = path.join(root, 'docs/page.md');
    const h = await subscribed(inputs([page]));
    h.watcher.emit('error', fsError('EMFILE', 'stat', path.join(root, 'unrelated/file.ts')));
    h.watcher.emit('error', fsError('ENOSPC', 'watch', path.join(root, 'unrelated')));
    h.watcher.emit('error', fsError('EMFILE', 'stat', path.join(h.output, 'routes.ts')));
    await flushed();
    expect(h.diagnostics).toEqual([
      {
        code: 'NGDOC_VITE_WATCHER',
        severity: 'warning',
        stage: 'host',
        message: expect.stringMatching(/outside the recorded NgDoc inputs.*\(and 2 more\)/),
      },
    ]);
    await h.subscription.dispose();
  });

  it('treats every fs failure as relevant before the inputs are known', async () => {
    const root = await directory();
    const h = await subscribed();
    h.watcher.emit('error', fsError('EMFILE', 'stat', path.join(root, 'anything.ts')));
    await flushed();
    expect(h.diagnostics.map((item) => item.code)).toEqual([WATCHER_RESCAN]);
    await h.subscription.dispose();
  });

  it('drops a pending report when the source is disposed', async () => {
    const root = await directory();
    const h = await subscribed(inputs([path.join(root, 'page.md')]));
    h.watcher.emit('error', fsError('EMFILE', 'stat', path.join(root, 'page.md')));
    await h.subscription.dispose();
    await flushed();
    expect(h.diagnostics).toEqual([]);
    expect(h.watcher.listenerCount('error')).toBe(0);
  });

  it("classifies a real error from Vite's bundled chokidar (symlink loop, ELOOP on stat)", async () => {
    // Outside the repository (no sibling test file shares it) and owned entirely by this test:
    // the loop is removed, and the watcher and server closed, before the test returns.
    const root = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ng-doc-watch-eloop-')));
    const docs = path.join(root, 'docs');
    const loop = path.join(docs, 'loop');
    const back = path.join(docs, 'loop-back');
    await mkdir(docs, { recursive: true });
    let server: ViteDevServer | undefined;
    let subscription: { dispose(): Promise<void> } | undefined;
    let failure: { error: unknown } | undefined;
    try {
      server = await createServer({
        root,
        // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
        // default one is shared by every fixture.
        cacheDir: path.join(root, '.vite/node_modules/.vite'),
        configFile: false,
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0 },
      });
      servers.push(server);
      await watcherReady(server.watcher);
      const source = new ViteFileEventSource(server.watcher, 100);
      await source.seed(1, inputs([], [{ root: docs, include: ['**/*.md'], exclude: [] }]));
      const diagnostics: Diagnostic[] = [];
      const errors: unknown[] = [];
      server.watcher.on('error', (error) => errors.push(error));
      subscription = await source.subscribe(
        () => {},
        (diagnostic) => diagnostics.push(diagnostic),
      );
      await symlink(back, loop);
      await symlink(loop, back);
      server.watcher.add(loop);
      await vi.waitFor(() => expect(diagnostics).toHaveLength(1), { timeout: 5_000 });
      // chokidar may report both links (the explicit add, and the root watcher following the new
      // symlink); the source reports them together.
      expect(errors.length).toBeGreaterThanOrEqual(1);
      for (const error of errors) {
        expect(error).toMatchObject({ code: 'ELOOP', syscall: 'stat' });
        expect([loop, back]).toContain((error as NodeJS.ErrnoException).path);
      }
      expect(diagnostics[0]).toMatchObject({ code: WATCHER_RESCAN, severity: 'warning' });
      expect([loop, back]).toContain(diagnostics[0].source?.path);
    } catch (error) {
      failure = { error };
      throw error;
    } finally {
      // Every step runs even when an earlier one throws, so the temp root (which holds the
      // symlink loop) is always removed. A cleanup failure is rethrown only when the body passed.
      await cleanupAll(
        [
          () => subscription?.dispose(),
          () => server?.watcher.unwatch([loop, back]),
          () => rm(loop, { force: true }),
          () => rm(back, { force: true }),
          async () => {
            if (!server) return;
            await server.close();
            // Only a closed server leaves the shared list; the file-level afterEach retries others.
            const index = servers.indexOf(server);
            if (index !== -1) servers.splice(index, 1);
          },
          () => rm(root, { recursive: true, force: true }),
        ],
        failure,
      );
    }
  }, 30_000);

  it('fixture cleanup runs every step after a failing one and rethrows the first failure', async () => {
    const ran: string[] = [];
    const first = new Error('dispose failed');
    await expect(
      cleanupAll([
        () => {
          ran.push('dispose');
          throw first;
        },
        async () => {
          ran.push('close');
          throw new Error('close failed');
        },
        () => ran.push('remove root'),
      ]),
    ).rejects.toMatchObject({
      errors: [first, expect.objectContaining({ message: 'close failed' })],
    });
    expect(ran).toEqual(['dispose', 'close', 'remove root']);
    await expect(cleanupAll([() => ran.push('only'), () => Promise.reject(first)])).rejects.toBe(
      first,
    );
    await expect(cleanupAll([() => undefined])).resolves.toBeUndefined();
  });

  it('a cleanup failure never masks the test body failure: the body error propagates, cleanup attached', async () => {
    const ran: string[] = [];
    const assertion = new Error('expected ELOOP diagnostic');
    const disposal = new Error('dispose failed');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const body = async () => {
      let failure: { error: unknown } | undefined;
      try {
        throw assertion;
      } catch (error) {
        failure = { error };
        throw error;
      } finally {
        await cleanupAll(
          [
            () => {
              ran.push('dispose');
              throw disposal;
            },
            () => ran.push('remove root'),
          ],
          failure,
        );
      }
    };
    await expect(body()).rejects.toBe(assertion);
    expect(ran).toEqual(['dispose', 'remove root']);
    expect(assertion).toMatchObject({ cleanupFailures: [disposal] });
    // A primary failure that is not an object is still rethrown unchanged by the caller.
    await expect(
      cleanupAll([() => Promise.reject(disposal)], { error: 'plain' }),
    ).resolves.toBeUndefined();
    await expect(cleanupAll([() => undefined], { error: assertion })).resolves.toBeUndefined();
    // A frozen primary error (or one that refuses new properties) is never replaced by a TypeError.
    const frozen = Object.freeze(new Error('frozen assertion'));
    await expect(
      cleanupAll([() => Promise.reject(disposal)], { error: frozen }),
    ).resolves.toBeUndefined();
    const refusing = new Proxy(new Error('proxy'), {
      defineProperty: () => {
        throw new TypeError('refused');
      },
    });
    await expect(
      cleanupAll([() => Promise.reject(disposal)], { error: refusing }),
    ).resolves.toBeUndefined();
    expect(logged.mock.calls.map((call) => call.slice(1))).toEqual([
      [disposal],
      [disposal],
      [disposal],
      [disposal],
    ]);
    logged.mockRestore();
  });
});

describe('Vite lossy-watcher recovery through the session reconcile (WATCHER_RESCAN parity)', () => {
  it('re-observes every committed input after a recoverable error and publishes a lost edit', async () => {
    const h = await harness();
    await writeFile(h.page, 'v1');
    await h.start();
    expect(h.commits).toEqual(['1:v1|']);

    // The edit happens on disk, but its event is lost: only a watcher error is reported.
    await writeFile(h.page, 'v2 lost');
    h.watcher.emit('error', fsError('EMFILE', 'stat', h.page));
    await vi.waitFor(() => expect(h.commits).toContain('2:v2 lost|'), { timeout: 5_000 });
    expect(h.requests.at(-1)?.changes).toEqual([{ kind: 'update', path: h.page }]);
    await h.lifecycle.settled();
    expect(h.lifecycle.failure).toBeUndefined();
    expect(h.logger.error).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalledWith(expect.stringContaining(`[${WATCHER_RESCAN}]`));
    expect(h.diagnostics.map((item) => `${item.code}:${item.severity}`)).toEqual([
      `${WATCHER_RESCAN}:warning`,
    ]);

    // Watching continues: an ordinary edit still regenerates.
    await h.edit(h.page, 'v3');
    await vi.waitFor(() => expect(h.commits).toContain('3:v3|'), { timeout: 5_000 });
    await h.dispose();
  }, 15_000);

  it('keeps a lost native watch on an input visible as a failure without regenerating', async () => {
    const h = await harness();
    await writeFile(h.page, 'v1');
    await h.start();
    h.watcher.emit('error', fsError('ENOSPC', 'watch', path.dirname(h.page)));
    await h.lifecycle.settled();
    expect(h.lifecycle.failure?.message).toContain('ENOSPC');
    expect(h.compile).toHaveBeenCalledTimes(1);
    // A later successful publication does not clear it: the watch stays lost until restart.
    await h.edit(h.page, 'v2');
    await vi.waitFor(() => expect(h.commits).toContain('2:v2|'), { timeout: 5_000 });
    await h.lifecycle.settled();
    expect(h.lifecycle.failure?.message).toContain('ENOSPC');
    expect(h.lifecycle.failure?.message).toContain('restart Vite');
    await h.dispose();
  }, 15_000);
});

describe('failures on paths that become inputs later', () => {
  const success = (generation: number, watchInputs: WatchInputs): BuildResult => ({
    status: 'success',
    generation,
    snapshot: undefined as never,
    manifest: undefined as never,
    diagnostics: [],
    whyRebuilt: [],
    watchInputs,
  });

  it('fails once a lost watch outside the inputs covers a newly recorded input (real chokidar, fs.watch backend)', async () => {
    const root = realpathSync(await directory());
    const page = path.join(root, 'docs/page.md');
    await mkdir(path.dirname(page), { recursive: true });
    await writeFile(page, 'v1');
    const server = await createServer({
      root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, watch: { useFsEvents: false, usePolling: false } },
    });
    servers.push(server);
    const watcher = server.watcher;
    await new Promise<void>((resolve) => watcher.once('ready', () => resolve()));
    const source = new ViteFileEventSource(watcher, 100);
    await source.seed(1, inputs([page]));
    const diagnostics: Diagnostic[] = [];
    const subscription = await source.subscribe(
      () => {},
      (diagnostic) => diagnostics.push(diagnostic),
    );
    const examples = path.join(root, 'examples');
    const demo = path.join(examples, 'demo.ts');
    const realWatch = fs.watch;
    // The inotify limit is reached for new watches under examples/.
    (fs as { watch: unknown }).watch = function (target: string, ...rest: unknown[]) {
      if (String(target).startsWith(examples)) {
        throw Object.assign(
          new Error(`ENOSPC: System limit for number of file watchers reached, watch '${target}'`),
          { errno: -28, code: 'ENOSPC', syscall: 'watch', path: target, filename: target },
        );
      }
      return Reflect.apply(realWatch, fs, [target, ...rest]);
    };
    try {
      await mkdir(examples);
      await writeFile(demo, 'export const a = 1;');
      await vi.waitFor(() => expect(diagnostics).toHaveLength(1), { timeout: 5_000 });
    } finally {
      (fs as { watch: typeof fs.watch }).watch = realWatch;
    }
    // Not an input yet: only a warning.
    expect(diagnostics[0]).toMatchObject({ code: 'NGDOC_VITE_WATCHER', severity: 'warning' });

    // A later generation records examples/demo.ts; chokidar will never watch it.
    source.started(2);
    expect((await source.observe(success(2, inputs([page, demo])))).accepted).toBe(true);
    expect(diagnostics.slice(1)).toEqual([
      expect.objectContaining({
        code: 'NGDOC_VITE_WATCHER',
        severity: 'error',
        message: expect.stringContaining('restart Vite'),
      }),
    ]);
    expect(diagnostics[1].message).toContain(examples);
    await subscription.dispose();
  }, 30_000);

  it('makes too many lost watches outside the inputs fatal', async () => {
    const root = await directory();
    const h = await subscribed(inputs([path.join(root, 'page.md')]));
    for (let index = 0; index <= MAX_LOST_WATCHES; index += 1) {
      h.watcher.emit('error', fsError('ENOSPC', 'watch', path.join(root, `elsewhere/${index}`)));
    }
    h.watcher.emit('error', fsError('ENOSPC', 'watch', path.join(root, 'elsewhere/late')));
    expect(h.diagnostics.filter((item) => item.severity === 'error')).toEqual([
      expect.objectContaining({
        code: 'NGDOC_VITE_WATCHER',
        message: expect.stringContaining(`More than ${MAX_LOST_WATCHES} native watches`),
      }),
    ]);
    // Lost watches below an owned root are the generator's own output and are not tracked.
    const owned = await subscribed(inputs([path.join(root, 'page.md')]));
    owned.watcher.emit('error', fsError('ENOSPC', 'watch', path.join(owned.output, 'x')));
    owned.source.started(2);
    await owned.source.observe(success(2, inputs([path.join(owned.output, 'x/y.ts')])));
    await flushed();
    expect(owned.diagnostics.map((item) => item.severity)).toEqual(['warning']);
    await h.subscription.dispose();
    await owned.subscription.dispose();
  });

  it('requests a rescan when a recoverable failure during a generation hits an input it records', async () => {
    const root = await directory();
    const page = path.join(root, 'page.md');
    const snippet = path.join(root, 'snippets/snippet.md');
    const h = await subscribed(inputs([page]));
    // While idle a failure outside the inputs is not retained.
    h.watcher.emit('error', fsError('EMFILE', 'stat', snippet));
    await flushed();
    h.source.started(2);
    expect(await h.source.observe(success(2, inputs([page, path.join(root, 'other.md')])))).toEqual(
      expect.objectContaining({ accepted: true }),
    );
    await flushed();
    expect(h.diagnostics.map((item) => item.code)).toEqual(['NGDOC_VITE_WATCHER']);

    // During generation 3, which records the snippet.
    h.source.started(3);
    h.watcher.emit('error', fsError('EMFILE', 'stat', snippet));
    await h.source.observe(success(3, inputs([page, snippet])));
    await flushed();
    expect(h.diagnostics.map((item) => `${item.code}:${item.severity}`)).toEqual([
      'NGDOC_VITE_WATCHER:warning',
      'NGDOC_VITE_WATCHER:warning',
      `${WATCHER_RESCAN}:warning`,
    ]);

    // Unchanged inputs cannot newly cover it; a newer start forgets it.
    h.source.started(4);
    h.watcher.emit('error', fsError('EMFILE', 'stat', path.join(root, 'late.md')));
    h.source.started(5);
    await h.source.observe(success(5, inputs([page, snippet, path.join(root, 'late.md')])));
    await flushed();
    expect(h.diagnostics.filter((item) => item.code === WATCHER_RESCAN)).toHaveLength(1);

    // Beyond the bound any input change requests the rescan.
    h.source.started(6);
    for (let index = 0; index <= MAX_RETAINED_REJECTIONS; index += 1) {
      h.watcher.emit('error', fsError('EMFILE', 'stat', path.join(root, `noise/${index}.json`)));
    }
    await h.source.observe(success(6, inputs([page])));
    await flushed();
    expect(h.diagnostics.filter((item) => item.code === WATCHER_RESCAN)).toHaveLength(2);
    await h.subscription.dispose();
  });

  it('re-checks a lost watch when a newer generation starts right after the registry installed the covering inputs', async () => {
    const root = await directory();
    const page = path.join(root, 'page.md');
    const demo = path.join(root, 'examples/demo.ts');
    const h = await subscribed(inputs([page]));
    // Not an input yet: the lost watch is only remembered (and warned about).
    h.watcher.emit('error', fsError('ENOSPC', 'watch', path.dirname(demo)));
    const registry = (h.source as unknown as { registry: WatchInputRegistry }).registry;
    const observe = registry.observe.bind(registry);
    let hop = true;
    // started(3) lands in the one hop between registry.observe(2) and the source resuming.
    registry.observe = async (result) => {
      const observed = await observe(result);
      if (hop) {
        hop = false;
        h.source.started(3);
      }
      return observed;
    };
    h.source.started(2);
    // Generation 2 installs the covering inputs but is no longer current.
    expect(await h.source.observe(success(2, inputs([page, demo])))).toEqual({
      accepted: false,
      reconcile: false,
    });
    // Generation 3 records the same inputs, so its observation reports no input change.
    expect((await h.source.observe(success(3, inputs([page, demo])))).accepted).toBe(true);
    await flushed();
    expect(h.diagnostics.map((item) => `${item.code}:${item.severity}`).sort()).toEqual([
      'NGDOC_VITE_WATCHER:error',
      'NGDOC_VITE_WATCHER:warning',
    ]);
    expect(h.diagnostics.find((item) => item.severity === 'error')?.message).toContain(
      path.dirname(demo),
    );
    // Reported once: a later observation with the same inputs does not re-check.
    h.source.started(4);
    await h.source.observe(success(4, inputs([page, demo])));
    await flushed();
    expect(h.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(1);
    await h.subscription.dispose();
  });
});

describe('input matching cost', () => {
  it('matches and re-checks retained paths in O(path depth) at 18 000 recorded files', async () => {
    const root = await directory();
    const files = Array.from({ length: 18_000 }, (_, index) =>
      path.join(root, `libs/p${index % 180}/src/f${index}.ts`),
    );
    const globs = Array.from({ length: 40 }, (_, index) => ({
      root: path.join(root, `libs/p${index}`),
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts'],
    }));
    const registry = new WatchInputRegistry(1_000_000);
    await registry.observe({
      status: 'success',
      generation: 1,
      snapshot: undefined as never,
      manifest: undefined as never,
      diagnostics: [],
      whyRebuilt: [],
      watchInputs: { files, globs },
    });
    const probes = Array.from({ length: 2_000 }, (_, index) =>
      path.join(root, `noise/n${index}.json`),
    );
    let started = performance.now();
    for (const probe of probes)
      expect(registry.matches({ kind: 'update', path: probe })).toBe(false);
    const perMatch = (performance.now() - started) / probes.length;
    // Recorded files, their directories, glob members and exclusions still behave as before.
    expect(registry.matches({ kind: 'update', path: files[7] })).toBe(true);
    expect(registry.matches({ kind: 'update', path: path.join(root, 'libs/p7') })).toBe(true);
    expect(registry.matches({ kind: 'update', path: path.join(root, 'libs/p7/src/new.ts') })).toBe(
      true,
    );
    expect(
      registry.matches({ kind: 'update', path: path.join(root, 'libs/p7/src/new.spec.ts') }),
    ).toBe(false);
    expect(registry.covers(path.join(root, 'libs/p7/src/deep/dir'))).toBe(true);
    expect(registry.covers(path.join(root, 'libs/p999/src'))).toBe(false);

    // The worst case: 1024 retained paths and an input change without a new physical target
    // (was 7.4-9.3 s).
    const source = new ViteFileEventSource(new FakeWatcher() as unknown as FSWatcher, 1_000_000);
    await source.seed(1, { files, globs });
    source.started(2);
    for (let index = 0; index < MAX_RETAINED_REJECTIONS; index += 1) {
      source.matches({ kind: 'update', path: path.join(root, `noise/r${index}.json`) });
    }
    started = performance.now();
    const observed = await source.observe({
      status: 'success',
      generation: 2,
      snapshot: undefined as never,
      manifest: undefined as never,
      diagnostics: [],
      whyRebuilt: [],
      watchInputs: { files: files.slice(0, -1), globs },
    });
    const observeMs = performance.now() - started;
    expect(observed).toEqual({ accepted: true, reconcile: false });
    // Generous bounds (a loaded CI machine): per match was ~7 ms, the observe ~8 s.
    expect(perMatch).toBeLessThan(0.5);
    expect(observeMs).toBeLessThan(1_500);
    await source.dispose();
  }, 60_000);
});

describe('Vite in-flight rejection retention bounds', () => {
  it('reconciles only for rejections since the newest start that new inputs now match', async () => {
    const root = await directory();
    const watcher = new FakeWatcher();
    const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 100);
    const page = path.join(root, 'page.md');
    const snippet = path.join(root, 'snippet.md');
    // Globs rooted at an already watched directory add inputs without a new physical target, so
    // any reconcile below comes from retention alone.
    const glob = (include: string) => ({ root, include: [include], exclude: [] });
    const success = (generation: number, globs: WatchInputs['globs']): BuildResult => ({
      status: 'success',
      generation,
      snapshot: undefined as never,
      manifest: undefined as never,
      diagnostics: [],
      whyRebuilt: [],
      watchInputs: inputs([page], globs),
    });
    expect(await source.seed(1, inputs([page], [glob('base/*.md')]))).toEqual({
      accepted: true,
      reconcile: true,
    });
    // Idle: nothing is retained.
    expect(source.matches({ kind: 'update', path: snippet })).toBe(false);
    expect(await source.observe(success(2, [glob('base/*.md'), glob('snippet.md')]))).toEqual({
      accepted: true,
      reconcile: false,
    });

    // A rejection before the newest start is read afresh by that generation.
    const other = path.join(root, 'other.md');
    source.started(3);
    expect(source.matches({ kind: 'update', path: other })).toBe(false);
    source.started(4);
    expect(await source.observe(success(4, [glob('base/*.md'), glob('*.md')]))).toEqual({
      accepted: true,
      reconcile: false,
    });

    // A rejection during the generation that records it as a new input.
    const late = path.join(root, 'late.txt');
    source.started(5);
    expect(source.matches({ kind: 'update', path: late })).toBe(false);
    expect(
      await source.observe(success(5, [glob('base/*.md'), glob('*.md'), glob('*.txt')])),
    ).toEqual({
      accepted: true,
      reconcile: true,
      // Exactly what the session re-observes: the replayed rejection.
      paths: [late],
    });

    // Unchanged inputs cannot match a rejection, whatever was retained.
    source.started(6);
    for (let index = 0; index <= MAX_RETAINED_REJECTIONS; index += 1) {
      source.matches({ kind: 'update', path: path.join(root, `noise-${index}.json`) });
    }
    expect(
      await source.observe(success(6, [glob('base/*.md'), glob('*.md'), glob('*.txt')])),
    ).toEqual({
      accepted: true,
      reconcile: false,
    });
    // Beyond the bound any input change reconciles, matched or not.
    source.started(7);
    for (let index = 0; index <= MAX_RETAINED_REJECTIONS; index += 1) {
      source.matches({ kind: 'update', path: path.join(root, `noise-${index}.json`) });
    }
    expect(await source.observe(success(7, [glob('base/*.md'), glob('*.md')]))).toEqual({
      accepted: true,
      reconcile: true,
    });
    await source.dispose();
  });
});

describe('IDE/OS metadata watch ignore', () => {
  const resolved = (workspaceRoot: string, docsRoot = path.join(workspaceRoot, 'docs')) =>
    resolveOptions({
      analogLiveReload: true,
      angularPlugins: [{ name: '@analogjs/vite-plugin-angular' }],
      angularComponentProbe: path.join(workspaceRoot, 'src/app.component.ts'),
      generator: {
        projectId: 'metadata-ignore',
        workspaceRoot,
        defaults: {
          docsRoot,
          tsConfig: path.join(workspaceRoot, 'tsconfig.json'),
          outputRoot: path.join(workspaceRoot, 'out'),
          cacheRoot: path.join(workspaceRoot, '.cache'),
        },
      },
    });

  it('ignores the workspace .idea directory and .DS_Store files, and nothing else', async () => {
    const workspaceRoot = await directory();
    const ignore = metadataWatchIgnore(resolved(workspaceRoot), workspaceRoot);
    if (!ignore) throw new Error('Expected a metadata matcher');
    expect(ignore(path.join(workspaceRoot, '.idea'))).toBe(true);
    expect(ignore(path.join(workspaceRoot, '.idea/workspace.xml'))).toBe(true);
    expect(ignore(path.join(workspaceRoot, '.DS_Store'))).toBe(true);
    expect(ignore(path.join(workspaceRoot, 'docs/deep/.DS_Store'))).toBe(true);
    expect(ignore(path.join(workspaceRoot, 'docs/.idea/page.md'))).toBe(false);
    expect(ignore(path.join(workspaceRoot, '.idea-notes/page.md'))).toBe(false);
    expect(ignore(path.join(workspaceRoot, '.vscode/settings.json'))).toBe(false);
    expect(ignore(path.join(workspaceRoot, 'docs/.DS_Store.md'))).toBe(false);
    expect(ignore(undefined as unknown as string)).toBe(false);
  });

  it('keeps .idea watched when a configured root lies inside it', async () => {
    const workspaceRoot = await directory();
    const inside = metadataWatchIgnore(
      resolved(workspaceRoot, path.join(workspaceRoot, '.idea/docs')),
      workspaceRoot,
    );
    expect(inside?.(path.join(workspaceRoot, '.idea/docs/page.md'))).toBe(false);
    expect(inside?.(path.join(workspaceRoot, 'docs/.DS_Store'))).toBe(true);
    const viteInside = metadataWatchIgnore(
      resolved(workspaceRoot),
      path.join(workspaceRoot, '.idea/app'),
    );
    expect(viteInside?.(path.join(workspaceRoot, '.idea/app/main.ts'))).toBe(false);
    const relative = resolved(workspaceRoot);
    Object.assign(relative.generator, { workspaceRoot: 'relative' });
    expect(metadataWatchIgnore(relative, workspaceRoot)).toBeUndefined();
  });

  it('keeps metadata writes away from a real Vite watcher', async () => {
    const workspaceRoot = realpathSync(await directory());
    await mkdir(path.join(workspaceRoot, '.idea'), { recursive: true });
    await mkdir(path.join(workspaceRoot, 'docs'), { recursive: true });
    const hot: string[] = [];
    const server = await createServer({
      root: workspaceRoot,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(workspaceRoot, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        port: 0,
        ...staticViteConfig(resolved(workspaceRoot), workspaceRoot).server,
      },
      plugins: [{ name: 'observer', hotUpdate: (context) => void hot.push(context.file) }],
    });
    servers.push(server);
    await server.listen();
    const control = path.join(workspaceRoot, 'docs/control.md');
    let version = 0;
    const touch = () => writeFile(control, String(++version));
    const until = async (done: () => boolean) => {
      for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
        await touch();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(done()).toBe(true);
    };
    await until(() => hot.includes(control));
    await writeFile(path.join(workspaceRoot, '.idea/workspace.xml'), '<project/>');
    await writeFile(path.join(workspaceRoot, 'docs/.DS_Store'), 'finder');
    const before = hot.length;
    await until(() => hot.slice(before).includes(control));
    expect(hot.filter((file) => file.includes('.idea') || file.includes('.DS_Store'))).toEqual([]);
  }, 30_000);
});

/**
 * Pins the chokidar behaviour the classification above relies on, in the chokidar 3.6.0 that
 * Vite bundles. A Vite upgrade that changes any of it fails here first.
 */
describe('bundled chokidar guard', () => {
  const require = createRequire(import.meta.url);
  const bundle = readFileSync(
    path.join(path.dirname(require.resolve('vite/package.json')), 'dist/node/chunks/config.js'),
    'utf8',
  );

  it('suppresses only ENOENT/ENOTDIR (and permission errors under Vite) and never closes on error', () => {
    expect(bundle).toContain('chokidar@3.6.0');
    expect(bundle).toMatch(
      /_handleError\(error\$1\) \{\s*const code = error\$1 && error\$1\.code;\s*if \(error\$1 && code !== "ENOENT" && code !== "ENOTDIR" && \(!this\.options\.ignorePermissionErrors \|\| code !== "EPERM" && code !== "EACCES"\)\) this\.emit\(EV_ERROR, error\$1\);\s*return error\$1 \|\| this\.closed;\s*\}/,
    );
    expect(bundle).toMatch(/ignoreInitial: true,\s*ignorePermissionErrors: true,/);
  });

  it('never re-creates a failed fs.watch handle and still attaches FSEvents after a stat failure', () => {
    expect(bundle).toContain('cont.watcherUnusable = true;');
    expect(bundle).not.toMatch(/if \(cont\.watcherUnusable\)/);
    // _addToFsEvents: the catch reports the error, then initWatch runs outside the try.
    expect(bundle).toMatch(
      /if \(!error\$1 \|\| this\.fsw\._handleError\(error\$1\)\) \{\s*this\.fsw\._emitReady\(\);\s*this\.fsw\._emitReady\(\);\s*\}\s*\}\s*if \(opts\.persistent && forceAdd !== true\)/,
    );
  });

  it('drops FSEvents MustScanSubDirs (dropped-event) notifications silently', () => {
    // Residual risk: an FSEvents queue overflow reaches neither an event nor an error in C.
    expect(bundle).toMatch(
      /if \(!cont\.listeners\.size\) return;\s*if \(flags & FSEVENT_FLAG_MUST_SCAN_SUBDIRS\) return;/,
    );
  });
});
