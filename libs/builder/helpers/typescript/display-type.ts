import {Type, TypeFormatFlags, TypeNode} from 'ts-morph';

/**
 *
 * @param type
 */
export function displayType(type: Type): string {
	return type.getText(undefined, TypeFormatFlags.NoTruncation);
}

/**
 *
 * @param node
 */
export function displayTypeNode(node: TypeNode): string {
	return node.getText();
}
