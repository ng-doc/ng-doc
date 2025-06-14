import { Element } from 'hast';
import { isElement } from 'hast-util-is-element';

/**
 *
 * @param node
 */
export function isCodeNode(node: Element): boolean {
  return isElement(node, 'code') || isElement(node, 'ng-doc-code');
}
