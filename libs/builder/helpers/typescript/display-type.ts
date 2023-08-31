import { Node, TypeFormatFlags } from 'ts-morph';

/**
 *
 * @param node
 * @param typeFormatFlags
 */
export function displayType(
	node: Node,
	typeFormatFlags: TypeFormatFlags = TypeFormatFlags.NoTruncation,
): string {
	return Node.isTypeAliasDeclaration(node)
		? node.getTypeNodeOrThrow().getText(undefined)
		: node.getType().getText(undefined, typeFormatFlags);
}

/**
 *
 * @param node
 * @param typeFormatFlags
 */
export function displayReturnType(
	node: Node,
	typeFormatFlags: TypeFormatFlags = TypeFormatFlags.NoTruncation,
): string {
	if (Node.isReturnTyped(node)) {
		return node.getReturnType().getText(undefined, typeFormatFlags);
	}
	return '';
}
