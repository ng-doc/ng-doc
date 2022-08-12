import {Type, TypeFormatFlags} from 'ts-morph';

export function displayType(type: Type): string {
	return type.getText(undefined, TypeFormatFlags.None);
}
