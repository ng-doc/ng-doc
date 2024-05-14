import { asArray, NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';

import {
  constructPageKeyword,
  extractSelectors,
  formatKeywordKey,
  getPipeName,
} from '../../../helpers';
import { DeclarationEntry, EntryMetadata } from '../interfaces';

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

    const anchorKeywords = anchors.map((anchor) => {
      const pageKeyword = constructPageKeyword(key, title, entry.absoluteRoute(), anchor);
      const anchorKeyword: NgDocKeyword = {
        title: pageKeyword.title,
        path: pageKeyword.path,
        type: anchor.type === 'heading' ? 'link' : undefined,
      };

      return [formatKeywordKey(pageKeyword.key), anchorKeyword];
    }) satisfies Array<[string, NgDocKeyword]>;

    const selectorKeywords = extractSelectors(entry.entry.declaration).map((selector) => [
      selector,
      {
        title: selector,
        path: entry.absoluteRoute(),
        languages: ['html'],
      },
    ]) satisfies Array<[string, NgDocKeyword]>;
    const pipeName = asArray(getPipeName(entry.entry.declaration)).map((name) => [
      name,
      {
        title: name,
        path: entry.absoluteRoute(),
        languages: ['html'],
      },
    ]) satisfies Array<[string, NgDocKeyword]>;

    return [
      [formatKeywordKey(key), apiKeyword],
      ...anchorKeywords,
      ...selectorKeywords,
      ...pipeName,
    ];
  };
}
