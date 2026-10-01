import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationSkipped, NavigationStart, Router, Scroll } from '@angular/router';
import { NgDocContentScrollIntent } from '@ng-doc/app/services/content-scroll-intent';
import { Subject } from 'rxjs';
import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';

interface IntentHarness {
  readonly events: Subject<unknown>;
  readonly listener: Mock;
  readonly router: { currentNavigation: Mock; events: Subject<unknown>; parseUrl: Mock };
  readonly service: NgDocContentScrollIntent;
}

async function harness(platform: unknown = 'browser'): Promise<IntentHarness> {
  const events = new Subject<unknown>();
  const router = {
    currentNavigation: vi.fn(),
    events,
    parseUrl: vi.fn((url: string) => ({
      fragment: url.includes('#') ? decodeURIComponent(url.slice(url.indexOf('#') + 1)) : null,
    })),
  };
  await TestBed.configureTestingModule({
    providers: [
      NgDocContentScrollIntent,
      { provide: PLATFORM_ID, useValue: platform },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();
  const service = TestBed.inject(NgDocContentScrollIntent);
  const listener = vi.fn();
  service.subscribe(listener);
  service.start();
  return { events, listener, router, service };
}

function initialNavigation(test: IntentHarness, overrides: Record<string, unknown> = {}): void {
  const url = '/docs/guide#hydrated';
  test.router.currentNavigation.mockReturnValue({
    extras: {},
    id: 1,
    previousNavigation: null,
    ...overrides,
  });
  test.events.next(new NavigationStart(1, url, 'imperative', null));
  test.events.next(new NavigationEnd(1, url, url));
}

describe('NgDocContentScrollIntent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('captures an eligible initial navigation before a page subscribes', async () => {
    const test = await harness();
    const earlyListener = vi.fn();
    initialNavigation(test);
    const unsubscribe = test.service.subscribe(earlyListener);

    expect(earlyListener).toHaveBeenCalledWith({
      anchor: 'hydrated',
      navigationId: 1,
      url: '/docs/guide#hydrated',
    });
    test.service.settle(1);
    expect(test.listener).toHaveBeenLastCalledWith(undefined);
    unsubscribe();
  });

  it('gives a real Scroll precedence, including a newer Scroll without a matching start', async () => {
    const test = await harness();
    initialNavigation(test);
    test.events.next(
      new Scroll(new NavigationEnd(2, '/other', '/other'), null, null, 'after-transition'),
    );

    expect(test.listener).toHaveBeenLastCalledWith(undefined);
  });

  it('does not publish when Scroll takes ownership before NavigationEnd', async () => {
    const test = await harness();
    const url = '/docs/guide#hydrated';
    test.router.currentNavigation.mockReturnValue({ extras: {}, id: 1, previousNavigation: null });
    test.events.next(new NavigationStart(1, url, 'imperative', null));
    test.events.next(new Scroll(new NavigationEnd(1, url, url), null, 'hydrated'));
    test.events.next(new NavigationEnd(1, url, url));

    expect(test.listener).not.toHaveBeenCalled();
  });

  it.each([
    { navigation: { extras: { scroll: 'manual' } }, trigger: 'imperative', restored: null },
    { navigation: { extras: {}, previousNavigation: {} }, trigger: 'imperative', restored: null },
    { navigation: { extras: {} }, trigger: 'popstate', restored: { navigationId: 4 } },
  ])('rejects manual, noninitial, and restored navigation ownership', async (scenario) => {
    const test = await harness();
    const url = '/docs/guide#hydrated';
    test.router.currentNavigation.mockReturnValue({
      id: 1,
      previousNavigation: null,
      ...scenario.navigation,
    });
    test.events.next(
      new NavigationStart(
        1,
        url,
        scenario.trigger as ConstructorParameters<typeof NavigationStart>[2],
        scenario.restored,
      ),
    );
    test.events.next(new NavigationEnd(1, url, url));

    expect(test.listener).not.toHaveBeenCalled();
  });

  it('invalidates the fallback on a skipped navigation and stays inert on the server', async () => {
    const test = await harness();
    initialNavigation(test);
    test.events.next(new NavigationSkipped(2, '/docs/guide#hydrated', 'same URL'));
    expect(test.listener).toHaveBeenLastCalledWith(undefined);

    TestBed.resetTestingModule();
    const server = await harness('server');
    initialNavigation(server);
    expect(server.listener).not.toHaveBeenCalled();
    expect(server.service.currentIntent()).toBeUndefined();
  });

  it('mirrors the published intent in a signal and clears it on destroy', async () => {
    const test = await harness();
    expect(test.service.currentIntent()).toBeUndefined();

    initialNavigation(test);
    expect(test.service.currentIntent()).toEqual({
      anchor: 'hydrated',
      navigationId: 1,
      url: '/docs/guide#hydrated',
    });
    expect(test.service.currentIntent()).toBe(test.listener.mock.lastCall?.[0]);

    test.service.settle(1);
    expect(test.service.currentIntent()).toBeUndefined();

    initialNavigation(test);
    expect(test.service.currentIntent()).toBeUndefined();

    TestBed.resetTestingModule();
    const destroyed = await harness();
    initialNavigation(destroyed);
    expect(destroyed.service.currentIntent()).toBeDefined();
    TestBed.resetTestingModule();
    expect(destroyed.service.currentIntent()).toBeUndefined();
    destroyed.events.next(new NavigationSkipped(2, '/docs/guide', 'same URL'));
    expect(destroyed.listener).toHaveBeenCalledTimes(1);
  });
});
