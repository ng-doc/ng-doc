import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type FSWatcher,
  type HmrContext,
  type HotUpdateOptions,
  type Plugin,
  type ViteDevServer,
  createServer,
} from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ArtifactSnapshot,
  BuildEvent,
  BuildResult,
  CommitRequest,
  CommitResult,
  CompilationRequest,
  CompilationResult,
  Dependency,
  Diagnostic,
  FileChange,
  FileEventSource,
  OutputManifest,
  WatchInputs,
} from '../../contracts';
import { type GeneratorBuildSession, createBuildSession } from '../../session/build-session';
import { createNgDocVitePlugin } from '..';
import { qualifyAngularPlugins } from '../angular-compatibility';
import {
  CacheRootWatchIgnore,
  GENERATED_STAGE_IGNORE,
  resolveOptions,
  staticViteConfig,
} from '../options';
import { ViteFileEventSource } from '../vite-event-source';

const temporary: string[] = [];
const servers: ViteDevServer[] = [];
const sessions: GeneratorBuildSession[] = [];

afterEach(async () => {
  await Promise.allSettled(sessions.splice(0).map((session) => session.dispose()));
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Vite watch start: physical target registration', () => {
  it('adds only targets the watcher can report and still reports their native changes', async () => {
    const w = await workspace();
    const { server, hot, bind } = await nativeServer(w.root);
    const add = vi.spyOn(server.watcher, 'add');
    const source = new ViteFileEventSource(server.watcher, 10);
    bind(source);
    expect(internals(server.watcher)._isIgnored?.(w.declaration)).toBe(true);

    // Every input is registered (and reconciled); only the ignored declaration skips chokidar.
    expect(await source.seed(1, inputs([w.declaration, w.input, w.missing]))).toEqual({
      accepted: true,
      reconcile: true,
    });
    expect(add.mock.calls).toEqual([[[w.input, w.missing]]]);
    expect(await source.observe(success(2, inputs([w.declaration, w.input, w.missing])))).toEqual({
      accepted: true,
      reconcile: false,
    });
    expect(add).toHaveBeenCalledOnce();

    const events: FileChange[] = [];
    const subscription = await source.subscribe(
      (batch) => events.push(...batch),
      () => {},
    );
    const seen = (file: string, kind: FileChange['kind']) =>
      events.some((event) => event.path === file && event.kind === kind);
    let version = 0;
    await writeFile(w.declaration, 'export declare const changed: true;');
    // watcher.add() has no attach acknowledgement: repeat each edit until its event arrives.
    await repeatUntil(
      () => writeFile(w.input, `export const input = ${++version};`),
      () => seen(w.input, 'update'),
    );
    // The external tree is demonstrably watched now; the ignored file changes again.
    await writeFile(w.declaration, 'export declare const changedAgain: true;');
    await repeatUntil(
      async () => {
        await rm(w.missing, { force: true });
        await writeFile(w.missing, `export const created = ${++version};`);
      },
      () => seen(w.missing, 'create'),
    );
    await repeatUntil(
      async () => {
        if (!existsSync(w.input)) await writeFile(w.input, `export const input = ${++version};`);
        await rm(w.input);
      },
      () => seen(w.input, 'delete'),
    );
    // An ignored path is never reported by Vite, whether or not it was added.
    expect(hot.some((file) => file === w.declaration)).toBe(false);
    expect(events.some((event) => event.path === w.declaration)).toBe(false);
    await subscription.dispose();
  }, 30_000);

  it('adds a path unwatched earlier, because chokidar add() is what re-enables it', async () => {
    const w = await workspace();
    const { server, bind } = await nativeServer(w.root);
    // unwatch() records the path in chokidar's _ignoredPaths; only add() removes it again.
    server.watcher.unwatch(w.input);
    expect(internals(server.watcher)._isIgnored?.(w.input)).toBe(true);
    const add = vi.spyOn(server.watcher, 'add');
    const source = new ViteFileEventSource(server.watcher, 10);
    bind(source);
    await source.seed(1, inputs([w.declaration, w.input]));
    expect(add.mock.calls).toEqual([[[w.declaration, w.input]]]);
    expect(internals(server.watcher)._isIgnored?.(w.input)).toBe(false);
    const events: FileChange[] = [];
    const subscription = await source.subscribe(
      (batch) => events.push(...batch),
      () => {},
    );
    let version = 3;
    await repeatUntil(
      () => writeFile(w.input, `export const input = ${version++};`),
      () => events.some((event) => event.path === w.input),
    );
    await subscription.dispose();
  }, 30_000);

  it.each([
    ['FSEvents', false],
    ['polling', true],
  ] as const)(
    'relies on the bundled chokidar never reporting an added ignored path (%s)',
    async (_handler, polling) => {
      // Compatibility control for the target filter: without the filter, adding an ignored path
      // must stay a no-op. A Vite/chokidar upgrade that changes this fails here, loudly.
      const w = await workspace();
      const { server } = await nativeServer(w.root, polling);
      const state = server.watcher as unknown as Internals;
      expect(typeof state._isIgnored).toBe('function');
      expect(state._ignoredPaths).toBeInstanceOf(Set);
      expect(state.options?.disableGlobbing).toBe(true);
      expect(internals(server.watcher)._isIgnored?.(w.declaration)).toBe(true);
      expect(internals(server.watcher)._isIgnored?.(w.input)).toBe(false);
      const reported: string[] = [];
      server.watcher.on('all', (_event, file) => reported.push(path.resolve(file)));
      server.watcher.add([w.declaration, w.input]);
      let version = 0;
      const touch = async () => {
        await writeFile(w.declaration, `export declare const d${++version}: true;`);
        await writeFile(w.input, `export const input = ${version};`);
      };
      await repeatUntil(touch, () => reported.includes(w.input));
      // Both watched siblings were written together; later writes follow an observed event.
      const before = reported.length;
      await repeatUntil(touch, () => reported.slice(before).includes(w.input));
      expect(reported).not.toContain(w.declaration);
      const watched = server.watcher.getWatched();
      expect(watched[path.dirname(w.declaration)] ?? []).not.toContain(
        path.basename(w.declaration),
      );
      expect(watched[path.dirname(w.input)]).toContain(path.basename(w.input));
    },
    30_000,
  );

  it('adds every target when skipping could differ from chokidar add()', async () => {
    const root = await directory();
    const [ignored, kept] = [path.join(root, 'ignored.ts'), path.join(root, 'kept.ts')];
    const variants: Array<[string, Partial<Internals>]> = [
      ['no chokidar internals', { _isIgnored: undefined }],
      ['a pending unwatch', { _ignoredPaths: new Set(['/elsewhere']) }],
      ['an unknown ignore set', { _ignoredPaths: ['/elsewhere'] }],
      ['globbing enabled', { options: { disableGlobbing: false } }],
      ['a relative watcher cwd', { options: { disableGlobbing: true, cwd: root } }],
    ];
    for (const [name, override] of variants) {
      const watcher = new IgnoringWatcher([ignored], override);
      const source = new ViteFileEventSource(watcher as unknown as FSWatcher, 10);
      expect(await source.seed(1, inputs([ignored, kept])), name).toEqual({
        accepted: true,
        reconcile: true,
      });
      expect(watcher.added, name).toEqual([ignored, kept]);
    }

    // A throwing predicate never hides a target.
    const throwing = new IgnoringWatcher([ignored], {
      _isIgnored: () => {
        throw new Error('unexpected matcher');
      },
    });
    await new ViteFileEventSource(throwing as unknown as FSWatcher, 10).seed(
      1,
      inputs([ignored, kept]),
    );
    expect(throwing.added).toEqual([ignored, kept]);

    // Only ignored targets: chokidar is not called, the inputs still count as registered.
    const all = new IgnoringWatcher([ignored, kept]);
    const source = new ViteFileEventSource(all as unknown as FSWatcher, 10);
    expect(await source.seed(1, inputs([ignored, kept]))).toEqual({
      accepted: true,
      reconcile: true,
    });
    expect(all.adds).toBe(0);
    expect(await source.observe(success(2, inputs([ignored, kept])))).toEqual({
      accepted: true,
      reconcile: false,
    });
  });
});

