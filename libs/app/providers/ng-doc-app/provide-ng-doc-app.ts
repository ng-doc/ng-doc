import { ViewportScroller } from '@angular/common';
import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { NgDocHighlighterConfig, NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
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

    /* --- UiKit --- */
    ...provideNgDocUiKitConfig(config?.uiKit),
  ];
}
