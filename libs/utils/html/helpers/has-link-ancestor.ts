import {Element} from 'hast';
import {isElement} from 'hast-util-is-element';

/**
 *
 * @param ancestors
 */
export function hasLinkAncestor(ancestors: Element[]): boolean {
	return ancestors.some((ancestor: Element) => isElement(ancestor, 'a'));
}
