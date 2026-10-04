import {
  DestroyRef,
  inject,
  Injectable,
  PendingTasks,
  signal,
  WritableSignal,
} from '@angular/core';
import { ɵforgetNgDocContent, ɵpeekNgDocContent, ɵpendingNgDocContent } from '@ng-doc/app/helpers';
import { NgDocContentState } from '@ng-doc/app/services/content-state';
import type { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';

/** A failed processing pass of one content version. */
export interface NgDocContentRenderFailure {
  /** The content version the pass rendered. */
  readonly version: number;
  /** The error the pass failed with. */
  readonly error: unknown;
}

/**
 * Owns one body or header content source for one component instance. Provide it in the
 * component's `providers`; it holds a pending task from each load until the processors accept
 * the loaded HTML.
 */
@Injectable()
export class NgDocContentController {
  /** The loaded HTML. */
  readonly html: WritableSignal<string> = signal('');
  /** Increments whenever the HTML must be processed again. */
  readonly version: WritableSignal<number> = signal(0);
  /** The load or processing error of the current source. */
  readonly error: WritableSignal<Error | undefined> = signal(undefined);
  /**
   * Whether the latest load of the current source has been rendered: its version was processed,
   * or the load or its processing failed. False while a load or its processing is pending.
   */
  readonly settled: WritableSignal<boolean> = signal(false);
  /**
   * The version of the latest loaded content of the current source, or undefined before the
   * first load. A processing pass of this version renders loaded content.
   * @internal
   */
  readonly loadedVersion: WritableSignal<number | undefined> = signal(undefined);

  private readonly pendingTasks = inject(PendingTasks);
  private readonly contentState = inject(NgDocContentState);

  private readonly owner = {};
  private source?: NgDocContentSource;
  private unsubscribe?: () => void;
  private abort?: AbortController;
  private pending?: {
    readonly request: number;
    readonly release: () => void;
    awaitingVersion?: number;
  };
  private request = 0;
  private sourceEpoch = 0;
  private renderState: { version: number; status: 'pending' | 'complete' | 'failed' } = {
    version: 0,
    status: 'pending',
  };
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.destroy());
  }

  /**
   * Loads the source and reloads it whenever the source reports a change. Connecting the
   * connected source again does nothing.
   * @param source - The content source.
   */
  connect(source: NgDocContentSource): void {
    if (this.destroyed || this.source === source) return;

    const previousId = this.source?.id;
    this.cancelCurrent();
    this.unsubscribeCurrent();
    const sourceEpoch = ++this.sourceEpoch;
    this.source = source;
    this.loadedVersion.set(undefined);
    if (previousId !== undefined && previousId !== source.id) {
      this.html.set('');
      this.version.update((version) => version + 1);
      this.renderState = { version: this.version(), status: 'pending' };
    }
    this.contentState.clear(this.owner);
    this.error.set(undefined);

    try {
      this.unsubscribe = source.subscribe?.(() => {
        if (this.source !== source || this.sourceEpoch !== sourceEpoch) return;
        // The source has a new revision, so a preloaded payload is stale.
        ɵforgetNgDocContent(source);
        this.reload(false);
      });
    } catch (error) {
      this.fail(source.id, error);
      return;
    }
    this.reload(true);
  }

  /** Drops the current source and clears the HTML. */
  disconnect(): void {
    if (this.destroyed || !this.source) return;
    this.cancelCurrent();
    this.sourceEpoch++;
    this.unsubscribeCurrent();
    this.source = undefined;
    this.loadedVersion.set(undefined);
    this.settled.set(false);
    this.contentState.clear(this.owner);
    this.error.set(undefined);
    if (this.html()) {
      this.html.set('');
      this.version.update((version) => version + 1);
      this.renderState = { version: this.version(), status: 'pending' };
    }
  }

  /**
   * Accepts a processing pass. Only the pass of the current version counts.
   * @param version - The content version the pass rendered.
   */
  processed(version: number): void {
    if (version !== this.version()) return;
    this.renderState = { version, status: 'complete' };
    if (this.pending?.awaitingVersion === version) this.settle(this.pending.request);
  }

  /**
   * Reports a failed processing pass. Only a failure of the current version counts.
   * @param failure - The version and the error.
   */
  processingFailed(failure: NgDocContentRenderFailure): void {
    if (failure.version !== this.version() || !this.source) return;
    this.renderState = { version: failure.version, status: 'failed' };
    if (this.pending?.awaitingVersion !== failure.version) return;
    this.fail(this.source.id, failure.error);
  }

  /** Cancels the current load and releases its pending task. Called on destroy. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.request++;
    this.sourceEpoch++;
    this.abort?.abort();
    this.abort = undefined;
    try {
      this.unsubscribeCurrent();
    } finally {
      this.finishPending();
      this.contentState.clear(this.owner);
    }
  }

  /**
   * Loads the current source.
   * @param preloaded - Whether a payload that was preloaded for the source (by the route resolver
   * or by link preloading) may be used. It is applied at once, so the first render of the
   * component already shows the content instead of an empty page.
   */
  private reload(preloaded: boolean): void {
    const source = this.source;
    if (!source || this.destroyed) return;

    this.cancelCurrent();
    this.settled.set(false);
    const request = ++this.request;
    const abort = new AbortController();
    this.abort = abort;
    this.pending = { request, release: once(this.pendingTasks.add()) };

    const payload = preloaded ? ɵpeekNgDocContent(source) : undefined;

    if (payload) {
      try {
        this.apply(validatePayload(payload, source.id), request);
      } catch (error) {
        this.fail(source.id, error);
      }
      return;
    }
    // A page that opened before its preload finished (the router stopped waiting) waits for the
    // same load instead of starting a second one.
    void this.load(
      source,
      request,
      abort.signal,
      preloaded ? ɵpendingNgDocContent(source) : undefined,
    );
  }

  private async load(
    source: NgDocContentSource,
    request: number,
    signal: AbortSignal,
    pending?: Promise<NgDocContentModule>,
  ): Promise<void> {
    try {
      const payload = validatePayload(await (pending ?? source.load(signal)), source.id);
      if (!this.isCurrent(source, request, signal)) return;

      this.apply(payload, request);
    } catch (error) {
      if (!this.isCurrent(source, request, signal)) return;
      this.fail(source.id, error);
    }
  }

  private apply(payload: NgDocContentModule, request: number): void {
    this.contentState.clear(this.owner);
    this.error.set(undefined);
    if (payload.html === this.html()) {
      if (this.renderState.version !== this.version() || this.renderState.status === 'failed') {
        this.version.update((version) => version + 1);
        this.renderState = { version: this.version(), status: 'pending' };
        this.loadedVersion.set(this.version());
        if (this.pending?.request === request) this.pending.awaitingVersion = this.version();
      } else if (this.renderState.status === 'complete') {
        // The loaded content is already on the page (for example an empty body).
        this.loadedVersion.set(this.version());
        this.settle(request);
      } else {
        this.loadedVersion.set(this.version());
        if (this.pending?.request === request) this.pending.awaitingVersion = this.version();
      }
      return;
    }

    this.html.set(payload.html);
    this.version.update((version) => version + 1);
    this.loadedVersion.set(this.version());
    this.renderState = { version: this.version(), status: 'pending' };
    if (this.pending?.request === request) this.pending.awaitingVersion = this.version();
  }

  private isCurrent(source: NgDocContentSource, request: number, signal: AbortSignal): boolean {
    return !this.destroyed && !signal.aborted && this.source === source && this.request === request;
  }

  private fail(contentId: string, error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.contentState.report(this.owner, { contentId, error });
    this.error.set(normalized);
    this.finishPending();
    this.settled.set(true);
  }

  private settle(request: number): void {
    if (this.pending?.request !== request) return;
    this.finishPending(request);
    this.settled.set(true);
  }

  private cancelCurrent(): void {
    this.request++;
    this.abort?.abort();
    this.abort = undefined;
    this.finishPending();
  }

  private finishPending(request?: number): void {
    if (!this.pending || (request !== undefined && this.pending.request !== request)) return;
    this.pending.release();
    this.pending = undefined;
  }

  private unsubscribeCurrent(): void {
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    try {
      unsubscribe?.();
    } catch {
      // Cleanup cannot keep an application unstable or revive an obsolete source.
    }
  }
}

/**
 * Checks that a loaded content module has the expected shape and id.
 * @param payload - The loaded value.
 * @param expectedId - The id of the source that loaded it.
 * @returns The payload, typed.
 */
export function validatePayload(payload: unknown, expectedId: string): NgDocContentModule {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('schemaVersion' in payload) ||
    payload.schemaVersion !== 1 ||
    !('id' in payload) ||
    payload.id !== expectedId ||
    !('revision' in payload) ||
    typeof payload.revision !== 'string' ||
    !('html' in payload) ||
    typeof payload.html !== 'string'
  ) {
    throw new Error(`Invalid NgDoc content payload for "${expectedId}".`);
  }
  return payload as NgDocContentModule;
}

/**
 * Wraps a callback so that only its first call runs.
 * @param callback - The callback.
 * @returns The wrapped callback.
 */
function once(callback: () => void): () => void {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    callback();
  };
}
