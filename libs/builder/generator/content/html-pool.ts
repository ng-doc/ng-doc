import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { CompilationRequest, KeywordExport, ShikiLanguage } from '../contracts';
import { PARALLEL_RENDER_FLAG, readFlag } from '../kernel/flags';
import { decode, encode } from '../worker/protocol';
import type { ContentBack } from './content-compiler';
export { PARALLEL_RENDER_MISMATCH } from './content-compiler';
import { type HighlightSession, highlightJournal } from './highlight-cache';
import {
  type HighlightRecord,
  type LinkedDocument,
  type LinkTask,
  type RenderedDocument,
  type RenderTask,
  bindingsOf,
  linkDocument,
  recordingHighlight,
  renderDocuments,
} from './html-pipeline';

/**
 * Parallel rendering: the HTML pipeline of a large generation's content (`./html-pipeline`) runs on
 * worker threads of the compiler runtime, while the main thread runs the fronts (files, templates,
 * semantic queries) strictly in plan order and settles every result in plan order
 * (`compiler/render.ts`, `compiler/link.ts`).
 *
 * The output cannot depend on where a task ran: a task is a pure function of its JSON input, and
 * every message to and from a thread is `encode`d JSON text. A thread that cannot start, crashes,
 * exits, replies with something malformed or fails a job gets the job run again in the main thread
 * through the same pipeline, and the rest of the generation runs there; no diagnostic is reported,
 * since a cold build would not have one (`renderPoolCounters` counts it).
 *
 * Threads are used only where they pay: never on the targeted path or the reference path
 * (`incrementalReuse: false`), and in a generation only after its first
 * {@link PARALLEL_RENDER_THRESHOLD} tasks, which run in the main thread while the threads start.
 * A production build or a start without a previous snapshot starts them before the semantic phase
 * (`prestartRenderThreads`), so their start-up hides behind it.
 *
 * The pool belongs to the runtime: a long-lived compiler runtime keeps it warm across generations
 * and terminates it after {@link RENDER_POOL_IDLE_MS} without work; a one-shot compile terminates
 * it when its service is disposed (`disposeHtmlPool`). Threads never keep the process alive, add
 * no process listeners and change no environment, and they die with the runtime's process.
 *
 * `NGDOC_PARALLEL_RENDER=0` (`CompilationOptions.parallelRender: false`) runs everything in the main
 * thread, as before. `verify` also runs every thread task in the main thread, uses that result and
 * reports `CONTENT_PARALLEL_MISMATCH` when the two differ.
 */

/** The default number of render threads at most. */
export const RENDER_THREAD_LIMIT = 4;

/** A generation's first tasks run in the main thread: a small generation never waits for a thread. */
export const PARALLEL_RENDER_THRESHOLD = 32;

/**
 * The entries a likely large generation has at least before its threads start ahead of time: every
 * entry renders a header and at least one tab, so fewer stay below the threshold anyway.
 */
export const PRESTART_ENTRIES = PARALLEL_RENDER_THRESHOLD / 2;

/** A pool without work for this long terminates its threads, to give their memory back. */
export const RENDER_POOL_IDLE_MS = 30_000;

/** Tasks in flight per live thread, at most (`compiler/render.ts` bounds its units by it too). */
export const RENDER_WINDOW_PER_THREAD = 4;

/** The default thread count: up to four, leaving room for the main thread and Prettier's. */
export function defaultRenderThreads(): number {
  return Math.max(0, Math.min(RENDER_THREAD_LIMIT, availableParallelism() - 2));
}

/** The switch: `off`, `on` or `verify`. */
export function parallelRenderSwitch(options: {
  parallelRender?: boolean | 'verify';
}): 'off' | 'on' | 'verify' {
  if (options.parallelRender === false) return 'off';
  const value = readFlag(PARALLEL_RENDER_FLAG).value;
  return value === 'off' ? 'off' : options.parallelRender === 'verify' ? 'verify' : value;
}

/** Why a thread could not give a task's result; the task then runs in the main thread. */
export class ThreadFailure extends Error {}

