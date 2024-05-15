import { NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';

import { formatKeywordKey } from '../../../helpers';
import { EntryMetadata, MarkdownEntry } from '../interfaces';
import { getPageAnchorKeywords } from './keywords/get-page-anchor-keywords';

/**
 *
 * @param entry
 */
export function buildGuideKeywords(
  entry: EntryMetadata<MarkdownEntry>,
): (anchors: NgDocPageAnchor[]) => Array<[string, NgDocKeyword]> {
  return (anchors: NgDocPageAnchor[]) => {
    if (!entry.entry.keyword) {
      return [];
    }

    const key = `*${entry.entry.keyword}`;
    const title = entry.keywordTitle;
    const guideKeyword: NgDocKeyword = {
      title,
      path: entry.absoluteRoute(),
      type: 'link',
    };

    return [[formatKeywordKey(key), guideKeyword], ...getPageAnchorKeywords(entry, anchors)];
  };
}
