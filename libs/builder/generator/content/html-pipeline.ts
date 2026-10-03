import { type NodeContent, parseFile } from '@orama/plugin-parsedoc';

import type { ContentAnchor, KeywordExport, SearchRecord } from '../contracts';
import { digestOf } from '../kernel/canonical';
import { decode, encode } from '../worker/protocol';
import type { HighlightBlock } from './highlight-cache';

/**
 * The back half of content compilation: the HTML pipeline of `@ng-doc/utils` (process, post-process,
 * keyword replacement, indexable content and search records). It is a pure function of strings and
 * JSON values: it reads no file, no program and no user value, and records no dependency, so the
 * same code runs in the main thread and in a render thread (`./html-worker`, `./html-pool`), and
 * both give the same result for the same input. Only the code-block highlight cache is state, and a
 * cache hit gives the same HTML as a miss (`./highlight-cache`).
 *
 * Everything that reaches this module from a thread crosses as `encode`d JSON text
 * (`worker/protocol`); the thread files import nothing but this module, `@ng-doc/utils`, the
 * search parser, the digest and the protocol (the `source-boundaries` check).
 */

/** The `@ng-doc/utils` pipeline, as the generator calls it. */
interface HtmlUtilities {
  processHtml(
    html: string,
    config: {
      headings?: string[];
      route?: string;
      lightTheme?: string;
      darkTheme?: string;
      highlight?: PipelineHighlight;
    },
  ): Promise<{ content: string; anchors: ContentAnchor[]; error?: unknown }>;
  postProcessHtml(
    html: string,
  ): Promise<{ content: string; usedKeywords: string[]; error?: unknown }>;
  replaceKeywords(html: string, config: { getKeyword(key: string): unknown }): Promise<string>;
  removeNotIndexableContent(html: string): Promise<string>;
}

export const htmlUtilities = () => import('@ng-doc/utils') as Promise<HtmlUtilities>;

/** The highlight cache of one `processHtml` call (`HighlightCall` of `./highlight-cache`). */
export interface PipelineHighlight {
  key(block: HighlightBlock): string;
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  loads(themes: HighlightBlock['themes']): boolean;
  readonly verify: boolean;
  mismatch(key: string): void;
  readonly mismatches: readonly string[];
}

/** One HTML document of a render task: one `processHtml` and one `postProcessHtml` call. */
export interface RenderDocument {
  readonly html: string;
  readonly route?: string;
  /** The configured anchor headings; absent for a demo asset, which takes none. */
  readonly headings?: string[];
}

/** The back half of one IR: its documents, processed in order until the first one fails. */
export interface RenderTask {
  readonly documents: readonly RenderDocument[];
  readonly themes: { readonly light: string; readonly dark: string };
}

/**
 * What processing one document gave. `mismatches` counts the cached code blocks that `verify`
 * found to differ (reported before any failure, as the content compiler always did).
 */
export type RenderedDocument = (
  | {
      readonly html: string;
      readonly anchors: ContentAnchor[];
      readonly usedKeywords: string[];
      readonly mismatches: number;
    }
  | {
      readonly failed: 'process' | 'post-process';
      readonly message: string;
      readonly mismatches: number;
    }
  | { readonly aborted: true; readonly mismatches: number }
) &
  ParallelCheck;

/**
 * `NGDOC_PARALLEL_RENDER=verify`: where a task's thread result differed from the main thread's,
 * which is used (on the first document of a render task).
 */
export interface ParallelCheck {
  readonly differs?: string;
}

/** The back half of linking one IR. */
export interface LinkTask {
  readonly html: string;
  readonly title: string;
  readonly absoluteRoute: string;
  readonly breadcrumbs: string[];
  readonly pageType: 'guide' | 'api';
}

/** What linking one IR gave; `consulted` lists every key it looked up, in lookup order. */
export type LinkedDocument = (
  | { readonly html: string; readonly searchRecords: SearchRecord[] }
  | { readonly failed: string }
  | { readonly aborted: true }
) & { readonly consulted: string[] } & ParallelCheck;

const notAborted = () => false;

/**
 * Processes a task's documents in order and stops after the first that does not succeed, as the
 * content compiler always did: a demo asset that fails ends its IR. `highlight` gives each document
 * its own highlight cache call; `aborted` is checked between the steps (only the main thread has
 * the signal: a thread's result is checked once it arrives).
 */
export async function renderDocuments(
  task: RenderTask,
  highlight: () => PipelineHighlight | undefined,
  aborted: () => boolean = notAborted,
): Promise<RenderedDocument[]> {
  const results: RenderedDocument[] = [];
  for (const document of task.documents) {
    const result = await renderDocument(document, task.themes, highlight, aborted);
    results.push(result);
    if (!('html' in result)) break;
  }
  return results;
}

