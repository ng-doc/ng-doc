import { Clipboard } from '@angular/cdk/clipboard';
import {
  HashLocationStrategy,
  LocationStrategy,
  PathLocationStrategy,
  PlatformLocation,
} from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterOutlet, withHashLocation } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocHeadingAnchorComponent } from '@ng-doc/app/components/heading-anchor';
import { NgDocPageComponent } from '@ng-doc/app/components/page';
import { NgDocPageLinkComponent } from '@ng-doc/app/components/page-link';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { NgDocTocComponent } from '@ng-doc/app/components/toc';
import { ɵngDocPageUrl, ɵngDocRouteUrl } from '@ng-doc/app/helpers';
import { NgDocTocItem } from '@ng-doc/app/interfaces';
import { NG_DOC_CONTEXT, NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import type { NgDocPage } from '@ng-doc/core/interfaces';
import { NgDocPageType } from '@ng-doc/core/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';
import { provideBrowserLocation } from '../location/browser-location';

/*
 * The links the reader copies or follows inside a page must work with the application's location
 * strategy: with `withHashLocation()` the route lives in the document's fragment
 * (`/#/docs/guide#usage`), so the document's `pathname` and `hash` are not the route's.
 */

/**
 * A document location with the parts the location strategies read.
 * @param url - The absolute URL of the document.
 * @returns The location.
 */
function documentAt(url: string): PlatformLocation & Location {
  const { href, origin, pathname, search, hash } = new URL(url);

  return { href, origin, pathname, search, hash } as unknown as PlatformLocation & Location;
}

describe('ɵngDocPageUrl and ɵngDocRouteUrl', () => {
  it('keep the document URL with the path location strategy', () => {
    const location = documentAt('https://ng-doc.test/docs/guide/?tab=api#usage');
    const strategy = new PathLocationStrategy(location, '/');

    expect(ɵngDocRouteUrl(strategy, location.href).href).toBe(location.href);
    // The path is the document's own, trailing slash included; the query is left out.
    expect(ɵngDocPageUrl(strategy, location)).toBe('https://ng-doc.test/docs/guide/');
    expect(ɵngDocPageUrl(strategy, location, 'install')).toBe(
      'https://ng-doc.test/docs/guide/#install',
    );
  });

  it('keep the base href with the path location strategy', () => {
    const location = documentAt('https://ng-doc.test/sub/docs/guide#usage');
    const strategy = new PathLocationStrategy(location, '/sub/');

    expect(ɵngDocPageUrl(strategy, location)).toBe('https://ng-doc.test/sub/docs/guide');
    expect(ɵngDocPageUrl(strategy, location, 'install')).toBe(
      'https://ng-doc.test/sub/docs/guide#install',
    );
  });

  it('keep an absolute base href with the path location strategy', () => {
    const location = documentAt('https://ng-doc.test/docs/guide');
    const strategy = new PathLocationStrategy(location, 'https://ng-doc.test');

    expect(ɵngDocPageUrl(strategy, location, 'install')).toBe(
      'https://ng-doc.test/docs/guide#install',
    );
  });

  it('read the route from the fragment with the hash location strategy', () => {
    const location = documentAt(
      'https://ng-doc.test/app/index.html?utm=1#/docs/guide?tab=api#usage',
    );
    const strategy = new HashLocationStrategy(location);
    const route = ɵngDocRouteUrl(strategy, location.href);

    expect(route.pathname).toBe('/docs/guide');
    expect(route.search).toBe('?tab=api');
    expect(route.hash).toBe('#usage');
    // The route follows the document's path; the queries of both are left out.
    expect(ɵngDocPageUrl(strategy, location)).toBe(
      'https://ng-doc.test/app/index.html#/docs/guide',
    );
    expect(ɵngDocPageUrl(strategy, location, 'install')).toBe(
      'https://ng-doc.test/app/index.html#/docs/guide#install',
    );
  });

  it('keep the application base href with the hash location strategy', () => {
    const location = documentAt('https://ng-doc.test/#/sub/docs/guide#usage');
    const strategy = new HashLocationStrategy(location, '/sub');

    expect(ɵngDocPageUrl(strategy, location, 'install')).toBe(
      'https://ng-doc.test/#/sub/docs/guide#install',
    );
  });

  it('read an empty fragment as the root route', () => {
    const location = documentAt('https://ng-doc.test/');
    const strategy = new HashLocationStrategy(location);

    expect(ɵngDocRouteUrl(strategy, location.href).pathname).toBe('/');
    expect(ɵngDocPageUrl(strategy, location)).toBe('https://ng-doc.test/#/');
  });

  it('do not read a route that starts with two slashes as another host', () => {
    const location = documentAt('https://ng-doc.test/#//evil.test/docs');
    const strategy = new HashLocationStrategy(location);

    expect(ɵngDocRouteUrl(strategy, location.href).origin).toBe('https://ng-doc.test');
  });
});

@Component({
  selector: 'ng-doc-location-anchor-host',
  imports: [NgDocHeadingAnchorComponent],
  template: `<h2 id="install">Install<ng-doc-heading-anchor anchor="install" /></h2>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HeadingAnchorHostComponent {}

@Component({
  selector: 'ng-doc-location-shell',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ShellComponent {}

@Component({
  selector: 'ng-doc-location-wrapper',
  imports: [NgDocPageWrapperComponent],
  template: `<ng-doc-page-wrapper [routes]="[]" headerContent="<h1>Guide</h1>" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WrapperComponent {}

@Component({
  selector: 'ng-doc-location-page',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: GuidePageComponent }],
})
class GuidePageComponent extends NgDocRootPage {
  override readonly page: NgDocPage = { title: 'Guide', mdFile: '' };
  readonly pageType: NgDocPageType = 'guide';
  readonly pageContent: string = '<p>Body</p>';
  readonly editSourceFileUrl?: string;
  readonly viewSourceFileUrl?: string;
}

/**
 * Creates headings for a table of contents.
 * @param titles - Titles of the headings, from the top of the page.
 * @returns The headings.
 */
function headings(titles: string[]): NgDocTocItem[] {
  return titles.map((title, index) => {
    const element = document.createElement('h2');

    element.getBoundingClientRect = () => ({ top: index * 800 + 200 }) as DOMRect;

    return { title, path: '/docs/guide', hash: `h${index}`, element, level: 1 };
  });
}

/** Waits until the application is stable for a while. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((done) => setTimeout(done));
  }
}

const strategies = [
  {
    name: 'path location',
    routerFeatures: [],
    /**
     * The URL the browser shows for a route.
     * @param route - The route, with its query and fragment.
     * @returns The absolute URL.
     */
    url: (route: string): string => `https://ng-doc.test${route}`,
    /**
     * The `href` of an application link.
     * @param route - The route, with its query and fragment.
     * @returns The `href`.
     */
    href: (route: string): string => route,
  },
  {
    name: 'hash location',
    routerFeatures: [withHashLocation()],
    url: (route: string): string => `https://ng-doc.test/#${route}`,
    href: (route: string): string => `#${route}`,
  },
];