describe('Vite watch start: verified reuse with the filtered watcher', () => {
  it.each([
    ['an input edit', true, (w: Workspace) => writeFile(w.input, 'export const input = "raced";')],
    [
      'a created missing input',
      true,
      (w: Workspace) => writeFile(w.missing, 'export const m = 1;'),
    ],
    ['a deleted input', true, (w: Workspace) => rm(w.input)],
    [
      'an edit of an input the watcher ignores',
      false,
      (w: Workspace) => writeFile(w.declaration, 'export declare const raced: true;'),
    ],
  ] as const)(
    'regenerates after %s between the target registration and readiness',
    async (_name, watched, mutate) => {
      const w = await workspace();
      // Polling: no replayed metadata notification for the files written before the server.
      const { server, bind } = await nativeServer(w.root, true);
      const { session, compile } = nativeSession(w);
      const built = await session.buildOnce({ mode: 'development' });
      if (built.status !== 'success') throw new Error('Expected an initial success');
      const source = new ViteFileEventSource(server.watcher, 10);
      bind(source);
      await source.seed(built.generation, built.watchInputs);
      // The change lands after the adapter registered its targets and subscribed, and before
      // the session re-observes the recorded inputs.
      const watch = await session.watch(
        racing(source, () => mutate(w)),
        () => {},
      );
      const initial = await watch.initial;
      if (initial.status !== 'success') throw new Error('Expected success');
      // Readiness publishes the raced bytes. Verification finds the change; for a watched input
      // its native event may also arrive first and start (or supersede) that generation.
      expect(initial.snapshot.revision).toBe(`${initial.generation}:${state(w)}`);
      expect(initial.generation).toBeGreaterThanOrEqual(2);
      expect(compile.mock.calls.length).toBeGreaterThanOrEqual(2);
      if (!watched) {
        // No native event can exist for an ignored path: only re-observation caught it.
        expect(initial.generation).toBe(2);
        expect(compile).toHaveBeenCalledTimes(2);
        expect(compile.mock.calls[1][0]).toMatchObject({
          changes: [],
          contentRequest: { origin: 'reconcile' },
        });
      }
      await watch.dispose();
    },
    30_000,
  );

  it('reuses an unchanged baseline, then generates for native edits of watched inputs only', async () => {
    const w = await workspace();
    // Polling reports content changes only: macOS FSEvents can replay metadata notifications for
    // files written just before the server started, which would (correctly) disqualify reuse.
    const { server, bind } = await nativeServer(w.root, true);
    const { session, compile } = nativeSession(w);
    const built = await session.buildOnce({ mode: 'development' });
    if (built.status !== 'success') throw new Error('Expected an initial success');
    const source = new ViteFileEventSource(server.watcher, 10);
    bind(source);
    await source.seed(built.generation, built.watchInputs);
    const events: BuildEvent[] = [];
    const watch = await session.watch(source, (event) => events.push(event));
    expect(await watch.initial).toEqual(built);
    expect(compile).toHaveBeenCalledOnce();
    expect(events).toEqual([]);

    await writeFile(w.declaration, 'export declare const late: true;');
    let version = 0;
    await repeatUntil(
      () => writeFile(w.input, `export const input = "after readiness ${++version}";`),
      () => events.some((event) => event.kind === 'result'),
    );
    const results = events.filter((event) => event.kind === 'result');
    expect(results.at(-1)).toMatchObject({
      result: {
        status: 'success',
        snapshot: { revision: expect.stringContaining('after readiness') },
      },
    });
    const started = events.filter(
      (event): event is Extract<BuildEvent, { kind: 'started' }> => event.kind === 'started',
    );
    expect(started.flatMap((event) => event.changes.map((change) => change.path))).toEqual(
      started.map(() => w.input),
    );
    await watch.dispose();
  }, 30_000);
});

