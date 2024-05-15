import { asArray, NgDocKeyword } from '@ng-doc/core';

import { getPipeName } from '../../../../helpers';
import { DeclarationEntry, EntryMetadata } from '../../interfaces';

/**
 *
 * @param entry
 */
export function getPipeKeywords(
  entry: EntryMetadata<DeclarationEntry>,
): Array<[string, NgDocKeyword]> {
  return asArray(getPipeName(entry.entry.declaration)).map((name) => [
    name,
    {
      title: name,
      path: entry.absoluteRoute(),
      languages: ['html'],
    },
  ]);
}
