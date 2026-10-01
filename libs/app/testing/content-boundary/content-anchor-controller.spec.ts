import { DOCUMENT, ViewportScroller } from '@angular/common';
import {
  ApplicationRef,
  createEnvironmentInjector,
  ElementRef,
  EnvironmentInjector,
  EnvironmentProviders,
  PLATFORM_ID,
  Provider,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationStart, Router, Scroll } from '@angular/router';
import { NgDocContentAnchorController } from '@ng-doc/app/classes/content-anchor-controller';
import { provideNgDocApp } from '@ng-doc/app/providers/ng-doc-app';
import { NgDocContentScrollIntent } from '@ng-doc/app/services/content-scroll-intent';
import { NgDocContentState } from '@ng-doc/app/services/content-state';
import { NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
import {
  NG_DOC_CONTENT_ANCHOR_SCROLLING,
  NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION,
  NgDocContentScrollPositionRestoration,
} from '@ng-doc/app/tokens';
import { Subject } from 'rxjs';
import {
  type Mock,
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

// The change-detection providers of the mode the current block runs in.
let modeProviders: Array<Provider | EnvironmentProviders> = [];

interface Harness {
  readonly application: ApplicationRef;
  readonly whenStable: MockInstance<() => Promise<void>>;
  readonly controller: NgDocContentAnchorController;
  readonly events: Subject<unknown>;
  readonly host: HTMLElement;
  readonly router: {
    currentNavigation: Mock;
    events: Subject<unknown>;
    parseUrl: Mock;
    url: string;
  };
  resolveStable(): void;
  readonly viewport: {
    getScrollPosition: Mock<() => [number, number]>;
    scrollToAnchor: Mock<(anchor: string) => void>;
    scrollToPosition: Mock<(position: readonly [number, number]) => void>;
  };
  readonly wrapper: HTMLElement;
}

async function harness(
  options: {
    enabled?: boolean;
    initialAnchor?: string;
    platform?: unknown;
    restoration?: NgDocContentScrollPositionRestoration;
  } = {},
): Promise<Harness> {
  const events = new Subject<unknown>();
  const router = {
    currentNavigation: vi.fn(),
    events,
    parseUrl: vi.fn((url: string) => ({
      fragment: url.includes('#') ? decodeURIComponent(url.slice(url.indexOf('#') + 1)) : null,
    })),
    url: '/docs/guide#target',
  };
  const viewport = {
    getScrollPosition: vi.fn<() => [number, number]>(() => [0, 0]),
    scrollToAnchor: vi.fn<(anchor: string) => void>(),
    scrollToPosition: vi.fn<(position: readonly [number, number]) => void>(),
  };
  let resolveStable: () => void = () => undefined;
  const wrapper = document.createElement('ng-doc-page-wrapper');
  const host = document.createElement('ng-doc-page');
  wrapper.append(host);
  document.body.append(wrapper);

  await TestBed.configureTestingModule({
    providers: [
      ...modeProviders,
      NgDocContentAnchorController,
      { provide: DOCUMENT, useValue: document },
      { provide: ElementRef, useValue: new ElementRef(host) },
      { provide: NG_DOC_CONTENT_ANCHOR_SCROLLING, useValue: options.enabled ?? true },
      {
        provide: NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION,
        useValue: options.restoration ?? 'disabled',
      },
      { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
      { provide: Router, useValue: router },
      { provide: ViewportScroller, useValue: viewport },
    ],
  }).compileComponents();

  const application = TestBed.inject(ApplicationRef);
  const whenStable = vi.spyOn(application, 'whenStable').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveStable = resolve;
      }),
  );
  if (options.initialAnchor) {
    const url = `/docs/guide#${encodeURIComponent(options.initialAnchor)}`;
    router.url = url;
    router.currentNavigation.mockReturnValue({
      extras: {},
      id: 1,
      previousNavigation: null,
    });
    TestBed.inject(NgDocContentScrollIntent).start();
    events.next(new NavigationStart(1, url, 'imperative', null));
    events.next(new NavigationEnd(1, url, url));
  }
  const controller = TestBed.inject(NgDocContentAnchorController);
  controller.activate();
  return {
    application,
    controller,
    events,
    host,
    resolveStable: () => resolveStable(),
    router,
    viewport,
    whenStable,
    wrapper,
  };
}

