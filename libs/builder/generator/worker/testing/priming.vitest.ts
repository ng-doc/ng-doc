import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { createOutputCommitter } from '../../artifacts';
import type { BuildEvent, BuildResult, FileChange, JsonValue } from '../../contracts';
import { hostPath } from '../../kernel/paths';
import { createBuildSession } from '../../session/build-session';
import { type PersistentWorkerOptions, createWorkerCompilationService } from '../index';

/**
 * Priming, end to end with the real compiler in real worker processes: the startup baseline is
 * compiled in the long-lived runtime, which retains its program for exactly the committed revision;
 * the warm-up then finds it and returns without compiling, so the first edit after start, however
 * soon it arrives, takes the retained-program skip instead of rebuilding the TypeScript program.
 * Without warm-ups the baseline comes from a one-shot runtime (which, told its lifetime, retains
 * nothing) and the first edit rebuilds the program.
 */

const repository = path.resolve(import.meta.dirname, '../../../../..');
let temporary: string;
let probeUrl: URL;
let entryUrl: URL;

interface Probe {
  pid: number;
  generation: number;
  base: string | null;
  lifetime: string | null;
  revision: string | null;
  retention: {
    counters: Record<'reused' | 'rebuilt' | 'promoted' | 'restored' | 'discarded', number>;
    retained?: { base: string };
    last?: { synchronization?: { path: string }; discarded?: string };
  };
}