for (const strategy of strategies) {
  describeChangeDetection(`Page links with the ${strategy.name} strategy`, ({ providers }) => {
    const copy = vi.fn();

    /**
     * Sets up the application, with the page of the route in its outlet, and opens a route.
     * @param route - The route, with its query and fragment.
     * @returns The element of the application.
     */
    async function open(route: string): Promise<HTMLElement> {
      TestBed.configureTestingModule({
        providers: [
          ...providers,
          provideRouter(
            [
              {
                path: 'docs/guide',
                component: WrapperComponent,
                children: [{ path: '', component: GuidePageComponent }],
              },
            ],
            ...strategy.routerFeatures,
          ),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: Clipboard, useValue: { copy } },
          // The browser's location, which the router updates.
          ...provideBrowserLocation('https://ng-doc.test/'),
          { provide: NG_DOC_PAGE_SKELETON, useValue: {} },
          { provide: NG_DOC_CONTEXT, useValue: { navigation: [] } },
        ],
      });
      const shell = TestBed.createComponent(ShellComponent);

      await TestBed.inject(Router).navigateByUrl(route);
      await settle();

      return shell.nativeElement;
    }

    beforeEach(() => copy.mockReset());

    afterEach(() => TestBed.resetTestingModule());

    it('shows the route in the browser the way the strategy does', async () => {
      await open('/docs/guide?tab=api#h1');

      expect(TestBed.inject(LocationStrategy)).toBeInstanceOf(
        strategy.name === 'hash location' ? HashLocationStrategy : PathLocationStrategy,
      );
      expect(TestBed.inject(PlatformLocation).href).toBe(strategy.url('/docs/guide?tab=api#h1'));
    });

    it('copies the link to the page from the table of contents', async () => {
      await open('/docs/guide?tab=api#h1');
      const toc = TestBed.createComponent(NgDocTocComponent);

      toc.componentRef.setInput('tableOfContent', headings(['Intro', 'Usage']));
      await settle();
      toc.componentInstance.copyLink();

      expect(copy).toHaveBeenCalledWith(strategy.url('/docs/guide'));
    });

    it('copies the link to the page from the page actions', async () => {
      const shell = await open('/docs/guide?tab=api#h1');

      shell.querySelector<HTMLButtonElement>('ng-doc-page .ng-doc-page-controls button')!.click();

      expect(copy).toHaveBeenCalledWith(strategy.url('/docs/guide'));
    });

    it('copies the link to a section from its heading', async () => {
      await open('/docs/guide?tab=api#h1');
      const fixture = TestBed.createComponent(HeadingAnchorHostComponent);

      await fixture.whenStable();
      const text: unknown = fixture.debugElement
        .query(By.directive(NgDocCopyButtonComponent))
        .componentInstance.text();

      expect(typeof text === 'function' ? text() : text).toBe(strategy.url('/docs/guide#install'));
    });

    it('marks the heading of the fragment in the URL when the table of contents renders', async () => {
      await open('/docs/guide#h2');
      const toc = TestBed.createComponent(NgDocTocComponent);

      toc.componentRef.setInput('tableOfContent', headings(['Intro', 'Usage', 'Details', 'API']));
      await settle();

      const selected = Array.from<HTMLElement>(
        toc.nativeElement.querySelectorAll('li[data-ng-doc-selected="true"]'),
      ).map((li) => li.textContent?.trim());

      expect(selected).toEqual(['Details']);
    });

    it('links a fragment in the content to a section of the page', async () => {
      await open('/docs/guide?tab=api#h1');
      const fixture = TestBed.createComponent(NgDocPageLinkComponent);

      fixture.componentRef.setInput('href', '#h2');
      await settle();

      expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe(
        strategy.href('/docs/guide?tab=api#h2'),
      );
      expect(fixture.componentInstance.path()).toBe('/docs/guide');
    });
  });
}
