import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPageComponent } from '@ng-doc/app/components/page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { blockquoteProcessor, codeProcessor } from '@ng-doc/app/processors/processors';
import { NG_DOC_CONTEXT, NG_DOC_PAGE_PROCESSOR, NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import type { NgDocContentModule, NgDocContentSource, NgDocPage } from '@ng-doc/core/interfaces';
import { NgDocPageType } from '@ng-doc/core/types';
import { afterEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

/*
 * The page processor creates its components through a `ViewContainerRef`, and since Angular 22.2
 * such a component takes the namespace of its container's parent. In the page template, the
 * content follows the page controls, whose icons are inline SVG. These specs keep the components
 * of the page content HTML elements, in both branches of the template: the static content of the
 * legacy engine and the content source of the Vite engine.
 */

const XHTML = 'http://www.w3.org/1999/xhtml';

const CONTENT =
  '<pre class="shiki"><code class="language-json"><span class="line">{}</span></code></pre>' +
  '<ng-doc-blockquote><p>Note</p></ng-doc-blockquote>';

const source: NgDocContentSource = {
  id: 'namespace-body',
  load: async (): Promise<NgDocContentModule> => ({
    schemaVersion: 1,
    id: 'namespace-body',
    revision: 'r1',
    html: CONTENT,
  }),
};

@Component({
  selector: 'ng-doc-namespace-shell',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ShellComponent {}

@Component({
  selector: 'ng-doc-namespace-wrapper',
  imports: [NgDocPageWrapperComponent],
  template: `<ng-doc-page-wrapper [routes]="[]" headerContent="<h1>Namespace</h1>" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WrapperComponent {}

abstract class TestPage extends NgDocRootPage {
  readonly pageType: NgDocPageType = 'guide';
  override readonly page: NgDocPage = { title: 'Namespace', mdFile: '' };
  // Every page control with an inline SVG icon is shown.
  readonly editSourceFileUrl: string = 'https://example.com/edit';
  readonly viewSourceFileUrl: string = 'https://example.com/view';
}

@Component({
  selector: 'ng-doc-namespace-static-page',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: StaticPageComponent }],
})
class StaticPageComponent extends TestPage {
  readonly pageContent: string = CONTENT;
}

@Component({
  selector: 'ng-doc-namespace-source-page',
  imports: [NgDocPageComponent],
  template: '<ng-doc-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgDocRootPage, useExisting: SourcePageComponent }],
})
class SourcePageComponent extends TestPage {
  readonly pageContent: string = '';
  override readonly pageContentSource = source;
}

/** Waits until the application is stable for a while. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((done) => setTimeout(done));
  }
}

describeChangeDetection('Namespace of the page content', ({ providers }) => {
  afterEach(() => TestBed.resetTestingModule());

  for (const [kind, url] of [
    ['static content', '/static'],
    ['a content source', '/source'],
  ] as const) {
    it(`creates the components of ${kind} as HTML elements`, async () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            {
              path: 'static',
              component: WrapperComponent,
              children: [{ path: '', component: StaticPageComponent }],
            },
            {
              path: 'source',
              component: WrapperComponent,
              children: [{ path: '', component: SourcePageComponent }],
            },
          ]),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: NG_DOC_PAGE_SKELETON, useValue: {} },
          { provide: NG_DOC_CONTEXT, useValue: { navigation: [] } },
          { provide: NG_DOC_PAGE_PROCESSOR, useValue: codeProcessor, multi: true },
          { provide: NG_DOC_PAGE_PROCESSOR, useValue: blockquoteProcessor, multi: true },
          ...providers,
        ],
      });

      const host: HTMLElement = TestBed.createComponent(ShellComponent).nativeElement;

      await TestBed.inject(Router).navigateByUrl(url);
      await settle();

      const created = ['ng-doc-code', 'blockquote[ng-doc-blockquote]'].map(
        (selector: string) => host.querySelector(`ng-doc-page ${selector}`)?.namespaceURI,
      );

      expect(created).toEqual([XHTML, XHTML]);
    });
  }
});