async function renderDocument(
  document: RenderDocument,
  themes: RenderTask['themes'],
  highlight: () => PipelineHighlight | undefined,
  aborted: () => boolean,
): Promise<RenderedDocument> {
  if (aborted()) return { aborted: true, mismatches: 0 };
  const utilities = await htmlUtilities();
  if (aborted()) return { aborted: true, mismatches: 0 };
  const call = highlight();
  const result = await utilities.processHtml(document.html, {
    ...('headings' in document ? { headings: document.headings } : {}),
    ...(document.route === undefined ? {} : { route: document.route }),
    lightTheme: themes.light,
    darkTheme: themes.dark,
    ...(call ? { highlight: call } : {}),
  });
  const mismatches = call?.mismatches.length ?? 0;
  if (result.error) return { failed: 'process', message: String(result.error), mismatches };
  if (aborted()) return { aborted: true, mismatches };
  const post = await utilities.postProcessHtml(result.content);
  if (post.error) return { failed: 'post-process', message: String(post.error), mismatches };
  if (aborted()) return { aborted: true, mismatches };
  return {
    html: post.content,
    anchors: result.anchors.map(normalizeAnchor),
    usedKeywords: post.usedKeywords,
    mismatches,
  };
}

/**
 * Links one IR: replaces its keywords, removes what is not indexable and builds its search records.
 * Every key the keyword plugin looks up goes to `consulted`, before any branch on its binding.
 */
export async function linkDocument(
  task: LinkTask,
  getKeyword: (key: string) => KeywordExport | undefined,
  aborted: () => boolean = notAborted,
): Promise<LinkedDocument> {
  const consulted: string[] = [];
  const seen = new Set<string>();
  try {
    const utilities = await htmlUtilities();
    const html = await utilities.replaceKeywords(task.html, {
      getKeyword: (key) => {
        if (!seen.has(key)) {
          seen.add(key);
          consulted.push(key);
        }
        return getKeyword(key);
      },
    });
    if (aborted()) return { aborted: true, consulted };
    const indexable = await utilities.removeNotIndexableContent(html);
    if (aborted()) return { aborted: true, consulted };
    const searchRecords = await buildSearchRecords(indexable, task);
    if (aborted()) return { aborted: true, consulted };
    return { html, searchRecords, consulted };
  } catch (error) {
    return { failed: String(error), consulted };
  }
}

/** The bindings of a keyword set by key; a later duplicate key wins, as in `new Map(...)`. */
export function bindingsOf(keywords: readonly KeywordExport[]): Map<string, KeywordExport> {
  return new Map(keywords.map((keyword) => [keyword.key, keyword]));
}

interface ParsedDocument {
  type: string;
  content: string;
  properties?: Record<string, unknown>;
}

/**
 * Search records are the parsed documents only. `populate` would also index every document
 * into a throw-away Orama database (tokenizing each one, in timer-separated batches) before
 * the records were read back in insertion order; `parseFile` returns the same records, in
 * the same order, without that index.
 */
async function buildSearchRecords(html: string, task: LinkTask): Promise<SearchRecord[]> {
  const documents: ParsedDocument[] = await parseFile(html, 'html', {
    transformFn: transformSearchNode,
    mergeStrategy: 'split',
  });
  const records: SearchRecord[] = [];
  let section: ParsedDocument | undefined;
  for (const document of documents) {
    if (!document?.content?.trim()) continue;
    if (isSearchHeading(document)) {
      section = document;
      continue;
    }
    const fragment = section?.properties?.['id'];
    records.push({
      breadcrumbs: task.breadcrumbs,
      pageType: task.pageType,
      title: task.title,
      section: section?.content ?? '',
      route: task.absoluteRoute,
      ...(typeof fragment === 'string' && fragment ? { fragment } : {}),
      content: document.content,
    });
  }
  return records;
}

function transformSearchNode(node: NodeContent): NodeContent {
  return ['strong', 'a', 'time', 'span', 'small', 'b', 'p', 'ul'].includes(node.tag)
    ? { ...node, raw: `<p>${node.content}</p>` }
    : node;
}

function isSearchHeading(document: ParsedDocument): boolean {
  return (
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(document.type) &&
    !!document.properties &&
    !!document.properties['id']
  );
}

function normalizeAnchor(anchor: ContentAnchor): ContentAnchor {
  return {
    anchorId: anchor.anchorId,
    anchor: anchor.anchor,
    title: anchor.title,
    type: anchor.type,
    ...(anchor.scope === undefined ? {} : { scope: anchor.scope }),
  };
}

/**
 * What one document's highlighting met, for the main thread to apply in plan order
 * (`HighlightSession.merge`): the keys it hit or highlighted, what it highlighted, and the keys
 * whose cached value `verify` found to differ.
 */
export interface HighlightRecord {
  used: string[];
  fresh: Array<[string, string]>;
  mismatched: string[];
}

/** Where a recording highlight cache reads and keeps entries. */
export interface HighlightStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  /** Whether the context's themes are known to load. */
  proven(): boolean;
  prove(): void;
}

/**
 * A highlight cache that records, per document, what it hit, highlighted and found to differ,
 * instead of deciding anything shared: a render thread (and the main thread when it renders out
 * of plan order) uses it, and the main thread merges the records in plan order, so what the
 * shared cache holds and which document reports a `verify` difference are those of a sequential
 * render, whatever ran where and when. `next` starts the record of the next document.
 */
