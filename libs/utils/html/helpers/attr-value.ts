import {Element} from 'hast';

/**
 *
 * @param node
 * @param attr
 */
export function attrValue(node: Element, attr: string): string | undefined {
	return node.properties?.[attr] ? String(node.properties[attr]) : undefined;
}