describe('Vite watch start: generator cache events', () => {
  it('stops ignoring the cache when the resolved root or published configuration overlaps it', async () => {
    const root = await directory();
    const cacheRoot = path.join(root, 'cache');
    const options = resolveOptions({
      analogLiveReload: true,
      angularPlugins: [{ name: '@analogjs/vite-plugin-angular' }],
      angularComponentProbe: path.join(root, 'src/app.component.ts'),
      generator: {
        projectId: 'cache-guard',
        workspaceRoot: path.join(root, 'workspace'),
        defaults: {
          docsRoot: path.join(root, 'workspace/docs'),
          tsConfig: path.join(root, 'workspace/tsconfig.json'),
          outputRoot: path.join(root, 'workspace/out'),
          cacheRoot,
        },
      },
    });
    const published = (outputRoot: string, cache = cacheRoot) => ({
      outputRoot,
      cacheRoot: cache,
      assetDirectory: 'assets',
      themes: { light: 'github-light', dark: 'ayu-dark' },
      digest: 'configuration',
    });
    const entry = path.join(cacheRoot, 'a.artifact.json');

    // The published configuration keeps the default roots: the cache stays ignored.
    const kept = new CacheRootWatchIgnore(options);
    const keptMatcher = kept.matcher(root);
    expect(keptMatcher?.(entry)).toBe(true);
    expect(kept.confirmRoot(path.join(root, 'app'))).toBe(true);
    expect(kept.admit(published(path.join(root, 'workspace/out')))).toBe(false);
    expect(keptMatcher?.(entry)).toBe(true);

    // A config-file outDir that publishes the output inside the cache fails open once.
    const moved = new CacheRootWatchIgnore(options);
    const movedMatcher = moved.matcher(root);
    expect(moved.admit(published(path.join(cacheRoot, 'ng-doc/cache-guard')))).toBe(true);
    expect(moved.ignoring).toBe(false);
    expect(movedMatcher?.(entry)).toBe(false);
    expect(moved.admit(published(path.join(cacheRoot, 'ng-doc/cache-guard')))).toBe(false);
    expect(moved.matcher(root)).toBeUndefined();

    // A different published cache root, or a resolved Vite root inside the cache, fails open.
    const relocated = new CacheRootWatchIgnore(options);
    const relocatedMatcher = relocated.matcher(root);
    expect(
      relocated.admit(published(path.join(root, 'workspace/out'), path.join(root, 'other'))),
    ).toBe(true);
    expect(relocatedMatcher?.(entry)).toBe(false);
    const rooted = new CacheRootWatchIgnore(options);
    const rootedMatcher = rooted.matcher(root);
    expect(rooted.confirmRoot(path.join(cacheRoot, 'app'))).toBe(false);
    expect(rootedMatcher?.(entry)).toBe(false);
    const unresolved = new CacheRootWatchIgnore(options);
    expect(unresolved.confirmRoot(undefined)).toBe(false);

    // The plugin's resolved-root check fails open for a root that a later plugin moved.
    const [hooks] = createNgDocVitePlugin({
      ...options,
      analogLiveReload: true,
      angularPlugins: qualifyAngularPlugins(fakeCompiler()),
    }) as unknown as Array<Record<string, (...args: unknown[]) => unknown>>;
    const config = hooks.config({ root }, { command: 'serve' }) as {
      server: { watch: { ignored: unknown[] } };
    };
    const matcher = config.server.watch.ignored[1] as (file: string) => boolean;
    expect(matcher(entry)).toBe(true);
    hooks.configResolved({ command: 'serve', root: path.join(cacheRoot, 'app') });
    expect(matcher(entry)).toBe(false);
    await hooks.closeBundle();
  });

  it('ignores the generator cache in the Vite watcher unless it could contain real inputs', async () => {
    const root = await directory();
    const workspaceRoot = path.join(root, 'workspace');
    const options = (cacheRoot: string, outputRoot = path.join(workspaceRoot, 'out')) =>
      resolveOptions({
        analogLiveReload: true,
        angularPlugins: [{ name: '@analogjs/vite-plugin-angular' }],
        angularComponentProbe: path.join(workspaceRoot, 'src/app.component.ts'),
        generator: {
          projectId: 'cache-ignore',
          workspaceRoot,
          defaults: {
            docsRoot: path.join(workspaceRoot, 'docs'),
            tsConfig: path.join(workspaceRoot, 'tsconfig.json'),
            outputRoot,
            cacheRoot,
          },
        },
      });
    const cache = path.join(root, '.cache/ng-doc/cache-ignore');
    const ignored = staticViteConfig(options(cache), workspaceRoot).server?.watch?.ignored;
    expect(Array.isArray(ignored) && ignored[0]).toBe(GENERATED_STAGE_IGNORE);
    const matcher = Array.isArray(ignored) ? ignored[1] : undefined;
    if (typeof matcher !== 'function') throw new Error('Expected a cache matcher');
    expect(matcher(cache)).toBe(true);
    expect(matcher(path.join(cache, 'a/b.artifact.json'))).toBe(true);
    expect(matcher(`${cache}-sibling/file.json`)).toBe(false);
    expect(matcher(path.join(workspaceRoot, 'out/index.ts'))).toBe(false);
    expect(matcher(undefined as unknown as string)).toBe(false);
    // The default Vite root is the process working directory. The last matcher is the IDE/OS
    // metadata ignore.
    expect(staticViteConfig(options(cache)).server?.watch?.ignored).toHaveLength(3);

    for (const [name, cacheRoot, viteRoot, outputRoot] of [
      ['contains the Vite root', root, path.join(root, 'app'), undefined],
      ['contains the workspace', path.dirname(root), path.join(root, 'app'), undefined],
      [
        'contains the output root',
        path.join(root, 'shared'),
        path.join(root, 'app'),
        path.join(root, 'shared/out'),
      ],
      ['is relative', 'cache', path.join(root, 'app'), undefined],
    ] as const) {
      expect(
        staticViteConfig(options(cacheRoot, outputRoot), viteRoot).server?.watch?.ignored,
        name,
      ).toEqual([GENERATED_STAGE_IGNORE, expect.any(Function)]);
    }

    const incomplete = options(cache);
    Object.assign(incomplete.generator.defaults, { docsRoot: undefined });
    expect(staticViteConfig(incomplete, workspaceRoot).server?.watch?.ignored).toEqual([
      GENERATED_STAGE_IGNORE,
      expect.any(Function),
    ]);

    // The real watcher never reports cache writes, and still reports its other files.
    const viteRoot = await directory();
    const viteCache = path.join(viteRoot, 'cache');
    const hot: string[] = [];
    const server = await createServer({
      root: viteRoot,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(viteRoot, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        port: 0,
        ...staticViteConfig(options(viteCache, path.join(viteRoot, 'generated')), viteRoot).server,
      },
      plugins: [{ name: 'observer', hotUpdate: (context) => void hot.push(context.file) }],
    });
    servers.push(server);
    await server.listen();
    const control = path.join(viteRoot, 'control.json');
    let version = 0;
    const touch = () => writeFile(control, JSON.stringify({ version: ++version }));
    // The root watcher is demonstrably live before the cache is written.
    await repeatUntil(touch, () => hot.includes(control));
    const cached = path.join(viteCache, 'x/entry.artifact.json');
    await mkdir(path.dirname(cached), { recursive: true });
    await writeFile(cached, '{}');
    await writeFile(cached, '{"changed":true}');
    const before = hot.length;
    await repeatUntil(touch, () => hot.slice(before).includes(control));
    expect(internals(server.watcher)._isIgnored?.(cached)).toBe(true);
    expect(hot.some((file) => file.startsWith(viteCache))).toBe(false);
  }, 30_000);
});

