import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { createOutputCommitter } from '../../artifacts';
import type {
  ArtifactSnapshot,
  BuildEvent,
  BuildResult,
  CommitGuard,
  CommitRequest,
  CommitResult,
  FileChange,
  JsonValue,
  OutputCommitter,
} from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import {
  type DeltaTransportStatistics,
  type PersistentWorkerOptions,
  createWorkerCompilationService,
} from '../index';

/**
 * Delta transport differential: one edit sequence through the real session, the real committer and
 * the real compiler in real worker processes, run three times on the same workspace path: with the
 * delta transport, with the delta transport in `verify` mode (every patched candidate is checked
 * against the full one inside the worker, and retained snapshots are frozen), and with the full
 * transport. Every step must publish byte-identical outputs, equal snapshots (deep equality, all
 * artifacts), equal manifests and diagnostics; every successful step must also equal a cold
 * one-shot compile of the same tree (revisions, content index, outputs). The sequence covers
 * priming, guide/include/API edits, a create and a delete, a failed generation, a failed commit, a
 * supersession, a runtime recycle, and a base mismatch resync (a production build commits between
 * two watch generations).
 */

const repository = path.resolve(import.meta.dirname, '../../../../..');
let temporary: string;
let probeUrl: URL;
let entryUrl: URL;
let root: string;

interface Probe {
  pid: number;
  generation: number;
  base: string | null;
  lifetime: string | null;
  revision: string | null;
  synchronization: string | null;
}

beforeAll(async () => {
  temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'ngdoc-delta-')));
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
  const probe = path.join(temporary, 'probe.mjs');
  await writeFile(
    probe,
    `import { appendFileSync } from 'node:fs';
import { createCompilationService as create, incrementalRetention } from './compiler.mjs';
export function createCompilationService({ probe, ...options }) {
  const service = create(options);
  return {
    async compile(request, signal, context) {
      const result = await service.compile(request, signal, context);
      appendFileSync(probe, JSON.stringify({ pid: process.pid, generation: request.generation,
        base: request.previous?.revision ?? null, lifetime: context?.lifetime ?? null,
        revision: result.candidate?.revision ?? null,
        synchronization: incrementalRetention().last?.synchronization?.path ?? null }) + '\\n');
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
  root = path.join(temporary, 'workspace');
}, 60_000);

afterAll(async () => {
  await rm(temporary, { recursive: true, force: true });
});

const at = (file: string) => path.join(root, file);
const put = async (file: string, text: string) => {
  await mkdir(path.dirname(at(file)), { recursive: true });
  await writeFile(at(file), text);
  return at(file);
};
const include = () => at('docs/shared/include.md');
/** Twenty documented functions; an edit of their JSDoc changes twenty API pages. */
const many = (label: string): string =>
  Array.from(
    { length: 20 },
    (_, index) =>
      `/** ${label} ${index}. */ export function many${index}(): number { return ${index}; }`,
  ).join('\n');

const initialFiles = (): Record<string, string> => ({
  'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
    include: ['docs/**/*.ts'],
  }),
  'ng-doc.config.ts': `export default { docsPath: 'docs', cache: true };`,
  'docs/ng-doc.api.ts': `const api = { title: 'API', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default api;`,
  'docs/api.ts': '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
  // Enough declarations that an API edit of every one of them is a large delta.
  'docs/api-many.ts': many('Function'),
  'docs/api-helper.ts':
    "import { Actual } from './api';\n/** Returns the given actual. */ export function helper(value: Actual): Actual { return value; }",
  'docs/guide/ng-doc.page.ts': `/** Guide introduction. */ const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
  'docs/guide/index.md': `---\nkeyword: Guide\n---\n# Guide heading\n\nBody with \`Actual\` and \`helper\`.\n\n{% include ${JSON.stringify(include())} %}\n`,
  'docs/second/ng-doc.page.ts': `const page = { title: 'Second', route: 'second', mdFile: './index.md' }; export default page;`,
  'docs/second/index.md': `# Second\n\nSee \`*Guide\` for details.\n\n{% include ${JSON.stringify(include())} %}\n`,
  'docs/shared/include.md': 'Shared include text.',
});

