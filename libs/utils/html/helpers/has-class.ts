import { Element } from 'hast';

/**
 *
 * @param node
 * @param cls
 */
export function hasClass(node: Element, cls: string): boolean {
  const className: string = node.properties?.['className']?.toString() ?? '';

  return !!className && className.includes(cls);
}
