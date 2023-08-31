import {ElementContent, Text} from 'hast';

/**
 *
 * @param element
 */
export function isText(element?: ElementContent): element is Text {
	return element?.type === 'text';
}
