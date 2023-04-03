import {Node, TypeFormatFlags} from 'ts-morph';

/**
 *
 * @param type
 * @param node
 */
export function displayType(node: Node): string {
	return node.getType().getText(undefined, TypeFormatFlags.NoTruncation);
}

/**
 *
 * @param node
 */
export function displayReturnType(node: Node): string {
	if (Node.isReturnTyped(node)) {
		return node.getReturnType().getText(undefined, TypeFormatFlags.NoTruncation);
	}
	return '';
}