/**
 * Counters of this runtime, for tests: where tasks ran (`rendered`: the render tasks among the
 * thread tasks) and how often a thread failed.
 */
const counters = { thread: 0, rendered: 0, main: 0, fallbacks: 0, mismatches: 0 };

/** Tests: a copy of the counters. */
export function renderPoolCounters(): typeof counters {
  return { ...counters };
}

/** Tests: the counters back to zero. */
export function resetRenderPoolCounters(): void {
  counters.thread = counters.rendered = counters.main = counters.fallbacks = 0;
  counters.mismatches = 0;
}

/** Tests only: the thread entry, the threshold and the idle time this runtime uses. */
const settings: { entry?: URL; threshold?: number; idleMs?: number } = {};

/**
 * Tests only: run the threads from `entry` (a bundled `html-worker.ts`; the sources cannot run in
 * a thread), with another threshold or idle time. `undefined` restores the default.
 */
export function configureRenderPool(value: {
  entry?: URL;
  threshold?: number;
  idleMs?: number;
}): void {
  Object.assign(settings, value);
}

/** The bundled entry, looked up once (`null`: there is none). */
let bundledEntry: URL | null | undefined;

/**
 * The bundled thread entry next to this module's bundle (`content/html-worker.js` beside
 * `compiler/index.js`), or undefined when there is none (the sources run in a test).
 */
function threadEntry(): URL | undefined {
  if (settings.entry) return settings.entry;
  if (bundledEntry === undefined) {
    bundledEntry = null;
    for (const candidate of ['../content/html-worker.js', './html-worker.js']) {
      const url = new URL(candidate, import.meta.url);
      if (url.protocol === 'file:' && existsSync(fileURLToPath(url))) {
        bundledEntry = url;
        break;
      }
    }
  }
  return bundledEntry ?? undefined;
}

type Reply = Record<string, unknown>;

/** One render thread and the jobs it has not answered. */
class HtmlThread {
  readonly worker: Worker;
  readonly pending = new Map<number, { resolve(reply: Reply): void; reject(error: Error): void }>();
  failure?: Error;
  /** How far this thread replayed the highlight journal (`highlightJournal`). */
  highlight?: { epoch: number; cursor: number };
  /** The keyword set this thread holds. */
  keywords?: readonly KeywordExport[];
  private readonly exited: Promise<void>;

  constructor(
    entry: URL,
    private readonly changed: () => void,
  ) {
    // No inherited flags: a thread accepts no per-process option, and needs none.
    this.worker = new Worker(entry, { execArgv: [] });
    this.worker.unref();
    this.exited = new Promise((resolve) => this.worker.once('exit', () => resolve()));
    this.worker.on('message', (message: unknown) => this.receive(message));
    this.worker.on('error', (error) => this.fail(error));
    this.worker.on('messageerror', (error) => this.fail(error));
    this.worker.on('exit', (code) => this.fail(new Error(`Render thread exited (${code})`)));
  }

  run(id: number, messages: readonly string[]): Promise<Reply> {
    if (this.failure) return Promise.reject(new ThreadFailure(this.failure.message));
    const reply = new Promise<Reply>((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
    for (const message of messages) this.worker.postMessage(message);
    return reply;
  }

  post(message: string): void {
    if (!this.failure) this.worker.postMessage(message);
  }

  private receive(message: unknown): void {
    let reply: Reply;
    try {
      reply = decode(message);
    } catch (error) {
      this.fail(error as Error);
      return;
    }
    const id = reply['id'];
    const waiter = typeof id === 'number' ? this.pending.get(id) : undefined;
    if (!waiter || (reply['type'] !== 'done' && reply['type'] !== 'failed')) {
      this.fail(new Error('Render thread sent a reply to no job'));
      return;
    }
    this.pending.delete(id as number);
    if (reply['type'] === 'done') waiter.resolve(reply);
    else waiter.reject(new ThreadFailure(String(reply['message'])));
    this.changed();
  }

  /** Ends the thread: every job it has not answered fails, and it is not used again. */
  fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.pending.values()) waiter.reject(new ThreadFailure(error.message));
    this.pending.clear();
    void this.worker.terminate().catch(() => undefined);
    this.changed();
  }

