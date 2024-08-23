import { getScopedKeyword } from '@ng-doc/builder';
import { NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';

import { constructPageKeyword, formatKeywordKey } from '../../../../helpers';
import { EntryMetadata, MarkdownEntry } from '../../interfaces';

/**
 *
 * @param entry
 * @param anchors
 */
export function getPageAnchorKeywords(
  entry: EntryMetadata<MarkdownEntry>,
  anchors: NgDocPageAnchor[],
): Array<[string, NgDocKeyword]> {
  const key = `*${entry.entry.keyword}`;
  const title = entry.keywordTitle;

  return anchors.map((anchor) => {
    if (anchor.scope) {
      return getScopedKeyword(entry, anchor as Required<NgDocPageAnchor>);
    }

    const pageKeyword = constructPageKeyword(key, title, entry.absoluteRoute(), anchor);
    const anchorKeyword: NgDocKeyword = {
      title: pageKeyword.title,
      path: pageKeyword.path,
      type: 'link',
    };

    return [formatKeywordKey(pageKeyword.key), anchorKeyword];
  });
}
