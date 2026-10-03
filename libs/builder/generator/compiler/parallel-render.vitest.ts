import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { GeneratorContentCompiler } from '../content/content-compiler';
import { HIGHLIGHT_CACHE_MISMATCH, resetHighlightCache } from '../content/highlight-cache';
import {
  configureRenderPool,
  disposeHtmlPool,
  keepHtmlPool,
  PARALLEL_RENDER_MISMATCH,
  renderPoolCounters,
  renderThreadsAlive,
  resetRenderPoolCounters,
} from '../content/html-pool';
import {
  type ThreadEntryBundle,
  bundleThreadEntry,
  misbehavingThread,
} from '../content/testing/html-thread';
import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationProgressUpdate,
  CompilationResult,
  ContentDescriptor,
  ContentRequest,
} from '../contracts';
import { PARALLEL_RENDER_FLAG } from '../kernel/flags';
import { resetClosureStores } from './closure-store';
import { GenerationRecords, traceRecords } from './fold';
import { type CompilationOptions, resetIncrementalRetention, resetTargetedDryRun } from './index';
import {
  type Fixture,
  candidate,
  cleanup,
  fixture,
  generation,
  page,
  settle,
  update,
} from './testing/targeted-corpus';

// Parallel rendering (`content/html-pool.ts`) in generation chains: with the switch off, on with
// 1, 2 and 4 threads that answer in a random order (every task of a generation on a thread), and
// in `verify`, every result is byte-identical (candidates, outputs, diagnostics and their order,
// dependencies, `whyRebuilt` and the memo's facts), equal to the reference path
// (`incrementalReuse: false`) and to cold builds. Threads that crash leave the results unchanged,
// an abort never waits for a thread, and nothing outlives a one-shot compile.

let delayed: ThreadEntryBundle;
const bundles: ThreadEntryBundle[] = [];

beforeAll(async () => {
  delayed = await misbehavingThread('delayed');
}, 60_000);
afterAll(async () => {
  await delayed.dispose();
  for (const bundle of bundles) await bundle.dispose();
});
beforeEach(() => {
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  resetHighlightCache();
  resetRenderPoolCounters();
  configureRenderPool({ entry: delayed.url, threshold: 0 });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  keepHtmlPool(false);
  await disposeHtmlPool();
  configureRenderPool({ entry: undefined, threshold: undefined });
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  resetHighlightCache();
});

const guide = (index: number, value: number) =>
  [
    `# Topic ${index}`,
    '',
    `See \`*Guide\`, \`Actual\` and \`*Topic${(index + 1) % TOPICS}\`.`,
    '',
    '## Usage',
    '',
    '```typescript name="a.ts" {2}',
    `const a = ${value};`,
    `const b = ${index};`,
    '```',
    '',
    '```html group="g" name="x.html"',
    `<p>${index}</p>`,
    '```',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
    '',
    '```bash',
    'npm install @ng-doc/core',
    '```',
  ].join('\n');

/**
 * Linked guides with code, beside the fixture's demo, playground, API and keyword pages: enough
 * entries for a start or a production build to start its threads before the semantic phase.
 */
const TOPICS = 10;
const topics = (): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: TOPICS }, (_, index) => [
      [`docs/topic${index}/ng-doc.page.ts`, page(`Topic ${index}`, `topic${index}`)],
      [`docs/topic${index}/index.md`, `---\nkeyword: Topic${index}\n---\n${guide(index, 1)}`],
    ]).flat(),
  );

type Mode = 'off' | 'on1' | 'on2' | 'on4' | 'verify';
const settings: Record<Mode, Partial<CompilationOptions>> = {
  off: { parallelRender: false },
  on1: { renderThreads: 1 },
  on2: { renderThreads: 2 },
  on4: { renderThreads: 4 },
  verify: { parallelRender: 'verify', renderThreads: 2 },
};

