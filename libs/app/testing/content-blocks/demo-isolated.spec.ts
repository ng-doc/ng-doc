import { APP_BASE_HREF } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocDemoComponent } from '@ng-doc/app/components/demo';
import { NgDocDemoFrameComponent } from '@ng-doc/app/components/demo-frame';
import { ɵNG_DOC_DEMO_MESSAGE_SOURCE } from '@ng-doc/app/demo-app';
import { NgDocDemoActionOptions } from '@ng-doc/core/interfaces';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

// jsdom implements no Web Animations; tooltips await `animate().finished`.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => ({ finished: Promise.resolve() }) as unknown as Animation,
  });
});

afterAll(() => {
  delete (Element.prototype as Partial<Element>).animate;
});

@Component({
  selector: 'ng-doc-button-demo',
  template: `<button type="button">Demo button</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ButtonDemoComponent {
  readonly label = input('');
}

@Component({
  selector: 'ng-doc-isolated-host',
  template: `<ng-doc-demo componentName="ButtonDemoComponent" [options]="options()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocDemoComponent],
})
class IsolatedHostComponent {
  readonly options = signal<NgDocDemoActionOptions>({});
}

function rootPage(overrides: Partial<NgDocRootPage> = {}): Partial<NgDocRootPage> {
  return {
    page: { title: 'Page', mdFile: '', demos: { ButtonDemoComponent } },
    demoAssets: { ButtonDemoComponent: [{ title: 'TypeScript', code: '<pre>x</pre>' }] },
    ...overrides,
  };
}

describeChangeDetection('Isolated demos', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<IsolatedHostComponent>;

  async function create(
    page: Partial<NgDocRootPage>,
    options: NgDocDemoActionOptions = {},
    baseHref?: string,
  ): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        ...(baseHref ? [{ provide: APP_BASE_HREF, useValue: baseHref }] : []),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NgDocRootPage, useValue: page },
      ],
    });
    fixture = TestBed.createComponent(IsolatedHostComponent);
    fixture.componentInstance.options.set(options);
    await fixture.whenStable();
  }

  afterEach(() => {
    fixture?.destroy();
  });

  const query = <T extends Element = HTMLElement>(selector: string): T | null =>
    fixture.nativeElement.querySelector(selector);
  const openLink = () => query<HTMLAnchorElement>('ng-doc-demo .ng-doc-demo-open');
  const frame = () => query<HTMLIFrameElement>('ng-doc-demo-frame iframe');

  it('renders the demo in the page without demo pages (another engine, or the option off)', async () => {
    await create(rootPage(), { isolated: true });

    expect(openLink()).toBeNull();
    expect(query('ng-doc-demo-frame')).toBeNull();
    expect(query('ng-doc-demo ng-doc-button-demo')).not.toBeNull();
    expect(query('.ng-doc-demo-stage')?.getAttribute('data-ng-doc-isolated')).toBe('false');
  });

  it('opens the demo page in a new tab, under the base href, with the inputs as a query', async () => {
    await create(
      rootPage({ demoRoute: 'demo-preview/docs/demos' }),
      { inputs: { label: 'A & B' } },
      '/site/',
    );

    expect(openLink()?.getAttribute('href')).toBe(
      `/site/demo-preview/docs/demos/ButtonDemoComponent?inputs=${encodeURIComponent('{"label":"A & B"}')}`,
    );
    expect(openLink()?.getAttribute('target')).toBe('_blank');
    expect(openLink()?.getAttribute('rel')).toBe('noopener');
    expect(openLink()?.getAttribute('aria-label')).toBe('Open in a new tab');
    // Not isolated: the demo still renders in the page.
    expect(query('ng-doc-demo ng-doc-button-demo')).not.toBeNull();
    expect(query('ng-doc-demo-frame')).toBeNull();
  });

  it('shows an isolated demo in a lazy iframe of its page', async () => {
    await create(rootPage({ demoRoute: 'demo-preview/docs/demos' }), { isolated: true });

    expect(query('ng-doc-demo ng-doc-button-demo')).toBeNull();
    expect(query('.ng-doc-demo-stage')?.getAttribute('data-ng-doc-isolated')).toBe('true');
    expect(frame()?.getAttribute('src')).toBe('/demo-preview/docs/demos/ButtonDemoComponent');
    expect(frame()?.getAttribute('title')).toBe('ButtonDemoComponent demo');
    expect(frame()?.getAttribute('loading')).toBe('lazy');
    // Until the demo reports its size, a placeholder says it loads, with a link to the page.
    const status = query('ng-doc-demo-frame [role="status"]');

    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.querySelector('a')?.getAttribute('href')).toBe(
      '/demo-preview/docs/demos/ButtonDemoComponent',
    );
  });

  it('isolates the demos of a page with isolatedDemos, unless a demo says otherwise', async () => {
    await create(rootPage({ demoRoute: 'demo-preview/docs/demos', isolatedDemos: true }));
    expect(frame()).not.toBeNull();

    fixture.componentInstance.options.set({ isolated: false });
    await fixture.whenStable();
    expect(frame()).toBeNull();
    expect(query('ng-doc-demo ng-doc-button-demo')).not.toBeNull();
  });

  it('keeps a demo with a fullscreen route out of the iframe', async () => {
    await create(rootPage({ demoRoute: 'demo-preview/docs/demos' }), {
      isolated: true,
      fullscreenRoute: 'button',
    });

    expect(frame()).toBeNull();
    expect(query('ng-doc-fullscreen-button')).not.toBeNull();
  });

  it('has no demo page for a demo the page does not have', async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NgDocRootPage, useValue: rootPage({ demoRoute: 'demo-preview/docs/demos' }) },
      ],
    });
    const demo = TestBed.createComponent(NgDocDemoComponent);

    demo.componentRef.setInput('componentName', 'Unknown');
    demo.componentRef.setInput('options', { isolated: true });
    await demo.whenStable();

    expect(demo.componentInstance.demoUrl()).toBeUndefined();
    expect(demo.componentInstance.isolated()).toBe(false);
    demo.destroy();
  });
});

