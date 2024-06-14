import { NgDocPageKeyword } from '@ng-doc/builder';
import { NgDocPageAnchor } from '@ng-doc/core';

/**
 *
 * @param key
 * @param title
 * @param path
 * @param anchor
 */
export function constructPageKeyword(
  key: string,
  title: string,
  path: string,
  anchor: NgDocPageAnchor,
): NgDocPageKeyword {
  return anchor.type === 'heading'
    ? {
        key: `${key}#${anchor.anchor}`,
        title: `${title} [${anchor.title}]`,
        path: `${path}#${anchor.anchorId}`,
      }
    : {
        key: `${key}.${anchor.anchor}`,
        title: `${title}.${anchor.title}`,
        path: `${path}#${anchor.anchorId}`,
      };
}
