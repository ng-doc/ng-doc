import { ViewportScroller } from '@angular/common';
import { inject, provideAppInitializer, Provider } from '@angular/core';
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
export function provideNgDocApp(config?: NgDocApplicationConfig): Provider[] {
  return [
    /* --- Viewport Scroller --- */
    provideAppInitializer(() => {
      const initializerFn = ((viewportScroller: ViewportScroller) => {
        return () => viewportScroller.setOffset([0, 120]);
      })(inject(ViewportScroller));
      return initializerFn();
    }),

    /* --- Shiki --- */
    provideAppInitializer(() => {
      const initializerFn = (() => {
        const highlighter = inject(NgDocHighlighterService);

        return () => highlighter.initialize(config?.shiki);
      })();
      return initializerFn();
    }),

    /* --- UiKit --- */
    ...provideNgDocUiKitConfig(config?.uiKit),
  ];
}