interface Workspace {
  root: string;
  external: string;
  input: string;
  missing: string;
  declaration: string;
}

interface Internals {
  _isIgnored?: (target: string) => boolean;
  _ignoredPaths?: unknown;
  options?: { disableGlobbing?: boolean; cwd?: string; useFsEvents?: boolean };
}

function internals(watcher: FSWatcher): Internals {
  const value = watcher as unknown as Internals;
  return { ...value, _isIgnored: value._isIgnored?.bind(watcher) };
}

class IgnoringWatcher extends EventEmitter {
  readonly added: string[] = [];
  adds = 0;
  _ignoredPaths: unknown = new Set();
  options: Internals['options'] = { disableGlobbing: true };
  _isIgnored?: (target: string) => boolean;

  constructor(ignored: readonly string[], override: Partial<Internals> = {}) {
    super();
    this._isIgnored = (target) => ignored.includes(target);
    Object.assign(this, override);
    // The FSEvents backend, which watches missing paths itself: every target reaches add().
    this.options = { useFsEvents: true, ...this.options };
  }

  add(values: string | readonly string[]): this {
    this.adds++;
    this.added.push(...(typeof values === 'string' ? [values] : values));
    return this;
  }
}

async function directory(): Promise<string> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-watch-start-'));
  temporary.push(root);
  return root;
}

