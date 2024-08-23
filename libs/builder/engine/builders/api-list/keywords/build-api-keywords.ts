import { NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';

import { formatKeywordKey } from '../../../../helpers';
import { DeclarationEntry, EntryMetadata } from '../../interfaces';
import { getApiAnchorKeywords } from './get-api-anchor-keywords';
import { getPipeKeywords } from './get-pipe-keywords';
import { getSelectorKeywords } from './get-selector-keywords';

/**
 *
 * @param entry
 */
export function buildApiKeywords(
  entry: EntryMetadata<DeclarationEntry>,
): (anchors: NgDocPageAnchor[]) => Array<[string, NgDocKeyword]> {
  return (anchors: NgDocPageAnchor[]) => {
    const key = String(entry.entry.declaration.getName());
    const title = entry.keywordTitle;
    const apiKeyword: NgDocKeyword = {
      title,
      path: entry.absoluteRoute(),
    };

    return [
      [formatKeywordKey(key), apiKeyword],
      ...getApiAnchorKeywords(entry, anchors),
      ...getSelectorKeywords(entry),
      ...getPipeKeywords(entry),
    ];
  };
}
