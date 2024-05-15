import { DeclarationEntry, EntryMetadata } from '@ng-doc/builder';
import { NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';

import { constructPageKeyword, formatKeywordKey } from '../../../../helpers';

/**
 *
 * @param entry
 * @param anchors
 */
export function getApiAnchorKeywords(
  entry: EntryMetadata<DeclarationEntry>,
  anchors: NgDocPageAnchor[],
): Array<[string, NgDocKeyword]> {
  const key = String(entry.entry.declaration.getName());
  const title = entry.keywordTitle;

  return anchors.map((anchor) => {
    const pageKeyword = constructPageKeyword(key, title, entry.absoluteRoute(), anchor);
    const anchorKeyword: NgDocKeyword = {
      title: pageKeyword.title,
      path: pageKeyword.path,
      type: anchor.type === 'heading' ? 'link' : undefined,
    };

    return [formatKeywordKey(pageKeyword.key), anchorKeyword];
  });
}
