import { Element, Root } from 'hast';

/**
 *
 * @param parent
 * @param node
 */
export function isCodeBlock(parent: Root | Element | null, node: Element): node is Element {
  return parent?.type === 'element' && parent.tagName === 'pre' && node.tagName === 'code';
}
