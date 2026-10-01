import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { afterEach, expect, it, vi } from 'vitest';

import { createOutputCommitter } from '../../artifacts';
import type {
  ArtifactSnapshot,
  BuildResult,
  CommitGuard,
  CommitRequest,
  CompilationRequest,
  CompilationResult,
  Diagnostic,
  FileChange,
  FileEventSource,
  OutputCommitter,
} from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import { acquireOutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';

/**
 * Vite host (real ViteAdapterLifecycle + HostUpdateCoordinator + session + transactional
 * committer): generation N commits `pages/a.mjs` and is superseded while the committer removes its
 * stage directory. The Vite watcher reports N's write 0 or 100 ms before the session reports N.
 * Generation N+1 (and N+2) then change only `pages/b.mjs`. Every later generation must still
 * announce its reload and leave no output blocker behind: the host has to learn N's manifest,
 * which the next commit was based on.
 */
const stage = vi.hoisted(() => ({ removing: undefined as undefined | (() => Promise<void>) }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    // Fault injection: runs the hook once while the committer removes a stage directory.
    rm: async (...args: Parameters<typeof actual.rm>) => {
      const hook = stage.removing;
      if (hook && String(args[0]).includes('.ng-doc-stage-')) {
        stage.removing = undefined;
        await hook();
      }
      return actual.rm(...args);
    },
  };
});

