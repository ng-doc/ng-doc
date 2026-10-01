import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, test } from 'vitest';

import { createOutputCommitter } from '../../artifacts';
import type {
  BuildResult,
  CommitGuard,
  CommitRequest,
  CommitResult,
  FileChange,
  JsonValue,
  OutputCommitter,
  RetainedCompilation,
} from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import { createWorkerCompilationService } from '../index';
import { createRuntimeRetention } from '../protocol';

/**
 * The retention slot a long-lived runtime owns. Unit tests of the slot, then the real compiler in
 * real worker processes through the real session: with the delta transport a candidate's program is
 * committed only on the commit's acknowledgement (the `promote` message), so a discarded commit
 * keeps the committed program unless the generation consumed it (a full synchronize) or mutated it
 * (a query added a source file). The full transport, which has no acknowledgement, keeps the
 * promote-at-compile-end semantics. Both transports publish identical snapshots at every step.
 */

const entry = (base: string, key = 'k'): RetainedCompilation => ({ key, base });

describe('runtime retention slot', () => {
  it('keeps a delta offer as the working entry until a promote or resync names its revision', () => {
    const slot = createRuntimeRetention();
    expect(slot.inspect()).toEqual({
      committed: null,
      working: null,
      invalidated: null,
      counters: { offered: 0, promoted: 0, dropped: 0 },
    });
    // A warm-up or full-transport compile commits its offer at once.
    slot.serve('compile-end').offer(entry('r0'));
    // A delta compile takes the committed entry, offers its candidate, restores the intact one.
    const handle = slot.serve('acknowledged');
    expect(handle.held()).toEqual({ committed: 'r0' });
    const taken = handle.take()!;
    expect(handle.take()).toBeUndefined();
    handle.offer(entry('r1'));
    expect(handle.restore(taken)).toBe(true);
    expect(handle.held()).toEqual({ committed: 'r0', working: 'r1' });
    // A second restore never replaces a held committed entry.
    expect(handle.restore(entry('other'))).toBe(false);
    // Acknowledged: the next compile message promotes exactly that revision.
    slot.promote('r1');
    expect(slot.inspect()).toMatchObject({ committed: 'r1', working: null });
    // Discarded: the next compile message carries no promote (or another revision).
    handle.offer(entry('r2'));
    slot.promote(undefined);
    handle.offer(entry('r3'));
    slot.promote('r2');
    expect(slot.inspect()).toMatchObject({
      committed: 'r1',
      working: null,
      counters: { offered: 3, promoted: 1, dropped: 2 },
    });
    // A resync to the working entry's revision (the caller committed it) promotes it; any other
    // base drops it and keeps the committed entry for the compiler's own base check.
    handle.offer(entry('r4'));
    slot.resync('r4');
    expect(slot.inspect()).toMatchObject({ committed: 'r4', working: null });
    handle.offer(entry('r5'));
    slot.resync(null);
    expect(slot.inspect()).toMatchObject({
      committed: 'r4',
      working: null,
      counters: { offered: 5, promoted: 2, dropped: 3 },
    });
    // Nothing is promoted when there is nothing to promote.
    slot.promote('r4');
    expect(slot.inspect().counters).toEqual({ offered: 5, promoted: 2, dropped: 3 });
    // A compile-end offer replaces the committed entry; nothing is working.
    slot.serve('compile-end').offer(entry('r6'));
    expect(slot.inspect()).toMatchObject({ committed: 'r6', working: null });
  });

  it('serves each compile a handle with its own promotion policy and no slot controls', () => {
    const slot = createRuntimeRetention();
    const delta = slot.serve('acknowledged');
    // A second compile's handle (for example a warm-up, or a verifying full compile) served before the delta
    // compile's offer does not change where that offer goes.
    const warm = slot.serve('compile-end');
    delta.offer(entry('d1'));
    expect(slot.inspect()).toMatchObject({ committed: null, working: 'd1' });
    warm.offer(entry('w1'));
    expect(slot.inspect()).toMatchObject({ committed: 'w1', working: 'd1' });
    // The handle exposes the compile's operations only, and cannot be changed.
    expect(Object.keys(delta).sort()).toEqual(['held', 'invalidate', 'offer', 'restore', 'take']);
    expect(Object.isFrozen(delta)).toBe(true);
    expect('promote' in delta || 'resync' in delta || 'serve' in delta).toBe(false);
  });

  it('keeps why its committed entry was invalidated until it holds one again', () => {
    const slot = createRuntimeRetention();
    const handle = slot.serve('acknowledged');
    slot.serve('compile-end').offer(entry('r0'));
    // A generation took the entry and consumed its program; its candidate's commit is discarded.
    handle.take();
    handle.invalidate!('consumed');
    handle.offer(entry('r1'));
    expect(handle.held()).toEqual({ working: 'r1', invalidated: 'consumed' });
    slot.promote(undefined);
    // The drop keeps the earlier cause.
    expect(slot.inspect()).toMatchObject({ committed: null, invalidated: 'consumed' });
    // A committed entry clears it; a drop with none held and no earlier cause records the drop.
    handle.offer(entry('r2'));
    slot.promote('r2');
    expect(slot.inspect()).toMatchObject({ committed: 'r2', invalidated: null });
    handle.invalidate!('ignored while a committed entry is held');
    expect(handle.held()).toEqual({ committed: 'r2' });
    handle.take();
    handle.offer(entry('r3'));
    slot.promote(undefined);
    expect(handle.held()).toEqual({ invalidated: 'dropped unacknowledged' });
    expect(handle.restore(entry('r2'))).toBe(true);
    expect(handle.held()).toEqual({ committed: 'r2' });
  });
});

