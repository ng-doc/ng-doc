import { ViewportScroller } from '@angular/common';
import { APP_INITIALIZER, inject, Provider } from '@angular/core';
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
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [ViewportScroller],
      useFactory: (viewportScroller: ViewportScroller) => {
        return () => viewportScroller.setOffset([0, 120]);
      },
    },

    /* --- Shiki --- */
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const highlighter = inject(NgDocHighlighterService);

        return () => highlighter.initialize(config?.shiki);
      },
    },

    /* --- UiKit --- */
    ...provideNgDocUiKitConfig(config?.uiKit),
  ];
}