/** A Vite root and an external input tree with an ordinary input and a node_modules input. */
async function workspace(): Promise<Workspace> {
  const root = await directory();
  const external = await directory();
  const input = path.join(external, 'src/input.ts');
  const missing = path.join(external, 'src/missing.ts');
  const declaration = path.join(external, 'node_modules/pkg/index.d.ts');
  await mkdir(path.dirname(input), { recursive: true });
  await mkdir(path.dirname(declaration), { recursive: true });
  await writeFile(input, 'export const input = 1;');
  await writeFile(declaration, 'export declare const declaration: true;');
  return { root, external, input, missing, declaration };
}

/** A real Vite server whose hot-update hook forwards native changes, as the adapter does. */
async function nativeServer(root: string, polling: boolean = false) {
  let source: ViteFileEventSource | undefined;
  const hot: string[] = [];
  const server = await createServer({
    root,
    // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
    // default one is shared by every fixture.
    cacheDir: path.join(root, '.vite/node_modules/.vite'),
    configFile: false,
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
      ...(polling ? { watch: { usePolling: true, interval: 50, binaryInterval: 50 } } : {}),
    },
    plugins: [
      {
        name: 'forward-native-hot-updates',
        enforce: 'pre',
        hotUpdate(context: HotUpdateOptions) {
          hot.push(context.file);
          source?.forward({ kind: context.type, path: context.file });
        },
      },
    ],
  });
  servers.push(server);
  await server.listen();
  return { server, hot, bind: (value: ViteFileEventSource) => (source = value) };
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function state(w: Workspace): string {
  const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : '<none>');
  return [read(w.input), read(w.missing), read(w.declaration)].join('|');
}