/** The memo's facts that do not depend on file stamps: links and assemblies. */
const memo = (f: Fixture): string => {
  const name = readdirSync(f.path('cache')).find((item) => item.endsWith('.compiler-memo.json'));
  if (!name) return '';
  const value = JSON.parse(readFileSync(path.join(f.path('cache'), name), 'utf8'));
  return JSON.stringify({ link: value.link, assembly: value.assembly });
};

const once = (
  f: Fixture,
  options: Partial<CompilationOptions>,
  mode: 'development' | 'production',
  context: CompilationContext = { lifetime: 'generation' },
) =>
  f
    .create(options)
    .compile({ generation: 1, mode, changes: [] }, new AbortController().signal, context);

/**
 * A server start (no previous snapshot: every IR rendered and linked), an edit of a topic and its
 * revert (targeted: never on a thread), a restart in a fresh runtime with the cache, and a
 * production build.
 */
async function chain(f: Fixture, options: Partial<CompilationOptions>) {
  f.reset();
  resetHighlightCache();
  resetIncrementalRetention();
  resetClosureStores();
  const results: CompilationResult[] = [];
  const memos: string[] = [];
  const threads: number[] = [];
  const counted = () => threads.push(renderPoolCounters().thread);
  const service = f.create(options);
  await settle();
  results.push(await generation(service, 1, undefined, []));
  memos.push(memo(f));
  counted();
  const first = candidate(results[0]!, 'start');
  const edited = update(
    f.write('docs/topic2/index.md', `---\nkeyword: Topic2\n---\n${guide(2, 9)}`),
  );
  await settle();
  results.push(await generation(service, 2, first, [edited]));
  memos.push(memo(f));
  counted();
  const second = candidate(results[1]!, 'edit');
  const reverted = update(f.write('docs/topic2/index.md', f.initial['docs/topic2/index.md']!));
  await settle();
  results.push(await generation(service, 3, second, [reverted]));
  memos.push(memo(f));
  counted();
  candidate(results[2]!, 'revert');
  resetIncrementalRetention();
  resetHighlightCache();
  results.push(await once(f, options, 'development'));
  memos.push(memo(f));
  counted();
  candidate(results[3]!, 'restart');
  resetHighlightCache();
  results.push(await once(f, options, 'production'));
  counted();
  candidate(results[4]!, 'production');
  return {
    results: results.map((result) => JSON.stringify(result)),
    candidates: results.map((result) => result.candidate),
    memos,
    threads,
  };
}

const outputs = (snapshot: ArtifactSnapshot | undefined) =>
  JSON.stringify(snapshot?.artifacts.map((artifact) => [artifact.id, artifact.outputs]));

test('chains with parallel rendering off, on (1, 2 and 4 threads, random completion order) and verify are byte-identical, and equal the reference path and cold builds', async () => {
  const f = fixture(true, {}, topics);
  const off = await chain(f, settings.off);
  expect(off.threads.at(-1)).toBe(0);
  expect(off.results[0]).toContain('class=\\"shiki');
  for (const mode of ['on1', 'on2', 'on4', 'verify'] as const) {
    resetRenderPoolCounters();
    await disposeHtmlPool();
    const on = await chain(f, settings[mode]);
    for (const [index, result] of off.results.entries()) {
      expect(on.results[index], `${mode} ${index}`).toBe(result);
      if (index < on.memos.length)
        expect(on.memos[index], `${mode} memo ${index}`).toBe(off.memos[index]);
    }
    // Threads rendered and linked the start and the production build, never the targeted edits.
    expect(on.threads[0], mode).toBeGreaterThan(0);
    expect(renderPoolCounters().rendered, mode).toBeGreaterThan(0);
    expect(on.threads[2], mode).toBe(on.threads[0]);
    expect(on.threads[4]!, mode).toBeGreaterThan(on.threads[3]!);
    expect(renderPoolCounters().fallbacks, mode).toBe(0);
    expect(on.results.join(), mode).not.toContain(PARALLEL_RENDER_MISMATCH);
  }

  // The reference path never uses a thread, and its candidates are the chain's.
  resetRenderPoolCounters();
  const reference = await chain(f, { ...settings.on2, incrementalReuse: false });
  expect(reference.threads.at(-1)).toBe(0);
  for (const [index, snapshot] of off.candidates.entries())
    expect(JSON.stringify(reference.candidates[index]), `reference ${index}`).toBe(
      JSON.stringify(snapshot),
    );
  // A cold build of the tree equals the start, the revert and the restart.
  resetHighlightCache();
  const cold = await once(f, { incrementalReuse: false }, 'development');
  expect(JSON.stringify(cold.candidate)).toBe(JSON.stringify(off.candidates[0]));
  expect(JSON.stringify(cold.candidate)).toBe(JSON.stringify(off.candidates[3]));
  expect(outputs(off.candidates[1])).not.toBe(outputs(off.candidates[0]));
}, 900_000);

