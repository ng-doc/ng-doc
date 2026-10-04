import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { GeneratorContentCompiler } from '../content/content-compiler';
import type { ArtifactSnapshot, CompilationResult } from '../contracts';
import { resetClosureStores } from './closure-store';
import {
  type CompilationOptions,
  type DryRunRecord,
  resetIncrementalRetention,
  resetTargetedDryRun,
  targetedDryRun,
} from './index';
import {
  type Fixture,
  type Step,
  candidate,
  cleanup,
  corpus,
  fixture,
  generation,
  settle,
} from './testing/targeted-corpus';

// The first edit after a development server starts. The startup generation runs in a one-shot
// runtime (a cold build, or one restored from the artifact cache), and the long-lived runtime that
// serves the edits is primed with a no-change generation of the committed snapshot. The closure
// records the startup generation kept (or that an earlier run kept) reach that runtime through the
// persistent store beside the cache, so its first program edit compiles targeted. Every result is
// byte-identical to the same start with the targeted rebuild off (which keeps no store) and to a
// cold build of the edited tree.

beforeEach(() => {
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
});

type Service = ReturnType<Fixture['create']>;

/** The startup generation: a development buildOnce in a one-shot runtime. */
const startup = (service: Service, previous?: ArtifactSnapshot) =>
  service.compile(
    { generation: 1, mode: 'development', changes: [], ...(previous ? { previous } : {}) },
    new AbortController().signal,
    { lifetime: 'generation' },
  );

/** The warm-up of the long-lived runtime: a no-change generation of the committed snapshot. */
const prime = (service: Service, snapshot: ArtifactSnapshot) =>
  service.compile(
    { generation: 1, mode: 'development', changes: [], previous: snapshot },
    new AbortController().signal,
    { lifetime: 'watch' },
  );

const store = (f: Fixture): string | undefined => {
  const name = readdirSync(f.path('cache')).find((item) =>
    item.endsWith('.semantic-closures.json'),
  );
  return name && path.join(f.path('cache'), name);
};

interface Start {
  results: CompilationResult[];
  /** The report of the first edit (undefined when the targeted rebuild is off). */
  edit?: DryRunRecord;
}

/**
 * A server start and its first edit: the startup generation (restored from the cache when one is
 * there), the warm-up of a fresh long-lived runtime, then `step`. `forget`: the store is deleted
 * before the warm-up, as a runtime without it would start.
 */
async function start(
  f: Fixture,
  step: Step,
  overrides: Partial<CompilationOptions> = {},
  forget: boolean = false,
): Promise<Start> {
  const committed = await startup(f.create(overrides));
  const snapshot = candidate(committed, 'startup');
  if (forget) rmSync(store(f)!);
  // A fresh long-lived runtime: nothing retained in this process.
  resetIncrementalRetention();
  resetTargetedDryRun();
  const runtime = f.create(overrides);
  const primed = await prime(runtime, snapshot);
  expect(candidate(primed, 'prime').revision).toBe(snapshot.revision);
  const changes = step.apply(f);
  await settle();
  const edited = await generation(runtime, 2, snapshot, changes);
  candidate(edited, step.name);
  return {
    results: [committed, edited],
    ...(targetedDryRun().last ? { edit: targetedDryRun().last } : {}),
  };
}

/**
 * The start a worker-backed session gives a development server: the startup generation runs in
 * the fresh long-lived runtime itself (its warm-up then compiles nothing), then `step`.
 */
async function startInRuntime(f: Fixture, step: Step): Promise<Start> {
  resetIncrementalRetention();
  resetTargetedDryRun();
  // The tree was just written: past the stat margin, the edit's sweep finds only the edit.
  await settle();
  const runtime = f.create();
  const committed = await generation(runtime, 1, undefined, []);
  const snapshot = candidate(committed, 'startup');
  const changes = step.apply(f);
  await settle();
  const edited = await generation(runtime, 2, snapshot, changes);
  candidate(edited, step.name);
  return {
    results: [committed, edited],
    ...(targetedDryRun().last ? { edit: targetedDryRun().last } : {}),
  };
}

/** A cold build of the current tree (a fresh one-shot runtime, no cache). */
async function cold(f: Fixture): Promise<CompilationResult> {
  rmSync(f.path('cache'), { recursive: true, force: true });
  resetClosureStores();
  return startup(f.create());
}

const byName = (name: string): Step => corpus.find((step) => step.name === name)!;

/** API declarations in a file no edit of the corpus touches. */
const OTHERS = 12;

/**
 * The corpus fixture with {@link OTHERS} more API declarations: without closure records the first
 * program edit makes every one a candidate, which exceeds the dirty threshold (the unit floor,
 * `DIRTY_UNIT_FLOOR`), as the API pages of a real site do.
 */
const withOther = () =>
  fixture(true, {}, () => ({
    'docs/api-other.ts': Array.from(
      { length: OTHERS },
      (_, index) =>
        `/** Other declaration ${index}. */ export class Other${index} { /** Count. */ count = ${index}; }`,
    ).join('\n'),
  }));

/** Program edits: without closure records every semantic unit would be rebuilt. */
const FIRST_EDITS = [
  'API JSDoc edit',
  'page title edit (entry module)',
  'demo .ts edit',
  'guide body edit',
];

