import { inject, InjectionToken, Provider } from '@angular/core';
import type { NgDocTexts, NgDocTextsOverrides } from '@ng-doc/app/interfaces';
import { mergeNgDocTexts, NG_DOC_DEFAULT_TEXTS, NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import { NG_DOC_UI_KIT_TEXTS } from '@ng-doc/ui-kit/tokens';

/** The changes of every `provideNgDocTexts` call of one injector, in the order of the calls. */
const NG_DOC_TEXTS_OVERRIDES = new InjectionToken<NgDocTextsOverrides[]>('NG_DOC_TEXTS_OVERRIDES');

/**
 * Changes the texts NgDoc shows to readers, for example to translate them. Pass the groups and
 * texts to change; every other text keeps its English default (`NG_DOC_DEFAULT_TEXTS`).
 *
 * Calls add up: in one injector the calls apply in order, so a later call wins for a text both
 * set, and the providers of a child injector (a lazy route, for example) apply on top of the
 * texts of its parent. The texts are read when a component is created, so they are fixed per
 * injector: switch the language by reloading the application, not at run time.
 * @example
 * ```typescript
 * provideNgDocTexts({
 *   search: { placeholder: 'Dokumentation durchsuchen…' },
 *   searchPalette: { noResults: ({ query }) => `Keine Ergebnisse für „${query}“` },
 * });
 * ```
 * @param texts - The texts to change, by group.
 * @returns The providers to add to the application, a route or a page.
 */
export function provideNgDocTexts(texts: NgDocTextsOverrides): Provider[] {
  return [
    { provide: NG_DOC_TEXTS_OVERRIDES, useValue: texts, multi: true },
    { provide: NG_DOC_TEXTS, useFactory: resolveTexts },
    // The ui-kit components read their own token: NgDocTexts extends NgDocUiKitTexts, so the
    // same object serves both and the two libraries always show the same texts.
    { provide: NG_DOC_UI_KIT_TEXTS, useFactory: () => inject(NG_DOC_TEXTS) },
  ];
}

/** The texts of the parent injector, or the defaults, with this injector's changes on top. */
function resolveTexts(): NgDocTexts {
  const parent: NgDocTexts | null = inject(NG_DOC_TEXTS, { skipSelf: true, optional: true });

  return mergeNgDocTexts(
    parent ?? NG_DOC_DEFAULT_TEXTS,
    ...inject(NG_DOC_TEXTS_OVERRIDES, { self: true }),
  );
}