function scroll(
  test: Harness,
  options: {
    anchor?: string | null;
    behavior?: 'manual' | 'after-transition';
    id?: number;
    position?: [number, number] | null;
    url?: string;
  } = {},
): void {
  const url = options.url ?? '/docs/guide#target';
  test.router.url = url;
  test.events.next(
    new Scroll(
      new NavigationEnd(options.id ?? 1, url, url),
      options.position ?? null,
      options.anchor === undefined ? 'target' : options.anchor,
      options.behavior,
    ),
  );
}

async function settle(test: Harness): Promise<void> {
  await Promise.resolve();
  test.resolveStable();
  await Promise.resolve();
  await Promise.resolve();
}

describeChangeDetection('NgDocContentAnchorController', ({ providers }) => {
  beforeEach(() => (modeProviders = providers));

  afterEach(() => {
    modeProviders = [];
    vi.restoreAllMocks();
    document.body.replaceChildren();
    TestBed.resetTestingModule();
  });

  it('replays a missed Unicode header anchor after accepted content and application stability', async () => {
    const test = await harness();
    scroll(test, { anchor: 'привет', url: '/docs/guide#%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82' });
    test.controller.contentProcessed();

    const header = document.createElement('header');
    header.id = 'привет';
    test.wrapper.prepend(header);
    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
    await settle(test);

    expect(test.viewport.scrollToAnchor).toHaveBeenCalledTimes(1);
    expect(test.viewport.scrollToAnchor).toHaveBeenCalledWith('привет');
    test.controller.contentProcessed();
    await Promise.resolve();
    expect(test.viewport.scrollToAnchor).toHaveBeenCalledTimes(1);
  });

  it('arms a later missed Scroll when the body finished before a pending header', async () => {
    const test = await harness();
    test.controller.contentProcessed();
    scroll(test);
    const target = document.createElement('h2');
    target.id = 'target';
    test.wrapper.append(target);
    expect(test.whenStable).toHaveBeenCalledTimes(1);
    await settle(test);
    expect(test.viewport.scrollToAnchor).toHaveBeenCalledWith('target');
  });

  it('lets an existing target, manual scrolling, and position restoration keep ownership', async () => {
    const test = await harness();
    const target = document.createElement('a');
    target.setAttribute('name', 'target');
    test.wrapper.append(target);
    scroll(test);
    test.controller.contentProcessed();

    target.remove();
    scroll(test, { behavior: 'manual' });
    test.controller.contentProcessed();
    scroll(test, { position: [10, 20] });
    test.controller.contentProcessed();
    await Promise.resolve();

    expect(test.whenStable).not.toHaveBeenCalled();
    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
    expect(test.viewport.scrollToPosition).not.toHaveBeenCalled();
  });

  it.each([
    { observed: [0, 0] as [number, number], label: 'fully clamped' },
    { observed: [0, 180] as [number, number], label: 'partially clamped' },
  ])('replays an enabled saved position after a $label router attempt', async ({ observed }) => {
    const test = await harness({ enabled: false, restoration: 'enabled' });
    test.viewport.getScrollPosition.mockReturnValue(observed);
    scroll(test, { anchor: null, position: [0, 450] });
    expect(test.wrapper.style.getPropertyValue('overflow-anchor')).toBe('none');
    window.dispatchEvent(new Event('scroll'));
    test.controller.contentProcessed();
    await settle(test);

    expect(test.viewport.scrollToPosition).toHaveBeenCalledTimes(1);
    expect(test.viewport.scrollToPosition).toHaveBeenCalledWith([0, 450]);
    expect(test.wrapper.style.getPropertyValue('overflow-anchor')).toBe('');
    test.controller.contentProcessed();
    await Promise.resolve();
    expect(test.viewport.scrollToPosition).toHaveBeenCalledTimes(1);
  });

  it('does not replay an already restored position or disabled, top, and manual policies', async () => {
    const restored = await harness({ enabled: false, restoration: 'enabled' });
    restored.viewport.getScrollPosition.mockReturnValue([0, 450]);
    scroll(restored, { anchor: null, position: [0, 450] });
    restored.controller.contentProcessed();
    expect(restored.whenStable).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    restored.wrapper.remove();

    for (const restoration of ['disabled', 'top'] as const) {
      const test = await harness({ enabled: false, restoration });
      scroll(test, { anchor: null, position: [0, 450] });
      test.controller.contentProcessed();
      expect(test.whenStable).not.toHaveBeenCalled();
      expect(test.viewport.scrollToPosition).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      test.wrapper.remove();
    }

    const manual = await harness({ enabled: false, restoration: 'enabled' });
    scroll(manual, { anchor: null, behavior: 'manual', position: [0, 450] });
    manual.controller.contentProcessed();
    expect(manual.whenStable).not.toHaveBeenCalled();
    expect(manual.viewport.scrollToPosition).not.toHaveBeenCalled();
  });

  it('treats a changed viewport position as user ownership even when it later returns', async () => {
    const test = await harness({ enabled: false, restoration: 'enabled' });
    test.viewport.getScrollPosition.mockReturnValue([0, 180]);
    scroll(test, { anchor: null, position: [0, 450] });
    test.controller.contentProcessed();
    await Promise.resolve();
    test.viewport.getScrollPosition.mockReturnValue([0, 240]);
    window.dispatchEvent(new Event('scroll'));
    test.viewport.getScrollPosition.mockReturnValue([0, 180]);
    window.dispatchEvent(new Event('scroll'));
    await settle(test);

    expect(test.viewport.scrollToPosition).not.toHaveBeenCalled();
  });

  it('captures the router clamp after the Scroll event stack before replaying a saved position', async () => {
    const test = await harness({ enabled: false, restoration: 'enabled' });
    test.viewport.getScrollPosition.mockReturnValueOnce([0, 0]).mockReturnValue([0, 200]);
    scroll(test, { anchor: null, position: [0, 450] });
    window.dispatchEvent(new Event('scroll'));
    test.controller.contentProcessed();
    await settle(test);

    expect(test.viewport.scrollToPosition).toHaveBeenCalledWith([0, 450]);
  });

  it('cancels a clamped position replay on explicit wheel intent even without viewport movement', async () => {
    const test = await harness({ enabled: false, restoration: 'enabled' });
    scroll(test, { anchor: null, position: [0, 450] });
    window.dispatchEvent(new WheelEvent('wheel'));
    test.controller.contentProcessed();
    await settle(test);

    expect(test.viewport.scrollToPosition).not.toHaveBeenCalled();
    expect(test.wrapper.style.getPropertyValue('overflow-anchor')).toBe('');
  });

  it('restores the prior inline overflow-anchor value and preserves a later host mutation', async () => {
    const restored = await harness({ enabled: false, restoration: 'enabled' });
    restored.wrapper.style.setProperty('overflow-anchor', 'auto', 'important');
    scroll(restored, { anchor: null, position: [0, 450] });
    expect(restored.wrapper.style.getPropertyValue('overflow-anchor')).toBe('none');
    restored.controller.contentFailed();
    expect(restored.wrapper.style.getPropertyValue('overflow-anchor')).toBe('auto');
    expect(restored.wrapper.style.getPropertyPriority('overflow-anchor')).toBe('important');
    TestBed.resetTestingModule();
    restored.wrapper.remove();

    const mutated = await harness({ enabled: false, restoration: 'enabled' });
    scroll(mutated, { anchor: null, position: [0, 450] });
    mutated.wrapper.style.setProperty('overflow-anchor', 'auto');
    mutated.controller.contentFailed();
    expect(mutated.wrapper.style.getPropertyValue('overflow-anchor')).toBe('auto');
  });

  it('keeps the wrapper lease until the last overlapping page controller releases it', async () => {
    const test = await harness({ enabled: false, restoration: 'enabled' });
    const secondHost = document.createElement('ng-doc-page');
    test.wrapper.append(secondHost);
    const child = createEnvironmentInjector(
      [NgDocContentAnchorController, { provide: ElementRef, useValue: new ElementRef(secondHost) }],
      TestBed.inject(EnvironmentInjector),
    );
    const second = child.get(NgDocContentAnchorController);
    second.activate();
    scroll(test, { anchor: null, position: [0, 450] });
    expect(test.wrapper.style.getPropertyValue('overflow-anchor')).toBe('none');

    child.destroy();
    expect(test.wrapper.style.getPropertyValue('overflow-anchor')).toBe('none');
    test.controller.contentFailed();
    expect(test.wrapper.style.getPropertyValue('overflow-anchor')).toBe('');
  });

  it('does not rearm the same navigation when its Scroll arrives after explicit user input', async () => {
    const test = await harness();
    test.events.next(new NavigationStart(2, '/docs/guide#target', 'imperative'));
    window.dispatchEvent(new WheelEvent('wheel'));
    scroll(test, { id: 2 });
    test.controller.contentProcessed();
    const target = document.createElement('h2');
    target.id = 'target';
    test.wrapper.append(target);
    await settle(test);

    expect(test.whenStable).not.toHaveBeenCalled();
    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });

  it('replays a captured pre-component initial fragment after stability and two animation frames', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let frame = 0;
    const request = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => (callbacks.set(++frame, callback), frame));
    const cancel = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => void callbacks.delete(id));
    const test = await harness({ initialAnchor: 'hydrated' });
    test.controller.contentProcessed();
    const target = document.createElement('h2');
    target.id = 'hydrated';
    test.wrapper.append(target);
    await Promise.resolve();
    test.resolveStable();
    await Promise.resolve();

    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
    callbacks.get(1)?.(1);
    callbacks.delete(1);
    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
    callbacks.get(2)?.(2);
    callbacks.delete(2);
    await Promise.resolve();
    expect(test.viewport.scrollToAnchor).toHaveBeenCalledWith('hydrated');

    test.controller.contentProcessed();
    await Promise.resolve();
    expect(test.viewport.scrollToAnchor).toHaveBeenCalledTimes(1);
    request.mockRestore();
    cancel.mockRestore();
  });

  it('lets a real Scroll supersede initial fallback and cancels owned animation frames on input', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let frame = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback) => (callbacks.set(++frame, callback), frame),
    );
    const cancel = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => void callbacks.delete(id));
    const test = await harness({ initialAnchor: 'hydrated' });
    test.controller.contentProcessed();
    const target = document.createElement('h2');
    target.id = 'hydrated';
    test.wrapper.append(target);
    await Promise.resolve();
    test.resolveStable();
    await Promise.resolve();
    expect(callbacks.size).toBe(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
    expect(cancel).toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
    scroll(test, { anchor: 'hydrated', url: '/docs/guide#hydrated' });
    await Promise.resolve();
    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });

  it('cancels initial fallback when Angular emits a real Scroll before stability', async () => {
    const request = vi.spyOn(window, 'requestAnimationFrame');
    const test = await harness({ initialAnchor: 'hydrated' });
    test.controller.contentProcessed();
    const target = document.createElement('h2');
    target.id = 'hydrated';
    test.wrapper.append(target);
    scroll(test, { anchor: 'hydrated', url: '/docs/guide#hydrated' });
    await settle(test);

    expect(request).not.toHaveBeenCalled();
    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });

  it('cancels a queued second frame on destruction', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let frame = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback) => (callbacks.set(++frame, callback), frame),
    );
    const cancel = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => void callbacks.delete(id));
    const test = await harness({ initialAnchor: 'hydrated' });
    test.controller.contentProcessed();
    const target = document.createElement('h2');
    target.id = 'hydrated';
    test.wrapper.append(target);
    await Promise.resolve();
    test.resolveStable();
    await Promise.resolve();
    callbacks.get(1)?.(1);
    callbacks.delete(1);

    TestBed.resetTestingModule();
    expect(cancel).toHaveBeenCalledWith(2);
    expect(callbacks.size).toBe(0);
    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });

  it('consumes a terminal missing initial target so a later page cannot revive it', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let frame = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback) => (callbacks.set(++frame, callback), frame),
    );
    const test = await harness({ initialAnchor: 'missing' });
    test.controller.contentProcessed();
    await Promise.resolve();
    test.resolveStable();
    await Promise.resolve();
    callbacks.get(1)?.(1);
    callbacks.get(2)?.(2);
    await Promise.resolve();

    const late = vi.fn();
    TestBed.inject(NgDocContentScrollIntent).subscribe(late);
    expect(late).not.toHaveBeenCalled();
    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });

  it('does nothing when disabled or outside the browser', async () => {
    for (const options of [{ enabled: false }, { platform: 'server' }]) {
      const test = await harness(options);
      scroll(test);
      test.controller.contentProcessed();
      expect(test.whenStable).not.toHaveBeenCalled();
      expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      test.wrapper.remove();
    }
  });

  it('discards replay after user movement, route supersession, failure, or destruction', async () => {
    const cases: Array<(test: Harness) => void> = [
      (test) => test.viewport.getScrollPosition.mockReturnValue([0, 40]),
      (test) => scroll(test, { anchor: null, id: 2, url: '/docs/other' }),
      (test) => test.controller.contentFailed(),
      () => TestBed.resetTestingModule(),
    ];

    for (const mutate of cases) {
      const test = await harness();
      scroll(test);
      test.controller.contentProcessed();
      const target = document.createElement('h2');
      target.id = 'target';
      test.wrapper.append(target);
      mutate(test);
      await settle(test);
      expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      test.wrapper.remove();
    }
  });

  it('invalidates a same-URL replay at NavigationStart and after any viewport scroll', async () => {
    for (const invalidate of [
      (test: Harness) => {
        test.events.next(new NavigationStart(2, '/docs/guide#target', 'imperative'));
        scroll(test, { id: 1 });
      },
      (test: Harness) => {
        test.viewport.getScrollPosition.mockReturnValue([0, 40]);
        window.dispatchEvent(new Event('scroll'));
        test.viewport.getScrollPosition.mockReturnValue([0, 0]);
      },
    ]) {
      const test = await harness();
      scroll(test);
      test.controller.contentProcessed();
      const target = document.createElement('h2');
      target.id = 'target';
      test.wrapper.append(target);
      invalidate(test);
      await settle(test);
      expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      test.wrapper.remove();
    }
  });

  it('contains stability rejection and cancels when another content source failed', async () => {
    const rejected = await harness();
    rejected.whenStable.mockRejectedValueOnce(new Error('stability failed'));
    scroll(rejected);
    rejected.controller.contentProcessed();
    await Promise.resolve();
    await Promise.resolve();
    expect(rejected.viewport.scrollToAnchor).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    rejected.wrapper.remove();

    const headerFailure = await harness();
    scroll(headerFailure);
    headerFailure.controller.contentProcessed();
    const target = document.createElement('h2');
    target.id = 'target';
    headerFailure.wrapper.append(target);
    TestBed.inject(NgDocContentState).report(
      {},
      { contentId: 'header', error: new Error('header') },
    );
    await settle(headerFailure);
    expect(headerFailure.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });

  it('clears a still-missing target and never jumps on a later body-only update', async () => {
    const test = await harness();
    scroll(test);
    test.controller.contentProcessed();
    await settle(test);

    const target = document.createElement('h2');
    target.id = 'target';
    test.wrapper.append(target);
    test.controller.contentProcessed();
    await Promise.resolve();

    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });

  it('requires the target to belong to the active page wrapper', async () => {
    const staleWrapper = document.createElement('ng-doc-page-wrapper');
    const stale = document.createElement('h2');
    stale.id = 'target';
    staleWrapper.append(stale);
    document.body.prepend(staleWrapper);
    const test = await harness();
    scroll(test);
    test.controller.contentProcessed();
    await settle(test);

    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });

  it('does not ask the global ViewportScroller to select a duplicate stale target', async () => {
    const staleWrapper = document.createElement('ng-doc-page-wrapper');
    const stale = document.createElement('h2');
    stale.id = 'target';
    staleWrapper.append(stale);
    document.body.prepend(staleWrapper);
    const test = await harness();
    scroll(test);
    test.controller.contentProcessed();
    const current = document.createElement('h2');
    current.id = 'target';
    test.wrapper.append(current);
    await settle(test);

    expect(test.viewport.scrollToAnchor).not.toHaveBeenCalled();
  });
});

