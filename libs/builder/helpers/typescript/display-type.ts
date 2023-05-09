import {Node, TypeFormatFlags} from 'ts-morph';

/**
 *
 * @param node
 * @param typeFormatFlags
 */
export function displayType(node: Node): string {
	return Node.isTypeAliasDeclaration(node)
		? node.getTypeNodeOrThrow().getText(undefined)
		: node.getType().getText(undefined, TypeFormatFlags.NoTruncation);
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
