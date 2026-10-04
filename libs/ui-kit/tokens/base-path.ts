import { APP_BASE_HREF, isPlatformBrowser } from '@angular/common';
import { DOCUMENT, inject, InjectionToken, PLATFORM_ID } from '@angular/core';

function withTrailingSeparator(value: string | null | undefined): string {
  const base = value?.trim().split(/[?#]/, 1)[0] ?? '';

  return base ? (base.endsWith('/') ? base : `${base}/`) : '/';
}

function documentBasePath(document: Document | null): string | null {
  if (!document) return null;
  const value = document.querySelector('base[href]')?.getAttribute('href');
  if (value === null || value === undefined) return null;

  const documentUrl = new URL(document.URL);
  const resolved = new URL(value, documentUrl);
  const directory = new URL('.', resolved);

  return directory.origin === documentUrl.origin
    ? directory.pathname
    : `${directory.origin}${directory.pathname}`;
}

function requestBasePath(): string {
  if (isPlatformBrowser(inject(PLATFORM_ID))) return '';

  // Browser-relative asset requests follow the document base, so SSR must prefer the same source.
  // APP_BASE_HREF remains the fallback for hosts that configure routing without a DOM base.
  const configured = inject(APP_BASE_HREF, { optional: true });
  const documentBase = documentBasePath(inject(DOCUMENT, { optional: true }));

  return withTrailingSeparator(documentBase ?? configured);
}

export const NG_REQUEST_BASE_PATH: InjectionToken<string> = new InjectionToken(
  'NG_REQUEST_BASE_PATH',
  {
    providedIn: 'root',
    factory: requestBasePath,
  },
);
