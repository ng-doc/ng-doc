import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentProviders,
  PLATFORM_ID,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { NgDocFullscreenDirective } from '@ng-doc/ui-kit/directives/fullscreen';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The site's API reference documents every exported declaration under libs/ui-kit, tests
// included, so the change-detection helper is declared here instead of in an exported module
// (libs/app keeps an exported copy: its API scope excludes testing/**). A ui-kit spec that needs it
// copies these declarations until the ui-kit scope excludes tests.

/** How TestBed schedules change detection in a spec. */
type ChangeDetectionMode = 'zone' | 'zoneless';

/** One change-detection mode and the providers that select it. */
interface ChangeDetectionCase {
  mode: ChangeDetectionMode;
  providers: Array<Provider | EnvironmentProviders>;
}

/**
 * The change-detection modes a spec can run in here. With zone.js loaded (`nx test`) both run;
 * without it (`nx run <lib>:test-zoneless`) only `zoneless` does, because zone scheduling needs
 * zone.js.
 */
function changeDetectionCases(): ChangeDetectionCase[] {
  const zoneLoaded = typeof (globalThis as { Zone?: unknown }).Zone !== 'undefined';
  const cases: ChangeDetectionCase[] = [
    { mode: 'zoneless', providers: [provideZonelessChangeDetection()] },
  ];

  return zoneLoaded
    ? [
        {
          mode: 'zone',
          // Zoneless fixtures detect changes like an application does; zone fixtures only do so
          // with auto-detection, so both modes exercise the same scheduling path.
          providers: [
            provideZoneChangeDetection(),
            { provide: ComponentFixtureAutoDetect, useValue: true },
          ],
        },
        ...cases,
      ]
    : cases;
}

/**
 * Declares a `describe` block per change-detection mode. Pass `providers` to
 * `TestBed.configureTestingModule`, so the same assertions run with zone.js scheduling and
 * without it.
 * @param title - Title of the block; the mode is appended.
 * @param body - Declares the specs for one mode.
 */
function describeChangeDetection(
  title: string,
  body: (testCase: ChangeDetectionCase) => void,
): void {
  for (const testCase of changeDetectionCases()) {
    describe(`${title} (${testCase.mode})`, () => body(testCase));
  }
}

/** A browser Fullscreen API on jsdom, which has none. */
interface FakeFullscreen {
  /** The elements that asked for fullscreen. */
  readonly requests: Element[];
  /** Whether a request is refused. */
  refuse: boolean;
  /** Leaves fullscreen as Esc does: without a call from the page. */
  escape(): void;
  /** Removes the API. */
  restore(): void;
}

/**
 * Installs a Fullscreen API that behaves like a browser's: a request makes the element the
 * fullscreen element and dispatches `fullscreenchange` on the document.
 * @param enabled - The value of `document.fullscreenEnabled`.
 * @returns The fake.
 */
function fakeFullscreen(enabled: boolean): FakeFullscreen {
  let element: Element | null = null;
  const change = (next: Element | null): void => {
    element = next;
    document.dispatchEvent(new Event('fullscreenchange'));
  };
  const fake: FakeFullscreen = {
    requests: [],
    refuse: false,
    escape: () => change(null),
    restore: () => {
      for (const name of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) {
        Reflect.deleteProperty(document, name);
      }
      Reflect.deleteProperty(Element.prototype, 'requestFullscreen');
    },
  };

  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: async (): Promise<void> => change(null),
  });
  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    value: async function (this: Element): Promise<void> {
      fake.requests.push(this);
      if (fake.refuse) throw new TypeError('Permissions check failed');
      change(this);
    },
  });

  return fake;
}