  async terminate(): Promise<void> {
    this.fail(new Error('Render thread terminated'));
    await this.exited;
  }
}

/**
 * A warm-up: the themes and languages to set the highlighter up for, and whether the cached
 * plugin is used.
 */
export interface RenderWarmUp {
  themes: { light: string; dark: string };
  langs?: readonly ShikiLanguage[];
  /** `all` when highlighting loads every bundled grammar. */
  grammars?: 'all';
  cache: boolean;
}

/** Up to `size` render threads, started on demand. */
export class HtmlPool {
  private readonly threads: HtmlThread[] = [];
  private nextId = 1;
  private idle: NodeJS.Timeout | undefined;
  private warm: RenderWarmUp | undefined;

  constructor(
    readonly size: number,
    private readonly entry: URL,
    private readonly idleMs: number,
  ) {}

  /** The threads that have not failed. */
  get live(): number {
    return this.threads.filter((thread) => !thread.failure).length;
  }

  /** Starts the missing threads (failed ones are replaced), each warmed up when `warm` is given. */
  start(warm: RenderWarmUp | undefined = this.warm): void {
    this.warm = warm;
    for (let index = this.threads.length - 1; index >= 0; index -= 1)
      if (this.threads[index]!.failure) this.threads.splice(index, 1);
    while (this.threads.length < this.size) {
      const thread = new HtmlThread(this.entry, () => this.changed());
      this.threads.push(thread);
      if (warm) thread.post(encode({ type: 'warm', ...warm }));
    }
    this.changed();
  }

  /**
   * Runs a job on the live thread with the fewest jobs in flight (the first on a tie). `messages`
   * builds what to post to that thread for job `id`: any messages that bring the thread up to date,
   * then the job. A thread that fails rejects the job with a {@link ThreadFailure}.
   */
  run(
    messages: (thread: HtmlThread, id: number) => string[],
  ): Promise<{ thread: HtmlThread; reply: Reply }> {
    if (this.live < this.size) this.start();
    let chosen: HtmlThread | undefined;
    for (const thread of this.threads)
      if (!thread.failure && (!chosen || thread.pending.size < chosen.pending.size))
        chosen = thread;
    if (!chosen) return Promise.reject(new ThreadFailure('No render thread is running'));
    clearTimeout(this.idle);
    this.idle = undefined;
    const id = this.nextId++;
    let posted: string[];
    try {
      posted = messages(chosen, id);
    } catch (error) {
      return Promise.reject(error);
    }
    const thread = chosen;
    return thread.run(id, posted).then((reply) => ({ thread, reply }));
  }

  /** Terminates every thread and resolves when all of them have stopped. */
  async terminate(): Promise<void> {
    clearTimeout(this.idle);
    this.idle = undefined;
    const threads = this.threads.splice(0);
    await Promise.all(threads.map((thread) => thread.terminate()));
  }

  /**
   * Every change (a start, a job, a reply, a release) starts the idle time again: with no job in
   * flight and no compile holding the pool (`holdHtmlPool`), the threads end once it has passed
   * without another change (a timer that keeps nothing alive).
   */
  changed(): void {
    clearTimeout(this.idle);
    this.idle = undefined;
    if (holds > 0 || !this.threads.length) return;
    if (this.threads.some((thread) => thread.pending.size > 0)) return;
    this.idle = setTimeout(() => {
      this.idle = undefined;
      void this.terminate();
    }, this.idleMs);
    this.idle.unref();
  }
}

/** Compiles that hold the pool: its threads never idle out while one runs. */
let holds = 0;

/**
 * Holds the pool for a compile: threads started before its semantic phase are still there for its
 * render, however long that phase takes. The returned release (idempotent) starts the idle time.
 */
