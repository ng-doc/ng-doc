import {Expression} from 'ts-morph';

/**
 *
 * @param expression
 */
export function displayInitializer(expression?: Expression): string {
	return expression?.getText(false) ?? '';
}
