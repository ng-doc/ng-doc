import { Text } from 'hast';

/**
 *
 * @param value
 */
export function textElement(value: string): Text {
	return { type: 'text', value };
}
