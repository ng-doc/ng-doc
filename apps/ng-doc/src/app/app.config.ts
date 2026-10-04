import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling, withPreloading } from '@angular/router';
import {
  NG_DOC_DEFAULT_PAGE_PROCESSORS,
  NG_DOC_DEFAULT_PAGE_SKELETON,
  NgDocDefaultSearchEngine,
  NgDocPreloadingStrategy,
  provideMainPageProcessor,
  provideMermaid,
  provideNgDocApp,
  providePageSkeleton,
  provideSearchEngine,
} from '@ng-doc/app';
import { provideNgDocContext } from '@ng-doc/generated';

/**
 * Hydration of the server-rendered document. The server always adds it; the browser adds it only
 * to a document the server rendered, because the Vite dev server serves a client-rendered
 * `index.html` and Angular warns (NG0505) when hydration finds no serialized state.
 */
export const hydrationProviders = provideClientHydration(withNoIncrementalHydration());

export const appConfig: ApplicationConfig = {
  providers: [
    provideNgDocContext(),
    provideNgDocApp({
      contentAnchorScrolling: true,
      contentScrollPositionRestoration: 'enabled',
    }),
    provideSearchEngine(NgDocDefaultSearchEngine),
    providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),
    provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),
    provideMermaid(),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideRouter(
      [
        {
          path: 'docs',
          loadChildren: () => import('./pages/docs/docs.routes'),
        },
        {
          path: '',
          loadChildren: () => import('./pages/landing/landing.routes'),
          pathMatch: 'full',
          data: { hideSidebar: true },
        },
        {
          path: '**',
          redirectTo: 'docs/get-started/installation',
          pathMatch: 'full',
        },
      ],
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      // Preloads a page when the reader is about to open a link to it.
      withPreloading(NgDocPreloadingStrategy),
    ),
  ],
};