export function holdHtmlPool(): () => void {
  holds += 1;
  shared?.changed();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds -= 1;
    shared?.changed();
  };
}

let shared: HtmlPool | undefined;
/** A long-lived compiler runtime keeps the pool when a generation's service is disposed. */
let kept = false;

/** This runtime's pool of `size` threads, or undefined when there is no thread entry or no size. */
export function htmlPool(size: number): HtmlPool | undefined {
  if (size <= 0) return undefined;
  const entry = threadEntry();
  if (!entry) return undefined;
  if (shared && shared.size !== size) {
    void shared.terminate();
    shared = undefined;
  }
  return (shared ??= new HtmlPool(size, entry, settings.idleMs ?? RENDER_POOL_IDLE_MS));
}

/** The live threads of this runtime's pool (tests: nothing may outlive a one-shot compile). */
export function renderThreadsAlive(): number {
  return shared?.live ?? 0;
}

/** Terminates this runtime's pool and resolves when every thread has stopped. */
export async function disposeHtmlPool(): Promise<void> {
  const pool = shared;
  shared = undefined;
  await pool?.terminate();
}

/**
 * Whether disposing a compilation service leaves the pool running: a long-lived compiler runtime
 * (`worker/entry.ts`) creates a service per generation and keeps its pool warm across them.
 */
export function keepHtmlPool(keep: boolean): void {
  kept = keep;
}

/** Whether a disposed compilation service leaves the pool to its runtime (`keepHtmlPool`). */
export function htmlPoolKept(): boolean {
  return kept;
}

/** The options parallel rendering reads (`CompilationOptions`). */
export interface ParallelRenderOptions {
  incrementalReuse?: boolean;
  parallelRender?: boolean | 'verify';
  renderThreads?: number;
}

const threadCount = (options: ParallelRenderOptions): number =>
  Math.max(0, Math.floor(options.renderThreads ?? defaultRenderThreads()));

/**
 * Starts the threads of a generation that is likely large, before its semantic phase: a production
 * build or a start without a previous snapshot, of at least {@link PRESTART_ENTRIES} entries. Other
 * generations start them only once they have more than {@link PARALLEL_RENDER_THRESHOLD} tasks, so a
 * small site never starts one.
 */
export function prestartRenderThreads(
  options: ParallelRenderOptions,
  request: Pick<CompilationRequest, 'mode' | 'previous'>,
  entries: number,
  warm: RenderWarmUp,
): void {
  if (parallelRenderSwitch(options) === 'off' || options.incrementalReuse === false) return;
  if ((request.mode !== 'production' && request.previous) || entries < PRESTART_ENTRIES) return;
  htmlPool(threadCount(options))?.start(warm);
}

/**
 * The back of one generation's content (`ContentBack`), or undefined when everything runs in the
 * main thread: with the switch off, on the reference path and without threads.
 */
export function createRenderBack(
  options: ParallelRenderOptions,
  highlight: HighlightSession | undefined,
  warm: RenderWarmUp,
): RenderBack | undefined {
  const mode = parallelRenderSwitch(options);
  const threads = threadCount(options);
  if (mode === 'off' || options.incrementalReuse === false || threads === 0) return undefined;
  return new RenderBack(mode, threads, highlight, warm);
}

type Outcome<T> = { value: T } | { aborted: true };

/** A render task's documents, and their highlight records when the generation has a cache. */
interface RenderOutcome {
  documents: RenderedDocument[];
  records?: HighlightRecord[];
}

/**
 * One generation's back. Its tasks run in the main thread until the generation is admitted (its
 * full path) and has passed the threshold, then on the pool. Results of thread render tasks feed
 * the highlight cache in the order the tasks were submitted, which is plan order.
 */
export class RenderBack implements ContentBack {
  private admitted = false;
  /** A thread failed in this generation: its remaining tasks run in the main thread. */
  private off = false;
  private tasks = 0;
  private submitted = 0;
  private merging = 0;
  private readonly held = new Map<number, () => void>();
  private readonly keywordSets = new WeakMap<readonly KeywordExport[], number>();
  private nextKeywordSet = 1;