test('the environment switch turns parallel rendering off, and on verify', async () => {
  const f = fixture(true, {}, topics);
  vi.stubEnv(PARALLEL_RENDER_FLAG, '0');
  const off = await chain(f, settings.on2);
  expect(off.threads.at(-1)).toBe(0);
  vi.stubEnv(PARALLEL_RENDER_FLAG, 'verify');
  const verify = await chain(f, settings.on2);
  expect(verify.threads.at(-1)).toBeGreaterThan(0);
  expect(verify.results).toEqual(off.results);
}, 600_000);

/** Pages whose HTML processing and linking fail. */
const failing = (): Record<string, string> => ({
  'docs/broken/ng-doc.page.ts': page('Broken', 'broken'),
  'docs/broken/index.md':
    '# Broken\n\n<pre><code class="language-ts" metastring="{bad">x</code></pre>\n',
  'docs/missing/ng-doc.page.ts': page('Missing', 'missing'),
  'docs/missing/index.md': '# Missing\n\nSee `*NoSuchGuide`.\n',
  ...topics(),
});

test('failed processing and linking report the same diagnostics, in the same order, on threads', async () => {
  const f = fixture(true, {}, failing);
  const compile = async (
    options: Partial<CompilationOptions>,
    mode: 'development' | 'production',
  ) => {
    f.reset();
    resetHighlightCache();
    return JSON.stringify(await once(f, options, mode));
  };
  for (const mode of ['development', 'production'] as const) {
    const off = await compile(settings.off, mode);
    expect(off).toContain('CONTENT_HTML_PROCESS');
    for (const parallel of ['on1', 'on4', 'verify'] as const)
      expect(await compile(settings[parallel], mode), `${mode} ${parallel}`).toBe(off);
    expect(await compile({ incrementalReuse: false }, mode), `${mode} reference`).toBe(off);
  }
  // Every page links after its render fails: linking runs only when every IR is there, so the
  // link error shows on a tree without the broken page.
  f.reset();
  f.remove('docs/broken/ng-doc.page.ts');
  const off = JSON.stringify(await once(f, settings.off, 'production'));
  expect(off).toContain('Route with keyword');
  for (const parallel of ['on1', 'on4', 'verify'] as const)
    expect(JSON.stringify(await once(f, settings[parallel], 'production')), parallel).toBe(off);
  expect(renderPoolCounters().thread).toBeGreaterThan(0);
}, 600_000);

test.each(['exit-mid-task', 'throw-on-load', 'malformed:0'])(
  'a thread that fails (%s) leaves every result unchanged',
  async (mode) => {
    const entry = await misbehavingThread(mode);
    bundles.push(entry);
    const f = fixture(true, {}, topics);
    const off = await chain(f, settings.off);
    configureRenderPool({ entry: entry.url });
    resetRenderPoolCounters();
    const on = await chain(f, settings.on2);
    expect(on.results).toEqual(off.results);
    expect(on.memos).toEqual(off.memos);
    expect(renderPoolCounters().fallbacks).toBeGreaterThan(0);
  },
  600_000,
);

