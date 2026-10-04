import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOutputCommitter } from '../../artifacts';
import type {
  ArtifactSnapshot,
  BuildResult,
  CompilationAcknowledgement,
  CompilationRequest,
  CompilationResult,
  CompilationService,
  Diagnostic,
  FileChange,
  FileEventSource,
} from '../../contracts';
import { hostPath } from '../../kernel/paths';
import { createBuildSession, GeneratorBuildSession } from '../../session/build-session';
import { createWorkerCompilationService } from '../index';

/**
 * The transactional committer's last guard check runs before it removes its stage directory. A
 * change that supersedes the generation during that removal leaves a `committed` result whose
 * outputs and manifest are on disk. The session must adopt it anyway; otherwise its manifest stays
 * one generation behind the disk and every later commit fails with OUTPUT_MANIFEST_STALE until
 * restart.
 */
const stage = vi.hoisted(() => ({ removing: undefined as undefined | (() => void) }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    // Fault injection: runs the hook once while the committer removes a stage directory.
    rm: async (...args: Parameters<typeof actual.rm>) => {
      const hook = stage.removing;
      if (hook && String(args[0]).includes('.ng-doc-stage-')) {
        stage.removing = undefined;
        hook();
      }
      return actual.rm(...args);
    },
  };
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

async function until(predicate: () => boolean, timeout: number = 10_000): Promise<void> {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Timed out waiting for observable state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('a generation superseded after its commit', () => {
  const sessions: GeneratorBuildSession[] = [];
  const roots: string[] = [];
  afterEach(async () => {
    stage.removing = undefined;
    await Promise.allSettled(sessions.splice(0).map((item) => item.dispose()));
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  function setup(acknowledging: boolean) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ngdoc-commit-race-')));
    roots.push(root);
    const outputRoot = join(root, 'out');
    mkdirSync(outputRoot);
    // A published configuration spells its roots as the engine does (forward slashes on Windows).
    const configuration = {
      outputRoot: hostPath(outputRoot),
      cacheRoot: hostPath(join(root, 'cache')),
      assetDirectory: 'assets',
      themes: { light: 'light', dark: 'dark' },
      digest: 'configuration',
    };
    const candidate = (generation: number): ArtifactSnapshot => {
      const body = `generation ${generation}`;
      return {
        configuration,
        projectId: 'project',
        revision: `revision-${generation}`,
        artifacts: [
          {
            id: 'artifact',
            identity: { projectId: 'project', entryId: 'entry', role: 'content' },
            revision: `artifact-${generation}`,
            fingerprint: {
              schemaVersion: 4,
              compilerVersion: 'compiler',
              toolchainDigest: 'toolchain',
              configurationDigest: 'configuration',
              inputDigest: 'input',
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
                path: 'generated.txt',
                role: 'content',
                encoding: 'utf8',
                content: body,
                digest: sha(body),
              },
            ],
            diagnostics: [],
          },
        ],
        globalKeywords: [],
        remoteKeywords: [],
      };
    };
    const acknowledgements: CompilationAcknowledgement[] = [];
    const compiler: CompilationService = {
      async compile(request: CompilationRequest): Promise<CompilationResult> {
        return {
          candidate: candidate(request.generation),
          dependencies: [],
          diagnostics: [],
          whyRebuilt: [],
        };
      },
      async dispose() {},
      ...(acknowledging
        ? { acknowledge: (item: CompilationAcknowledgement) => void acknowledgements.push(item) }
        : {}),
    };
    const session = createBuildSession(
      { compiler, committer: createOutputCommitter({ outputRoot }) },
      { batchDelayMs: 0 },
    );
    sessions.push(session);
    return { session, outputRoot, acknowledgements };
  }

  it.each([
    ['with the full transport', false],
    ['with the delta transport (acknowledged as committed)', true],
  ])(
    'adopts the commit and lets the next edit commit normally, %s',
    async (_label, acknowledging) => {
      const { session, outputRoot, acknowledgements } = setup(acknowledging);
      const source = new Events();
      const results: BuildResult[] = [];
      const watch = await session.watch(source, (event) => {
        if (event.kind === 'result') results.push(event.result);
      });
      const initial = await watch.initial;
      expect(initial.diagnostics).toEqual([]);
      expect(initial.status).toBe('success');
      // Generation 2 commits; while the committer removes its stage directory, a change supersedes it.
      stage.removing = () => source.emit({ kind: 'update', path: '/docs/b.md' });
      source.emit({ kind: 'update', path: '/docs/a.md' });
      await until(() => results.some((result) => result.generation === 3), 10_000);
      expect(results.map((result) => [result.generation, result.status])).toEqual([
        [1, 'success'],
        [2, 'success'],
        [3, 'success'],
      ]);
      // Generation 2 was published on disk, adopted, and reported to hosts as a committed
      // generation; generation 3 committed against it.
      expect(results[1]).toMatchObject({ superseded: true, manifest: { generation: 2 } });
      expect(readFileSync(join(outputRoot, 'generated.txt'), 'utf8')).toBe('generation 3');
      expect(session.inspect().lastGoodRevision).toBe('revision-3');
      // A later edit still commits.
      source.emit({ kind: 'update', path: '/docs/c.md' });
      await until(() => results.some((result) => result.generation === 4), 10_000);
      expect(results.at(-1)).toMatchObject({ generation: 4, status: 'success' });
      if (acknowledging)
        expect(acknowledgements.map((item) => [item.generation, item.status])).toEqual([
          [1, 'committed'],
          [2, 'committed'],
          [3, 'committed'],
          [4, 'committed'],
        ]);
      await watch.dispose();
    },
  );
});

/**
 * The same race through the real long-lived runtime and the real host,
 * with the delta transport. The compilation module is a stand-in that drives the runtime's
 * retention handle exactly as the compiler does (take, offer its candidate, restore the taken
 * entry) and reports what it took and what the slot held. The superseded generation's commit is
 * adopted and acknowledged `committed`, so the host promotes its working entry with the next
 * compile message; the next generation's candidate then replaces it.
 */
describe('a generation superseded after its commit, in the real runtime', () => {
  const roots: string[] = [];
  afterEach(async () => {
    stage.removing = undefined;
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it("promotes the superseded commit's retained entry, then replaces it with the next one", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ngdoc-commit-race-runtime-')));
    roots.push(root);
    const outputRoot = join(root, 'out');
    mkdirSync(outputRoot);
    const repository = resolve(import.meta.dirname, '../../../../..');
    await build({
      entryPoints: [
        join(repository, 'libs/builder/generator/worker/entry.ts'),
        join(repository, 'libs/builder/generator/worker/protocol.ts'),
      ],
      outdir: join(root, 'worker'),
      platform: 'node',
      format: 'esm',
      target: 'node24',
    });
    const probe = join(root, 'probe.jsonl');
    const module = join(root, 'compiler.mjs');
    writeFileSync(
      module,
      `import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = (value) => createHash('sha256').update(value).digest('hex');
export function createCompilationService({ probe, configuration }) {
  return {
    async compile(request, _signal, context) {
      const port = context?.retention;
      const taken = port?.take();
      const body = 'generation ' + request.generation;
      const candidate = {
        configuration, projectId: 'project', revision: 'revision-' + request.generation,
        artifacts: [{ id: 'artifact', identity: { projectId: 'project', entryId: 'entry', role: 'content' },
          revision: 'artifact-' + request.generation,
          fingerprint: { schemaVersion: 4, compilerVersion: 'compiler', toolchainDigest: 'toolchain',
            configurationDigest: 'configuration', inputDigest: 'input', keywordDigest: 'keywords' },
          dependencies: [], content: [], exportedKeywords: [], usedKeywords: [], searchRecords: [],
          routes: [], apiList: [],
          outputs: [{ path: 'generated.txt', role: 'content', encoding: 'utf8', content: body, digest: sha(body) }],
          diagnostics: [] }],
        globalKeywords: [], remoteKeywords: [],
      };
      port?.offer({ key: 'k', base: candidate.revision });
      if (taken) port.restore(taken);
      appendFileSync(probe, JSON.stringify({ generation: request.generation,
        base: request.previous?.revision ?? null, took: taken?.base ?? null, held: port?.held() ?? null }) + '\\n');
      return { candidate, dependencies: [], diagnostics: [], whyRebuilt: [] };
    },
    async dispose() {},
  };
}
`,
    );
    // A published configuration spells its roots as the engine does (forward slashes on Windows).
    const configuration = {
      outputRoot: hostPath(outputRoot),
      cacheRoot: hostPath(join(root, 'cache')),
      assetDirectory: 'assets',
      themes: { light: 'light', dark: 'dark' },
      digest: 'configuration',
    };
    const compiler = createWorkerCompilationService({
      moduleUrl: pathToFileURL(module),
      workerEntryUrl: pathToFileURL(join(root, 'worker/entry.js')),
      factoryOptions: { probe, configuration },
      startupTimeoutMs: 30_000,
      compileTimeoutMs: 30_000,
      persistent: { delta: true, prime: false },
    });
    const session = createBuildSession(
      { compiler, committer: createOutputCommitter({ outputRoot }) },
      { batchDelayMs: 0 },
    );
    try {
      const source = new Events();
      const results: BuildResult[] = [];
      const watch = await session.watch(source, (event) => {
        if (event.kind === 'result') results.push(event.result);
      });
      expect((await watch.initial).status).toBe('success');
      stage.removing = () => source.emit({ kind: 'update', path: '/docs/b.md' });
      source.emit({ kind: 'update', path: '/docs/a.md' });
      await until(() => results.some((result) => result.generation === 3), 20_000);
      expect(results[1]).toMatchObject({ generation: 2, superseded: true, status: 'success' });
      source.emit({ kind: 'update', path: '/docs/c.md' });
      await until(() => results.some((result) => result.generation === 4), 20_000);
      expect(results.map((result) => result.status)).toEqual([
        'success',
        'success',
        'success',
        'success',
      ]);
      await watch.dispose();
      const probes = readFileSync(probe, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(
          (line) =>
            JSON.parse(line) as {
              generation: number;
              base: string | null;
              took: string | null;
              held: object | null;
            },
        );
      const at = (generation: number) => probes.find((item) => item.generation === generation)!;
      // Generation 2 offered its entry as the working one (its commit then raced the supersede).
      expect(at(2).held).toEqual({ committed: 'revision-1', working: 'revision-2' });
      // Its commit was adopted: generation 3 compiled on base 2 with generation 2's entry, which
      // the host promoted with the compile message; generation 3's candidate is the new working one.
      expect(at(3)).toMatchObject({ base: 'revision-2', took: 'revision-2' });
      expect(at(3).held).toEqual({ committed: 'revision-2', working: 'revision-3' });
      // Then replaced by N+1's.
      expect(at(4)).toMatchObject({ base: 'revision-3', took: 'revision-3' });
      expect(at(4).held).toEqual({ committed: 'revision-3', working: 'revision-4' });
      expect(compiler.transport()).toMatchObject({ fallbacks: 0 });
      expect(compiler.transport().promotions).toBeGreaterThanOrEqual(3);
    } finally {
      await session.dispose();
    }
  }, 60_000);
});
