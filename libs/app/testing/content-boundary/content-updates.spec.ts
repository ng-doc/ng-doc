import { ViewportScroller } from '@angular/common';
import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  Injector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocContentController } from '@ng-doc/app/classes/content-controller';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPageComponent } from '@ng-doc/app/components/page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { ɵNG_DOC_CONTENT_UPDATE_EVENT } from '@ng-doc/app/constants';
import {
  ɵlistenNgDocContentUpdates,
  ɵloadNgDocContent,
  ɵpeekNgDocContent,
  ɵpendingNgDocContent,
  ɵpreloadNgDocContent,
  ɵupdatedNgDocContent,
  ɵwatchNgDocContentUpdates,
} from '@ng-doc/app/helpers';
import { NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import type { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

let ids = 0;

/** A content id no other test uses: updates are kept for the life of the page. */
function uniqueId(): string {
  return `content-${++ids}`;
}

function payload(id: string, html: string): NgDocContentModule {
  return { schemaVersion: 1, id, revision: html, html };
}

/**
 * Dispatches a content update as the Vite development client does.
 * @param detail - The event detail.
 * @returns Whether the page applied it (cancelled the event).
 */
function dispatch(detail: unknown): boolean {
  return !window.dispatchEvent(
    new CustomEvent(ɵNG_DOC_CONTENT_UPDATE_EVENT, { cancelable: true, detail }),
  );
}

describe('development content updates', () => {
  beforeEach(() => ɵlistenNgDocContentUpdates(window));

  it('applies a readable update once per window, keeps its payloads and tells every watcher', () => {
    // Listening again adds no second listener.
    ɵlistenNgDocContentUpdates(window);
    ɵlistenNgDocContentUpdates(null);
    const id = uniqueId();
    const changes: unknown[] = [];
    const stop = ɵwatchNgDocContentUpdates((change) => changes.push(change));

    expect(dispatch({ payloads: [payload(id, '<p>New</p>')], search: true })).toBe(true);
    stop();
    expect(dispatch({ payloads: [payload(id, '<p>Newer</p>')], search: false })).toBe(true);

    expect(changes).toEqual([{ ids: new Set([id]), search: true }]);
    expect(ɵupdatedNgDocContent(id)?.html).toBe('<p>Newer</p>');
  });

  it('leaves an update it cannot read to the client, which reloads the page', () => {
    const id = uniqueId();
    const listener = vi.fn();
    const stop = ɵwatchNgDocContentUpdates(listener);

    for (const detail of [
      undefined,
      null,
      'text',
      { payloads: 'none', search: false },
      { payloads: [], search: 'yes' },
      { payloads: [{ ...payload(id, 'x'), schemaVersion: 2 }], search: false },
      { payloads: [{ schemaVersion: 1, id, revision: 'r' }], search: false },
      { payloads: [null], search: false },
    ]) {
      expect(dispatch(detail)).toBe(false);
    }
    stop();

    expect(listener).not.toHaveBeenCalled();
    expect(ɵupdatedNgDocContent(id)).toBeUndefined();
  });

  it('keeps applying an update when a watcher throws, and reports the error', () => {
    vi.useFakeTimers();
    try {
      const id = uniqueId();
      const after = vi.fn();
      const stopFailing = ɵwatchNgDocContentUpdates(() => {
        throw new Error('watcher failed');
      });
      const stopAfter = ɵwatchNgDocContentUpdates(after);

      expect(dispatch({ payloads: [payload(id, 'x')], search: false })).toBe(true);
      stopFailing();
      stopAfter();

      expect(after).toHaveBeenCalledTimes(1);
      expect(() => vi.runAllTimers()).toThrow('watcher failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('serves the updated payload to every later load and preload of the source', async () => {
    const id = uniqueId();
    const load = vi.fn(async () => payload(id, '<p>Imported</p>'));
    const source: NgDocContentSource = { id, load };

    expect(await ɵpreloadNgDocContent(source)).toEqual(payload(id, '<p>Imported</p>'));
    expect(ɵpeekNgDocContent(source)?.html).toBe('<p>Imported</p>');

    dispatch({ payloads: [payload(id, '<p>Updated</p>')], search: false });

    // The browser keeps the module it imported first; the update replaces it from now on.
    expect(ɵpeekNgDocContent(source)?.html).toBe('<p>Updated</p>');
    expect(ɵpendingNgDocContent(source)).toBeUndefined();
    expect((await ɵpreloadNgDocContent(source)).html).toBe('<p>Updated</p>');
    expect((await ɵpreloadNgDocContent(source)).html).toBe('<p>Updated</p>');
    expect((await ɵloadNgDocContent(source, new AbortController().signal)).html).toBe(
      '<p>Updated</p>',
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('starts a preload of an updated source with the update, before any load', async () => {
    const id = uniqueId();
    const load = vi.fn(async () => payload(id, 'stale'));
    const source: NgDocContentSource = { id, load };

    dispatch({ payloads: [payload(id, 'fresh')], search: false });

    expect(ɵpendingNgDocContent(source)).toBeUndefined();
    expect((await ɵpreloadNgDocContent(source)).html).toBe('fresh');
    expect(load).not.toHaveBeenCalled();
  });

  it('renders the update of a connected source at once and ignores other sources', async () => {
    const id = uniqueId();
    const load = vi.fn(async () => payload(id, '<p>First</p>'));
    const controller = TestBed.runInInjectionContext(() => new NgDocContentController());

    controller.connect({ id, load });
    await vi.waitFor(() => expect(controller.html()).toBe('<p>First</p>'));
    const version = controller.version();

    dispatch({ payloads: [payload(uniqueId(), '<p>Other</p>')], search: false });
    expect(controller.version()).toBe(version);

    dispatch({ payloads: [payload(id, '<p>Second</p>')], search: false });
    expect(controller.html()).toBe('<p>Second</p>');
    expect(controller.version()).toBe(version + 1);
    expect(controller.loadedVersion()).toBe(version + 1);
    controller.processed(version + 1);
    expect(controller.settled()).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);

    controller.disconnect();
    dispatch({ payloads: [payload(id, '<p>Third</p>')], search: false });
    expect(controller.html()).toBe('');
  });

  it('still reports a source whose subscribe fails, and stops listening for its updates', () => {
    const id = uniqueId();
    const controller = TestBed.runInInjectionContext(() => new NgDocContentController());

    controller.connect({
      id,
      load: async () => payload(id, 'x'),
      subscribe: () => {
        throw new Error('subscribe failed');
      },
    });
    expect(controller.error()?.message).toBe('subscribe failed');

    controller.disconnect();
    dispatch({ payloads: [payload(id, '<p>Ignored</p>')], search: false });
    expect(controller.html()).toBe('');
  });

  it('stops both the update watch and the source subscription when it disconnects', () => {
    const id = uniqueId();
    const unsubscribe = vi.fn();
    const controller = TestBed.runInInjectionContext(() => new NgDocContentController());

    controller.connect({ id, load: async () => payload(id, 'x'), subscribe: () => unsubscribe });
    controller.disconnect();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    dispatch({ payloads: [payload(id, '<p>Ignored</p>')], search: false });
    expect(controller.html()).toBe('');
  });
});

describeChangeDetection('NgDocPageComponent and development content updates', ({ providers }) => {
  let ref: ComponentRef<NgDocPageComponent> | undefined;
  const scrolled: Array<[number, number]> = [];
  let position: [number, number] = [0, 0];

  beforeEach(() => {
    scrolled.length = 0;
    position = [0, 0];
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([]),
        { provide: NG_DOC_PAGE_SKELETON, useValue: {} },
        {
          provide: ViewportScroller,
          useValue: {
            getScrollPosition: () => position,
            scrollToPosition: (value: [number, number]) => scrolled.push(value),
            setOffset: () => undefined,
            scrollToAnchor: () => undefined,
            setHistoryScrollRestoration: () => undefined,
          },
        },
      ],
    });
  });

  afterEach(() => {
    ref?.destroy();
    ref = undefined;
  });

  async function settle(application: ApplicationRef): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await application.whenStable();
      await new Promise((done) => setTimeout(done));
    }
  }

  async function page(id: string, html: string): Promise<ApplicationRef> {
    const source: NgDocContentSource = { id, load: async () => payload(id, html) };
    const rootPage = { pageType: 'guide', pageContent: '', pageContentSource: source };
    const wrapper = { pageToc: () => ({ clear: () => undefined }) };

    ref = createComponent(NgDocPageComponent, {
      environmentInjector: TestBed.inject(EnvironmentInjector),
      elementInjector: Injector.create({
        providers: [
          { provide: NgDocRootPage, useValue: rootPage },
          { provide: NgDocPageWrapperComponent, useValue: wrapper },
        ],
      }),
    });
    const application = TestBed.inject(ApplicationRef);

    application.attachView(ref.hostView);
    await settle(application);

    return application;
  }

  const body = (): string =>
    ref?.location.nativeElement.querySelector('.ng-doc-page-wrapper')?.textContent ?? '';

  it('renders the new content in place and keeps the reader where they were', async () => {
    const id = uniqueId();
    const application = await page(id, '<h2 id="intro">Intro</h2><p>Old text.</p>');

    expect(body()).toContain('Old text.');
    position = [0, 420];
    expect(
      dispatch({ payloads: [payload(id, '<h2 id="intro">Intro</h2><p>New.</p>')], search: false }),
    ).toBe(true);
    // The position is taken when the update arrives, before the new HTML replaces the old one.
    position = [0, 0];
    await settle(application);

    expect(body()).toContain('New.');
    expect(body()).not.toContain('Old text.');
    expect(scrolled).toEqual([[0, 420]]);
  });

  it('keeps the position untouched for an update of other content or of the same HTML', async () => {
    const id = uniqueId();
    const application = await page(id, '<p>Same.</p>');

    position = [0, 300];
    dispatch({ payloads: [payload(uniqueId(), '<p>Other page.</p>')], search: false });
    dispatch({ payloads: [payload(id, '<p>Same.</p>')], search: false });
    await settle(application);

    expect(body()).toContain('Same.');
    expect(scrolled).toEqual([]);
  });
});
