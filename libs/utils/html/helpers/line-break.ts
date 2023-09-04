import { Text } from 'hast';

/**
 * Creates a line break
 */
export function lineBreak(): Text {
	return { type: 'text', value: '\n' };
}
