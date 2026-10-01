import {
  HTTP_INTERCEPTORS,
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  createComponent,
  createEnvironmentInjector,
  EnvironmentInjector,
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  Signal,
  signal,
} from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { NgDocIconComponent, NgDocIconRegistry } from '@ng-doc/ui-kit/components/icon';
import { NgDocCacheInterceptor } from '@ng-doc/ui-kit/interceptors';
import { NG_DOC_ASSETS_PATH, NG_DOC_CUSTOM_ICONS_PATH } from '@ng-doc/ui-kit/tokens';
import { NgDocIconSize } from '@ng-doc/ui-kit/types';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The site's API reference documents every exported declaration under libs/ui-kit, tests
// included, so this spec exports nothing and declares its change-detection helper locally (the
// same helper as testing/change-detection/change-detection-modes.spec.ts).

/** How TestBed schedules change detection in a spec. */
type ChangeDetectionMode = 'zone' | 'zoneless';

/** One change-detection mode and the providers that select it. */
interface ChangeDetectionCase {
  mode: ChangeDetectionMode;
  providers: Array<Provider | EnvironmentProviders>;
}

/**
 * The change-detection modes a spec can run in here: both with zone.js loaded (`nx test`), only
 * zoneless without it (`nx run ui-kit:test-zoneless`).
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
 * Declares a `describe` block per change-detection mode.
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

const CHECK_SVG = '<svg id="check"></svg>';
const MINUS_SVG = '<svg id="minus"></svg>';
const BRAND_SVG = '<svg id="brand"></svg>';

@Component({
  imports: [NgDocIconComponent],
  template: `
    @for (name of names(); track $index) {
      <ng-doc-icon [icon]="name" [size]="size()" />
    }
    <ng-doc-icon class="custom" [customIcon]="customIcon()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class IconsHostComponent {
  readonly names = signal<string[]>(['check', 'check']);
  readonly size = signal<NgDocIconSize>(16);
  readonly customIcon = signal<string>('brand');
}

@Component({
  imports: [NgDocIconComponent],
  template: `<ng-doc-icon icon="check" size="24" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class IconSizeAttributeHostComponent {}

describeChangeDetection('NgDocIconComponent and NgDocIconRegistry', ({ providers }) => {
  let http: HttpTestingController;

  /**
   * Renders the icon host without HTTP interceptors, as a new zoneless application is set up.
   */
  async function render(): Promise<ComponentFixture<IconsHostComponent>> {
    const fixture: ComponentFixture<IconsHostComponent> =
      TestBed.createComponent(IconsHostComponent);

    fixture.detectChanges();

    return fixture;
  }

  /**
   * Answers the pending request for an URL and waits for the icons to render.
   * @param fixture - The fixture of the test.
   * @param url - URL of the request.
   * @param body - SVG markup to answer with.
   */
  async function answer(
    fixture: ComponentFixture<unknown>,
    url: string,
    body: string,
  ): Promise<void> {
    http.expectOne(url).flush(body);
    await fixture.whenStable();
  }

  /**
   * The markup of every icon in the fixture.
   * @param fixture - The fixture.
   */
  function icons(fixture: ComponentFixture<unknown>): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('ng-doc-icon'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NG_DOC_ASSETS_PATH, useValue: 'assets/ui-kit' },
        { provide: NG_DOC_CUSTOM_ICONS_PATH, useValue: 'assets/icons' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('requests each icon once and shows it in every instance', async () => {
    const fixture = await render();

    await answer(fixture, 'assets/ui-kit/icons/16/check.svg#check', CHECK_SVG);
    await answer(fixture, 'assets/icons/brand.svg#brand', '<svg id="brand"></svg>');

    const [first, second, custom] = icons(fixture);

    expect(first.innerHTML).toBe(CHECK_SVG);
    expect(second.innerHTML).toBe(CHECK_SVG);
    expect(first.getAttribute('data-ng-doc-icon')).toBe('check');
    expect(first.getAttribute('data-ng-doc-size')).toBe('16');
    expect(custom.getAttribute('data-ng-doc-custom-icon')).toBe('brand');
    expect(custom.innerHTML).toBe('<svg id="brand"></svg>');
  });

  it('sends the request without a cache token, so no interceptor is needed', async () => {
    const fixture = await render();
    const request = http.expectOne('assets/ui-kit/icons/16/check.svg#check');

    expect(request.request.params.keys()).toEqual([]);

    request.flush(CHECK_SVG);
    await answer(fixture, 'assets/icons/brand.svg#brand', BRAND_SVG);
  });

  it('keeps the current icon until the next one has loaded', async () => {
    const fixture = await render();

    await answer(fixture, 'assets/ui-kit/icons/16/check.svg#check', CHECK_SVG);
    await answer(fixture, 'assets/icons/brand.svg#brand', BRAND_SVG);

    fixture.componentInstance.names.set(['minus', 'check']);
    fixture.detectChanges();

    const [first, second] = icons(fixture);

    expect(first.innerHTML).toBe(CHECK_SVG);
    expect(first.getAttribute('data-ng-doc-icon')).toBe('minus');

    await answer(fixture, 'assets/ui-kit/icons/16/minus.svg#minus', MINUS_SVG);

    expect(first.innerHTML).toBe(MINUS_SVG);
    expect(second.innerHTML).toBe(CHECK_SVG);
  });

  it('loads the size folder that the size input selects', async () => {
    const fixture = await render();

    await answer(fixture, 'assets/ui-kit/icons/16/check.svg#check', CHECK_SVG);
    await answer(fixture, 'assets/icons/brand.svg#brand', BRAND_SVG);

    fixture.componentInstance.size.set(24);
    fixture.detectChanges();
    await answer(fixture, 'assets/ui-kit/icons/24/check.svg#check', '<svg id="large"></svg>');

    expect(icons(fixture)[0].getAttribute('data-ng-doc-size')).toBe('24');
    expect(icons(fixture)[0].innerHTML).toBe('<svg id="large"></svg>');
  });

  it('accepts the size as a static attribute', async () => {
    const fixture: ComponentFixture<IconSizeAttributeHostComponent> = TestBed.createComponent(
      IconSizeAttributeHostComponent,
    );

    fixture.detectChanges();
    await answer(fixture, 'assets/ui-kit/icons/24/check.svg#check', CHECK_SVG);

    expect(icons(fixture)[0].getAttribute('data-ng-doc-size')).toBe('24');
    expect(icons(fixture)[0].innerHTML).toBe(CHECK_SVG);
  });

  it('logs a failed request once and does not request it again by itself', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => void 0);
    const registry: NgDocIconRegistry = TestBed.inject(NgDocIconRegistry);
    const url = 'assets/ui-kit/icons/16/missing.svg#missing';
    const failed: Signal<string | null> = registry.get(url);

    expect(failed()).toBeNull();

    http.expectOne(url).flush('', { status: 404, statusText: 'Not Found' });

    expect(failed()).toBe('');
    expect(error).toHaveBeenCalledTimes(1);
    expect(registry.get(url)()).toBe('');
    http.expectNone(url);

    registry.retry(url);
    http.expectOne(url).flush(CHECK_SVG);

    expect(failed()).toBe(CHECK_SVG);

    registry.retry(url);
    http.expectNone(url);
    error.mockRestore();
  });

  it('treats an HTML fallback page as a failed request and does not request it again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => void 0);
    const fixture = await render();
    const missing = 'assets/ui-kit/icons/16/missing.svg#missing';

    await answer(fixture, 'assets/ui-kit/icons/16/check.svg#check', CHECK_SVG);
    await answer(fixture, 'assets/icons/brand.svg#brand', BRAND_SVG);

    fixture.componentInstance.names.set(['missing', 'check']);
    fixture.detectChanges();
    // A dev server answers a missing file with the application's index.html, which may itself
    // contain inline SVG.
    http
      .expectOne(missing)
      .flush('<!doctype html><html><body><svg></svg><app-root></app-root></body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      http.expectNone(missing);
    }

    expect(icons(fixture)[0].innerHTML).toBe('');
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('is not an SVG file');
    error.mockRestore();
  });

  it('rejects a response without SVG markup and accepts SVG without a content type', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => void 0);
    const registry: NgDocIconRegistry = TestBed.inject(NgDocIconRegistry);
    const text = 'assets/ui-kit/icons/16/text.svg#text';
    const svg = 'assets/ui-kit/icons/16/plain.svg#plain';
    const rejected: Signal<string | null> = registry.get(text);
    const accepted: Signal<string | null> = registry.get(svg);

    http.expectOne(text).flush('Not found');
    // Responses replayed from the hydration transfer cache carry no headers.
    http.expectOne(svg).flush(`<?xml version="1.0"?>\n${CHECK_SVG}`);

    expect(rejected()).toBe('');
    expect(accepted()).toBe(`<?xml version="1.0"?>\n${CHECK_SVG}`);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('does not loop on a missing icon, and retries it when an icon starts showing it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => void 0);
    const fixture = await render();
    const missing = 'assets/ui-kit/icons/16/missing.svg#missing';

    await answer(fixture, 'assets/ui-kit/icons/16/check.svg#check', CHECK_SVG);
    await answer(fixture, 'assets/icons/brand.svg#brand', BRAND_SVG);

    fixture.componentInstance.names.set(['missing', 'check']);
    fixture.detectChanges();
    http.expectOne(missing).flush('', { status: 404, statusText: 'Not Found' });

    // A failure re-renders the icon; that must not send the request again.
    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      http.expectNone(missing);
    }

    expect(icons(fixture)[0].innerHTML).toBe('');
    expect(error).toHaveBeenCalledTimes(1);

    // A second icon that starts showing the missing URL tries it once more.
    fixture.componentInstance.names.set(['missing', 'missing']);
    fixture.detectChanges();
    http.expectOne(missing).flush(MINUS_SVG);
    await fixture.whenStable();

    expect(icons(fixture).map((icon: HTMLElement) => icon.innerHTML)).toEqual([
      MINUS_SVG,
      MINUS_SVG,
      BRAND_SVG,
    ]);
    error.mockRestore();
  });
});