  constructor(
    readonly mode: 'on' | 'verify',
    readonly threads: number,
    private readonly highlight: HighlightSession | undefined,
    private readonly warm: RenderWarmUp,
  ) {}

  /** The generation's full path may use threads (the targeted path never does). */
  admit(): void {
    this.admitted = true;
  }

  /** Whether tasks may go to threads: the units in flight are worth bounding. */
  get parallel(): boolean {
    return this.admitted && !this.off && threadEntry() !== undefined;
  }

  /** How many units may wait for their back half before the next front starts. */
  window(): number {
    return this.parallel ? this.threads * RENDER_WINDOW_PER_THREAD : 0;
  }

  async render(task: RenderTask, signal: AbortSignal): Promise<RenderedDocument[]> {
    const order = this.submitted++;
    let outcome: RenderOutcome;
    try {
      outcome = await this.renderAnywhere(task, signal);
    } catch (error) {
      await this.inTurn(order);
      throw error;
    }
    const { documents, records } = outcome;
    // The highlight cache takes each task's records in plan order, and only then does a document
    // know which `verify` differences it reports: those of a sequential render.
    let counts: number[] = [];
    await this.inTurn(order, () => {
      if (records && this.highlight)
        counts = records.map((record) => this.highlight!.merge(record));
    });
    return records
      ? documents.map((document, index) =>
          index < counts.length ? { ...document, mismatches: counts[index]! } : document,
        )
      : documents;
  }

  /** A render task's documents and highlight records, from a thread or from this thread. */
  private async renderAnywhere(task: RenderTask, signal: AbortSignal): Promise<RenderOutcome> {
    const pool = this.pool();
    if (!pool || signal.aborted) return this.renderHere(task, signal);
    const settings = this.highlight?.prepare();
    const outcome = await this.onThread(
      pool,
      signal,
      (thread, id) => [
        ...this.highlightSync(thread, settings),
        encode({
          type: 'render',
          id,
          task,
          ...(settings
            ? { highlight: { context: settings.context, verify: settings.verify } }
            : {}),
        }),
      ],
      (reply) => renderReply(reply, task, settings !== undefined),
    );
    if (!outcome) return this.renderHere(task, signal);
    if ('aborted' in outcome) return { documents: [{ aborted: true, mismatches: 0 }] };
    counters.rendered += 1;
    if (this.mode === 'verify') {
      // The main thread's result (and highlight records) is used; the thread's is only compared.
      const local = await this.renderHere(task, signal);
      const differs = differenceOf(
        outcome.value.documents.map(withoutMismatches),
        local.documents.map(withoutMismatches),
      );
      return differs === undefined
        ? local
        : {
            ...local,
            documents: [this.mismatch(local.documents[0]!, differs), ...local.documents.slice(1)],
          };
    }
    if (signal.aborted) return { documents: [{ aborted: true, mismatches: 0 }] };
    return outcome.value;
  }

  async link(
    task: LinkTask,
    keywords: readonly KeywordExport[],
    signal: AbortSignal,
  ): Promise<LinkedDocument> {
    const pool = this.pool();
    if (!pool || signal.aborted) return this.linkHere(task, keywords, signal);
    const set = this.keywordSet(keywords);
    const outcome = await this.onThread(
      pool,
      signal,
      (thread, id) => {
        const messages = [encode({ type: 'link', id, task, keywords: set })];
        // The keyword set crosses once per thread and generation (its frozen array).
        if (thread.keywords !== keywords) {
          messages.unshift(encode({ type: 'keywords', id: set, keywords }));
          thread.keywords = keywords;
        }
        return messages;
      },
      linkReply,
    );
    if (!outcome) return this.linkHere(task, keywords, signal);
    if ('aborted' in outcome) return { aborted: true, consulted: [] };
    if (this.mode === 'verify') {
      const local = await this.linkHere(task, keywords, signal);
      const differs = differenceOf(outcome.value, local);
      if (differs === undefined) return local;
      counters.mismatches += 1;
      return { ...local, differs } as LinkedDocument;
    }
    return signal.aborted ? { aborted: true, consulted: outcome.value.consulted } : outcome.value;
  }