describeChangeDetection('Demo frames', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<NgDocDemoFrameComponent>;

  async function create(): Promise<HTMLIFrameElement> {
    TestBed.configureTestingModule({ providers });
    fixture = TestBed.createComponent(NgDocDemoFrameComponent);
    fixture.componentRef.setInput('src', '/demo-preview/docs/demos/ButtonDemoComponent');
    fixture.componentRef.setInput('frameTitle', 'ButtonDemoComponent demo');
    await fixture.whenStable();

    return fixture.nativeElement.querySelector('iframe');
  }

  afterEach(() => {
    vi.useRealTimers();
    fixture.destroy();
  });

  const size = (height: number, extra: object = {}) => ({
    source: ɵNG_DOC_DEMO_MESSAGE_SOURCE,
    version: 1,
    type: 'size',
    height,
    ...extra,
  });
  const post = async (
    data: unknown,
    source: MessageEventSource | null,
    origin = window.location.origin,
  ) => {
    window.dispatchEvent(new MessageEvent('message', { data, source, origin }));
    await fixture.whenStable();
  };

  it('takes the height its demo reports', async () => {
    const iframe = await create();

    // The first report comes before the demo has rendered.
    await post(size(0), iframe.contentWindow);
    expect(fixture.componentInstance.state()).toBe('loading');

    await post(size(212), iframe.contentWindow);
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(iframe.style.height).toBe('212px');
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();

    await post(size(48), iframe.contentWindow);
    expect(iframe.style.height).toBe('48px');
  });

  it('ignores messages of other windows, other origins and other shapes', async () => {
    const iframe = await create();

    await post(size(100), window);
    await post(size(100), iframe.contentWindow, 'https://elsewhere.example');
    await post({ ...size(100), type: 'resize' }, iframe.contentWindow);
    await post('100', iframe.contentWindow);

    expect(fixture.componentInstance.height()).toBeUndefined();
    expect(fixture.componentInstance.state()).toBe('loading');
  });

  it('fills its container fullscreen', async () => {
    const iframe = await create();

    await post(size(212), iframe.contentWindow);
    fixture.componentRef.setInput('fill', true);
    await fixture.whenStable();

    expect(iframe.style.height).toBe('');
    expect(fixture.nativeElement.getAttribute('data-ng-doc-fill')).toBe('true');
  });

  it('reports a demo page that loads without reporting its size', async () => {
    const iframe = await create();

    // Change detection runs by hand here: a zone would wait for the faked timer.
    vi.useFakeTimers();
    iframe.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(9_999);
    expect(fixture.componentInstance.state()).toBe('loading');
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('failed');
    const status = fixture.nativeElement.querySelector('[role="status"]');

    expect(status.getAttribute('aria-busy')).toBe('false');
    expect(status.textContent).toContain('The demo did not load.');
    expect(status.querySelector('a').getAttribute('href')).toBe(
      '/demo-preview/docs/demos/ButtonDemoComponent',
    );

    // A late report still shows the demo.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: size(30),
        source: iframe.contentWindow,
        origin: window.location.origin,
      }),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('does not wait for a size once the demo reported one', async () => {
    const iframe = await create();

    await post(size(30), iframe.contentWindow);
    vi.useFakeTimers();
    iframe.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(20_000);
    vi.useRealTimers();
    expect(fixture.componentInstance.state()).toBe('ready');
  });
});
