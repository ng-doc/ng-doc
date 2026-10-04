import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  EnvironmentProviders,
  PLATFORM_ID,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet, Routes } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPageComponent } from '@ng-doc/app/components/page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import {
  NgDocCustomNavbarDirective,
  NgDocCustomSidebarDirective,
  NgDocRootComponent,
} from '@ng-doc/app/components/root';
import { NgDocFullscreenRouteService } from '@ng-doc/app/services/fullscreen-route';
import { NG_DOC_CONTEXT, NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import type { NgDocContentModule, NgDocContentSource, NgDocPage } from '@ng-doc/core/interfaces';
import { NgDocPageType } from '@ng-doc/core/types';
import { afterEach, describe, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

/*
 * A fullscreen route (a child route of a generated page) opens as a standalone page: only the
 * routed component, on the canvas of demos, with a link back to the page. The application's own
 * template (`ng-doc-root` with its navbar and sidebar) stays as it is.
 */

/** How many times the asynchronous page loaded its content. */
let asyncLoads = 0;

const asyncSource: NgDocContentSource = {
  id: 'async-body',
  load: async (): Promise<NgDocContentModule> => {
    asyncLoads++;

    return { schemaVersion: 1, id: 'async-body', revision: 'r1', html: '<p class="body">Body</p>' };
  },
};

@Component({
  selector: 'ng-doc-route-shell',
  imports: [
    NgDocRootComponent,
    NgDocCustomNavbarDirective,
    NgDocCustomSidebarDirective,
    RouterOutlet,
  ],
  template: `
    <ng-doc-root footerContent="Footer">
      <nav class="test-navbar" ngDocCustomNavbar>Navbar</nav>
      <nav class="test-sidebar" ngDocCustomSidebar>Sidebar</nav>
      <router-outlet />
    </ng-doc-root>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ShellComponent {}

@Component({
  selector: 'ng-doc-route-wrapper',
  imports: [NgDocPageWrapperComponent],
  template: `<ng-doc-page-wrapper [routes]="[]" headerContent="<h1>Header</h1>" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WrapperComponent {}

@Component({
  selector: 'ng-doc-route-demo',
  template: `<button type="button" class="demo">Demo button</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DemoComponent {}

abstract class TestPage extends NgDocRootPage {
  readonly pageType: NgDocPageType = 'guide';
  readonly pageContent: string = '<p class="body">Body</p>';
  readonly editSourceFileUrl?: string;
  readonly viewSourceFileUrl?: string;
}

@Component({
  selector: 'ng-doc-route-buttons-page',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: ButtonsPageComponent }],
})
class ButtonsPageComponent extends TestPage {
  override readonly page: NgDocPage = { title: 'Buttons', mdFile: '' };
}

@Component({
  selector: 'ng-doc-route-own-page',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: OwnRoutesPageComponent }],
})
class OwnRoutesPageComponent extends TestPage {
  override readonly page: NgDocPage = {
    title: 'Own routes',
    mdFile: '',
    disableFullscreenRoutes: true,
  };
}

@Component({
  selector: 'ng-doc-route-async-page',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: AsyncPageComponent }],
})
class AsyncPageComponent extends TestPage {
  override readonly pageContent: string = '';
  override readonly pageContentSource = asyncSource;
  override readonly page: NgDocPage = { title: 'Async', mdFile: '' };
}

/**
 * The routes of a generated page with a `button` child route.
 * @param path - The path of the page.
 * @param page - The page component.
 * @returns The route.
 */
function pageRoute(path: string, page: Routes[number]['component']): Routes[number] {
  return {
    path,
    component: WrapperComponent,
    children: [
      { path: '', component: page, children: [{ path: 'button', component: DemoComponent }] },
    ],
  };
}

/**
 * Creates the application shell and opens a URL.
 * @param providers - The change detection providers and any others.
 * @param url - The URL to open.
 * @returns The host element.
 */
async function open(
  providers: Array<Provider | EnvironmentProviders>,
  url: string,
): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        pageRoute('buttons', ButtonsPageComponent),
        pageRoute('own', OwnRoutesPageComponent),
        pageRoute('async', AsyncPageComponent),
      ]),
      provideHttpClient(),
      { provide: NG_DOC_PAGE_SKELETON, useValue: {} },
      { provide: NG_DOC_CONTEXT, useValue: { navigation: [] } },
      ...providers,
    ],
  });

  const fixture = TestBed.createComponent(ShellComponent);

  await fixture.whenStable();
  await navigate(url);

  return fixture.nativeElement;
}

/**
 * Navigates and waits until the application is stable.
 * @param url - The URL.
 */
async function navigate(url: string): Promise<void> {
  await TestBed.inject(Router).navigateByUrl(url);
  await settle();
}

/** Waits until the application is stable for a while. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((done) => setTimeout(done));
  }
}

/**
 * What the application shows.
 * @param host - The host element.
 * @returns Whether the chrome is hidden, and what the page shows.
 */
function shown(host: HTMLElement): {
  root: string | null;
  wrapper: string | null;
  body: boolean;
  demo: boolean;
} {
  return {
    root: host.querySelector('ng-doc-root')!.getAttribute('data-ng-doc-fullscreen-route'),
    wrapper:
      host.querySelector('ng-doc-page-wrapper')?.getAttribute('data-ng-doc-fullscreen-route') ??
      null,
    body: !!host.querySelector('ng-doc-page .body'),
    demo: !!host.querySelector('ng-doc-page .ng-doc-fullscreen-route .demo'),
  };
}

describeChangeDetection('Fullscreen routes', ({ providers }) => {
  afterEach(() => {
    asyncLoads = 0;
    TestBed.resetTestingModule();
  });

  it('opens a fullscreen route as a standalone page, without a dialog', async () => {
    const host = await open(providers, '/buttons/button');
    const back = host.querySelector<HTMLAnchorElement>('.ng-doc-fullscreen-route-back');

    expect(shown(host)).toEqual({ root: 'true', wrapper: 'true', body: false, demo: true });
    expect(host.querySelector<HTMLElement>('.ng-doc-fullscreen-route')?.hidden).toBe(false);
    // The page actions belong to the page, which is not shown.
    expect(host.querySelector('.ng-doc-page-controls')).toBeNull();
    expect(host.querySelector('ng-doc-dialog-outlet')).toBeNull();
    expect(document.querySelector('ng-doc-dialog')).toBeNull();
    expect(back?.getAttribute('href')).toBe('/buttons');
    expect(back?.getAttribute('aria-label')).toBe('Back to Buttons');
    expect(back?.textContent?.trim()).toBe('Buttons');
    // The navbar and the sidebar of the application's template are still rendered (the browser
    // hydrates the same markup), and hidden by the styles of the root.
    expect(host.querySelector('.test-navbar')).not.toBeNull();
    expect(TestBed.inject(NgDocFullscreenRouteService).active()).toBe(true);
  });

  it('opens and closes in place, back to the page', async () => {
    const host = await open(providers, '/buttons');

    expect(shown(host)).toEqual({ root: 'false', wrapper: 'false', body: true, demo: false });
    expect(host.querySelector<HTMLElement>('.ng-doc-fullscreen-route')?.hidden).toBe(true);

    await navigate('/buttons/button');

    expect(shown(host)).toEqual({ root: 'true', wrapper: 'true', body: false, demo: true });

    host.querySelector<HTMLAnchorElement>('.ng-doc-fullscreen-route-back')!.click();
    await settle();

    expect(TestBed.inject(Router).url).toBe('/buttons');
    expect(shown(host)).toEqual({ root: 'false', wrapper: 'false', body: true, demo: false });
    expect(host.querySelector('.ng-doc-fullscreen-route-back')).toBeNull();
  });

  it('shows the chrome again when the reader leaves for another page', async () => {
    const host = await open(providers, '/buttons/button');

    await navigate('/own');

    expect(shown(host)).toEqual({ root: 'false', wrapper: 'false', body: true, demo: false });
    expect(TestBed.inject(NgDocFullscreenRouteService).active()).toBe(false);
  });

  it('loads asynchronous page content only when the reader goes back to the page', async () => {
    const host = await open(providers, '/async/button');

    // The application is stable without the content: a prerender of the route completes.
    expect(asyncLoads).toBe(0);
    expect(shown(host)).toEqual({ root: 'true', wrapper: 'true', body: false, demo: true });
    expect(host.querySelector('ng-doc-page')?.hasAttribute('data-ng-doc-async-content')).toBe(
      false,
    );

    await navigate('/async');

    expect(asyncLoads).toBe(1);
    expect(shown(host)).toEqual({ root: 'false', wrapper: 'false', body: true, demo: false });
  });

  it('leaves child routes to the page with disableFullscreenRoutes, as before', async () => {
    const host = await open(providers, '/own/button');

    expect(shown(host)).toEqual({ root: 'false', wrapper: 'false', body: true, demo: false });
    expect(host.querySelector('.ng-doc-fullscreen-route')).toBeNull();
    expect(host.querySelector('ng-doc-page router-outlet')).toBeNull();
  });
});

describe('Fullscreen routes on the server', () => {
  const globals = globalThis as { ngServerMode?: boolean };
  const serverMode = globals.ngServerMode;

  afterEach(() => {
    globals.ngServerMode = serverMode;
    TestBed.resetTestingModule();
  });

  it('renders the standalone page', async () => {
    // `ngServerMode` switches the render hooks off, as in a server bundle.
    globals.ngServerMode = true;
    const host = await open(
      [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: 'server' }],
      '/buttons/button',
    );

    expect(shown(host)).toEqual({ root: 'true', wrapper: 'true', body: false, demo: true });
  });
});

describe('NgDocFullscreenRouteService in the browser', () => {
  let rendered: HTMLElement;

  afterEach(() => {
    rendered.remove();
    TestBed.resetTestingModule();
  });

  it('keeps the server-rendered state until the first navigation settles', async () => {
    // The server-rendered root of a fullscreen route, which the browser hydrates.
    rendered = document.createElement('ng-doc-root');
    rendered.setAttribute('data-ng-doc-fullscreen-route', 'true');
    document.body.appendChild(rendered);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([{ path: '**', children: [] }])],
    });
    const service = TestBed.inject(NgDocFullscreenRouteService);

    expect(service.active()).toBe(true);

    await TestBed.inject(Router).navigateByUrl('/');

    expect(service.active()).toBe(false);
  });

  it('starts hidden without a server-rendered fullscreen route', () => {
    rendered = document.createElement('div');
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });

    expect(TestBed.inject(NgDocFullscreenRouteService).active()).toBe(false);
  });
});
