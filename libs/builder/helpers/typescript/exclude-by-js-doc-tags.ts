import { asArray } from '@ng-doc/core';
import { JSDocableNode } from 'ts-morph';

import { hasJsDocTag } from '../get-js-doc';

/**
 *
 * @param nodes
 * @param tags
 */
export function excludeByJsDocTags<T extends JSDocableNode>(
  nodes: T[],
  tags: string | string[],
): T[] {
  return nodes.filter((node: T) => !asArray(tags).some((tag) => hasJsDocTag(node, tag)));
}
