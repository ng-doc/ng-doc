import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Worker, MessageChannel } from 'node:worker_threads';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { KeywordExport } from '../../contracts';
import { PARALLEL_RENDER_FLAG } from '../../kernel/flags';
import { decode, encode } from '../../worker/protocol';
import {
  type HighlightSession,
  createHighlightSession,
  highlightJournal,
  resetHighlightCache,
} from '../highlight-cache';
import {
  type LinkTask,
  type RenderTask,
  linkDocument,
  renderDocuments,
  serveHtmlThread,
} from '../html-pipeline';
import {
  configureRenderPool,
  createRenderBack,
  defaultRenderThreads,
  disposeHtmlPool,
  holdHtmlPool,
  htmlPool,
  htmlPoolKept,
  keepHtmlPool,
  parallelRenderSwitch,
  PRESTART_ENTRIES,
  prestartRenderThreads,
  renderPoolCounters,
  renderThreadsAlive,
  resetRenderPoolCounters,
  ThreadFailure,
} from '../html-pool';
import { type ThreadEntryBundle, bundleThreadEntry, misbehavingThread } from './html-thread';

// The render pool (`content/html-pool.ts`) and its threads: whatever a thread does, a task's
// result is the main thread's pipeline result for its input, in any completion order, and a
// thread that fails, crashes, exits or replies with something malformed gets its tasks run in the
// main thread again. Threads end when the pool is disposed or idle, and an abort never waits for
// one.

const themes = { light: 'github-light', dark: 'ayu-dark' };
const code = (language: string, text: string, meta = '') =>
  `<pre><code class="language-${language}" lang="${language}"${meta ? ` metastring="${meta}"` : ''}>${text}</code></pre>`;

/** Documents of every kind the content compiler renders, and some that fail. */
const DOCUMENTS = {
  guide: {
    html: `<h1>Guide</h1><h2>Usage</h2><p>See <code>Actual</code> and <code>*Guide</code>.</p>${code('typescript', 'const a = 1;\nconst b = 2;', '{\\&quot;highlightedlines\\&quot;:\\&quot;[2]\\&quot;}')}${code('html', '&lt;p&gt;twice&lt;/p&gt;')}${code('html', '&lt;p&gt;twice&lt;/p&gt;')}`,
    route: 'docs/guide',
    headings: ['h2'],
  },
  mermaid: { html: code('mermaid', 'graph TD; A--&gt;B'), route: 'docs/mermaid' },
  unknown: { html: code('not-a-language', 'plain'), route: 'docs/unknown' },
  plain: { html: '<h1>Header</h1><p>No code.</p>', route: 'docs/header' },
  failing: { html: code('typescript', 'x', '{bad'), route: 'docs/failing' },
};
const tasks = (): RenderTask[] => [
  { documents: [DOCUMENTS.guide], themes },
  { documents: [DOCUMENTS.plain], themes },
  { documents: [DOCUMENTS.mermaid, DOCUMENTS.unknown], themes },
  // A demo whose second asset fails: the task stops there.
  {
    documents: [{ html: code('ts', 'export const a = 1;') }, DOCUMENTS.failing, DOCUMENTS.plain],
    themes,
  },
  { documents: [DOCUMENTS.failing], themes },
];

const KEYWORDS: KeywordExport[] = Object.freeze([
  { key: '*Guide', title: 'Guide', path: '/docs/guide', type: 'link' },
  { key: 'Actual', title: 'Actual', path: '/api/actual', description: 'The actual class.' },
]) as KeywordExport[];
const link = (html: string): LinkTask => ({
  html,
  title: 'Linked',
  absoluteRoute: 'docs/linked',
  breadcrumbs: ['Docs', 'Linked'],
  pageType: 'guide',
});
const LINKS: LinkTask[] = [
  link('<h2 id="usage">Usage</h2><p>See <code>Actual</code> and <code>*Guide</code>.</p>'),
  link('<p><code>*Missing</code></p>'),
  link('<p>Nothing to link.</p>'),
];