const roots: string[] = [];
afterEach(() => {
  stage.removing = undefined;
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

class Events implements FileEventSource {
  listener?: (events: FileChange[]) => unknown;
  async subscribe(
    listener: (events: FileChange[]) => unknown,
    _onError: (item: Diagnostic) => void,
  ) {
    this.listener = listener;
    return { dispose: async () => {} };
  }
  emit(...events: FileChange[]) {
    this.listener?.(events);
  }
}

it.each([0, 100])(
  'announces every generation after a commit adopted during its supersession (watcher event %i ms before its result)',
  async (gap) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-superseded-')));
    roots.push(root);
    const output = path.join(root, 'out');
    mkdirSync(output);
    const configuration = {
      outputRoot: output,
      cacheRoot: path.join(root, 'cache'),
      assetDirectory: 'assets',
      themes: { light: 'github-light', dark: 'ayu-dark' },
      digest: 'configuration',
    };
    // The markdown sources (an edit changes one) and the page bodies compiled from them: like the
    // real compiler, re-rendering an unchanged source yields the same module bytes.
    const sources: Record<string, string> = { a: 'a-1', b: 'b-1' };
    const bodies: Record<string, string> = { ...sources };
    let edits = 1;
    const edit = (page: string) => {
      sources[page] = `${page}-${++edits}`;
      return { kind: 'update' as const, path: path.join(root, `docs/${page}.md`) };
    };
    const module = (body: string) => `export default ${JSON.stringify(body)};\n`;
    const snapshot = (): ArtifactSnapshot => ({
      configuration,
      projectId: 'project',
      revision: `${bodies['a']}|${bodies['b']}`,
      artifacts: Object.entries(bodies).map(([page, body]) => ({
        id: page,
        identity: { projectId: 'project', entryId: page, role: 'content' },
        revision: body,
        fingerprint: {
          schemaVersion: 4,
          compilerVersion: 'compiler',
          toolchainDigest: 'toolchain',
          configurationDigest: 'configuration',
          inputDigest: body,
          keywordDigest: 'keywords',
        },
        dependencies: [],
        content: [],
        exportedKeywords: [],
        usedKeywords: [],
        searchRecords: [],
        routes: [],
        apiList: [],
        outputs: [
          {
            path: `pages/${page}.mjs`,
            role: 'content',
            encoding: 'utf8',
            content: module(body),
            digest: sha(module(body)),
          },
        ],
        diagnostics: [],
      })),
      globalKeywords: [],
      remoteKeywords: [],
    });
    const compiler = {
      async compile(request: CompilationRequest): Promise<CompilationResult> {
        // The superseding generation takes a realistic while (the real one ~2 s): N's own output
        // event is long settled before N+1's result defines what N+1 expects to see written.
        if (raced !== undefined && request.generation === raced + 1)
          await new Promise((resolve) => setTimeout(resolve, 400));
        for (const change of request.changes) {
          const page = path.basename(change.path, '.md');
          if (page in sources) bodies[page] = sources[page];
        }
        return { candidate: snapshot(), dependencies: [], diagnostics: [], whyRebuilt: [] };
      },
      async dispose() {},
    };
    const sends: unknown[] = [];
    const server = {
      config: { logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } },
      ws: { send: (payload: unknown) => sends.push(payload) },
    } as unknown as ViteDevServer;
    const lifecycle = new ViteAdapterLifecycle(
      acquireOutputLease(`superseded-${gap}-${Date.now()}`, output),
    );
    lifecycle.attachServer(server, undefined as never);
    // The Vite watcher's report of an output write, as the plugin's hotUpdate hook forwards it.
    const watcherEvent = (relative: string) => {
      const file = path.join(output, relative);
      const ticket = lifecycle.hostUpdateStarted(file, 'update', () => readFileSync(file, 'utf8'));
      void lifecycle.hostUpdateCompleted(ticket);
    };
    const real = createOutputCommitter({ outputRoot: output });
    let raced: number | undefined = undefined;
    let watching = false;
    const committer: OutputCommitter = {
      async commit(request: CommitRequest, guard: CommitGuard, signal: AbortSignal) {
        const result = await real.commit(request, guard, signal);
        // The Vite watcher reports every file the commit physically wrote, before the session
        // learns the result (the raced generation's write is reported by the stage hook below).
        if (result.status === 'committed' && watching && request.generation !== raced)
          for (const relative of result.written) watcherEvent(relative);
        return result;
      },
      dispose: () => real.dispose(),
    };
    const session = createBuildSession({ compiler, committer }, { batchDelayMs: 0 });
    lifecycle.attachSession(session);
    const initial = lifecycle.acceptInitial(await session.buildOnce({ mode: 'development' }));
    lifecycle.publish(initial, configuration);
    const source = new Events();
    const results: BuildResult[] = [];
    const observe = lifecycle.observer(() => configuration);
    const watch = await session.watch(source, (event) => {
      if (event.kind === 'result') results.push(event.result);
      observe(event);
    });
    lifecycle.attachWatch(watch);
    expect((await watch.initial).status).toBe('success');
    watching = true;
    await lifecycle.settled();
    const reloads = () => sends.length;
    const blockers = () =>
      (
        lifecycle as unknown as { hostUpdates: { blockerCount(): number } }
      ).hostUpdates.blockerCount();

    // Generation N: an edit of a.md; superseded by an edit of b.md while its stage is removed.
    const before = results.length;
    const start = reloads();
    raced = (await watch.initial).generation + 1;
    stage.removing = async () => {
      watcherEvent('pages/a.mjs');
      source.emit(edit('b'));
      if (gap) await new Promise((resolve) => setTimeout(resolve, gap));
    };
    source.emit(edit('a'));
    await vi.waitFor(() => expect(results.length).toBe(before + 2), { timeout: 10_000 });
    // N+1 changed only b.mjs; the host still announces it and keeps no blocker.
    await vi.waitFor(
      async () => {
        await lifecycle.settled();
        expect(blockers()).toBe(0);
        expect(reloads()).toBeGreaterThan(start);
      },
      { timeout: 5_000 },
    );
    // N+2: another edit of b only; it must be announced too.
    const announced = reloads();
    source.emit(edit('b'));
    await vi.waitFor(() => expect(results.length).toBe(before + 3), { timeout: 10_000 });
    expect(results.at(-1)).toMatchObject({ generation: raced + 2, status: 'success' });
    await vi.waitFor(
      async () => {
        await lifecycle.settled();
        expect(reloads()).toBeGreaterThan(announced);
        expect(blockers()).toBe(0);
      },
      { timeout: 5_000 },
    );
    const [adopted, next] = results.slice(before);
    expect(adopted).toMatchObject({ generation: raced, status: 'success', superseded: true });
    expect(next).toMatchObject({ generation: raced + 1, status: 'success' });
    expect(next.status === 'success' && next.manifest.files.length).toBe(2);
    expect(lifecycle.failure).toBeUndefined();
    await watch.dispose();
    await lifecycle.dispose();
    await session.dispose();
  },
  30_000,
);