/** A session whose compiler reports the real observations it made of the workspace inputs. */
function nativeSession(w: Workspace) {
  const observe = (file: string): Dependency =>
    existsSync(file)
      ? { kind: 'content', path: file, digest: digest(readFileSync(file)) }
      : { kind: 'existence', path: file, exists: false };
  const compile = vi.fn(
    async (request: CompilationRequest, _signal: AbortSignal): Promise<CompilationResult> => {
      const snapshot: ArtifactSnapshot = {
        projectId: 'watch-start',
        revision: `${request.generation}:${state(w)}`,
        artifacts: [],
        globalKeywords: [],
        remoteKeywords: [],
      };
      return {
        candidate: snapshot,
        dependencies: [observe(w.input), observe(w.missing), observe(w.declaration)],
        diagnostics: [],
        whyRebuilt: [],
      };
    },
  );
  const commit = vi.fn(
    async (request: CommitRequest): Promise<CommitResult> => ({
      status: 'committed',
      manifest: {
        ...manifest(),
        generation: request.generation,
        revision: request.candidate.revision,
      },
      written: [],
      removed: [],
      diagnostics: [],
    }),
  );
  const session = createBuildSession(
    {
      compiler: { compile, dispose: async () => {} },
      committer: { commit, dispose: async () => {} },
    },
    { batchDelayMs: 0 },
  );
  sessions.push(session);
  return { session, compile, commit };
}

/** Delegates to the Vite event source, then changes an input before the session is ready. */
function racing(source: ViteFileEventSource, race: () => Promise<unknown>): FileEventSource {
  return {
    async subscribe(
      listener: (events: FileChange[]) => void,
      onError: (diagnostic: Diagnostic) => void,
    ) {
      const subscription = await source.subscribe(listener, onError);
      await race();
      return subscription;
    },
  };
}

function manifest(): OutputManifest {
  return { schemaVersion: 1, projectId: 'watch-start', generation: 1, revision: 'r', files: [] };
}

function inputs(files: string[]): WatchInputs {
  return { files, globs: [] };
}

function success(generation: number, watchInputs: WatchInputs): BuildResult {
  return {
    status: 'success',
    generation,
    snapshot: undefined as never,
    manifest: undefined as never,
    diagnostics: [],
    whyRebuilt: [],
    watchInputs,
  };
}

/**
 * Repeats an idempotent filesystem action until its native event is observed. Chokidar attaches
 * an added target asynchronously and without acknowledgement, so a single early write can be
 * lost under load; a later repetition is reported once the listener is attached.
 */
async function repeatUntil(
  action: () => Promise<unknown>,
  predicate: () => boolean,
  timeout: number = 10_000,
  interval: number = 100,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out repeating a native filesystem change');
    await action();
    const next = Date.now() + interval;
    while (!predicate() && Date.now() < next) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

function fakeCompiler(): Plugin[] {
  return [
    {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      handleHotUpdate(context: HmrContext) {
        return context.modules;
      },
      transform() {
        return null;
      },
    },
  ];
}
