import { ViewportScroller } from '@angular/common';
import { APP_INITIALIZER, Provider } from '@angular/core';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NgDocUiConfig, provideNgDocUiKitConfig } from '@ng-doc/ui-kit';

/**
 * NgDoc application config.
 */
export interface NgDocApplicationConfig {
  /**
   * UI Kit configuration.
   */
  uiKit?: NgDocUiConfig;
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

    /* --- UiKit --- */
    ...provideNgDocUiKitConfig(config?.uiKit),
    NgDocThemeService,
  ];
}