  /** The pool this task may use, or undefined when it runs in the main thread. */
  private pool(): HtmlPool | undefined {
    const threshold = settings.threshold ?? PARALLEL_RENDER_THRESHOLD;
    if (!this.admitted || this.off || this.tasks++ < threshold) return undefined;
    return htmlPool(this.threads);
  }

  /**
   * Runs a job on a thread: its validated result, `aborted` when the generation was aborted first
   * (the thread's reply is then ignored), or undefined after a failure, when the task must run in
   * the main thread (and so must the rest of the generation's).
   */
  private async onThread<T>(
    pool: HtmlPool,
    signal: AbortSignal,
    messages: (thread: HtmlThread, id: number) => string[],
    validate: (reply: Reply) => T,
  ): Promise<Outcome<T> | undefined> {
    pool.start(this.warm);
    const running = pool.run(messages);
    // A reply after an abort is not waited for; a failure after it must not go unhandled.
    running.catch(() => undefined);
    let stop: (() => void) | undefined;
    const aborted = new Promise<'aborted'>((resolve) => {
      stop = () => resolve('aborted');
      signal.addEventListener('abort', stop, { once: true });
    });
    try {
      const settled = await Promise.race([running, aborted]);
      if (settled === 'aborted') return { aborted: true };
      let value: T;
      try {
        value = validate(settled.reply['result'] as Reply);
      } catch (error) {
        // A malformed reply: the thread is not trusted again.
        settled.thread.fail(error as Error);
        throw error;
      }
      counters.thread += 1;
      return { value };
    } catch {
      this.off = true;
      counters.fallbacks += 1;
      return undefined;
    } finally {
      signal.removeEventListener('abort', stop!);
    }
  }

  /**
   * Renders in this thread. Its highlighting is recorded rather than applied, like a thread's, so
   * that tasks rendered here out of plan order (ahead of earlier thread tasks, or concurrently with
   * each other) still feed the cache in plan order.
   */
  private async renderHere(task: RenderTask, signal: AbortSignal): Promise<RenderOutcome> {
    counters.main += 1;
    const session = this.highlight;
    if (!session)
      return {
        documents: await renderDocuments(
          task,
          () => undefined,
          () => signal.aborted,
        ),
      };
    const settings = session.prepare();
    const local = new Map<string, string>();
    let proved = false;
    const recording = recordingHighlight(settings, task.themes, {
      get: (key) => local.get(key) ?? session.peek(key),
      set: (key, value) => local.set(key, value),
      proven: () => proved || session.prepare().proven,
      prove: () => (proved = true),
    });
    const documents = await renderDocuments(
      task,
      () => recording.next(),
      () => signal.aborted,
    );
    return { documents, records: recording.records };
  }

  private linkHere(
    task: LinkTask,
    keywords: readonly KeywordExport[],
    signal: AbortSignal,
  ): Promise<LinkedDocument> {
    counters.main += 1;
    const bindings = bindingsFor(keywords);
    return linkDocument(
      task,
      (key) => bindings.get(key),
      () => signal.aborted,
    );
  }

  private mismatch(document: RenderedDocument, differs: string): RenderedDocument {
    counters.mismatches += 1;
    return { ...document, differs } as RenderedDocument;
  }

  /**
   * The highlight entries a thread lacks before a render job: all of them after it started or the
   * cache was cleared, then those written since its last job.
   */
  private highlightSync(
    thread: HtmlThread,
    settings: { context: string; proven: boolean } | undefined,
  ): string[] {
    if (!settings) return [];
    const { epoch, entries } = highlightJournal();
    const reset = thread.highlight?.epoch !== epoch;
    const from = reset ? 0 : thread.highlight!.cursor;
    thread.highlight = { epoch, cursor: entries.length };
    return [
      encode({
        type: 'highlight',
        reset,
        context: settings.context,
        proven: settings.proven,
        entries: entries.slice(from),
      }),
    ];
  }

