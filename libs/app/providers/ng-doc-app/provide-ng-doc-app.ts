import { isPlatformBrowser, ViewportScroller } from '@angular/common';
import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  PLATFORM_ID,
  provideAppInitializer,
  Provider,
} from '@angular/core';
import { ɵcaptureNgDocHydrationSnapshots } from '@ng-doc/app/helpers';
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
    ...(config?.contentAnchorScrolling || config?.contentScrollPositionRestoration === 'enabled'
      ? [
          provideAppInitializer(() => {
            inject(NgDocContentScrollIntent).start();
          }),
        ]
      : []),

    /* --- Hydration --- */
    // Before the application renders: the pages and headers that skip hydration show their
    // server-rendered content until their own is rendered, instead of a blank page.
    provideAppInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) ɵcaptureNgDocHydrationSnapshots(inject(DOCUMENT));
    }),

    /* --- Keyboard shortcuts --- */
    { provide: NG_DOC_SHORTCUTS, useValue: config?.shortcuts ?? true },
    // Created at start-up so the built-in shortcuts work on every page.
    provideAppInitializer(() => {
      inject(NgDocShortcutsService);
    }),

    /* --- Viewport Scroller --- */
    provideAppInitializer(() => {
      inject(ViewportScroller).setOffset([0, 120]);
    }),

    /* --- Shiki --- */
    provideAppInitializer(async () => {
      await inject(NgDocHighlighterService).initialize(config?.shiki);
    }),

    /* --- UiKit --- */
    ...provideNgDocUiKitConfig(config?.uiKit),
  ];
}
