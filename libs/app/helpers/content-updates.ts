import { ɵNG_DOC_CONTENT_UPDATE_EVENT } from '@ng-doc/app/constants';
import type { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';

/**
 * The detail of an `ɵNG_DOC_CONTENT_UPDATE_EVENT` (`@ng-doc/app/constants`).
 * @internal
 */
export interface ɵNgDocContentUpdate {
  /** The new payload of every changed content module the page may have loaded. */
  readonly payloads: readonly unknown[];
  /** Whether the search index changed too. */
  readonly search: boolean;
}

/**
 * What an update tells the code that shows content.
 * @internal
 */
export interface ɵNgDocContentChange {
  /** The ids of the content modules that changed. */
  readonly ids: ReadonlySet<string>;
  /** Whether the search index changed. */
  readonly search: boolean;
}

/**
 * The newest payload of every content module an update changed, by id. A browser keeps the module
 * it imported first for as long as the page lives, so a later load of the same source (a page
 * opened after the update, a link preload) takes the payload from here instead.
 */
const updated = new Map<string, NgDocContentModule>();
const listeners = new Set<(change: ɵNgDocContentChange) => void>();
const listening = new WeakSet<object>();

/**
 * Applies the content updates of the Vite development host in this window. Every NgDoc content
 * controller calls it in the browser; it listens once per window. Nothing dispatches the event
 * outside the development host, so it is inert in production builds, and Angular's production
 * mode (`ngDevMode` false) skips it altogether.
 * @param view - The window, if any (none on the server).
 * @internal
 */
export function ɵlistenNgDocContentUpdates(view: Window | null | undefined): void {
  if ((typeof ngDevMode !== 'undefined' && !ngDevMode) || !view || listening.has(view)) return;
  listening.add(view);
  view.addEventListener(ɵNG_DOC_CONTENT_UPDATE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    const payloads = contentPayloads(detail);

    // Anything this runtime cannot read is left to the client, which reloads the page.
    if (!payloads) return;
    event.preventDefault();
    for (const payload of payloads) updated.set(payload.id, payload);
    const change: ɵNgDocContentChange = {
      ids: new Set(payloads.map((payload) => payload.id)),
      search: (detail as ɵNgDocContentUpdate).search === true,
    };
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch (error) {
        // One failing consumer must not keep the others on stale content.
        reportError(view, error);
      }
    }
  });
}

/**
 * Calls `listener` with every content update applied in this window.
 * @param listener - The listener.
 * @returns A function that stops it.
 * @internal
 */
export function ɵwatchNgDocContentUpdates(
  listener: (change: ɵNgDocContentChange) => void,
): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/**
 * The newest payload an update delivered for a content module.
 * @param id - The content module id.
 * @returns The payload, or `undefined` when no update changed the module.
 * @internal
 */
export function ɵupdatedNgDocContent(id: string): NgDocContentModule | undefined {
  return updated.get(id);
}

/**
 * Loads a content source: its newest updated payload, if an update delivered one, or the source.
 * @param source - The content source.
 * @param signal - Aborts the load.
 * @returns The payload.
 * @internal
 */
export function ɵloadNgDocContent(
  source: NgDocContentSource,
  signal: AbortSignal,
): Promise<NgDocContentModule> {
  const payload = updated.get(source.id);

  return payload ? Promise.resolve(payload) : source.load(signal);
}

/**
 * The payloads of an update, or `undefined` when it is not one this runtime can apply.
 * @param detail - The event detail.
 */
function contentPayloads(detail: unknown): NgDocContentModule[] | undefined {
  if (typeof detail !== 'object' || detail === null) return undefined;
  const { payloads, search } = detail as Partial<ɵNgDocContentUpdate>;

  if (!Array.isArray(payloads) || typeof search !== 'boolean') return undefined;

  return payloads.every(isContentModule) ? (payloads as NgDocContentModule[]) : undefined;
}

/**
 * Whether a value is a content module payload.
 * @param value - The value.
 */
function isContentModule(value: unknown): value is NgDocContentModule {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Partial<NgDocContentModule>;

  return (
    payload.schemaVersion === 1 &&
    typeof payload.id === 'string' &&
    typeof payload.revision === 'string' &&
    typeof payload.html === 'string'
  );
}

/**
 * Reports a listener's error without stopping the update.
 * @param view - The window.
 * @param error - The error.
 */
function reportError(view: Window, error: unknown): void {
  view.setTimeout(() => {
    throw error;
  });
}
