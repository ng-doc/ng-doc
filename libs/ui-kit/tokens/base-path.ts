import { isPlatformBrowser } from '@angular/common';
import { inject, InjectionToken, PLATFORM_ID } from '@angular/core';

export const NG_REQUEST_BASE_PATH: InjectionToken<string> = new InjectionToken(
  'NG_REQUEST_BASE_PATH',
  {
    providedIn: 'root',
    factory: () => (isPlatformBrowser(inject(PLATFORM_ID)) ? '' : '/'),
  },
);