const repository = path.resolve(import.meta.dirname, '../../../../..');
let temporary: string;
let probeUrl: URL;
let entryUrl: URL;

interface Probe {
  generation: number;
  base: string | null;
  revision: string | null;
  retention: {
    counters: Record<'reused' | 'rebuilt' | 'promoted' | 'restored' | 'discarded', number>;
    retained?: { base: string };
    working?: { base: string };
    last?: { synchronization?: { path: string; reason?: string }; discarded?: string };
  };
  /** The targeted rebuild's record of the generation. */
  targeted?: { published: string; pending: number; reason?: string };
}

beforeAll(async () => {
  temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'ngdoc-retention-')));
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
    `import { appendFileSync } from 'node:fs';
import { createCompilationService as create, incrementalRetention, targetedDryRun } from './compiler.mjs';
export function createCompilationService({ probe, ...options }) {
  const service = create(options);
  return {
    async compile(request, signal, context) {
      const result = await service.compile(request, signal, context);
      appendFileSync(probe, JSON.stringify({ generation: request.generation,
        base: request.previous?.revision ?? null, revision: result.candidate?.revision ?? null,
        retention: incrementalRetention(), targeted: targetedDryRun().last }) + '\\n');
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

interface Step {
  name: string;
  apply(put: (file: string, text: string) => Promise<string>): Promise<string>;
  failCommit?: true;
}

const outside = '{{ NgDocApi.details("outside/extra.ts#Outside") }}';
const guide = (body: string) =>
  `# Guide\n\nBody with \`Actual\`. ${body}\n\n{% include "../shared/include.md" %}\n`;
const steps: Step[] = [
  {
    name: 'include edit whose commit fails',
    apply: (put) => put('docs/shared/include.md', 'Include of a discarded commit.'),
    failCommit: true,
  },
  { name: 'guide edit after it', apply: (put) => put('docs/guide/index.md', guide('One.')) },
  {
    name: 'API edit whose commit fails',
    apply: (put) =>
      put('docs/api.ts', '/** Discarded edit. */ export class Actual { /** Value. */ value = 1; }'),
    failCommit: true,
  },
  {
    name: 'guide edit after the patched program',
    apply: (put) => put('docs/guide/index.md', guide('Two.')),
  },
  {
    name: 'guide edit that adds a source file to the program',
    apply: (put) => put('docs/guide/index.md', guide(`Three.\n\n${outside}`)),
  },
  {
    name: 'guide edit after the mutated program',
    apply: (put) => put('docs/guide/index.md', guide('Four.')),
  },
];