/** What the main thread alone gives: the reference every thread result is compared with. */
async function reference(highlight?: () => HighlightSession | undefined) {
  const rendered = [];
  for (const task of tasks())
    rendered.push(await renderDocuments(task, () => highlight?.()?.call()));
  // The corpus succeeds where it should: the guide is highlighted, the failing documents fail.
  expect(JSON.stringify(rendered[0])).toContain('class=\\"shiki');
  expect(JSON.stringify(rendered[0])).toContain('highlighted');
  expect(rendered.map((documents) => documents.map((item) => 'html' in item))).toEqual([
    [true],
    [true],
    [true, true],
    [true, false],
    [false],
  ]);
  const bindings = new Map(KEYWORDS.map((keyword) => [keyword.key, keyword]));
  const linked = [];
  for (const task of LINKS) linked.push(await linkDocument(task, (key) => bindings.get(key)));
  return JSON.stringify({ rendered, linked });
}

/** Every task through a back at once (completion order is the threads'), results in task order. */
async function throughBack(
  back: NonNullable<ReturnType<typeof createRenderBack>>,
  signal: AbortSignal = new AbortController().signal,
) {
  const rendered = await Promise.all(tasks().map((task) => back.render(task, signal)));
  const linked = await Promise.all(LINKS.map((task) => back.link(task, KEYWORDS, signal)));
  return JSON.stringify({ rendered, linked });
}

const production = (): HighlightSession =>
  createHighlightSession(
    { projectId: 'pool' },
    { mode: 'production' },
    { cacheEnabled: false, cacheRoot: '', themes },
  )!;

let real: ThreadEntryBundle;
const bundles: ThreadEntryBundle[] = [];
const fixtureThread = async (mode: string) => {
  const bundle = await misbehavingThread(mode);
  bundles.push(bundle);
  return bundle.url;
};

beforeAll(async () => {
  real = await bundleThreadEntry();
}, 60_000);
afterAll(async () => {
  await real.dispose();
  for (const bundle of bundles) await bundle.dispose();
});
beforeEach(() => {
  resetHighlightCache();
  resetRenderPoolCounters();
  configureRenderPool({ entry: real.url, threshold: 0, idleMs: undefined });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  keepHtmlPool(false);
  await disposeHtmlPool();
  configureRenderPool({ entry: undefined, threshold: undefined, idleMs: undefined });
});

const back = (threads: number, highlight?: HighlightSession, mode: 'on' | 'verify' = 'on') => {
  const created = createRenderBack(
    { renderThreads: threads, ...(mode === 'verify' ? { parallelRender: 'verify' as const } : {}) },
    highlight,
    { themes, cache: highlight !== undefined },
  )!;
  created.admit();
  return created;
};

