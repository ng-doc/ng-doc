import { isPlatformBrowser } from '@angular/common';
import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  PendingTasks,
  PLATFORM_ID,
  provideEnvironmentInitializer,
  Provider,
} from '@angular/core';
import { ɵcaptureNgDocHydrationSnapshots } from '@ng-doc/app/helpers';
import { NgDocApiListIndexService } from '@ng-doc/app/services';
import { NgDocContentScrollIntent } from '@ng-doc/app/services/content-scroll-intent';
import type { NgDocHighlighterConfig } from '@ng-doc/app/services/highlighter';
import { NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
import { NG_DOC_SHORTCUTS, NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import type { NgDocContentScrollPositionRestoration } from '@ng-doc/app/tokens';
import {
  NG_DOC_CONTENT_ANCHOR_SCROLLING,
  NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION,
} from '@ng-doc/app/tokens';
import type { NgDocUiConfig } from '@ng-doc/ui-kit';
import { provideNgDocUiKitConfig } from '@ng-doc/ui-kit';

/**
 * NgDoc application config.
 */
export interface NgDocApplicationConfig {
  /**
   * Replays a router anchor scroll once asynchronous NgDoc content has been processed.
   * Enable this beside Angular router anchor scrolling.
   */
  contentAnchorScrolling?: boolean;
  /**
   * Replays a saved router position after asynchronous NgDoc content is processed.
   * Select the same intent as Angular router scroll position restoration.
   */
  contentScrollPositionRestoration?: NgDocContentScrollPositionRestoration;
  /**
   * UI Kit configuration.
   */
  uiKit?: NgDocUiConfig;
  /**
   * Extra Shiki themes and languages for the code that the browser highlights.
   */
  shiki?: NgDocHighlighterConfig;
  /**
   * Whether single-key shortcuts (slash, the square brackets, F, L and T) are on for readers who
   * have not turned them on or off themselves. Readers can always change it with the switch in
   * the search palette. Command+K (Control+K) opens the search either way. Defaults to true.
   */
  shortcuts?: boolean;
}

/**
 * Provides the NgDoc application configuration.
 *
 * Add it to the application's providers, or to the `providers` of the route that holds the
 * documentation, together with the other NgDoc providers: then NgDoc starts only when the reader
 * opens the documentation, and its code stays out of the application's initial bundle. It starts
 * with environment initializers, which run where it is provided. The server render waits until
 * the code highlighter of playgrounds has loaded.
 * @param config - The optional application configuration.
 */
export function provideNgDocApp(
  config?: NgDocApplicationConfig,
): Array<EnvironmentProviders | Provider> {
  return [
    { provide: NG_DOC_CONTENT_ANCHOR_SCROLLING, useValue: config?.contentAnchorScrolling ?? false },
    {
      provide: NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION,
      useValue: config?.contentScrollPositionRestoration ?? 'disabled',
    },
    { provide: NG_DOC_SHORTCUTS, useValue: config?.shortcuts ?? true },

    /* --- Services --- */
    // Provided where the configuration is, so that they read the NgDoc providers of a lazy route
    // (the generated context, the shortcuts option): an instance in the root injector could not
    // see them. In the root injector this is the instance `providedIn: 'root'` gives.
    NgDocHighlighterService,
    NgDocShortcutsService,
    NgDocApiListIndexService,

    ...(config?.contentAnchorScrolling || config?.contentScrollPositionRestoration === 'enabled'
      ? [
          provideEnvironmentInitializer(() => {
            inject(NgDocContentScrollIntent).start();
          }),
        ]
      : []),

    /* --- Hydration --- */
    // Before the documentation renders: the pages and headers that skip hydration show their
    // server-rendered content until their own is rendered, instead of a blank page. A lazy route
    // creates its injector before it creates its components, so this also runs in time when the
    // documentation is the first route the browser hydrates.
    provideEnvironmentInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) ɵcaptureNgDocHydrationSnapshots(inject(DOCUMENT));
    }),

    /* --- Shiki --- */
    // Started with the documentation instead of blocking the application's start: the playgrounds
    // highlight their code once it is ready, and the application stays unstable until then, so the
    // server renders the highlighted code.
    provideEnvironmentInitializer(() => {
      const highlighter = inject(NgDocHighlighterService);

      inject(PendingTasks).run(() => highlighter.initialize(config?.shiki));
    }),

    /* --- UiKit --- */
    ...provideNgDocUiKitConfig(config?.uiKit),
  ];
}