  /**
   * Resolves once every render task submitted before `order` has had its turn, after running
   * `apply` (this task's highlight merge): turns are taken in submission order, which is plan order.
   */
  private inTurn(order: number, apply?: () => void): Promise<void> {
    return new Promise((resolve) => {
      this.held.set(order, () => {
        apply?.();
        resolve();
      });
      while (this.held.has(this.merging)) {
        const next = this.held.get(this.merging)!;
        this.held.delete(this.merging);
        this.merging += 1;
        next();
      }
    });
  }

  private keywordSet(keywords: readonly KeywordExport[]): number {
    let id = this.keywordSets.get(keywords);
    if (id === undefined) this.keywordSets.set(keywords, (id = this.nextKeywordSet++));
    return id;
  }
}

const keywordBindings = new WeakMap<readonly KeywordExport[], Map<string, KeywordExport>>();

function bindingsFor(keywords: readonly KeywordExport[]): Map<string, KeywordExport> {
  let bindings = keywordBindings.get(keywords);
  if (!bindings) {
    bindings = bindingsOf(keywords);
    if (Object.isFrozen(keywords)) keywordBindings.set(keywords, bindings);
  }
  return bindings;
}

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** A thread's render result, checked; anything else is a malformed reply. */
function renderReply(result: Reply, task: RenderTask, highlighted: boolean): RenderOutcome {
  const documents = result?.['documents'];
  if (
    !Array.isArray(documents) ||
    documents.length > task.documents.length ||
    (task.documents.length > 0 && documents.length === 0) ||
    !documents.every((document: Reply, index) => {
      if (!document || typeof document !== 'object' || !isCount(document['mismatches']))
        return false;
      const succeeded =
        typeof document['html'] === 'string' &&
        Array.isArray(document['anchors']) &&
        isStrings(document['usedKeywords']);
      const failed =
        (document['failed'] === 'process' || document['failed'] === 'post-process') &&
        typeof document['message'] === 'string';
      // Only the last document may have failed; a task stops there.
      return succeeded || (failed && index === documents.length - 1);
    }) ||
    // A task that stopped early stopped at a failure.
    (documents.length < task.documents.length && 'html' in documents[documents.length - 1])
  )
    throw new Error('Malformed render reply');
  if (!highlighted) return { documents };
  // One highlight record per processed document.
  const records = result['highlight'];
  if (
    !Array.isArray(records) ||
    records.length !== documents.length ||
    !records.every(
      (record: Reply) =>
        !!record &&
        typeof record === 'object' &&
        isStrings(record['used']) &&
        isStrings(record['mismatched']) &&
        Array.isArray(record['fresh']) &&
        record['fresh'].every(
          (entry: unknown) => Array.isArray(entry) && entry.length === 2 && isStrings(entry),
        ),
    )
  )
    throw new Error('Malformed render reply');
  return { documents, records: records as HighlightRecord[] };
}

/** A thread's link result, checked; anything else is a malformed reply. */
function linkReply(result: Reply): LinkedDocument {
  if (
    !result ||
    typeof result !== 'object' ||
    !isStrings(result['consulted']) ||
    !(
      (typeof result['html'] === 'string' && Array.isArray(result['searchRecords'])) ||
      typeof result['failed'] === 'string'
    )
  )
    throw new Error('Malformed link reply');
  return result as unknown as LinkedDocument;
}

function withoutMismatches(document: RenderedDocument): unknown {
  const { mismatches: _ignored, ...rest } = document;
  return rest;
}

/** Where two JSON values differ first, as a short path, or undefined when they are equal. */
function differenceOf(left: unknown, right: unknown, at: string = '$'): string | undefined {
  if (JSON.stringify(left) === JSON.stringify(right)) return undefined;
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
    for (const key of keys) {
      const found = differenceOf(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        Array.isArray(left) ? `${at}[${key}]` : `${at}.${key}`,
      );
      if (found) return found;
    }
  }
  return at;
}
