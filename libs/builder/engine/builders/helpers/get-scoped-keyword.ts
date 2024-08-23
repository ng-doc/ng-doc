import { NgDocKeyword, NgDocPageAnchor } from '@ng-doc/core';

import { constructPageKeyword, formatKeywordKey } from '../../../helpers';
import { EntryMetadata } from '../interfaces';

/**
 *
 * @param metadata
 * @param anchor
 */
export function getScopedKeyword(
  metadata: EntryMetadata,
  anchor: Required<NgDocPageAnchor>,
): [string, NgDocKeyword] {
  const pageKeyword = constructPageKeyword(
    anchor.scope.key,
    anchor.scope.title,
    metadata.absoluteRoute(),
    anchor,
  );

  const anchorKeyword: NgDocKeyword = {
    title: pageKeyword.title,
    path: pageKeyword.path,
    type: anchor.type === 'heading' ? 'link' : undefined,
  };

  return [formatKeywordKey(pageKeyword.key), anchorKeyword];
}
