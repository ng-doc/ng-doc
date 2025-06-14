import { Element } from 'hast';

/**
 *
 * @param node
 * @param attr
 */
export function attrValue(node: Element, attr: string): string | undefined {
  const attrKey: string = attr.toLowerCase();

  return node.properties?.[attrKey] ? String(node.properties[attrKey]) : undefined;
}