export function recordingHighlight(
  settings: { context: string; verify: boolean },
  themes: RenderTask['themes'],
  store: HighlightStore,
): { next(): PipelineHighlight; records: HighlightRecord[] } {
  const records: HighlightRecord[] = [];
  return {
    records,
    next: () => {
      const record: HighlightRecord = { used: [], fresh: [], mismatched: [] };
      records.push(record);
      const mismatches: string[] = [];
      return {
        key: (block) => digestOf({ context: settings.context, block }),
        get: (key) => {
          const value = store.get(key);
          if (value !== undefined) record.used.push(key);
          return value;
        },
        set: (key, value) => {
          store.set(key, value);
          record.used.push(key);
          record.fresh.push([key, value]);
          store.prove();
        },
        loads: (requested) =>
          requested.light === themes.light && requested.dark === themes.dark && store.proven(),
        verify: settings.verify,
        mismatch: (key) => {
          mismatches.push(key);
          record.mismatched.push(key);
        },
        mismatches,
      };
    },
  };
}

/** A port a render thread receives jobs on and replies through (`parentPort`, or a test channel). */
export interface ThreadPort {
  on(event: 'message', listener: (value: unknown) => void): unknown;
  postMessage(value: string): void;
}

/** A tiny document whose processing loads the pipeline and sets the highlighter up. */
const WARM_DOCUMENT = '<pre><code class="language-ts">const warm = 1;</code></pre>';

/**
 * Serves render, link and warm-up jobs on `port`: the body of a render thread. Every message is
 * `encode`d JSON text both ways. A job replies `{ type: 'done', id, result }`, or
 * `{ type: 'failed', id, message }` when it could not run (the main thread then runs it itself).
 *
 * The thread keeps a copy of the main thread's highlighted blocks, which the main thread sends as
 * `highlight` messages (all of them after a reset, then the new ones), and reports what each render
 * hit (`used`) and highlighted (`fresh`), which the main thread merges in plan order. It keeps the
 * generation's keyword set, sent once as a `keywords` message and named by its number in each
 * link job.
 */
export function serveHtmlThread(port: ThreadPort): void {
  const entries = new Map<string, string>();
  /** The contexts whose themes are known to load in this thread (see `NgDocHighlightCache.loads`). */
  const proven = new Set<string>();
  let keywordSet: { id: number; bindings: Map<string, KeywordExport> } | undefined;
  const reply = (value: Record<string, unknown>): void => port.postMessage(encode(value));

  const render = async (job: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const task = job['task'] as RenderTask;
    const settings = job['highlight'] as { context: string; verify: boolean } | undefined;
    const recording = settings
      ? recordingHighlight(settings, task.themes, {
          get: (key) => entries.get(key),
          set: (key, value) => entries.set(key, value),
          proven: () => proven.has(settings.context),
          prove: () => proven.add(settings.context),
        })
      : undefined;
    const documents = await renderDocuments(task, () => recording?.next());
    return { documents, ...(recording ? { highlight: recording.records } : {}) };
  };

  const link = async (job: Record<string, unknown>): Promise<LinkedDocument> => {
    if (!keywordSet || keywordSet.id !== job['keywords'])
      throw new Error(`Unknown keyword set ${String(job['keywords'])}`);
    const bindings = keywordSet.bindings;
    return linkDocument(job['task'] as LinkTask, (key) => bindings.get(key));
  };

  port.on('message', (message) => {
    let id: unknown;
    void (async () => {
      try {
        const job = decode(message);
        id = job['id'];
        switch (job['type']) {
          case 'highlight': {
            if (job['reset'] === true) entries.clear();
            for (const [key, value] of job['entries'] as Array<[string, string]>)
              entries.set(key, value);
            if (job['proven'] === true) proven.add(job['context'] as string);
            return;
          }
          case 'keywords':
            keywordSet = {
              id: job['id'] as number,
              bindings: bindingsOf(job['keywords'] as KeywordExport[]),
            };
            return;
          case 'warm': {
            // A throw-away cache that always misses: the highlighter is set up, nothing is kept.
            const cache: PipelineHighlight = {
              key: () => '',
              get: () => undefined,
              set: () => undefined,
              loads: () => false,
              verify: false,
              mismatch: () => undefined,
              mismatches: [],
            };
            await renderDocuments(
              {
                documents: [{ html: WARM_DOCUMENT }],
                themes: job['themes'] as RenderTask['themes'],
              },
              () => (job['cache'] === true ? cache : undefined),
            );
            return;
          }
          case 'render':
            reply({ type: 'done', id, result: await render(job) });
            return;
          case 'link':
            reply({ type: 'done', id, result: await link(job) });
            return;
          default:
            throw new Error(`Unknown render thread job ${String(job['type'])}`);
        }
      } catch (error) {
        reply({ type: 'failed', id: id ?? null, message: String(error) });
      }
    })();
  });
}
