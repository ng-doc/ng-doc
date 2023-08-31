import {
	ExportedDeclarations,
	Node,
	ObjectLiteralExpression,
	SourceFile,
	SyntaxKind,
} from 'ts-morph';

/**
 * Returns object expression from default export in the current sourceFile
 *
 * @param sourceFile - source file to get object expression from
 */
export function getObjectExpressionFromDefault(
	sourceFile: SourceFile,
): ObjectLiteralExpression | undefined {
	const defaultExport: ExportedDeclarations | undefined = sourceFile
		.getExportedDeclarations()
		?.get('default')?.[0];

	if (Node.isVariableDeclaration(defaultExport)) {
		return defaultExport?.getFirstChildByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
	}

	return undefined;
}