test('the first edit after a cold start compiles targeted and equals the targeted rebuild off and a cold build', async () => {
  const f = withOther();
  for (const name of FIRST_EDITS) {
    const step = byName(name);
    f.reset();
    const on = await start(f, step);
    expect(
      { step: name, path: on.edit?.path, published: on.edit?.published },
      on.edit?.reason,
    ).toEqual({
      step: name,
      path: 'content',
      published: 'targeted',
    });
    expect(store(f)).toBeDefined();
    f.reset();
    const off = await start(f, step, { targetedRebuild: false });
    expect(off.edit).toBeUndefined();
    // No store is kept with the targeted rebuild off.
    expect(store(f)).toBeUndefined();
    expect(on.results.map((item) => JSON.stringify(item))).toEqual(
      off.results.map((item) => JSON.stringify(item)),
    );
    const reference = await cold(f);
    expect(JSON.stringify(on.results[1]!.candidate!.artifacts), name).toBe(
      JSON.stringify(reference.candidate!.artifacts),
    );
  }
}, 600_000);

test('the first edit after a startup compiled in the long-lived runtime compiles targeted and equals the one-shot start with the targeted rebuild off and a cold build', async () => {
  const f = withOther();
  for (const name of FIRST_EDITS) {
    const step = byName(name);
    f.reset();
    const inRuntime = await startInRuntime(f, step);
    expect(
      { step: name, path: inRuntime.edit?.path, published: inRuntime.edit?.published },
      inRuntime.edit?.reason,
    ).toEqual({ step: name, path: 'content', published: 'targeted' });
    f.reset();
    const off = await start(f, step, { targetedRebuild: false });
    expect(inRuntime.results.map((item) => JSON.stringify(item))).toEqual(
      off.results.map((item) => JSON.stringify(item)),
    );
    const reference = await cold(f);
    expect(JSON.stringify(inRuntime.results[1]!.candidate!.artifacts), name).toBe(
      JSON.stringify(reference.candidate!.artifacts),
    );
  }
}, 600_000);

test('without the store the first program edit exceeds the dirty threshold and runs FULL', async () => {
  const f = withOther();
  for (const name of ['API JSDoc edit', 'page title edit (entry module)', 'demo .ts edit']) {
    const step = byName(name);
    f.reset();
    const without = await start(f, step, {}, true);
    f.reset();
    const withStore = await start(f, step);
    // The records make the difference: without them every closure refreshes as changed, so every
    // other declaration is a candidate too.
    expect({ step: name, path: without.edit?.path }).toEqual({ step: name, path: 'full' });
    expect(without.edit?.reason, name).toMatch(/^dirty threshold: /);
    expect(without.edit!.candidates.units, name).toBeGreaterThan(OTHERS);
    expect({ step: name, path: withStore.edit?.path }).toEqual({ step: name, path: 'content' });
    expect(withStore.edit!.candidates.units, name).toBeLessThanOrEqual(2);
    expect(JSON.stringify(without.results[1]), name).toBe(JSON.stringify(withStore.results[1]));
  }
}, 600_000);

test('the first edit after a start restored from the cache compiles targeted', async () => {
  const f = withOther();
  for (const name of ['API JSDoc edit', 'page title edit (entry module)']) {
    const step = byName(name);
    f.reset();
    // An earlier run wrote the cache and the store; this start restores both.
    candidate(await startup(f.create()), 'earlier run');
    resetClosureStores();
    const on = await start(f, step);
    expect({ step: name, path: on.edit?.path }, on.edit?.reason).toEqual({
      step: name,
      path: 'content',
    });
    f.reset();
    candidate(await startup(f.create({ targetedRebuild: false })), 'earlier run, off');
    const off = await start(f, step, { targetedRebuild: false });
    expect(on.results.map((item) => JSON.stringify(item))).toEqual(
      off.results.map((item) => JSON.stringify(item)),
    );
    const reference = await cold(f);
    expect(JSON.stringify(on.results[1]!.candidate!.artifacts), name).toBe(
      JSON.stringify(reference.candidate!.artifacts),
    );
  }
}, 600_000);

test('a start restored after an edit made while the server was down renders only what changed and equals a cold build', async () => {
  const f = withOther();
  const rendered: string[] = [];
  const render = GeneratorContentCompiler.prototype.compile;
  vi.spyOn(GeneratorContentCompiler.prototype, 'compile').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof render>
  ) {
    rendered.push(args[0].id);
    return render.apply(this, args);
  });
  candidate(await startup(f.create()), 'earlier run');
  resetClosureStores();
  byName('API JSDoc edit').apply(f);
  await settle();
  rendered.length = 0;
  const restored = await startup(f.create());
  const renderedOn = rendered.splice(0);
  const off = await (async () => {
    f.reset();
    candidate(await startup(f.create({ targetedRebuild: false })), 'earlier run, off');
    byName('API JSDoc edit').apply(f);
    await settle();
    rendered.length = 0;
    return startup(f.create({ targetedRebuild: false }));
  })();
  // The stored records confirm the closures the edit did not reach: the other declaration's page
  // is not rendered again, as it is without them.
  expect(renderedOn.length).toBeGreaterThan(0);
  expect(renderedOn.length).toBeLessThan(rendered.length);
  expect(JSON.stringify(restored)).toBe(JSON.stringify(off));
  const reference = await cold(f);
  expect(JSON.stringify(restored.candidate!.artifacts)).toBe(
    JSON.stringify(reference.candidate!.artifacts),
  );
}, 600_000);

test('the first edit after a start is clean in verify modes: the full compile and fresh renders agree', async () => {
  const f = withOther();
  for (const name of ['API JSDoc edit', 'page title edit (entry module)']) {
    f.reset();
    const verified = await start(f, byName(name), {
      targetedRebuild: 'verify',
      scopedSemantic: 'verify',
    });
    expect({ step: name, path: verified.edit?.path }, verified.edit?.reason).toEqual({
      step: name,
      path: 'content',
    });
    expect(verified.edit?.mismatch).toBeUndefined();
    expect(verified.edit?.misses).toEqual([]);
    for (const result of verified.results)
      expect(result.diagnostics.filter((item) => item.code.endsWith('_MISMATCH'))).toEqual([]);
  }
}, 600_000);
