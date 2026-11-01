/**
 * @vitest-environment node
 */

import { NgDocTexts } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS_AR } from '@ng-doc/app/texts/ar';
import { NG_DOC_TEXTS_DE } from '@ng-doc/app/texts/de';
import { NG_DOC_TEXTS_ES } from '@ng-doc/app/texts/es';
import { NG_DOC_TEXTS_FR } from '@ng-doc/app/texts/fr';
import { NG_DOC_TEXTS_HI } from '@ng-doc/app/texts/hi';
import { NG_DOC_TEXTS_JA } from '@ng-doc/app/texts/ja';
import { NG_DOC_TEXTS_KO } from '@ng-doc/app/texts/ko';
import { NG_DOC_TEXTS_PT_BR } from '@ng-doc/app/texts/pt-br';
import { NG_DOC_TEXTS_RU } from '@ng-doc/app/texts/ru';
import { NG_DOC_TEXTS_UK } from '@ng-doc/app/texts/uk';
import { NG_DOC_TEXTS_ZH } from '@ng-doc/app/texts/zh';
import { NG_DOC_DEFAULT_TEXTS } from '@ng-doc/app/tokens';
import { describe, expect, it } from 'vitest';

const LANGUAGES: Record<string, NgDocTexts> = {
  ar: NG_DOC_TEXTS_AR,
  de: NG_DOC_TEXTS_DE,
  es: NG_DOC_TEXTS_ES,
  fr: NG_DOC_TEXTS_FR,
  hi: NG_DOC_TEXTS_HI,
  ja: NG_DOC_TEXTS_JA,
  ko: NG_DOC_TEXTS_KO,
  'pt-br': NG_DOC_TEXTS_PT_BR,
  ru: NG_DOC_TEXTS_RU,
  uk: NG_DOC_TEXTS_UK,
  zh: NG_DOC_TEXTS_ZH,
};

type Texts = Record<string, Record<string, unknown>>;

/**
 * The parameters a text with values is called with: every value is a marker that names it, so a
 * translation that drops a value the English text shows is found. Counts and positions are
 * numbers, called with several values so each plural form is reached.
 * @param count - The number for `count` and `index`.
 */
function parameters(count: number): object {
  return new Proxy(
    {},
    { get: (_, key) => (key === 'count' || key === 'index' ? count : `«${String(key)}»`) },
  );
}

/** The markers of the values a text shows. */
const markers = (text: string): string[] => (text.match(/«\w+»/g) ?? []).sort();

describe('the translated texts', () => {
  const english = NG_DOC_DEFAULT_TEXTS as unknown as Texts;

  for (const [language, texts] of Object.entries(LANGUAGES) as Array<[string, unknown]>) {
    describe(language, () => {
      const translated = texts as Texts;

      it('have every group and text of the English defaults, and no other', () => {
        const keys = (all: Texts) =>
          Object.fromEntries(
            Object.entries(all).map(([group, t]) => [group, Object.keys(t).sort()]),
          );

        expect(keys(translated)).toEqual(keys(english));
        expect(Object.isFrozen(translated)).toBe(true);
      });

      it('are texts where the defaults are texts, and functions where they take values', () => {
        const wrong: string[] = [];

        for (const [group, values] of Object.entries(english)) {
          for (const [key, value] of Object.entries(values)) {
            const own = translated[group]?.[key];

            if (typeof own !== typeof value || (typeof own === 'string' && !own.trim())) {
              wrong.push(`${group}.${key}`);
            }
          }
        }
        expect(wrong).toEqual([]);
      });

      it('show every value that the English text shows', () => {
        const wrong: string[] = [];

        for (const [group, values] of Object.entries(english)) {
          for (const [key, value] of Object.entries(values)) {
            if (typeof value !== 'function') continue;
            for (const count of [0, 1, 2, 3, 5, 11, 21, 100]) {
              const expected: string[] = markers(value(parameters(count)));
              const own = (translated[group][key] as (p: object) => string)(parameters(count));

              const source: string = value(parameters(count));
              const lostCount = source.includes(String(count)) && !own.includes(String(count));

              if (!own.trim() || markers(own).join() !== expected.join() || lostCount) {
                wrong.push(`${group}.${key} (${count}): ${own}`);
              }
            }
          }
        }
        expect(wrong).toEqual([]);
      });
    });
  }
});