async function run(
  transport: 'delta' | 'full',
  chain: Step[] = steps,
  options: { acknowledge?: false } = {},
) {
  // One workspace path for both transports, so their snapshots (paths, digests) are comparable.
  const root = path.join(temporary, 'workspace');
  await rm(root, { recursive: true, force: true });
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
    `export default { docsPath: 'docs', cache: false };`,
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
  await put('docs/guide/index.md', guide('Zero.'));
  await put('docs/shared/include.md', 'Shared include text.');
  await put('outside/extra.ts', '/** Outside the tsconfig. */ export class Outside {}');
  const probe = path.join(root, 'probe.jsonl');
  const outputRoot = path.join(root, 'out');
  const factoryOptions: JsonValue = {
    probe,
    projectId: 'retention',
    workspaceRoot: root,
    configFile,
    defaults: {
      docsRoot: path.join(root, 'docs'),
      tsConfig,
      outputRoot,
      cacheRoot: path.join(root, 'cache'),
    },
    compilerVersion: 'retention-test',
    toolchainDigest: 'node24-ts6-shiki',
    templateRoot: path.join(repository, 'libs/builder/templates'),
  };
  let failNext = false;
  const real = createOutputCommitter({ outputRoot });
  const committer: OutputCommitter = {
    commit(request: CommitRequest, guard: CommitGuard, signal: AbortSignal) {
      if (!failNext) return real.commit(request, guard, signal);
      failNext = false;
      return Promise.resolve<CommitResult>({
        status: 'failed',
        diagnostics: [
          { code: 'TEST_COMMIT_FAILED', message: 'injected', severity: 'error', stage: 'commit' },
        ],
      });
    },
    dispose: () => real.dispose(),
  };
  const worker = createWorkerCompilationService({
    moduleUrl: probeUrl,
    workerEntryUrl: entryUrl,
    factoryOptions,
    startupTimeoutMs: 30_000,
    compileTimeoutMs: 60_000,
    persistent: { delta: transport === 'delta' },
  });
  // A host that never learns the commit outcome: the session still uses
  // the delta transport, but the runtime is never told to promote, so every compile after a
  // commit resyncs the runtime to the caller's committed snapshot first.
  const compiler =
    options.acknowledge === false ? { ...worker, acknowledge: () => undefined } : worker;
  const session = createBuildSession({ compiler, committer }, { batchDelayMs: 0 });
  const probes = async (): Promise<Probe[]> =>
    (await readFile(probe, 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Probe);
  try {
    const built = await session.buildOnce({ mode: 'development' });
    expect(built.status).toBe('success');
    let emit!: (changes: FileChange[]) => unknown;
    const results: BuildResult[] = [];
    const watch = await session.watch(
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
    await watch.initial;
    await expect
      .poll(() => session.inspect().priming, { timeout: 60_000, interval: 50 })
      .toBe('primed');
    const recorded: Array<{ step: string; result: BuildResult; probe: Probe }> = [];
    for (const step of chain) {
      // Files written by a step settle past the retained program's stat margin first.
      await new Promise((resolve) => setTimeout(resolve, 150));
      failNext = step.failCommit === true;
      const changed = await step.apply(put);
      const before = results.length;
      emit([{ kind: 'update', path: changed }]);
      await expect.poll(() => results.length, { timeout: 60_000, interval: 20 }).toBe(before + 1);
      const result = results.at(-1)!;
      expect(result.status, step.name).toBe(step.failCommit ? 'failure' : 'success');
      recorded.push({ step: step.name, result, probe: (await probes()).at(-1)! });
    }
    await watch.dispose();
    return { recorded, transport: worker.transport() };
  } finally {
    await session.dispose();
  }
}

test('the delta transport commits a candidate program only on its acknowledgement; both transports publish identical snapshots', async () => {
  const delta = await run('delta');
  const full = await run('full');
  const sync = (probe: Probe) => probe.retention.last?.synchronization?.path;
  const snapshot = (result: BuildResult) =>
    result.status === 'success' ? JSON.stringify(result.snapshot) : null;
  for (const [index, item] of delta.recorded.entries()) {
    const other = full.recorded[index];
    expect(item.result.status, item.step).toBe(other.result.status);
    expect(snapshot(item.result), item.step).toBe(snapshot(other.result));
  }
  const [discarded, after, consumed, afterConsumed, mutated, afterMutated] = delta.recorded.map(
    (item) => item.probe,
  );
  // 1. The program was only read: the committed entry is restored beside the working one.
  expect(sync(discarded)).toBe('reused');
  expect(discarded.retention.working).toEqual({ base: discarded.revision });
  expect(discarded.retention.retained).toEqual({ base: discarded.base });
  // 2. The failed commit was acknowledged `discarded`: the committed program serves the next edit.
  expect(after.base).toBe(discarded.base);
  expect(sync(after)).toBe('reused');
  // Both edits were content edits, compiled by the targeted rebuild; the second one also compiled
  // the include edit of the discarded commit against the same base (and equals the full transport,
  // whose runtime rebuilt in full).
  expect(discarded.targeted).toMatchObject({ published: 'targeted', pending: 0 });
  expect(after.targeted).toMatchObject({ published: 'targeted', pending: 1 });
  // 3–4. The program-file edit patched the committed program in place for its candidate only:
  // after the discarded commit, nothing holds a program and the next edit rebuilds.
  expect(sync(consumed)).toBe('patched');
  expect(consumed.retention.retained).toBeUndefined();
  expect(consumed.retention.working).toEqual({ base: consumed.revision });
  expect(afterConsumed.retention.last).toEqual({
    synchronization: { path: 'full', reason: 'no retained program' },
    // Not a cold start: the slot says why it held no program.
    discarded: 'invalidated: patched',
  });
  // 5–6. A query added a source file to the reused program: neither entry survives.
  expect(sync(mutated)).toBe('reused');
  expect(mutated.retention.retained).toBeUndefined();
  expect(mutated.retention.working).toBeUndefined();
  expect(afterMutated.retention.last?.synchronization).toEqual({
    path: 'full',
    reason: 'no retained program',
  });
  expect(afterMutated.retention.last?.discarded).toBe('invalidated: mutated');
  // The acknowledged commits were promoted by the runtime and nothing fell back.
  expect(delta.transport).toMatchObject({ fallbacks: 0, mismatches: 0 });
  expect(delta.transport.promotions).toBeGreaterThanOrEqual(2);
  // Without acknowledgements (full transport) the candidate program is committed at compile end, so
  // after the discarded commit the program is rebuilt.
  const fullProbes = full.recorded.map((item) => item.probe);
  expect(sync(fullProbes[0])).toBe('reused');
  expect(fullProbes[0].retention.working).toBeUndefined();
  expect(fullProbes[1].retention.last).toMatchObject({
    synchronization: { path: 'full' },
    discarded: 'previous snapshot is not the retained base revision',
  });
}, 240_000);

test('a resync to the revision the caller committed promotes the working program', async () => {
  // No acknowledgement ever reaches the runtime, so no compile message promotes: each edit after
  // a commit starts with a resync to that commit's revision, and only the resync rule
  // (worker/entry.ts `retention.resync`) keeps the candidate program for the next edit.
  const edits: Step[] = [
    { name: 'guide edit', apply: (put) => put('docs/guide/index.md', guide('One.')) },
    {
      name: 'guide edit after a resync',
      apply: (put) => put('docs/guide/index.md', guide('Two.')),
    },
    {
      name: 'include edit after a resync',
      apply: (put) => put('docs/shared/include.md', 'Include after a resync.'),
    },
  ];
  const { recorded, transport } = await run('delta', edits, { acknowledge: false });
  const probes = recorded.map((item) => item.probe);
  for (const [index, probe] of probes.entries()) {
    expect(probe.retention.last?.synchronization?.path, edits[index].name).toBe('reused');
    expect(probe.retention.working, edits[index].name).toEqual({ base: probe.revision });
  }
  // Each later edit's base is the previous edit's commit, reached by a resync, not a promotion.
  expect(probes[1].base).toBe(probes[0].revision);
  expect(probes[2].base).toBe(probes[1].revision);
  expect(probes[1].retention.retained).toEqual({ base: probes[0].revision });
  expect(transport.promotions).toBe(0);
  expect(transport.snapshotResyncs).toBeGreaterThanOrEqual(2);
}, 240_000);