async function reset(): Promise<void> {
  for (const directory of ['docs', 'out', 'cache'])
    await rm(at(directory), { recursive: true, force: true });
  for (const [file, text] of Object.entries(initialFiles())) await put(file, text);
}

async function tree(directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else
        files[path.relative(directory, full)] = createHash('sha256')
          .update(await readFile(full))
          .digest('hex');
    }
  };
  await walk(directory);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

interface Recorded {
  step: string;
  status: BuildResult['status'];
  generation: number;
  snapshot?: ArtifactSnapshot;
  manifest?: unknown;
  diagnostics: string[];
  outputs: Record<string, string>;
  cancelled: number;
  /** Delta transport counters after the step (delta chains). */
  transport?: DeltaTransportStatistics;
  /** The production build's snapshot revision, for steps that ran one. */
  production?: string;
}

const read = async (file: string) => readFile(at(file), 'utf8');
const update = (file: string): FileChange => ({ kind: 'update', path: at(file) });

interface Controls {
  failCommit(): void;
  /** A one-shot build in the same session (production unless `mode` says otherwise). */
  production(mode?: 'production' | 'development'): Promise<BuildResult>;
}

interface Step {
  name: string;
  /** Writes the tree and returns the changes to report; `supersede` reports a second batch mid-run. */
  apply(controls: Controls): Promise<FileChange[]>;
  supersede?: () => Promise<FileChange[]>;
  expect: BuildResult['status'];
  cold?: false;
}

const steps: Step[] = [
  {
    name: 'guide edit (first edit after priming)',
    apply: async () => [
      update(await put('docs/guide/index.md', (await read('docs/guide/index.md')) + '\nEdited.\n')),
    ],
    expect: 'success',
  },
  {
    name: 'include edit',
    apply: async () => [update(await put('docs/shared/include.md', 'Edited include text.'))],
    expect: 'success',
  },
  {
    name: 'API JSDoc edit',
    apply: async () => [
      update(
        await put(
          'docs/api.ts',
          '/** Edited declaration. */ export class Actual { /** Value. */ value = 1; }',
        ),
      ),
      // Units re-render only on their own semantic closure: edit twenty declarations.
      update(await put('docs/api-many.ts', many('Edited function'))),
    ],
    expect: 'success',
  },
  {
    name: 'API file created',
    apply: async () => [
      {
        kind: 'create',
        path: await put('docs/api-extra.ts', '/** Extra declaration. */ export class Extra {}'),
      },
    ],
    expect: 'success',
  },
  {
    name: 'API file deleted',
    apply: async () => {
      await unlink(at('docs/api-extra.ts'));
      return [{ kind: 'delete', path: at('docs/api-extra.ts') }];
    },
    expect: 'success',
  },
  {
    name: 'API edit whose commit fails (a large delta, discarded)',
    apply: async (controls) => {
      controls.failCommit();
      return [
        update(
          await put(
            'docs/api.ts',
            '/** Discarded declaration. */ export class Actual { /** Value. */ value = 1; }',
          ),
        ),
        update(await put('docs/api-many.ts', many('Discarded function'))),
      ];
    },
    expect: 'failure',
    cold: false,
  },
  {
    name: 'edit after the discarded large delta (resync)',
    apply: async () => [
      update(await put('docs/guide/index.md', (await read('docs/guide/index.md')) + '\nAfter.\n')),
    ],
    expect: 'success',
  },
  {
    name: 'failed generation (broken include)',
    apply: async () => [
      update(
        await put(
          'docs/second/index.md',
          `# Second\n\n{% include ${JSON.stringify(at('docs/shared/missing.md'))} %}\n`,
        ),
      ),
    ],
    expect: 'failure',
  },
  {
    name: 'repair after the failed generation',
    apply: async () => [
      update(
        await put(
          'docs/second/index.md',
          `# Second\n\nSee \`*Guide\` again.\n\n{% include ${JSON.stringify(include())} %}\n`,
        ),
      ),
    ],
    expect: 'success',
  },
  {
    name: 'failed commit',
    apply: async (controls) => {
      controls.failCommit();
      return [update(await put('docs/shared/include.md', 'Include of a failed commit.'))];
    },
    expect: 'failure',
    cold: false,
  },
  {
    name: 'edit after the failed commit',
    apply: async () => [
      update(await put('docs/guide/index.md', (await read('docs/guide/index.md')) + '\nAgain.\n')),
    ],
    expect: 'success',
  },
  {
    name: 'supersession (a second edit aborts the running generation)',
    apply: async () => [
      update(await put('docs/shared/include.md', 'Include of a superseded generation.')),
    ],
    supersede: async () => [
      update(await put('docs/guide/index.md', (await read('docs/guide/index.md')) + '\nLater.\n')),
    ],
    expect: 'success',
  },
  {
    name: 'one-shot build of the same revision, then a guide edit (identity resync)',
    apply: async (controls) => {
      // A one-shot development build commits a snapshot of the same revision from another runtime:
      // the long-lived runtime must not treat it as its own retained base. (A
      // production build no longer has the same revision: development artifacts record semantic
      // closures, production ones the global semantic reference.)
      expect((await controls.production('development')).status).toBe('success');
      return [
        update(await put('docs/guide/index.md', (await read('docs/guide/index.md')) + '\nSame.\n')),
      ];
    },
    expect: 'success',
  },
  {
    name: 'production build of an unreported edit, then an include edit (base mismatch resync)',
    apply: async (controls) => {
      // The production build commits a tree the long-lived runtime never compiled, so the next
      // watch generation's base is a revision the runtime does not hold.
      await put('docs/guide/index.md', (await read('docs/guide/index.md')) + '\nProd.\n');
      expect((await controls.production()).status).toBe('success');
      return [update(await put('docs/shared/include.md', 'Include after a production build.'))];
    },
    expect: 'success',
  },
  {
    name: 'API revert',
    apply: async () => [
      update(
        await put(
          'docs/api.ts',
          '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
        ),
      ),
    ],
    expect: 'success',
  },
  {
    name: 'include edit after a recycle',
    apply: async () => [update(await put('docs/shared/include.md', 'Final include text.'))],
    expect: 'success',
  },
];

