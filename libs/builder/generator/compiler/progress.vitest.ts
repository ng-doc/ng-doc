import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationProgressUpdate,
  CompilationResult,
} from '../contracts';
import { resetClosureStores } from './closure-store';
import { type CompilationOptions, resetIncrementalRetention, resetTargetedDryRun } from './index';
import { CompilationProgress } from './progress';
import {
  type Fixture,
  type Step,
  candidate,
  category,
  cleanup,
  corpus,
  fixture,
  settle,
} from './testing/targeted-corpus';

// Discovery that fails once when it runs with pinned keywords (as when the pinned keyword
// loaders' results no longer hold), so the compiler repeats it without the pin before admission.
const pinned = vi.hoisted(() => ({ fail: false, failures: 0 }));
vi.mock('../discovery', async (original) => {
  const actual = await original<typeof import('../discovery')>();
  return {
    ...actual,
    createDiscoveryServices: (options: Parameters<typeof actual.createDiscoveryServices>[0]) => {
      const services = actual.createDiscoveryServices(options);
      const discover: typeof services.discovery.discover = (request, signal) => {
        if (pinned.fail && request.pinnedRemoteKeywords) {
          pinned.fail = false;
          pinned.failures++;
          return Promise.resolve({
            dependencies: [],
            diagnostics: [
              { code: 'TEST_PINNED', message: 'pinned', severity: 'error', stage: 'discovery' },
            ],
          });
        }
        return services.discovery.discover(request, signal);
      };
      return { ...services, discovery: { discover } };
    },
  };
});

// Compiler progress: phases in execution order with totals equal to the loops they count, the
// targeted pass and its fall back to the full one, nothing from the `verify` oracle, and results
// byte-identical with and without a consumer.

beforeEach(() => {
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
});
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
});

const COMPILER_PHASES = [
  'discovery',
  'semantic',
  'plan',
  'describe',
  'render',
  'keywords',
  'link',
  'assemble',
  'aggregate',
  'persist',
];

function recorder(lifetime: CompilationContext['lifetime']) {
  const updates: CompilationProgressUpdate[] = [];
  const context: CompilationContext = { lifetime };
  Object.defineProperty(context, 'progress', {
    value: (update: CompilationProgressUpdate) => updates.push(structuredClone(update)),
    enumerable: false,
  });
  return { updates, context };
}

const starts = (updates: CompilationProgressUpdate[]) =>
  updates.filter((update) => update.state === 'start').map((update) => update.phase);

type Service = ReturnType<Fixture['create']>;

/**
 * A development server's start and one edit, as the session drives them: the startup generation
 * in a one-shot runtime, the warm-up of the long-lived one, then `step`. `record` attaches a
 * progress consumer to the edit (and to the startup, when `startup` is set).
 */
async function chain(
  f: Fixture,
  step: Step,
  options: { record: boolean; overrides?: Partial<CompilationOptions> },
): Promise<{
  results: CompilationResult[];
  startup: CompilationProgressUpdate[];
  edit: CompilationProgressUpdate[];
}> {
  const overrides = options.overrides ?? {};
  const cold = recorder('generation');
  const startupService: Service = f.create(overrides);
  const startup = await startupService.compile(
    { generation: 1, mode: 'development', changes: [] },
    new AbortController().signal,
    options.record ? cold.context : { lifetime: 'generation' },
  );
  const snapshot: ArtifactSnapshot = candidate(startup, 'startup');
  resetIncrementalRetention();
  resetTargetedDryRun();
  const runtime = f.create(overrides);
  candidate(
    await runtime.compile(
      { generation: 1, mode: 'development', changes: [], previous: snapshot },
      new AbortController().signal,
      { lifetime: 'watch' },
    ),
    'prime',
  );
  const changes = step.apply(f);
  await settle();
  const edit = recorder('watch');
  const edited = await runtime.compile(
    {
      generation: 2,
      mode: 'development',
      changes,
      previous: snapshot,
      contentRequest: { origin: 'filesystem' },
    },
    new AbortController().signal,
    options.record ? edit.context : { lifetime: 'watch' },
  );
  candidate(edited, step.name);
  return { results: [startup, edited], startup: cold.updates, edit: edit.updates };
}

/** The same chain without a consumer, from the initial tree, must give the same bytes. */
async function withoutConsumer(
  f: Fixture,
  step: Step,
  overrides?: Partial<CompilationOptions>,
): Promise<CompilationResult[]> {
  f.reset();
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  return (await chain(f, step, { record: false, ...(overrides ? { overrides } : {}) })).results;
}

const byName = (name: string): Step => corpus.find((step) => step.name === name)!;

