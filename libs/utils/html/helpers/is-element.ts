import { Content, Element } from 'hast';

/**
 *
 * @param node
 */
export function isElement(node?: Content): node is Element {
  return node?.type === 'element';
}
