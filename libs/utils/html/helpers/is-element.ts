import {Element, ElementContent} from 'hast';

/**
 *
 * @param node
 */
export function isElement(node?: ElementContent): node is Element {
	return node?.type === 'element';
}