test('reports every compiler phase in order, with totals equal to what the loops count', async () => {
  const f = fixture();
  const step = byName('guide body edit');
  const recorded = await chain(f, step, { record: true });
  const [startup] = recorded.results;
  // A cold development build: no targeted pass is possible, so no pass is reported.
  expect(starts(recorded.startup)).toEqual(COMPILER_PHASES);
  expect(recorded.startup.every((update) => update.pass === undefined)).toBe(true);
  const pages = startup.candidate!.artifacts.filter(
    (artifact) => artifact.identity.role !== 'aggregate',
  ).length;
  const of = (phase: string, state: string) =>
    recorded.startup.filter((update) => update.phase === phase && update.state === state);
  expect(of('render', 'start')).toEqual([
    { phase: 'render', state: 'start', completed: 0, total: pages },
  ]);
  expect(of('link', 'start')[0]).toMatchObject({ completed: 0, total: pages });
  expect(of('render', 'end')).toEqual([
    { phase: 'render', state: 'end', completed: pages, total: pages, reused: 0 },
  ]);
  for (const phase of ['describe', 'render', 'link']) {
    const advances = of(phase, 'advance');
    const total = of(phase, 'start')[0].total!;
    expect(advances.length, phase).toBe(total);
    expect(advances.map((update) => update.completed)).toEqual(
      Array.from({ length: total }, (_, index) => index + 1),
    );
  }
  // Every phase ends before the next starts, and the last one ends too.
  const sequence = recorded.startup.filter((update) => update.state !== 'advance');
  for (let index = 0; index < sequence.length; index += 2) {
    expect(sequence[index].state).toBe('start');
    expect(sequence[index + 1]).toMatchObject({ phase: sequence[index].phase, state: 'end' });
  }
  // The edit takes the targeted pass and reuses the pages it did not rebuild.
  expect(starts(recorded.edit)).toEqual(COMPILER_PHASES);
  expect(recorded.edit.every((update) => update.pass === 'targeted')).toBe(true);
  const renderEnd = recorded.edit.find(
    (update) => update.phase === 'render' && update.state === 'end',
  )!;
  expect(renderEnd.reused).toBeGreaterThan(0);
  expect(renderEnd.reused).toBeLessThan(renderEnd.total!);
  expect(JSON.stringify(await withoutConsumer(f, step))).toBe(JSON.stringify(recorded.results));
}, 300_000);

test('a startup build that the long-lived runtime serves reports no pass, as in a one-shot runtime', async () => {
  const f = fixture();
  const recorded = recorder('watch');
  const service: Service = f.create();
  candidate(
    await service.compile(
      { generation: 1, mode: 'development', changes: [] },
      new AbortController().signal,
      recorded.context,
    ),
    'startup',
  );
  expect(starts(recorded.updates)).toEqual(COMPILER_PHASES);
  expect(recorded.updates.filter((update) => update.pass || update.reason)).toEqual([]);
}, 300_000);

test('an edit decided at admission restarts the phases once, with the full pass and its reason', async () => {
  // The category exists from the start, so the page's move is the edit.
  const f = fixture(false, {}, () => ({
    'docs/group/ng-doc.category.ts': category('Group', 'group'),
  }));
  const step = byName('page moved into a category (its module imports the category)');
  const recorded = await chain(f, step, { record: true });
  const passes = recorded.edit.map((update) => update.pass);
  const first = passes.indexOf('full');
  expect(first).toBeGreaterThan(0);
  expect(passes.slice(0, first).every((pass) => pass === 'targeted')).toBe(true);
  expect(passes.slice(first).every((pass) => pass === 'full')).toBe(true);
  expect(recorded.edit[first]).toMatchObject({ state: 'start' });
  expect(typeof recorded.edit[first].reason).toBe('string');
  // Only the first update of the full pass carries the reason.
  expect(recorded.edit.filter((update) => update.reason !== undefined)).toHaveLength(1);
  const full = recorded.edit.slice(first);
  expect(starts(full)).toEqual(COMPILER_PHASES.slice(COMPILER_PHASES.indexOf(full[0].phase)));
  expect(JSON.stringify(await withoutConsumer(f, step))).toBe(JSON.stringify(recorded.results));
}, 300_000);

test('the verify oracle compiles without reporting: the phases appear once', async () => {
  const f = fixture();
  const step = byName('guide body edit');
  const overrides = { targetedRebuild: 'verify' as const };
  const recorded = await chain(f, step, { record: true, overrides });
  expect(starts(recorded.edit)).toEqual(COMPILER_PHASES);
  expect(recorded.edit.every((update) => update.pass === 'targeted')).toBe(true);
  expect(JSON.stringify(await withoutConsumer(f, step, overrides))).toBe(
    JSON.stringify(recorded.results),
  );
}, 300_000);

