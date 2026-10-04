import { InjectionToken } from '@angular/core';

/** Enables one delayed anchor replay after asynchronous NgDoc content is processed. */
export const NG_DOC_CONTENT_ANCHOR_SCROLLING = new InjectionToken<boolean>(
  'NG_DOC_CONTENT_ANCHOR_SCROLLING',
  { providedIn: 'root', factory: () => false },
);
