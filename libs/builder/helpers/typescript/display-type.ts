import { Node, Type, TypeFormatFlags } from 'ts-morph';

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
		: formatType(node.getType(), typeFormatFlags);
}

/**
 *
 * @param type
 * @param typeFormatFlags
 */
export function formatType(
	type: Type,
	typeFormatFlags: TypeFormatFlags = TypeFormatFlags.NoTruncation,
) {
	return type.getText(undefined, typeFormatFlags);
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
