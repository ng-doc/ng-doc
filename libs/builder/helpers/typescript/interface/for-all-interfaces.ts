import {ExpressionWithTypeArguments, InterfaceDeclaration, Node} from 'ts-morph';

/**
 *
 * @param int
 * @param fn
 */
export function forAllInterfaces(int: InterfaceDeclaration, fn: (c: InterfaceDeclaration) => boolean | void): void {
	const baseInterface: InterfaceDeclaration | undefined = int;

	if (!fn(baseInterface)) {
		baseInterface
			.getExtends()
			.map((expr: ExpressionWithTypeArguments) => expr.getType().getSymbol()?.getDeclarations()[0])
			.reverse()
			.forEach((node: Node | undefined) => Node.isInterfaceDeclaration(node) && forAllInterfaces(node, fn));
	}
}