describe('provideNgDocApp content anchor intent', () => {
  // provideNgDocApp initializes the highlighter, which needs the generated shiki theme. These
  // specs only read tokens, so a resolved stub keeps the initializer from rejecting (an
  // unhandled rejection that ends the process when zone.js is not loaded).
  const highlighter = {
    provide: NgDocHighlighterService,
    useValue: { initialize: () => Promise.resolve() },
  };

  afterEach(() => TestBed.resetTestingModule());

  it('defaults off and provides an explicit opt-in', async () => {
    await TestBed.configureTestingModule({
      providers: [provideNgDocApp(), highlighter],
    }).compileComponents();
    expect(TestBed.inject(NG_DOC_CONTENT_ANCHOR_SCROLLING)).toBe(false);
    expect(TestBed.inject(NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION)).toBe('disabled');
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      providers: [
        provideNgDocApp({
          contentAnchorScrolling: true,
          contentScrollPositionRestoration: 'enabled',
        }),
        highlighter,
      ],
    }).compileComponents();
    expect(TestBed.inject(NG_DOC_CONTENT_ANCHOR_SCROLLING)).toBe(true);
    expect(TestBed.inject(NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION)).toBe('enabled');
  });

  it('uses disabled root token factories without provideNgDocApp', () => {
    expect(TestBed.inject(NG_DOC_CONTENT_ANCHOR_SCROLLING)).toBe(false);
    expect(TestBed.inject(NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION)).toBe('disabled');
  });
});
