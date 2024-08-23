import { Element } from 'hast';
import { isElement } from 'hast-util-is-element';

const HEADINGS: string[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/**
 *
 * @param node
 */
export function isHeading(node: Element): boolean {
  return isElement(node, HEADINGS);
}
