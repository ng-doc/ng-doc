import {Node, ObjectLiteralExpression, SourceFile, Symbol, SyntaxKind} from 'ts-morph';

/**
 * Returns object expression from default export in the current sourceFile
 *
 * @param sourceFile - source file to get object expression from
 */
export function getObjectExpressionFromDefault(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
	const defaultExport: Symbol | undefined = sourceFile.getDefaultExportSymbol();
	const exportAlias: Symbol | undefined = defaultExport?.getAliasedSymbol();
	const valueDeclaration: Node | undefined = exportAlias?.getValueDeclarationOrThrow();

	return valueDeclaration?.getFirstChildByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
}
