import { InjectionToken } from '@angular/core';

import { NgDocUiKitTexts } from './texts.interfaces';

/**
 * The English texts of the `@ng-doc/ui-kit` components. They are the texts the components showed
 * before the texts could be changed, so an application that changes none renders as before.
 */
export const NG_DOC_UI_KIT_DEFAULT_TEXTS: NgDocUiKitTexts = Object.freeze({
  blockquote: Object.freeze({
    note: 'Note',
    warning: 'Warning',
    alert: 'Alert',
    success: 'Success',
  }),
  pane: Object.freeze({
    resizer: 'Resize the panes',
  }),
  combobox: Object.freeze({
    placeholder: 'Chose the value',
  }),
});

/**
 * The texts the `@ng-doc/ui-kit` components show. It resolves to `NG_DOC_UI_KIT_DEFAULT_TEXTS`
 * unless `provideNgDocTexts` from `@ng-doc/app` sets it.
 */
export const NG_DOC_UI_KIT_TEXTS: InjectionToken<NgDocUiKitTexts> =
  new InjectionToken<NgDocUiKitTexts>('NG_DOC_UI_KIT_TEXTS', {
    providedIn: 'root',
    factory: () => NG_DOC_UI_KIT_DEFAULT_TEXTS,
  });