test('an abort while threads hold the generation’s tasks ends the compile at once', async () => {
  const hang = await misbehavingThread('hang');
  bundles.push(hang);
  configureRenderPool({ entry: hang.url });
  const f = fixture(true, {}, topics);
  const controller = new AbortController();
  const context: CompilationContext = { lifetime: 'generation' };
  let started = 0;
  Object.defineProperty(context, 'progress', {
    enumerable: false,
    value: (update: CompilationProgressUpdate) => {
      // Abort while threads hold tasks that will never be answered.
      if (update.phase === 'render' && update.state === 'start' && !started) {
        started = performance.now();
        setTimeout(() => controller.abort(), 300).unref();
      }
    },
  });
  const service = f.create(settings.on2);
  const compiled = service.compile(
    { generation: 1, mode: 'production', changes: [] },
    controller.signal,
    context,
  );
  const result = await compiled;
  expect(started).toBeGreaterThan(0);
  // The compile ended right after the abort, without the threads' answers.
  expect(performance.now() - started).toBeLessThan(10_000);
  expect(result.candidate).toBeUndefined();
  expect(JSON.stringify(result.diagnostics)).toMatch(/ABORTED|cancelled/i);
  await service.dispose();
  expect(renderThreadsAlive()).toBe(0);
}, 120_000);

test('nothing outlives a one-shot compile; a long-lived runtime keeps its threads', async () => {
  const f = fixture(true, {}, topics);
  const service = f.create(settings.on2);
  await service.compile(
    { generation: 1, mode: 'production', changes: [] },
    new AbortController().signal,
    {
      lifetime: 'generation',
    },
  );
  expect(renderThreadsAlive()).toBe(2);
  await service.dispose();
  expect(renderThreadsAlive()).toBe(0);

  keepHtmlPool(true);
  const kept = f.create(settings.on2);
  await kept.compile(
    { generation: 1, mode: 'production', changes: [] },
    new AbortController().signal,
    {
      lifetime: 'generation',
    },
  );
  await kept.dispose();
  expect(renderThreadsAlive()).toBe(2);
}, 600_000);

test('the real thread entry renders a production build like the main thread', async () => {
  const real = await bundleThreadEntry();
  bundles.push(real);
  const f = fixture(true, {}, topics);
  const off = JSON.stringify(await once(f, settings.off, 'production'));
  configureRenderPool({ entry: real.url, threshold: undefined });
  resetRenderPoolCounters();
  f.reset();
  resetHighlightCache();
  expect(JSON.stringify(await once(f, settings.on4, 'production'))).toBe(off);
  // The default threshold keeps the first tasks in the main thread.
  expect(renderPoolCounters().main).toBeGreaterThanOrEqual(32);
  expect(renderPoolCounters().thread).toBeGreaterThan(0);
}, 600_000);

