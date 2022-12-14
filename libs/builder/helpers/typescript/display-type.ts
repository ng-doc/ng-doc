import {Type, TypeFormatFlags} from 'ts-morph';

/**
 *
 * @param type
 */
export function displayType(type: Type): string {
	return type.getText(undefined, TypeFormatFlags.None);
}
