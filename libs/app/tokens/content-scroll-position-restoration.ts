import { InjectionToken } from '@angular/core';

export type NgDocContentScrollPositionRestoration = 'enabled' | 'top' | 'disabled';

/** Declares whether delayed NgDoc content may replay a missed saved scroll position. */
export const NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION =
  new InjectionToken<NgDocContentScrollPositionRestoration>(
    'NG_DOC_CONTENT_SCROLL_POSITION_RESTORATION',
    { providedIn: 'root', factory: () => 'disabled' },
  );
