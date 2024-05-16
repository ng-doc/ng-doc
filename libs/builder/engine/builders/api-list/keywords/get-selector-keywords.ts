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
      // Add attribute selectors as keywords, this is also necessary to make them available for code blocks with highlighting.
      // We take the last part of the selector, which is probably the most important one.
      // It's not perfect, but at least it makes it work most of the time.
      const attributeSelector = selector.match(/\[(?<selector>[\w-]+)\]$/)?.groups?.['selector'];

      if (attributeSelector) {
        acc.push([
          attributeSelector,
          {
            title: attributeSelector,
            path: entry.absoluteRoute(),
            languages: ['html'],
          },
        ]);
      } else {
        acc.push([
          selector,
          {
            title: selector,
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