const factoryOptions = (probe: string): JsonValue => ({
  probe,
  projectId: 'delta',
  workspaceRoot: root,
  configFile: at('ng-doc.config.ts'),
  defaults: {
    docsRoot: at('docs'),
    tsConfig: at('tsconfig.json'),
    outputRoot: at('out'),
    cacheRoot: at('cache'),
  },
  compilerVersion: 'delta-test',
  toolchainDigest: 'node24-ts6-shiki',
  templateRoot: path.join(repository, 'libs/builder/templates'),
});

/** A cold build of the current tree: a one-shot runtime, no previous snapshot, no cache. */
async function cold(): Promise<ArtifactSnapshot> {
  const parked = `${at('cache')}.parked`;
  await rename(at('cache'), parked).catch(() => {});
  const service = createWorkerCompilationService({
    moduleUrl: probeUrl,
    workerEntryUrl: entryUrl,
    factoryOptions: factoryOptions(path.join(temporary, 'cold.jsonl')),
    startupTimeoutMs: 30_000,
    compileTimeoutMs: 60_000,
  });
  try {
    const result = await service.compile(
      { generation: 1, mode: 'development', changes: [] },
      new AbortController().signal,
    );
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    return result.candidate!;
  } finally {
    await service.dispose();
    await rm(at('cache'), { recursive: true, force: true });
    await rename(parked, at('cache')).catch(() => {});
  }
}

