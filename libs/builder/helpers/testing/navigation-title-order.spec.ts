import { afterEach, describe, expect, it, vi } from 'vitest';

import { compareNavigationTitles } from '../navigation-title-order';
import { sortNavigationEntries } from '../sort-navigation-entities';

const swedish = new Intl.Collator('sv');

/** Entries without an order, as the legacy navigation builds them. */
const entries = (...titles: string[]) =>
  titles.map((title) => ({ item: { title } })) as unknown as Parameters<
    typeof sortNavigationEntries
  >[0];

describe('the navigation title order', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is English whatever the process locale', () => {
    // A process whose default locale is Swedish sorts `Ä` after `Z` with `localeCompare`.
    vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (
      this: string,
      other: string,
    ) {
      return swedish.compare(String(this), other);
    });
    expect('Ärlig'.localeCompare('Zeta')).toBeGreaterThan(0);
    expect(compareNavigationTitles('Ärlig', 'Zeta')).toBeLessThan(0);
    expect(
      sortNavigationEntries(entries('Zeta', 'Ärlig', 'apple', 'Banana')).map(
        (entry) => entry.item.title,
      ),
    ).toEqual(['apple', 'Ärlig', 'Banana', 'Zeta']);
  });

  it('is what localeCompare gives in English, so existing sidebars keep their order', () => {
    const titles = [
      'Zeta',
      'zeta',
      'Ärlig',
      'arlig',
      'API',
      'Api',
      'a-b',
      'ab',
      'Écrire',
      '10',
      '9',
    ];
    const english = new Intl.Collator('en');
    expect([...titles].sort(compareNavigationTitles)).toEqual(
      [...titles].sort((left, right) => english.compare(left, right)),
    );
    expect([...titles].sort(compareNavigationTitles)).toEqual(
      [...titles].sort((left, right) => left.localeCompare(right, 'en')),
    );
  });
});
