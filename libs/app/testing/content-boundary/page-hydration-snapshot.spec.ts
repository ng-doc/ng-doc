import {
  afterNextRender,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  createComponent,
  ElementRef,
  EnvironmentInjector,
  inject,
  Injector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPageComponent } from '@ng-doc/app/components/page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { ɵcaptureNgDocHydrationSnapshots } from '@ng-doc/app/helpers';
import { NG_DOC_PAGE_SKELETON, provideMainPageProcessor } from '@ng-doc/app/tokens';
import type { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

/** Where each measuring demo was when it rendered. */
const renders: Array<{ hidden: boolean }> = [];

/**
 * A demo that measures itself after it renders. jsdom has no layout, so it records what decides
 * a real measurement: whether it rendered inside content that the server-rendered copy hides.
 */
@Component({
  selector: 'ng-doc-measuring-demo',
  template: '<div class="measured">Demo</div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MeasuringDemoComponent {
  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;

    afterNextRender(() =>
      renders.push({ hidden: host.closest('[data-ng-doc-hydration-snapshot]') !== null }),
    );
  }
}

const LOADED = '<h2 id="usage">Usage</h2><p>Loaded body.</p><measure-me></measure-me>';

describeChangeDetection('NgDocPageComponent server-rendered copy', ({ providers }) => {
  let host: HTMLElement;
  let ref: ComponentRef<NgDocPageComponent> | undefined;

  beforeEach(() => {
    renders.length = 0;
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([]),
        { provide: NG_DOC_PAGE_SKELETON, useValue: {} },
        provideMainPageProcessor({
          component: MeasuringDemoComponent,
          selector: 'measure-me',
          extractOptions: () => ({}),
        }),
      ],
    });
    // The server-rendered page, reused by the browser: Angular empties it when it creates the
    // component, as it does for a host that skips hydration.
    host = document.createElement('ng-doc-page');
    host.setAttribute('ngskiphydration', 'true');
    host.setAttribute('data-ng-doc-async-content', '');
    host.innerHTML = '<div class="server">Server-rendered body.</div>';
    document.body.appendChild(host);
    ɵcaptureNgDocHydrationSnapshots(document);
  });

  afterEach(() => {
    ref?.destroy();
    ref = undefined;
    host.remove();
  });

  /**
   * Creates the page on the server-rendered host with a source that resolves when told to.
   * @param early - Whether the source has resolved before the page renders.
   * @param html - The loaded body.
   */
  async function page(
    early: boolean,
    html: string,
  ): Promise<{ resolve: () => Promise<void>; application: ApplicationRef }> {
    let resolve!: () => void;
    const loaded = new Promise<void>((done) => (resolve = done));
    if (early) resolve();
    const source: NgDocContentSource = {
      id: 'page',
      load: async (): Promise<NgDocContentModule> => {
        await loaded;

        return { schemaVersion: 1, id: 'page', revision: 'r1', html };
      },
    };
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
      hostElement: host,
    });
    const application = TestBed.inject(ApplicationRef);

    application.attachView(ref.hostView);
    // A pending load keeps the application unstable, so an unresolved source is only given time
    // to render its empty pass.
    await (early ? settle(application) : turns());

    return {
      application,
      resolve: async () => {
        resolve();
        await settle(application);
      },
    };
  }

  async function turns(): Promise<void> {
    for (let turn = 0; turn < 5; turn++) await new Promise((done) => setTimeout(done));
  }

  async function settle(application: ApplicationRef): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await application.whenStable();
      await new Promise((done) => setTimeout(done));
    }
  }

  const copy = (): Element | null => host.querySelector('.ng-doc-hydration-snapshot');

  it('keeps the copy through the empty pass and reveals the loaded body before it renders', async () => {
    const { resolve } = await page(false, LOADED);

    // The processors rendered the empty body; the copy stays, inert, and the page is busy.
    expect(copy()?.textContent).toBe('Server-rendered body.');
    expect(copy()?.hasAttribute('inert')).toBe(true);
    expect(host.getAttribute('aria-busy')).toBe('true');

    await resolve();

    expect(copy()).toBeNull();
    expect(host.hasAttribute('data-ng-doc-hydration-snapshot')).toBe(false);
    expect(host.hasAttribute('aria-busy')).toBe(false);
    expect(host.querySelector('.ng-doc-page-wrapper')?.textContent).toContain('Loaded body.');
    // The demo rendered, and would have measured itself, visible.
    expect(renders).toEqual([{ hidden: false }]);
  });

  it('reveals a body that loaded before the first pass when that pass renders', async () => {
    await page(true, LOADED);

    expect(copy()).toBeNull();
    expect(host.querySelector('.ng-doc-page-wrapper')?.textContent).toContain('Loaded body.');
    expect(renders).toEqual([{ hidden: false }]);
  });

  it('releases the copy for an empty body that loads after the empty pass', async () => {
    const { resolve } = await page(false, '');

    expect(copy()).not.toBeNull();

    await resolve();

    // No new pass renders an unchanged empty body: the settled load releases the copy, and the
    // page controls show.
    expect(copy()).toBeNull();
    expect(host.hasAttribute('data-ng-doc-hydration-snapshot')).toBe(false);
    expect(host.querySelector('.ng-doc-page-controls')).not.toBeNull();
  });

  it('releases the copy for an empty body that loaded before the first pass', async () => {
    await page(true, '');

    expect(copy()).toBeNull();
    expect(host.hasAttribute('data-ng-doc-hydration-snapshot')).toBe(false);
  });
});