test('CompilationProgress exists only with a sink and never lets it throw', () => {
  expect(CompilationProgress.of(undefined)).toBeUndefined();
  expect(CompilationProgress.of({ lifetime: 'generation' })).toBeUndefined();
  const updates: CompilationProgressUpdate[] = [];
  const context: CompilationContext = { lifetime: 'generation' };
  Object.defineProperty(context, 'progress', {
    value: (update: CompilationProgressUpdate) => updates.push(update),
    enumerable: false,
  });
  const progress = CompilationProgress.of(context)!;
  progress.unit();
  progress.end();
  expect(updates).toEqual([]);
  expect(progress.targeted).toBe(false);
  progress.begin('targeted');
  expect(progress.targeted).toBe(true);
  progress.phase('render', 2);
  progress.unit(1, true);
  progress.unit(0);
  progress.unit(5);
  progress.full('  ');
  progress.full('ignored: the pass is already full');
  progress.phase('link');
  progress.unit();
  progress.end();
  expect(updates).toEqual([
    { phase: 'render', state: 'start', completed: 0, total: 2, pass: 'targeted' },
    { phase: 'render', state: 'advance', completed: 1, reused: 1, pass: 'targeted' },
    // A loop that visits more units than planned never reports more than the total.
    { phase: 'render', state: 'advance', completed: 2, reused: 1, pass: 'targeted' },
    { phase: 'render', state: 'end', completed: 2, total: 2, reused: 1, pass: 'targeted' },
    { phase: 'link', state: 'start', pass: 'full' },
    { phase: 'link', state: 'advance', completed: 1, pass: 'full' },
    { phase: 'link', state: 'end', pass: 'full' },
  ]);

  const long = 'x'.repeat(300);
  const reasons: CompilationProgressUpdate[] = [];
  const throwing: CompilationContext = { lifetime: 'watch' };
  Object.defineProperty(throwing, 'progress', {
    value: (update: CompilationProgressUpdate) => {
      reasons.push(update);
      throw new Error('consumer failed');
    },
    enumerable: false,
  });
  const failing = CompilationProgress.of(throwing)!;
  failing.begin('targeted');
  expect(() => failing.phase('discovery')).not.toThrow();
  failing.full(long);
  failing.phase('semantic');
  expect(reasons).toEqual([
    { phase: 'discovery', state: 'start', pass: 'targeted' },
    { phase: 'discovery', state: 'end', pass: 'targeted' },
    { phase: 'semantic', state: 'start', pass: 'full', reason: `${'x'.repeat(117)}...` },
  ]);

  // Decided before compiling: the first update carries the full pass and its reason.
  const decided: CompilationProgressUpdate[] = [];
  const full: CompilationContext = { lifetime: 'watch' };
  Object.defineProperty(full, 'progress', {
    value: (update: CompilationProgressUpdate) => decided.push(update),
    enumerable: false,
  });
  const direct = CompilationProgress.of(full)!;
  direct.begin('full', 'discovery: configuration changed');
  direct.full('ignored: not on the targeted pass');
  direct.phase('discovery');
  direct.phase('semantic');
  expect(decided).toEqual([
    {
      phase: 'discovery',
      state: 'start',
      pass: 'full',
      reason: 'discovery: configuration changed',
    },
    { phase: 'discovery', state: 'end', pass: 'full' },
    { phase: 'semantic', state: 'start', pass: 'full' },
  ]);
});

test('an edit decided at classification reports the full pass and its reason from the start', async () => {
  const f = fixture();
  const step = byName('config edit');
  const recorded = await chain(f, step, { record: true });
  expect(starts(recorded.edit)).toEqual(COMPILER_PHASES);
  expect(recorded.edit.every((update) => update.pass === 'full')).toBe(true);
  expect(recorded.edit[0]).toMatchObject({ phase: 'discovery', state: 'start' });
  expect(typeof recorded.edit[0].reason).toBe('string');
  expect(recorded.edit.filter((update) => update.reason !== undefined)).toHaveLength(1);
  expect(JSON.stringify(await withoutConsumer(f, step))).toBe(JSON.stringify(recorded.results));
}, 300_000);

test('discovery repeated without the pin before admission is not reported: the targeted pass stands', async () => {
  // A keyword loader, so a targeted generation pins its result.
  const f = fixture(false, {}, () => ({
    'ng-doc.config.ts': `export default { docsPath: 'docs', cache: false, keywords: { loaders: [async function stub() { return { RemoteKw: { title: 'Remote', url: '/remote' } }; }] } };`,
  }));
  const step = byName('guide body edit');
  pinned.failures = 0;
  pinned.fail = true;
  const recorded = await chain(f, step, { record: true });
  expect(pinned.failures).toBe(1);
  expect(starts(recorded.edit)).toEqual(COMPILER_PHASES);
  expect(recorded.edit.every((update) => update.pass === 'targeted')).toBe(true);
  // The same failure without a consumer gives the same bytes.
  f.reset();
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  pinned.fail = true;
  const plain = await chain(f, step, { record: false });
  expect(pinned.failures).toBe(2);
  expect(JSON.stringify(plain.results)).toBe(JSON.stringify(recorded.results));
}, 300_000);
