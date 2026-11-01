import path from 'node:path';
import type { HtmlTagDescriptor, ViteDevServer, WebSocketClient } from 'vite';

import { flagOff, VITE_CONTENT_UPDATE_FLAG } from '../kernel/flags';
import type { AnnouncedChange } from './host-updates';

/** The custom HMR event that carries a content update to the NgDoc client of a page. */
export const CONTENT_UPDATE_EVENT = 'ng-doc:content-update';
/** The custom HMR event a page's NgDoc client sends once it listens for content updates. */
export const CONTENT_CLIENT_EVENT = 'ng-doc:content-client';
/** The version of the content update messages; a client announces the version it reads. */
export const CONTENT_UPDATE_VERSION = 1;

/** A content update as the server sends it to a client. */
export interface ContentUpdateMessage {
  readonly version: typeof CONTENT_UPDATE_VERSION;
  /** The URLs to import the changed content modules from, each with a fresh timestamp. */
  readonly modules: readonly string[];
  /** Whether the search index changed. */
  readonly search: boolean;
}

/** What a content-only publication changed. */
export interface ContentChanges {
  /** The changed content modules (`*.content.mjs`), absolute, in path order. */
  readonly modules: readonly string[];
  /** Whether the search index changed. */
  readonly search: boolean;
}

/**
 * The page's NgDoc development client, a module script Vite serves with a hot context. It imports
 * the changed content modules again and hands their payloads to the NgDoc runtime as a cancelable
 * window event (`@ng-doc/app`'s `ɵNG_DOC_CONTENT_UPDATE_EVENT`, the same name). The runtime
 * cancels it once it applied them; otherwise (no NgDoc runtime on the page, a payload it cannot
 * read) and on any failure the client reloads the page, as it did before. Updates apply one at a
 * time, in the order they arrive.
 */
export const CONTENT_UPDATE_CLIENT = `
const hot = import.meta.hot;
if (hot) {
  let queue = Promise.resolve();
  hot.on(${JSON.stringify(CONTENT_UPDATE_EVENT)}, (update) => {
    queue = queue.then(async () => {
      try {
        const payloads = await Promise.all(
          update.modules.map(async (url) => (await import(/* @vite-ignore */ url)).default),
        );
        const event = new CustomEvent(${JSON.stringify(CONTENT_UPDATE_EVENT)}, {
          cancelable: true,
          detail: { payloads, search: update.search },
        });
        if (window.dispatchEvent(event)) location.reload();
      } catch (error) {
        console.error('[ng-doc] The content update failed; reloading the page.', error);
        location.reload();
      }
    });
  });
  hot.send(${JSON.stringify(CONTENT_CLIENT_EVENT)}, { version: ${CONTENT_UPDATE_VERSION} });
}
`;

/** Marks the client script, so a document that already carries it does not get it twice. */
const CLIENT_MARKER = 'data-ng-doc-content-updates';

/**
 * The tag that adds the NgDoc development client to a page the development server serves.
 * Vite turns an inline module script into a module of its own, with a hot context.
 * @param html The page.
 * @returns The tag, or none when the page carries the client or the switch is off.
 */
export function contentUpdateClientTags(html: string): HtmlTagDescriptor[] {
  if (!contentUpdatesEnabled() || html.includes(CLIENT_MARKER)) return [];
  return [
    {
      tag: 'script',
      attrs: { type: 'module', [CLIENT_MARKER]: '' },
      children: CONTENT_UPDATE_CLIENT,
      injectTo: 'head',
    },
  ];
}

/** Whether content updates are on (`NGDOC_VITE_CONTENT_UPDATE`). */
export function contentUpdatesEnabled(): boolean {
  return !flagOff(VITE_CONTENT_UPDATE_FLAG);
}

/**
 * What a reload announces, when it changes only content: every changed file is an existing
 * content module (`*.content.mjs`) whose bytes changed, the search index or the keyword map
 * (which no page reads). Anything else (a TypeScript module, a created or deleted file, another
 * asset, the API lists) takes a full reload.
 * @param changes The files that differ from the last announcement.
 * @param assetDirectory The asset directory, relative to the output root.
 * @returns The content changes, or `undefined` for a full reload.
 */
export function contentOnly(
  changes: readonly AnnouncedChange[] | undefined,
  assetDirectory: string,
): ContentChanges | undefined {
  if (!changes?.length) return undefined;
  // As the outputs name it (`joinOutput` in `outputs/index.ts`).
  const keywords = path.posix.join(assetDirectory.replace(/\\/g, '/'), 'keywords.json');
  const modules: string[] = [];
  let search = false;
  for (const change of changes) {
    const { before, after } = change;
    if (!before || !after || before.role !== after.role) return undefined;
    if (after.role === 'content' && change.path.endsWith('.content.mjs')) {
      modules.push(change.file);
    } else if (after.role === 'search') {
      search = true;
    } else if (!(after.role === 'asset' && change.path === keywords)) {
      return undefined;
    }
  }
  return { modules, search };
}

/**
 * Sends a content update. Each client that announced its NgDoc client gets the changed content
 * modules it may have loaded (those in the client module graph: a module nobody imported loads
 * afresh anyway); every other client reloads, as before. Without any client the reload is sent
 * as Vite buffers it, so a page that connects later reloads.
 * @param server The development server.
 * @param clients The clients that announced the NgDoc client.
 * @param changes The content changes.
 * @param timestamp A timestamp no earlier update used, so the browser imports new modules.
 */
export function sendContentUpdate(
  server: ViteDevServer,
  clients: WeakSet<WebSocketClient>,
  changes: ContentChanges,
  timestamp: number,
): void {
  // A server without a client list (a test double) has no page to update in place.
  const connected = [...(server.ws.clients ?? [])];
  if (connected.length === 0) {
    server.ws.send({ type: 'full-reload' });
    return;
  }
  const graph = server.environments['client']?.moduleGraph;
  const urls = new Set<string>();
  for (const file of changes.modules) {
    for (const module of graph?.getModulesByFile(file) ?? []) urls.add(module.url);
  }
  const base = server.config.base.endsWith('/') ? server.config.base : `${server.config.base}/`;
  const message: ContentUpdateMessage = {
    version: CONTENT_UPDATE_VERSION,
    modules: [...urls]
      .sort()
      .map(
        (url) => `${base}${url.replace(/^\//, '')}${url.includes('?') ? '&' : '?'}t=${timestamp}`,
      ),
    search: changes.search,
  };
  for (const client of connected) {
    if (clients.has(client)) client.send(CONTENT_UPDATE_EVENT, message);
    else client.send({ type: 'full-reload' });
  }
}
