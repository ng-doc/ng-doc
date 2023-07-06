import {ExportedDeclarations, Node, ObjectLiteralExpression, SourceFile, SyntaxKind} from 'ng-morph';

/**
 *
 * @param sourceFile
 */
export function getObjectExpressionFromDefault(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
	const defaultExport: ExportedDeclarations | undefined = sourceFile.getExportedDeclarations()?.get('default')?.[0];

	if (Node.isVariableDeclaration(defaultExport)) {
		return defaultExport?.getFirstChildByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
	}

	return undefined;
}
