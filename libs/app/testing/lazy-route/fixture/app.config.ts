import { ViewportScroller } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig, inject, provideEnvironmentInitializer } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

/** The scroll offset of the application's own pages: the height of its header. */
export const APP_SCROLL_OFFSET: [number, number] = [0, 48];

/** Providers of the application itself: no NgDoc provider is here. */
export const appProviders = [
  provideHttpClient(withInterceptorsFromDi()),
  // The application's own pages scroll anchors below its fixed header.
  provideEnvironmentInitializer(() => inject(ViewportScroller).setOffset(APP_SCROLL_OFFSET)),
];

export const appConfig: ApplicationConfig = {
  providers: [
    ...appProviders,
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
  ],
};
