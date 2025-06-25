import { isPlatformBrowser, ViewportScroller } from '@angular/common';
import {
  EnvironmentProviders,
  inject,
  PLATFORM_ID,
  provideAppInitializer,
  Provider,
} from '@angular/core';
import { NgDocHighlighterConfig, NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
import { NG_REQUEST_BASE_PATH } from '@ng-doc/core';
import { NgDocUiConfig, provideNgDocUiKitConfig } from '@ng-doc/ui-kit';

/**
 * NgDoc application config.
 */
export interface NgDocApplicationConfig {
  /**
   * UI Kit configuration.
   */
  uiKit?: NgDocUiConfig;
  /**
   * Shiki theme.
   */
  shiki?: NgDocHighlighterConfig;
}

/**
 * Provides the NgDoc application configuration.
 * @param config - The optional application configuration.
 */
export function provideNgDocApp(
  config?: NgDocApplicationConfig,
): Array<EnvironmentProviders | Provider> {
  return [
    /* --- Viewport Scroller --- */
    provideAppInitializer(() => {
      inject(ViewportScroller).setOffset([0, 120]);
    }),

    /* --- Shiki --- */
    provideAppInitializer(async () => {
      await inject(NgDocHighlighterService).initialize(config?.shiki);
    }),

    {
      provide: NG_REQUEST_BASE_PATH,
      useFactory: () => {
        return isPlatformBrowser(inject(PLATFORM_ID)) ? '' : '/';
      },
    },

    /* --- UiKit --- */
    ...provideNgDocUiKitConfig(config?.uiKit),
  ];
}
