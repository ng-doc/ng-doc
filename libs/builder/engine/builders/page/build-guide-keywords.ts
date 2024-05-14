import { NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';

import { constructPageKeyword, formatKeywordKey } from '../../../helpers';
import { EntryMetadata, MarkdownEntry } from '../interfaces';

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

    const anchorKeywords = anchors.map((anchor) => {
      const pageKeyword = constructPageKeyword(key, title, entry.absoluteRoute(), anchor);
      const anchorKeyword: NgDocKeyword = {
        title: pageKeyword.title,
        path: pageKeyword.path,
        type: 'link',
      };

      return [formatKeywordKey(pageKeyword.key), anchorKeyword];
    }) satisfies Array<[string, NgDocKeyword]>;

    return [[formatKeywordKey(key), guideKeyword], ...anchorKeywords];
  };
}