@Component({
  imports: [NgDocIconComponent],
  template: `<ng-doc-icon icon="check" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LazyIconComponent {}

describe('NgDocIconComponent with HttpClient provided in a lazy injector', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the icon with the HttpClient of its own injector', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: NG_DOC_ASSETS_PATH, useValue: 'assets/ui-kit' },
      ],
    });

    // Route providers create an environment injector like this one; the root has no HttpClient.
    const routeInjector: EnvironmentInjector = createEnvironmentInjector(
      [provideHttpClient(), provideHttpClientTesting()],
      TestBed.inject(EnvironmentInjector),
    );
    const http: HttpTestingController = routeInjector.get(HttpTestingController);
    const appRef: ApplicationRef = TestBed.inject(ApplicationRef);
    const ref: ComponentRef<LazyIconComponent> = createComponent(LazyIconComponent, {
      environmentInjector: routeInjector,
    });

    appRef.attachView(ref.hostView);
    appRef.tick();
    http.expectOne('assets/ui-kit/icons/16/check.svg#check').flush(CHECK_SVG);
    await appRef.whenStable();

    expect(
      (ref.location.nativeElement as HTMLElement).querySelector('ng-doc-icon')?.innerHTML,
    ).toBe(CHECK_SVG);

    http.verify();
    ref.destroy();
    routeInjector.destroy();
  });
});

describe('NgDocCacheInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: NgDocCacheInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  /**
   * Requests an URL with the cache token.
   * @param url - The URL.
   */
  function cachedGet(url: string): Promise<string> {
    return firstValueFrom(
      client.get(url, {
        responseType: 'text',
        params: { [NgDocCacheInterceptor.TOKEN]: 'true' },
      }),
    );
  }

  it('sends one request without the token and shares its response', async () => {
    const first: Promise<string> = cachedGet('data.json');
    const second: Promise<string> = cachedGet('data.json');
    const request = http.expectOne('data.json');

    expect(request.request.params.has(NgDocCacheInterceptor.TOKEN)).toBe(false);

    request.flush('content');

    await expect(first).resolves.toBe('content');
    await expect(second).resolves.toBe('content');
    await expect(cachedGet('data.json')).resolves.toBe('content');
    http.expectNone('data.json');
  });

  it('does not cache a failed request', async () => {
    const failed: Promise<string> = cachedGet('data.json');

    http.expectOne('data.json').flush('', { status: 500, statusText: 'Server Error' });

    await expect(failed).rejects.toBeTruthy();

    const retried: Promise<string> = cachedGet('data.json');

    http.expectOne('data.json').flush('content');

    await expect(retried).resolves.toBe('content');
  });

  it('passes requests without the token through', async () => {
    const first: Promise<string> = firstValueFrom(
      client.get('data.json', { responseType: 'text' }),
    );

    http.expectOne('data.json').flush('one');

    const second: Promise<string> = firstValueFrom(
      client.get('data.json', { responseType: 'text' }),
    );

    http.expectOne('data.json').flush('two');

    await expect(first).resolves.toBe('one');
    await expect(second).resolves.toBe('two');
  });
});
