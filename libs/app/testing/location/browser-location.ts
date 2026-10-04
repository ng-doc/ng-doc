import { PlatformLocation } from '@angular/common';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { inject, Provider } from '@angular/core';
import { WA_LOCATION } from '@ng-web-apis/common';

/**
 * Starts the browser's location of a test at a URL. TestBed replaces the browser's history with a
 * fake that the router updates, so `WA_LOCATION`, which reads `window.location`, follows that
 * fake here, as it follows the real history in a browser.
 * @param startUrl - The absolute URL of the document.
 * @param appBaseHref - The base href of the document.
 * @returns The providers.
 */
export function provideBrowserLocation(startUrl: string, appBaseHref: string = '/'): Provider[] {
  return [
    { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl, appBaseHref } },
    {
      provide: WA_LOCATION,
      useFactory: (): Pick<Location, 'href' | 'origin' | 'pathname'> => {
        const platform = inject(PlatformLocation);

        return {
          get href(): string {
            return platform.href;
          },
          get origin(): string {
            return new URL(platform.href).origin;
          },
          get pathname(): string {
            return platform.pathname;
          },
        };
      },
    },
  ];
}
