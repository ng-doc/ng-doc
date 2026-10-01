import { afterEach, describe, expect, it, vi } from 'vitest';

import { compareText } from '../text-order';
import { sortByNodesName } from '../typescript/node/sort-by-nodes-name';

const swedish = new Intl.Collator('sv');

/** Nodes with a name, as the API templates pass them to `sortByNodesName`. */
const nodes = (...names: Array<string | undefined>) =>
  names.map((name) => ({ getName: () => name })) as unknown as Parameters<
    typeof sortByNodesName
  >[0];

describe('the shared text order', () => {
  afterEach(() => vi.restoreAllMocks());

  it('orders API members in English whatever the process locale', () => {
    // A process whose default locale is Swedish sorts `Ä` after `Z` with `localeCompare`.
    vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (
      this: string,
      other: string,
    ) {
      return swedish.compare(String(this), other);
    });
    expect('ärlig'.localeCompare('zeta')).toBeGreaterThan(0);
    expect(compareText('ärlig', 'zeta')).toBeLessThan(0);
    expect(
      sortByNodesName(nodes('zeta', 'ärlig', undefined, 'Beta', 'alpha')).map((node) =>
        node.getName(),
      ),
    ).toEqual([undefined, 'alpha', 'ärlig', 'Beta', 'zeta']);
  });

  it('is what localeCompare gives in English, so existing output keeps its order', () => {
    const values = [
      'Zeta',
      'zeta',
      'Ärlig',
      'arlig',
      'API',
      'Api',
      'a-b',
      'ab',
      'a_b',
      'docs/a/b.ts',
      'docs/a-b.ts',
      'docs/ä.ts',
      '10',
      '9',
    ];
    expect([...values].sort(compareText)).toEqual(
      [...values].sort((left, right) => left.localeCompare(right, 'en')),
    );
  });
});