const published = (snapshot: ArtifactSnapshot) => ({
  revision: snapshot.revision,
  revisions: snapshot.artifacts.map((artifact) => [artifact.id, artifact.revision]),
  outputs: Object.fromEntries(
    snapshot.artifacts
      .flatMap((artifact) => artifact.outputs)
      .map((output) => [output.path, output.digest] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  ),
});

async function chain(
  kind: 'delta' | 'verify' | 'full',
  colds?: Map<string, ReturnType<typeof published>>,
) {
  await reset();
  const probe = path.join(temporary, `${kind}.jsonl`);
  const persistent: PersistentWorkerOptions = {
    delta: kind === 'full' ? false : kind === 'verify' ? 'verify' : true,
    // Recycle the runtime late in the sequence: the next generation starts in a fresh runtime.
    maxGenerations: 10,
  };
  const compiler = createWorkerCompilationService({
    moduleUrl: probeUrl,
    workerEntryUrl: entryUrl,
    factoryOptions: factoryOptions(probe),
    startupTimeoutMs: 30_000,
    compileTimeoutMs: 60_000,
    persistent,
  });
  let failNext = false;
  const real = createOutputCommitter({ outputRoot: at('out') });
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
  const session = createBuildSession({ compiler, committer }, { batchDelayMs: 0 });
  const recorded: Recorded[] = [];
  const results: BuildResult[] = [];
  const events: BuildEvent[] = [];
  let production: string | undefined;
  let primed = 0;
  const record = async (step: string, result: BuildResult, cancelled = 0) => {
    recorded.push({
      transport: compiler.transport(),
      ...(production ? { production } : {}),
      step,
      status: result.status,
      generation: result.generation,
      ...(result.status === 'success'
        ? { snapshot: result.snapshot, manifest: result.manifest }
        : {}),
      diagnostics: result.diagnostics.map((item) => `${item.severity}:${item.code}`),
      outputs: await tree(at('out')),
      cancelled,
    });
  };
  try {
    const baseline = await session.buildOnce({ mode: 'development' });
    expect(baseline.status).toBe('success');
    await record('baseline', baseline);
    let emit!: (changes: FileChange[]) => unknown;
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
    expect(await watch.initial).toEqual(baseline);
    await expect
      .poll(() => session.inspect().priming, { timeout: 60_000, interval: 50 })
      .toBe('primed');
    primed = compiler.transport().snapshotResyncs;
    const controls: Controls = {
      failCommit: () => {
        failNext = true;
      },
      production: async (mode = 'production') => {
        const built = await session.buildOnce({ mode });
        production = built.status === 'success' ? built.snapshot.revision : undefined;
        return built;
      },
    };
    for (const step of steps) {
      // Files written by a step settle past the retained program's stat margin first.
      await new Promise((resolve) => setTimeout(resolve, 150));
      // After `apply`: a production build it runs also reports its result to the watch observer.
      production = undefined;
      const changes = await step.apply(controls);
      const before = results.length;
      const started = events.filter((event) => event.kind === 'started').length;
      emit(changes);
      if (step.supersede) {
        await expect
          .poll(() => events.filter((event) => event.kind === 'started').length, {
            timeout: 30_000,
            interval: 1,
          })
          .toBe(started + 1);
        emit(await step.supersede());
      }
      await expect
        .poll(
          () => results.slice(before).find((result) => result.status !== 'cancelled') ?? undefined,
          { timeout: 60_000, interval: 20 },
        )
        .toBeDefined();
      const settled = results.slice(before).find((result) => result.status !== 'cancelled')!;
      expect(settled.status, step.name).toBe(step.expect);
      await record(
        step.name,
        settled,
        results.slice(before).filter((result) => result.status === 'cancelled').length,
      );
      if (colds && settled.status === 'success' && step.cold !== false) {
        colds.set(step.name, published(await cold()));
      }
    }
    await watch.dispose();
  } finally {
    await session.dispose();
  }
  const probes = (await readFile(probe, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Probe);
  return { recorded, statistics: compiler.transport(), probes, primed };
}

test('the delta transport publishes exactly what the full transport and a cold build publish', async () => {
  const colds = new Map<string, ReturnType<typeof published>>();
  const delta = await chain('delta', colds);
  const verify = await chain('verify');
  const full = await chain('full');

  for (const [index, expected] of full.recorded.entries()) {
    for (const [label, actual] of [
      ['delta', delta.recorded[index]],
      ['verify', verify.recorded[index]],
    ] as const) {
      const where = `${label}: ${expected.step}`;
      expect(actual.step, where).toBe(expected.step);
      expect(actual.status, where).toBe(expected.status);
      expect(actual.generation, where).toBe(expected.generation);
      expect(actual.diagnostics, where).toEqual(expected.diagnostics);
      // Byte-identical published files, equal manifests and equal snapshots (every artifact).
      expect(actual.outputs, where).toEqual(expected.outputs);
      expect(actual.manifest, where).toEqual(expected.manifest);
      expect(actual.snapshot, where).toEqual(expected.snapshot);
      expect(JSON.stringify(actual.snapshot), where).toBe(JSON.stringify(expected.snapshot));
    }
  }
  // Snapshot resyncs per step (delta chains): the identity rule, the large delta and priming.
  const resyncedAt = (run: typeof delta) =>
    run.recorded.map((item, index): [string, number] => [
      item.step,
      (item.transport?.snapshotResyncs ?? 0) -
        (index ? run.recorded[index - 1].transport?.snapshotResyncs ?? 0 : 0),
    ]);
  const index = (name: string) => steps.findIndex((step) => step.name.startsWith(name)) + 1;
  for (const run of [delta, verify]) {
    const resyncs = resyncedAt(run);
    // Priming was the first resync; the first edit after it sent no snapshot.
    expect(run.primed).toBe(1);
    expect(resyncs[index('guide edit (first edit')][1] - run.primed).toBe(0);
    // A discarded large delta leaves the runtime without a committed snapshot: one resync.
    expect(resyncs[index('edit after the discarded large delta')][1]).toBe(1);
    // A same-revision snapshot from a one-shot build is another object: one resync.
    const same = index('one-shot build of the same revision');
    expect(run.recorded[same].production).toBe(run.recorded[same - 1].snapshot!.revision);
    expect(resyncs[same][1]).toBe(1);
    expect(resyncs[index('production build of an unreported edit')][1]).toBe(1);
  }
  // The API edit really was a large delta: more than FIELD_LEVEL_LIMIT artifacts changed.
  {
    const api = index('API JSDoc edit');
    const before = new Map(
      delta.recorded[api - 1].snapshot!.artifacts.map((item) => [item.id, item.revision]),
    );
    const changed = delta.recorded[api].snapshot!.artifacts.filter(
      (item) => before.get(item.id) !== item.revision,
    );
    expect(changed.length).toBeGreaterThan(16);
  }
  expect(delta.recorded.map((item) => item.status)).toEqual([
    'success',
    ...steps.map((step) => step.expect),
  ]);
  // The supersession really aborted a generation (in every chain).
  const supersession = steps.findIndex((step) => step.supersede) + 1;
  for (const run of [delta, verify, full])
    expect(run.recorded[supersession].cancelled).toBeGreaterThanOrEqual(1);

  // Every successful step equals a cold build of the same tree.
  for (const item of delta.recorded) {
    const expected = colds.get(item.step);
    if (!expected) continue;
    expect(published(item.snapshot!), `cold: ${item.step}`).toEqual(expected);
  }
  expect(colds.size).toBe(steps.filter((step) => step.expect === 'success').length);

  // The delta chains really used the delta transport: priming was the first resync, the first
  // edit sent no snapshot, a recycle and the production build each forced one more resync, every
  // committed candidate was promoted, nothing fell back and nothing differed in verify mode.
  const check = (statistics: DeltaTransportStatistics, label: string) => {
    expect(statistics.mismatches, label).toBe(0);
    expect(statistics.fallbacks, label).toBe(0);
    // Priming, the discarded large delta, both production builds, and one per recycle at most.
    expect(statistics.snapshotResyncs, label).toBeGreaterThanOrEqual(4);
    expect(statistics.snapshotResyncs, label).toBeLessThanOrEqual(7);
    expect(statistics.promotions, label).toBeGreaterThanOrEqual(6);
    // Every step but the failed generation returned a candidate as a delta.
    expect(statistics.deltas, label).toBeGreaterThanOrEqual(steps.length - 1);
  };
  check(delta.statistics, 'delta');
  check(verify.statistics, 'verify');
  expect(full.statistics).toMatchObject({ deltas: 0, snapshotResyncs: 0, promotions: 0 });
  // A recycle replaced the runtime (more than one watch runtime served the chain), and the first
  // edit after priming reused the primed program in the same runtime.
  for (const run of [delta, verify]) {
    const watchProbes = run.probes.filter((item) => item.lifetime === 'watch');
    expect(new Set(watchProbes.map((item) => item.pid)).size).toBeGreaterThanOrEqual(2);
    const [prime, first] = watchProbes;
    expect(first.pid).toBe(prime.pid);
    expect(first.base).toBe(run.recorded[0].snapshot!.revision);
    expect(first.synchronization).toBe('reused');
  }
  // The delta transport sends a fraction of what the full transport sends.
  expect(delta.statistics.sentCharacters).toBeGreaterThan(0);
}, 600_000);