beforeAll(async () => {
  temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'ngdoc-priming-')));
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  await symlink(path.join(repository, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  await build({
    absWorkingDir: repository,
    entryPoints: ['libs/builder/generator/compiler/index.ts'],
    outfile: path.join(temporary, 'compiler.mjs'),
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    alias: {
      '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
    },
  });
  // Records, after every compile, what the runtime's compiler did with its retained program.
  const probe = path.join(temporary, 'probe.mjs');
  await writeFile(
    probe,
    `import { appendFileSync, writeFileSync } from 'node:fs';
import { createCompilationService as create, incrementalRetention } from './compiler.mjs';
export function createCompilationService({ probe, race, ...options }) {
  const service = create(options);
  return {
    async compile(request, signal, context) {
      const result = await service.compile(request, signal, context);
      // An edit that lands while the startup generation runs, after it read the file.
      if (race && request.generation === 1 && !request.previous) writeFileSync(race.file, race.text);
      appendFileSync(probe, JSON.stringify({ pid: process.pid, generation: request.generation,
        base: request.previous?.revision ?? null, lifetime: context?.lifetime ?? null,
        revision: result.candidate?.revision ?? null, retention: incrementalRetention() }) + '\\n');
      return result;
    },
    dispose: () => service.dispose(),
  };
}
`,
  );
  await build({
    entryPoints: [
      path.join(repository, 'libs/builder/generator/worker/entry.ts'),
      path.join(repository, 'libs/builder/generator/worker/protocol.ts'),
    ],
    outdir: path.join(temporary, 'worker'),
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  probeUrl = pathToFileURL(probe);
  entryUrl = pathToFileURL(path.join(temporary, 'worker/entry.js'));
}, 60_000);

afterAll(async () => {
  await rm(temporary, { recursive: true, force: true });
});

async function workspace(name: string) {
  const root = path.join(temporary, name);
  const put = async (file: string, text: string) => {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
    return target;
  };
  const tsConfig = await put(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
  );
  const configFile = await put(
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', cache: true };`,
  );
  await put(
    'docs/ng-doc.api.ts',
    `const api = { title: 'API', scopes: [{ name: 'Public', route: 'public', include: ['docs/api.ts'] }] }; export default api;`,
  );
  await put(
    'docs/api.ts',
    '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
  );
  await put(
    'docs/guide/ng-doc.page.ts',
    `/** Guide introduction. */ const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
  );
  const guide = await put('docs/guide/index.md', '# Guide\n\nBody with `Actual`.\n');
  const probe = path.join(root, 'probe.jsonl');
  return { root, tsConfig, configFile, guide, probe };
}

async function run(
  name: string,
  persistent: PersistentWorkerOptions,
  { waitForWarmUp = true }: { waitForWarmUp?: boolean } = {},
) {
  const w = await workspace(name);
  const outputRoot = path.join(w.root, 'out');
  const factoryOptions: JsonValue = {
    probe: w.probe,
    projectId: 'priming',
    workspaceRoot: w.root,
    configFile: w.configFile,
    defaults: {
      docsRoot: path.join(w.root, 'docs'),
      tsConfig: w.tsConfig,
      outputRoot,
      cacheRoot: path.join(w.root, 'cache'),
    },
    compilerVersion: 'priming-test',
    toolchainDigest: 'node24-ts6-shiki',
    templateRoot: path.join(repository, 'libs/builder/templates'),
  };
  const session = createBuildSession(
    {
      compiler: createWorkerCompilationService({
        moduleUrl: probeUrl,
        workerEntryUrl: entryUrl,
        factoryOptions,
        startupTimeoutMs: 30_000,
        compileTimeoutMs: 60_000,
        persistent,
      }),
      committer: createOutputCommitter({ outputRoot }),
    },
    { batchDelayMs: 0 },
  );
  const probes = async (): Promise<Probe[]> =>
    (await readFile(w.probe, 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Probe);
  try {
    const built = await session.buildOnce({ mode: 'development' });
    expect(built.status).toBe('success');
    if (built.status !== 'success') throw new Error('buildOnce failed');
    let emit!: (changes: FileChange[]) => unknown;
    const events: BuildEvent[] = [];
    const results: BuildResult[] = [];
    const watch = await session.watch(
      {
        async subscribe(listener: (events: FileChange[]) => unknown) {
          emit = listener;
          return { dispose: async () => {} };
        },
      },
      (event) => {
        events.push(event);
        if (event.kind === 'result') results.push(event.result);
      },
    );
    expect(await watch.initial).toEqual(built);
    // The user is still opening the browser: the warm-up runs (or is skipped) while idle. Or the
    // first edit arrives at once.
    if (waitForWarmUp)
      await expect
        .poll(() => session.inspect().priming ?? 'none', { timeout: 60_000, interval: 50 })
        .toMatch(/^(primed|none)$/);
    const primed = session.inspect().priming;
    const beforeEdit = await probes();
    expect(events).toEqual([]);
    await writeFile(w.guide, '# Guide\n\nEdited body with `Actual`.\n');
    // A watcher reports the engine's spelling of the path (forward slashes on Windows).
    emit([{ kind: 'update', path: hostPath(w.guide) }]);
    await expect.poll(() => results.length, { timeout: 60_000, interval: 50 }).toBe(1);
    await watch.dispose();
    return {
      built: built.snapshot.revision,
      primed,
      beforeEdit,
      all: await probes(),
      results,
      events,
    };
  } finally {
    await session.dispose();
  }
}

/** The baseline in the long-lived runtime, and the first edit in the same runtime. */
function expectRetainedFirstEdit({ built, all, results, events }: Awaited<ReturnType<typeof run>>) {
  // The baseline: a development buildOnce before the watch, served by the long-lived runtime,
  // which retains its program for exactly the committed revision.
  const [baseline, edit] = all;
  expect(baseline).toMatchObject({ lifetime: 'watch', base: null, revision: built, generation: 1 });
  expect(baseline.retention).toMatchObject({
    retained: { base: built },
    counters: { rebuilt: 1, promoted: 1, reused: 0 },
  });
  // The warm-up compiled nothing. The first edit: same runtime, base = retained base, program
  // reused.
  expect(all).toHaveLength(2);
  expect(edit).toMatchObject({ pid: baseline.pid, lifetime: 'watch', base: built, generation: 2 });
  expect(edit.retention.last?.synchronization?.path).toBe('reused');
  expect(edit.retention.counters).toMatchObject({ reused: 1, rebuilt: 1, promoted: 2 });
  expect(results[0]).toMatchObject({ status: 'success', generation: 2 });
  expect(results[0].status === 'success' && results[0].snapshot.revision).toBe(edit.revision);
  expect(edit.revision).not.toBe(built);
  expect(events.map((event) => event.kind)).toEqual(['started', 'result']);
}

test('priming makes the first edit after start take the retained-program skip', async () => {
  const outcome = await run('primed', {});
  expect(outcome.primed).toBe('primed');
  expect(outcome.beforeEdit).toHaveLength(1);
  expectRetainedFirstEdit(outcome);
}, 180_000);

test('an edit right after the start takes the retained-program skip without waiting for a warm-up', async () => {
  expectRetainedFirstEdit(await run('immediate', {}, { waitForWarmUp: false }));
}, 180_000);

test('without priming the first edit rebuilds the program', async () => {
  const { built, primed, beforeEdit, all, results } = await run('unprimed', { prime: false });
  expect(primed).toBeUndefined();
  expect(beforeEdit).toHaveLength(1);
  // The one-shot baseline runtime is told its lifetime and retains nothing.
  expect(beforeEdit[0]).toMatchObject({ lifetime: 'generation', base: null, revision: built });
  expect(beforeEdit[0].retention.retained).toBeUndefined();
  expect(all[1].pid).not.toBe(beforeEdit[0].pid);
  const edit = all[1];
  expect(all).toHaveLength(2);
  expect(edit).toMatchObject({ lifetime: 'watch', base: built, generation: 2 });
  expect(edit.retention.last?.synchronization?.path).toBe('full');
  expect(edit.retention.counters).toMatchObject({ reused: 0, rebuilt: 1 });
  expect(results[0]).toMatchObject({ status: 'success', generation: 2 });
}, 180_000);

test('an edit during the startup generation in the long-lived runtime, then another edit, equal a cold build', async () => {
  const w = await workspace('startup-race');
  const outputRoot = path.join(w.root, 'out');
  const options = (cacheRoot: string, race?: { file: string; text: string }): JsonValue => ({
    probe: w.probe,
    ...(race ? { race } : {}),
    projectId: 'priming',
    workspaceRoot: w.root,
    configFile: w.configFile,
    defaults: { docsRoot: path.join(w.root, 'docs'), tsConfig: w.tsConfig, outputRoot, cacheRoot },
    compilerVersion: 'priming-test',
    toolchainDigest: 'node24-ts6-shiki',
    templateRoot: path.join(repository, 'libs/builder/templates'),
  });
  const session = (factoryOptions: JsonValue, persistent: PersistentWorkerOptions | false) =>
    createBuildSession(
      {
        compiler: createWorkerCompilationService({
          moduleUrl: probeUrl,
          workerEntryUrl: entryUrl,
          factoryOptions,
          startupTimeoutMs: 30_000,
          compileTimeoutMs: 60_000,
          persistent,
        }),
        committer: createOutputCommitter({ outputRoot }),
      },
      { batchDelayMs: 0 },
    );
  const api = path.join(w.root, 'docs/api.ts');
  const watched = session(
    options(path.join(w.root, 'cache'), {
      file: w.guide,
      text: '# Guide\n\nRaced body with `Actual`.\n',
    }),
    {},
  );
  let final: BuildResult | undefined;
  try {
    const built = await watched.buildOnce({ mode: 'development' });
    expect(built.status).toBe('success');
    let emit!: (changes: FileChange[]) => unknown;
    const results: BuildResult[] = [];
    const watch = await watched.watch(
      {
        async subscribe(listener: (events: FileChange[]) => unknown) {
          emit = listener;
          return { dispose: async () => {} };
        },
      },
      (event) => {
        if (event.kind === 'result') results.push(event.result);
      },
    );
    // The baseline read the guide before the edit: the watch generates instead of reusing it.
    const initial = await watch.initial;
    expect(initial.status).toBe('success');
    expect(initial.generation).toBeGreaterThan(built.generation);
    const settled = results.length;
    await writeFile(
      api,
      '/** Edited declaration. */ export class Actual { /** Value. */ value = 2; }',
    );
    emit([{ kind: 'update', path: hostPath(api) }]);
    await expect
      .poll(() => results.slice(settled).some((result) => result.status === 'success'), {
        timeout: 60_000,
        interval: 50,
      })
      .toBe(true);
    final = results.at(-1);
    await watch.dispose();
  } finally {
    await watched.dispose();
  }
  expect(final?.status).toBe('success');
  // A cold build of the same tree: one-shot, with the cache removed.
  await rm(path.join(w.root, 'cache'), { recursive: true, force: true });
  const cold = session(options(path.join(w.root, 'cache')), false);
  try {
    const reference = await cold.buildOnce({ mode: 'development' });
    expect(reference.status).toBe('success');
    if (final?.status !== 'success' || reference.status !== 'success') return;
    expect(JSON.stringify(final.snapshot.artifacts)).toBe(
      JSON.stringify(reference.snapshot.artifacts),
    );
    expect(JSON.stringify(final.snapshot.artifacts)).toContain('Raced body');
    expect(JSON.stringify(final.snapshot.artifacts)).toContain('Edited declaration');
  } finally {
    await cold.dispose();
  }
}, 180_000);