@Component({
  selector: 'ng-doc-fullscreen-fixture',
  template: `
    <div class="stage" ngDocFullscreen #stage="ngDocFullscreen">
      <span class="state">{{ stage.supported() }} {{ stage.active() }}</span>
    </div>
  `,
  imports: [NgDocFullscreenDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FullscreenFixtureComponent {}

describeChangeDetection('NgDocFullscreenDirective', ({ providers }) => {
  let fake: FakeFullscreen;
  let fixture: ComponentFixture<FullscreenFixtureComponent>;

  const stage = (): HTMLElement => fixture.nativeElement.querySelector('.stage');
  const state = (): string | undefined =>
    fixture.nativeElement.querySelector('.state')?.textContent?.trim();
  const directive = (): NgDocFullscreenDirective =>
    fixture.debugElement.children[0].injector.get(NgDocFullscreenDirective);

  /**
   * Creates the fixture with the given support and waits for its first render.
   * @param enabled - The value of `document.fullscreenEnabled`.
   * @param extra - More providers.
   */
  async function create(enabled: boolean, extra: Provider[] = []): Promise<void> {
    fake = fakeFullscreen(enabled);
    TestBed.configureTestingModule({ providers: [...providers, ...extra] });
    fixture = TestBed.createComponent(FullscreenFixtureComponent);
    await fixture.whenStable();
  }

  afterEach(() => {
    fixture.destroy();
    fake.restore();
  });

  it('shows the host fullscreen and follows the browser state', async () => {
    await create(true);

    expect(state()).toBe('true false');
    expect(stage().getAttribute('data-ng-doc-fullscreen')).toBe('false');

    await directive().toggle();
    await fixture.whenStable();

    expect(fake.requests).toEqual([stage()]);
    expect(state()).toBe('true true');
    expect(stage().getAttribute('data-ng-doc-fullscreen')).toBe('true');

    await directive().toggle();
    await fixture.whenStable();

    expect(state()).toBe('true false');
    expect(stage().getAttribute('data-ng-doc-fullscreen')).toBe('false');
  });

  it('follows an exit the page did not ask for, such as Esc', async () => {
    await create(true);
    await directive().enter();
    await fixture.whenStable();

    fake.escape();
    await fixture.whenStable();

    expect(directive().active()).toBe(false);
    expect(stage().getAttribute('data-ng-doc-fullscreen')).toBe('false');
  });

  it('is unsupported, and does nothing, where the browser does not allow fullscreen', async () => {
    await create(false);

    await directive().enter();
    await fixture.whenStable();

    expect(state()).toBe('false false');
    expect(fake.requests).toEqual([]);
  });

  it('stays as it is when the browser refuses the request', async () => {
    await create(true);
    fake.refuse = true;

    await expect(directive().enter()).resolves.toBeUndefined();
    await fixture.whenStable();

    expect(fake.requests).toEqual([stage()]);
    expect(directive().active()).toBe(false);
  });

  it('ignores another element going fullscreen', async () => {
    await create(true);

    await document.body.requestFullscreen();
    await fixture.whenStable();

    expect(directive().active()).toBe(false);
    await expect(directive().exit()).resolves.toBeUndefined();
    expect(document.fullscreenElement).toBe(document.body);
  });

  it('stops listening when it is destroyed', async () => {
    await create(true);
    const instance = directive();

    fixture.destroy();
    await stage().requestFullscreen();

    expect(instance.active()).toBe(false);
  });
});

describe('NgDocFullscreenDirective on the server', () => {
  const globals = globalThis as { ngServerMode?: boolean };
  const serverMode = globals.ngServerMode;
  let fake: FakeFullscreen;

  // `ngServerMode` switches the render hooks off, as in a server bundle.
  beforeEach(() => {
    globals.ngServerMode = true;
    fake = fakeFullscreen(true);
  });
  afterEach(() => {
    globals.ngServerMode = serverMode;
    fake.restore();
  });

  it('is unsupported, so the server renders no fullscreen controls', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: 'server' }],
    });
    const fixture = TestBed.createComponent(FullscreenFixtureComponent);

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state')?.textContent?.trim()).toBe('false false');
    fixture.destroy();
  });
});
