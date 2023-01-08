import {ExpressionWithTypeArguments, InterfaceDeclaration, Node} from 'ts-morph';

/**
 *
 * @param int
 * @param fn
 */
export function findInterface(
	int: InterfaceDeclaration,
	fn: (c: InterfaceDeclaration) => boolean,
): InterfaceDeclaration | undefined {
	const baseInterface: InterfaceDeclaration | undefined = int;

	if (fn(baseInterface)) {
		return baseInterface;
	}

	const ext: InterfaceDeclaration[] = baseInterface
		.getExtends()
		.map((expr: ExpressionWithTypeArguments) => expr.getType().getSymbol()?.getDeclarations()[0])
		.filter((node: Node | undefined) => Node.isInterfaceDeclaration(node))
		// Reverse interfaces because the latest one overrides previous one
		.reverse() as InterfaceDeclaration[];

	for (const i of ext) {
		const deepResult: InterfaceDeclaration | undefined = findInterface(i, fn);

		if (deepResult) {
			return i;
		}
	}

	return undefined;
}
