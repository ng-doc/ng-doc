import { NgDocKeyword } from '@ng-doc/core';

import { extractSelectors } from '../../../../helpers';
import { DeclarationEntry, EntryMetadata } from '../../interfaces';

/**
 *
 * @param entry
 */
export function getSelectorKeywords(
  entry: EntryMetadata<DeclarationEntry>,
): Array<[string, NgDocKeyword]> {
  return extractSelectors(entry.entry.declaration).reduce(
    (acc, selector) => {
      acc.push([
        selector,
        {
          title: selector,
          path: entry.absoluteRoute(),
          languages: ['html'],
        },
      ]);

      // Add attribute selectors as keywords, this is also necessary to make them available for code blocks with highlighting
      if (selector.includes('[')) {
        const key = selector.replace(/[[\]]/g, '');

        acc.push([
          key,
          {
            title: key,
            path: entry.absoluteRoute(),
            languages: ['html'],
          },
        ]);
      }

      return acc;
    },
    [] as Array<[string, NgDocKeyword]>,
  );
}