test('fronts run one at a time in plan order, and records settle in plan order', async () => {
  const f = fixture(true, {}, topics);
  /** Every compile's front start and end, by content id, in the order they happened. */
  const run = async (options: Partial<CompilationOptions>) => {
    f.reset();
    resetHighlightCache();
    const fronts: string[] = [];
    let pending = 0;
    let overlapped = 0;
    const original = GeneratorContentCompiler.prototype.compileStaged;
    const spy = vi
      .spyOn(GeneratorContentCompiler.prototype, 'compileStaged')
      .mockImplementation(async function (
        this: GeneratorContentCompiler,
        request: ContentRequest,
        signal: AbortSignal,
        descriptor?: ContentDescriptor,
      ) {
        fronts.push(`start ${request.id}`);
        pending += 1;
        const staged = await original.call(this, request, signal, descriptor);
        fronts.push(`front ${request.id}`);
        void staged.finish.then(() => (pending -= 1));
        // A front that starts while an earlier compile's back half is still running.
        if (pending > 1) overlapped += 1;
        return staged;
      });
    const traced: GenerationRecords[] = [];
    traceRecords((records) => traced.push(records));
    // The order in which units settle (`records.rendered`), against their plan order.
    const settled: unknown[] = [];
    const rendered = GenerationRecords.prototype.rendered;
    const settles = vi.spyOn(GenerationRecords.prototype, 'rendered').mockImplementation(function (
      this: GenerationRecords,
      ...args: Parameters<GenerationRecords['rendered']>
    ) {
      settled.push(args[0]);
      return rendered.apply(this, args);
    });
    try {
      const result = await once(f, options, 'production');
      candidate(result, 'production');
    } finally {
      traceRecords(undefined);
      spy.mockRestore();
      settles.mockRestore();
    }
    const units = traced.at(-1)!.units;
    return {
      fronts,
      settled: settled.map((record) => units.indexOf(record as (typeof units)[number])),
      overlapped,
      journal: JSON.stringify(traced.map((records) => records.journal)),
    };
  };
  const off = await run(settings.off);
  resetRenderPoolCounters();
  const on = await run(settings.on4);
  expect(renderPoolCounters().rendered).toBeGreaterThan(0);
  // Strictly alternating: no front starts before the previous one is done.
  expect(on.fronts.length).toBeGreaterThan(10);
  on.fronts.forEach((item, index) =>
    expect(item.startsWith(index % 2 ? 'front ' : 'start '), `${index}: ${item}`).toBe(true),
  );
  expect(on.fronts).toEqual(off.fronts);
  // The back halves ran while later fronts did; without threads every unit settles first.
  expect(on.overlapped).toBeGreaterThan(0);
  expect(off.overlapped).toBe(0);
  // Units settle in plan order, although their back halves completed in a random order.
  expect(on.settled.length).toBeGreaterThan(10);
  expect(on.settled).toEqual(on.settled.map((_, index) => index));
  expect(on.settled).toEqual(off.settled);
  // Every contribution was recorded in the order of the sequential render.
  expect(on.journal).toBe(off.journal);
}, 600_000);

test('verify reports a tampered highlight entry shared by many pages once, with threads as without', async () => {
  const f = fixture(true, {}, topics);
  // A start writes the pack; every topic shares one code block.
  await chain(f, settings.off);
  const file = readdirSync(f.path('cache')).find((item) => item.endsWith('.highlight.json'))!;
  const pack = JSON.parse(readFileSync(path.join(f.path('cache'), file), 'utf8')) as {
    entries: Record<string, string>;
  };
  for (const key of Object.keys(pack.entries))
    pack.entries[key] = pack.entries[key]!.replace(
      '"properties":{',
      '"properties":{"data-tampered":"",',
    );
  /** A start that renders every page from the tampered pack, verifying every hit. */
  const restart = async (options: Partial<CompilationOptions>) => {
    for (const name of readdirSync(f.path('cache')))
      rmSync(path.join(f.path('cache'), name), { recursive: true, force: true });
    writeFileSync(path.join(f.path('cache'), file), JSON.stringify(pack));
    resetHighlightCache();
    resetIncrementalRetention();
    resetClosureStores();
    return JSON.stringify(await once(f, { ...options, highlightCache: 'verify' }, 'development'));
  };
  const off = await restart(settings.off);
  const warnings = (text: string) => text.split(HIGHLIGHT_CACHE_MISMATCH).length - 1;
  expect(warnings(off)).toBeGreaterThan(0);
  expect(off).not.toContain('data-tampered');
  resetRenderPoolCounters();
  for (const mode of ['on1', 'on4'] as const) {
    const on = await restart(settings[mode]);
    expect(warnings(on), mode).toBe(warnings(off));
    expect(on, mode).toBe(off);
  }
  expect(renderPoolCounters().rendered).toBeGreaterThan(0);
}, 600_000);