describe('render threads', () => {
  it('give the main thread’s results with 1, 2 and 4 threads, in any completion order', async () => {
    const expected = await reference();
    configureRenderPool({ entry: await fixtureThread('delayed') });
    for (const threads of [1, 2, 4]) {
      await disposeHtmlPool();
      for (let round = 0; round < 3; round += 1)
        expect(await throughBack(back(threads)), `${threads} threads`).toBe(expected);
    }
    expect(renderPoolCounters()).toMatchObject({ main: 0, fallbacks: 0 });
    expect(renderPoolCounters().thread).toBe(3 * 3 * (tasks().length + LINKS.length));
  }, 120_000);

  it('highlight with the task’s languages as the main thread does, warmed up with them', async () => {
    const langs = [
      {
        name: 'ngdoc-test',
        scopeName: 'source.ngdoc-test',
        patterns: [{ match: '\\bhello\\b', name: 'keyword.control.ngdoc-test' }],
        repository: {},
      },
    ];
    const task: RenderTask = {
      documents: [{ html: '<pre><code class="language-ngdoc-test">hello world</code></pre>' }],
      themes,
      langs,
    };
    const main = await renderDocuments(task, () => undefined);
    expect(JSON.stringify(main)).toContain('language-ngdoc-test');
    for (const cached of [false, true]) {
      const highlight = cached ? production() : undefined;
      const created = createRenderBack({ renderThreads: 1 }, highlight, {
        themes,
        langs,
        cache: cached,
      })!;
      created.admit();
      expect(await created.render(task, new AbortController().signal), `cache ${cached}`).toEqual(
        main,
      );
      await disposeHtmlPool();
    }
    expect(renderPoolCounters()).toMatchObject({ main: 0, fallbacks: 0, thread: 2 });
  }, 120_000);

  it('feed the highlight cache in plan order: the same entries and pack as the main thread', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ngdoc-pool-pack-'));
    try {
      const session = (pack: string) =>
        createHighlightSession(
          { projectId: 'pool' },
          { mode: 'development' },
          { cacheEnabled: true, cacheRoot: path.join(root, pack), themes },
        )!;
      // The main thread alone.
      const main = session('main');
      const expected = await reference(() => main);
      await main.save(true);
      const keys = highlightJournal()
        .entries.map(([key]) => key)
        .sort();

      // Threads: a cold cache, then a warm one (every block a hit in the thread's copy).
      resetHighlightCache();
      configureRenderPool({ entry: await fixtureThread('delayed') });
      const cold = session('threads');
      const threaded = back(2, cold);
      const rendered = JSON.parse(expected).rendered;
      expect(JSON.parse(await throughBack(threaded)).rendered).toEqual(rendered);
      expect(
        highlightJournal()
          .entries.map(([key]) => key)
          .sort(),
      ).toEqual(keys);
      await cold.save(true);
      const pack = (name: string) => {
        const file = readdirSync(path.join(root, name)).find((item) =>
          item.endsWith('.highlight.json'),
        );
        return readFileSync(path.join(root, name, file!), 'utf8');
      };
      expect(pack('threads')).toBe(pack('main'));

      const warm = session('threads');
      expect(JSON.parse(await throughBack(back(2, warm))).rendered).toEqual(rendered);
      // Nothing new was highlighted: every block came from the copy the threads were sent.
      expect(
        highlightJournal()
          .entries.map(([key]) => key)
          .sort(),
      ).toEqual(keys);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it('verify uses the main thread’s result and reports where a thread differs', async () => {
    const expected = await reference();
    // A correct thread: nothing differs.
    expect(await throughBack(back(2, undefined, 'verify'))).toBe(expected);
    expect(renderPoolCounters().mismatches).toBe(0);

    await disposeHtmlPool();
    configureRenderPool({ entry: await fixtureThread('wrong') });
    const signal = new AbortController().signal;
    const verified = back(1, production(), 'verify');
    const [rendered] = await verified.render({ documents: [DOCUMENTS.plain], themes }, signal);
    expect(rendered).toMatchObject({ differs: '$[0].html' });
    expect('html' in rendered! && rendered.html).not.toContain('wrong');
    const linked = await verified.link(LINKS[0]!, KEYWORDS, signal);
    expect(linked.differs).toBe('$.html');
    expect('html' in linked && linked.html).not.toContain('wrong');
    expect(renderPoolCounters().mismatches).toBe(2);
    // Without verify the thread's result is used: the check is real.
    const trusted = back(1);
    expect(await trusted.render({ documents: [DOCUMENTS.plain], themes }, signal)).toEqual([
      { html: '<p>wrong</p>', anchors: [], usedKeywords: [], mismatches: 0 },
    ]);
  }, 120_000);

  it.each([
    ['throw-on-load'],
    ['exit-mid-task'],
    ['failed'],
    ['stray'],
    ['malformed:0'],
    ['malformed:1'],
    ['malformed:2'],
    ['malformed:3'],
    ['malformed:4'],
    ['malformed:5'],
  ])(
    'a thread that %s gets its tasks run in the main thread, with the same results',
    async (mode) => {
      const expected = await reference(() => production());
      resetHighlightCache();
      configureRenderPool({ entry: await fixtureThread(mode) });
      const failing = back(2, production());
      expect(failing.parallel).toBe(true);
      expect(await throughBack(failing)).toBe(expected);
      expect(renderPoolCounters().fallbacks).toBeGreaterThan(0);
      // The rest of the generation runs in the main thread.
      expect(failing.parallel).toBe(false);
      expect(failing.window()).toBe(0);
    },
    120_000,
  );

  it('a malformed link reply gets the link run in the main thread', async () => {
    const expected = JSON.parse(await reference()).linked[0];
    configureRenderPool({ entry: await fixtureThread('malformed:0') });
    const linking = back(1);
    expect(await linking.link(LINKS[0]!, KEYWORDS, new AbortController().signal)).toEqual(expected);
    expect(renderPoolCounters()).toMatchObject({ fallbacks: 1, thread: 0 });
  }, 60_000);

  it('a tampered block that verify finds in several pages is reported once, as a sequential render reports it', async () => {
    // Every task holds the shared block; only the first in plan order finds the tampered entry.
    const shared = code('ts', 'export const shared = 1;');
    const many = (): RenderTask[] =>
      Array.from({ length: 8 }, (_, index) => ({
        documents: [
          { html: `<h2>Page ${index}</h2>${shared}${code('ts', `const own = ${index};`)}` },
        ],
        themes,
      }));
    /** A verifying session whose entries are the highlighted blocks, tampered. */
    const tampered = async () => {
      resetHighlightCache();
      const seed = production();
      for (const task of many()) await renderDocuments(task, () => seed.call());
      const entries = highlightJournal().entries.map(([key, value]) => [key, value] as const);
      resetHighlightCache();
      const session = createHighlightSession(
        { projectId: 'pool', highlightCache: 'verify' },
        { mode: 'production' },
        { cacheEnabled: false, cacheRoot: '', themes },
      )!;
      const call = session.call();
      for (const [key, value] of entries)
        call.set(key, value.replace('"properties":{', '"properties":{"data-tampered":"",'));
      return session;
    };
    const mismatches = (rendered: Array<Array<{ mismatches: number }>>) =>
      rendered.map((documents) => documents.reduce((sum, item) => sum + item.mismatches, 0));

    // Sequential: the first page reports both of its blocks, every later page only its own.
    const sequential = await tampered();
    const expected = [];
    for (const task of many()) expected.push(await renderDocuments(task, () => sequential.call()));
    expect(mismatches(expected)).toEqual([2, 1, 1, 1, 1, 1, 1, 1]);

    // Threads answering in any order, and the main thread rendering ahead of the threshold.
    configureRenderPool({ entry: await fixtureThread('delayed') });
    for (const threshold of [0, 100]) {
      configureRenderPool({ threshold });
      const session = await tampered();
      const parallel = back(2, session);
      const rendered = await Promise.all(
        many().map((task) => parallel.render(task, new AbortController().signal)),
      );
      expect(JSON.stringify(rendered), `threshold ${threshold}`).toBe(JSON.stringify(expected));
      expect(JSON.stringify(rendered)).not.toContain('data-tampered');
    }
    expect(renderPoolCounters().thread).toBe(8);
  }, 120_000);

  it('a missing thread entry runs everything in the main thread', async () => {
    const expected = await reference();
    configureRenderPool({ entry: pathToFileURL(path.join(tmpdir(), 'ngdoc-no-such-thread.js')) });
    expect(await throughBack(back(2))).toBe(expected);
    expect(renderPoolCounters().thread).toBe(0);
  }, 60_000);

  it('an abort settles waiting tasks at once, and a reply after it is ignored', async () => {
    configureRenderPool({ entry: await fixtureThread('hang') });
    const controller = new AbortController();
    const hanging = back(2);
    const rendered = hanging.render({ documents: [DOCUMENTS.plain], themes }, controller.signal);
    const linked = hanging.link(LINKS[0]!, KEYWORDS, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    expect(await rendered).toEqual([{ aborted: true, mismatches: 0 }]);
    expect(await linked).toEqual({ aborted: true, consulted: [] });
    // Aborted before it is dispatched: nothing reaches a thread.
    expect(
      await hanging.render({ documents: [DOCUMENTS.plain], themes }, controller.signal),
    ).toEqual([{ aborted: true, mismatches: 0 }]);
    expect(await hanging.link(LINKS[0]!, KEYWORDS, controller.signal)).toMatchObject({
      aborted: true,
    });
    // Terminating the threads fails the abandoned jobs; nobody waits for them any more.
    await disposeHtmlPool();
  }, 60_000);

  it('a thread result that arrives after an abort reports the abort', async () => {
    configureRenderPool({ entry: await fixtureThread('delayed') });
    const controller = new AbortController();
    const late = back(1);
    const rendered = late.render(
      { documents: [DOCUMENTS.guide], themes },
      Object.defineProperty(controller.signal, 'aborted', {
        get: (() => {
          let reads = 0;
          // Not aborted when dispatched, aborted when the result arrives.
          return () => (reads += 1) > 1;
        })(),
      }),
    );
    expect(await rendered).toEqual([{ aborted: true, mismatches: 0 }]);
  }, 60_000);
});

describe('the pool', () => {
  it('starts threads only for admitted generations past the threshold', async () => {
    configureRenderPool({ threshold: 2 });
    const signal = new AbortController().signal;
    const unadmitted = createRenderBack({ renderThreads: 1 }, undefined, { themes, cache: false })!;
    expect(unadmitted.parallel).toBe(false);
    expect(unadmitted.window()).toBe(0);
    for (const task of tasks()) await unadmitted.render(task, signal);
    expect(renderPoolCounters()).toMatchObject({ thread: 0, main: tasks().length });

    resetRenderPoolCounters();
    const admitted = back(1);
    expect(admitted.window()).toBe(4);
    for (const task of tasks()) await admitted.render(task, signal);
    expect(renderPoolCounters()).toMatchObject({ thread: tasks().length - 2, main: 2 });
  }, 60_000);

  it('is off with the switch, on the reference path and without threads', () => {
    expect(defaultRenderThreads()).toBeGreaterThanOrEqual(0);
    expect(defaultRenderThreads()).toBeLessThanOrEqual(4);
    const warm = { themes, cache: false };
    expect(createRenderBack({ parallelRender: false }, undefined, warm)).toBeUndefined();
    expect(createRenderBack({ incrementalReuse: false }, undefined, warm)).toBeUndefined();
    expect(createRenderBack({ renderThreads: 0 }, undefined, warm)).toBeUndefined();
    expect(createRenderBack({ renderThreads: 2 }, undefined, warm)?.mode).toBe('on');
    expect(parallelRenderSwitch({})).toBe('on');
    expect(parallelRenderSwitch({ parallelRender: 'verify' })).toBe('verify');
    vi.stubEnv(PARALLEL_RENDER_FLAG, 'off');
    expect(parallelRenderSwitch({ parallelRender: 'verify' })).toBe('off');
    expect(createRenderBack({ renderThreads: 2 }, undefined, warm)).toBeUndefined();
    vi.stubEnv(PARALLEL_RENDER_FLAG, 'verify');
    expect(parallelRenderSwitch({})).toBe('verify');
    expect(parallelRenderSwitch({ parallelRender: false })).toBe('off');
  });

  it('starts before the semantic phase only for a large production build or start without a snapshot', async () => {
    const warm = { themes, cache: true };
    const options = { renderThreads: 1 };
    const live = () => htmlPool(1)!.live;
    const large = PRESTART_ENTRIES;
    prestartRenderThreads(options, { mode: 'development', previous: {} as never }, large, warm);
    expect(live()).toBe(0);
    prestartRenderThreads(
      { ...options, parallelRender: false },
      { mode: 'production' },
      large,
      warm,
    );
    prestartRenderThreads(
      { ...options, incrementalReuse: false },
      { mode: 'production' },
      large,
      warm,
    );
    // A small site never starts a thread ahead of time.
    prestartRenderThreads(options, { mode: 'production' }, large - 1, warm);
    expect(live()).toBe(0);
    prestartRenderThreads(options, { mode: 'production' }, large, warm);
    expect(live()).toBe(1);
    await disposeHtmlPool();
    prestartRenderThreads(options, { mode: 'development' }, large, warm);
    expect(live()).toBe(1);
  });

  it('dispose resolves once every thread has stopped, and a new pool starts afterwards', async () => {
    expect(renderThreadsAlive()).toBe(0);
    const pool = htmlPool(3)!;
    pool.start({ themes, cache: true });
    expect(renderThreadsAlive()).toBe(3);
    const workers = (pool as unknown as { threads: Array<{ worker: Worker }> }).threads.map(
      (thread) => thread.worker,
    );
    expect(workers).toHaveLength(3);
    const exits = workers.map(
      (worker) => new Promise<void>((resolve) => worker.once('exit', () => resolve())),
    );
    let exited = 0;
    for (const exit of exits) void exit.then(() => (exited += 1));
    await disposeHtmlPool();
    expect(exited).toBe(3);
    expect(htmlPool(3)).not.toBe(pool);
    expect(htmlPool(3)!.live).toBe(0);
  }, 60_000);

  it('a size change replaces the pool; no size or no entry is no pool', async () => {
    const two = htmlPool(2)!;
    two.start();
    expect(htmlPool(2)).toBe(two);
    const one = htmlPool(1)!;
    expect(one).not.toBe(two);
    expect(two.live).toBe(0);
    expect(htmlPool(0)).toBeUndefined();
    configureRenderPool({ entry: undefined });
    // The sources have no bundled thread entry beside them.
    expect(htmlPool(1)).toBeUndefined();
  });

  it('terminates idle threads, and starts them again for the next job', async () => {
    configureRenderPool({ idleMs: 30 });
    const pool = htmlPool(2)!;
    const signal = new AbortController().signal;
    const idle = back(2);
    await idle.render({ documents: [DOCUMENTS.plain], themes }, signal);
    expect(pool.live).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pool.live).toBe(0);
    await idle.render({ documents: [DOCUMENTS.plain], themes }, signal);
    expect(pool.live).toBe(2);
  }, 60_000);

  it('starts the idle time again on every start, and never ends threads a compile holds', async () => {
    configureRenderPool({ idleMs: 150 });
    const pool = htmlPool(1)!;
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    pool.start();
    await pause(100);
    // A prestart restarts the idle time: the first start's timer does not end the threads.
    pool.start();
    await pause(100);
    expect(pool.live).toBe(1);
    await pause(200);
    expect(pool.live).toBe(0);

    // Held (a compile whose semantic phase outlasts the idle time): the threads stay.
    const release = holdHtmlPool();
    pool.start();
    await pause(400);
    expect(pool.live).toBe(1);
    release();
    release();
    expect(pool.live).toBe(1);
    await pause(400);
    expect(pool.live).toBe(0);
  }, 60_000);

  it('sends only JSON: a function or a class instance throws, and no thread is lost', async () => {
    const pool = htmlPool(1)!;
    await expect(pool.run(() => [encode({ value: () => 1 })])).rejects.toThrow(
      'Worker transport requires JSON values',
    );
    await expect(pool.run(() => [encode({ value: new Map() })])).rejects.toThrow(
      'Worker transport requires JSON values',
    );
    expect(pool.live).toBe(1);
  }, 60_000);

  it('rejects jobs with a ThreadFailure once a thread has failed', async () => {
    configureRenderPool({ entry: await fixtureThread('exit-mid-task') });
    const pool = htmlPool(1)!;
    const job = (id: number) => [encode({ type: 'render', id, task: { documents: [], themes } })];
    await expect(pool.run((_, id) => job(id))).rejects.toBeInstanceOf(ThreadFailure);
    const thread = (
      pool as unknown as { threads: Array<{ run(id: number, m: string[]): Promise<unknown> }> }
    ).threads[0]!;
    await expect(thread.run(1, [])).rejects.toBeInstanceOf(ThreadFailure);
  }, 60_000);

  it('a long-lived runtime keeps the pool when a service is disposed', () => {
    expect(htmlPoolKept()).toBe(false);
    keepHtmlPool(true);
    expect(htmlPoolKept()).toBe(true);
  });
});

describe('a thread’s job server, in this thread', () => {
  it('the thread entry serves only inside a thread', async () => {
    // This test process is no worker thread: importing the entry starts nothing.
    await expect(import('../html-worker')).resolves.toBeDefined();
  });

  /** Serves on one end of a channel; `ask` posts a job and resolves with its decoded reply. */
  function server() {
    const { port1, port2 } = new MessageChannel();
    serveHtmlThread(port1);
    const replies: Array<Record<string, unknown>> = [];
    const waiting: Array<() => void> = [];
    port2.on('message', (message) => {
      replies.push(decode(message));
      waiting.shift()?.();
    });
    const post = (value: Record<string, unknown>) => port2.postMessage(encode(value));
    const ask = async (value: Record<string, unknown>) => {
      const reply = new Promise<void>((resolve) => waiting.push(resolve));
      post(value);
      await reply;
      return replies.at(-1)!;
    };
    return { post, ask, close: () => (port1.close(), port2.close()) };
  }

  it('renders and links as the main thread does, and reports what it highlighted', async () => {
    const main = production();
    const expected = JSON.parse(await reference(() => main));
    const thread = server();
    try {
      const context = main.prepare().context;
      // The warm-up sets the highlighter up and replies nothing.
      thread.post({ type: 'warm', themes, cache: true });
      thread.post({ type: 'warm', themes, cache: false });
      const rendered = [];
      let fresh = 0;
      for (const [id, task] of tasks().entries()) {
        const reply = await thread.ask({
          type: 'render',
          id,
          task,
          highlight: { context, verify: false },
        });
        expect(reply['type']).toBe('done');
        const result = reply['result'] as {
          documents: unknown;
          highlight: Array<{ fresh: unknown[] }>;
        };
        rendered.push(result.documents);
        fresh += result.highlight.reduce((sum, record) => sum + record.fresh.length, 0);
      }
      expect(rendered).toEqual(expected.rendered);
      expect(fresh).toBeGreaterThan(0);
      // Again, from its own copy: everything hits, nothing is highlighted.
      const again = await thread.ask({
        type: 'render',
        id: 10,
        task: tasks()[0],
        highlight: { context, verify: false },
      });
      expect(
        (again['result'] as { highlight: Array<{ fresh: unknown[]; used: unknown[] }> }).highlight,
      ).toMatchObject([{ fresh: [], mismatched: [] }]);
      // Without a cache.
      const plain = await thread.ask({ type: 'render', id: 11, task: tasks()[0] });
      expect((plain['result'] as { documents: unknown }).documents).toEqual(expected.rendered[0]);
      expect(plain['result']).not.toHaveProperty('highlight');

      thread.post({ type: 'keywords', id: 7, keywords: KEYWORDS });
      const linked = [];
      for (const [index, task] of LINKS.entries())
        linked.push(
          (await thread.ask({ type: 'link', id: 20 + index, task, keywords: 7 }))['result'],
        );
      expect(linked).toEqual(expected.linked);
      expect(await thread.ask({ type: 'link', id: 30, task: LINKS[0], keywords: 8 })).toEqual({
        type: 'failed',
        id: 30,
        message: 'Error: Unknown keyword set 8',
      });
    } finally {
      thread.close();
    }
  }, 60_000);

  it('takes the main thread’s entries, verifies hits and reports a tampered one', async () => {
    const main = production();
    await reference(() => main);
    const { context } = main.prepare();
    const entries = highlightJournal().entries.map(
      ([key, value]) =>
        [key, value.replace('"properties":{', '"properties":{"data-tampered":"",')] as const,
    );
    const thread = server();
    try {
      thread.post({ type: 'highlight', reset: true, context, proven: true, entries });
      const trusted = await thread.ask({
        type: 'render',
        id: 1,
        task: tasks()[0],
        highlight: { context, verify: false },
      });
      expect(JSON.stringify(trusted)).toContain('data-tampered');
      const verified = await thread.ask({
        type: 'render',
        id: 2,
        task: tasks()[0],
        highlight: { context, verify: true },
      });
      const result = verified['result'] as {
        documents: Array<{ html: string; mismatches: number }>;
        highlight: Array<{ fresh: unknown[]; mismatched: string[] }>;
      };
      expect(result.documents[0]!.html).not.toContain('data-tampered');
      expect(result.documents[0]!.mismatches).toBeGreaterThan(0);
      expect(result.highlight[0]!.fresh.length).toBeGreaterThan(0);
      // The keys that differed go to the main thread, which decides in plan order what counts.
      expect(result.highlight[0]!.mismatched.length).toBe(result.documents[0]!.mismatches);
      // A reset drops the copy.
      thread.post({ type: 'highlight', reset: true, context, proven: false, entries: [] });
      const cold = await thread.ask({
        type: 'render',
        id: 3,
        task: { documents: [DOCUMENTS.mermaid], themes },
        highlight: { context, verify: false },
      });
      expect(JSON.stringify(cold)).not.toContain('data-tampered');
    } finally {
      thread.close();
    }
  }, 60_000);

  it('replies that a job failed when it cannot run it', async () => {
    const thread = server();
    try {
      expect(await thread.ask({ type: 'unknown', id: 1 })).toEqual({
        type: 'failed',
        id: 1,
        message: 'Error: Unknown render thread job unknown',
      });
      const reply = new Promise<Record<string, unknown>>((resolve) => {
        const { port1, port2 } = new MessageChannel();
        serveHtmlThread(port1);
        port2.on('message', (message) => {
          resolve(decode(message));
          port1.close();
          port2.close();
        });
        port2.postMessage('not json');
      });
      expect(await reply).toMatchObject({ type: 'failed', id: null });
    } finally {
      thread.close();
    }
  });
});
