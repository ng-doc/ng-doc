import { ChangeDetectionStrategy, Component, input, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  NgDocDemoAppComponent,
  NgDocDemoHostComponent,
  ɵisNgDocDemoSizeMessage,
  ɵNG_DOC_DEMO_MESSAGE_SOURCE,
  ɵngDocDemoApplicationConfig,
} from '@ng-doc/app/demo-app';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

@Component({
  selector: 'ng-doc-label-demo',
  template: `<span class="label">{{ label() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LabelDemoComponent {
  readonly label = input('default label');
}

const ROUTES: Routes = [
  {
    path: 'demo-preview/docs/page',
    children: [
      {
        path: 'LabelDemo',
        component: NgDocDemoHostComponent,
        data: { ngDocDemo: LabelDemoComponent },
      },
      { path: 'Missing', component: NgDocDemoHostComponent, data: {} },
    ],
  },
  { path: '**', component: NgDocDemoHostComponent },
];

describeChangeDetection('Demo pages', ({ providers }: ChangeDetectionCase) => {
  async function open(url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [...providers, provideRouter(ROUTES)] });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl(url);
    harness.detectChanges();
    await harness.fixture.whenStable();

    return harness.routeNativeElement as HTMLElement;
  }

  it('shows the demo of the page', async () => {
    const page = await open('/demo-preview/docs/page/LabelDemo');

    expect(page.querySelector('.label')?.textContent).toBe('default label');
  });

  it('passes the inputs of the query to the demo', async () => {
    const inputs = encodeURIComponent(JSON.stringify({ label: 'From the page' }));
    const page = await open(`/demo-preview/docs/page/LabelDemo?inputs=${inputs}`);

    expect(page.querySelector('.label')?.textContent).toBe('From the page');
  });

  it('ignores inputs that are not a JSON object', async () => {
    for (const inputs of ['%7Bnot-json', '%5B1%5D', 'null']) {
      TestBed.resetTestingModule();
      const page = await open(`/demo-preview/docs/page/LabelDemo?inputs=${inputs}`);

      expect(page.querySelector('.label')?.textContent, inputs).toBe('default label');
    }
  });

  it('tells that a demo does not exist', async () => {
    for (const url of ['/demo-preview/docs/page/Missing', '/somewhere/else']) {
      TestBed.resetTestingModule();
      const page = await open(url);

      expect(page.querySelector('[role="alert"]')?.textContent, url).toContain(
        'This demo does not exist.',
      );
    }
  });
});

describe('Demo application configuration', () => {
  it('provides change detection, the demo routes with a page for unknown demos and demoProviders', async () => {
    const marker: Provider = { provide: 'marker', useValue: 'from demoProviders' };
    const server: Provider = { provide: 'server', useValue: true };
    const config = await ɵngDocDemoApplicationConfig(
      ROUTES.slice(0, 1),
      async () => ({ default: [marker] }),
      { providers: [server] },
    );

    TestBed.configureTestingModule({ providers: config.providers });
    expect(TestBed.inject('marker' as never)).toBe('from demoProviders');
    expect(TestBed.inject('server' as never)).toBe(true);
    expect(TestBed.inject(Router).config.map((route) => route.path)).toEqual([
      'demo-preview/docs/page',
      '**',
    ]);
  });

  it('starts without demoProviders, with zone.js change detection when asked', async () => {
    const zoneless = await ɵngDocDemoApplicationConfig([], undefined);
    const zone = await ɵngDocDemoApplicationConfig([], undefined, { zone: true });

    expect(zoneless.providers).toHaveLength(2);
    expect(zone.providers).toHaveLength(2);
    expect(zone.providers[0]).not.toBe(zoneless.providers[0]);
  });
});

describe('Demo size messages', () => {
  it('accepts only size messages of the demo application', () => {
    const message = { source: ɵNG_DOC_DEMO_MESSAGE_SOURCE, version: 1, type: 'size', height: 40 };

    expect(ɵisNgDocDemoSizeMessage(message)).toBe(true);
    expect(ɵisNgDocDemoSizeMessage({ ...message, height: 0 })).toBe(true);
    for (const value of [
      null,
      'size',
      { ...message, source: 'other' },
      { ...message, version: 2 },
      { ...message, type: 'ready' },
      { ...message, height: '40' },
      { ...message, height: -1 },
      { ...message, height: Number.NaN },
    ]) {
      expect(ɵisNgDocDemoSizeMessage(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('Demo application root', () => {
  type Callback = (entries: unknown[]) => void;
  const observers: Array<{ callback: Callback; options?: unknown; disconnected: boolean }> = [];
  const posted: Array<{ message: unknown; origin: string }> = [];
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  const originalObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

  function embed(): void {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        postMessage: (message: unknown, origin: string) => posted.push({ message, origin }),
      },
    });
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      private readonly record: (typeof observers)[number];

      constructor(callback: Callback) {
        this.record = { callback, disconnected: false };
        observers.push(this.record);
      }

      observe(_target: Element, options?: unknown): void {
        this.record.options = options;
      }

      disconnect(): void {
        this.record.disconnected = true;
      }
    };
  }

  afterEach(() => {
    if (originalParent) Object.defineProperty(window, 'parent', originalParent);
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalObserver;
    observers.splice(0);
    posted.splice(0);
    document.documentElement.removeAttribute('data-theme');
  });

  it('reports the border-box height of its content to the embedding page, once per change', () => {
    embed();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NgDocDemoAppComponent);
    let height = 120.2;

    fixture.nativeElement.getBoundingClientRect = () => ({ height }) as DOMRect;
    expect(observers).toHaveLength(1);
    expect(observers[0].options).toEqual({ box: 'border-box' });

    observers[0].callback([]);
    observers[0].callback([]);
    height = 64;
    observers[0].callback([]);

    expect(posted).toEqual([
      {
        message: { source: ɵNG_DOC_DEMO_MESSAGE_SOURCE, version: 1, type: 'size', height: 121 },
        origin: window.location.origin,
      },
      {
        message: { source: ɵNG_DOC_DEMO_MESSAGE_SOURCE, version: 1, type: 'size', height: 64 },
        origin: window.location.origin,
      },
    ]);
    fixture.destroy();
    expect(observers[0].disconnected).toBe(true);
  });

  it('reports nothing when it is not embedded', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NgDocDemoAppComponent);

    expect(observers).toHaveLength(0);
    fixture.destroy();
  });

  it('follows the theme the reader picks on the documentation site', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NgDocDemoAppComponent);
    const store = (key: string, newValue: string | null) =>
      window.dispatchEvent(new StorageEvent('storage', { key, newValue }));

    store('ng-doc-theme-id', 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    store('another-key', 'light');
    store('ng-doc-theme-id', null);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    store('ng-doc-theme-id', '');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    fixture.destroy();
    store('ng-doc-theme-id', 'dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
