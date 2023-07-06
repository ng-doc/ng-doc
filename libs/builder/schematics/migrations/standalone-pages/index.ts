import {Rule, Tree} from '@angular-devkit/schematics';
import {
	createProject,
	getSourceFiles,
	ImportDeclaration,
	ImportSpecifier,
	Node,
	ObjectLiteralExpression,
	QuoteKind,
	saveActiveProject,
	setActiveProject,
} from 'ng-morph';
import * as path from 'path';

import {getObjectExpressionFromDefault} from '../../utils';
import {NgDocStandalonePagesSchema} from './schema';

/**
 * Moves all dependencies from `ng-doc.dependencies.ts` to `ng-doc.page.ts` and removes the `ng-doc.dependencies.ts` file.
 *
 * @param options
 */
export function migrate(options: NgDocStandalonePagesSchema): Rule {
	return (tree: Tree) => {
		setActiveProject(createProject(tree, options.path, ['**/**/ng-doc.dependencies.ts', '**/**/ng-doc.page.ts']));

		const sourceFiles = getSourceFiles('**/**/ng-doc.dependencies.ts');

		for (const sourceFile of sourceFiles) {
			const pageSourceFile = getSourceFiles(path.join(sourceFile.getDirectoryPath(), 'ng-doc.page.ts'))[0];

			if (!pageSourceFile) {
				continue;
			}

			const objectExpression = getObjectExpressionFromDefault(sourceFile);
			const pageObjectExpression = getObjectExpressionFromDefault(pageSourceFile);

			if (!objectExpression || !pageObjectExpression) {
				continue;
			}

			migrateProperty(
				objectExpression,
				pageObjectExpression,
				'module',
				'imports',
				(initializer: string) => `[${initializer}]`,
			);
			migrateProperty(objectExpression, pageObjectExpression, 'demo', 'demos');
			migrateProperty(objectExpression, pageObjectExpression, 'playgrounds');

			sourceFile.delete();
		}

		saveActiveProject();
	};
}

/**
 *
 * @param original
 * @param destination
 * @param propertyName
 * @param newPropertyName
 * @param initializer
 */
function migrateProperty(
	original: ObjectLiteralExpression,
	destination: ObjectLiteralExpression,
	propertyName: string,
	newPropertyName: string = propertyName,
	initializer: (initializer: string) => string = (initializer: string) => initializer,
): void {
	const sourceFile = original.getSourceFile();
	const property = original.getProperty(propertyName);

	sourceFile.getProject().manipulationSettings.set({
		quoteKind: QuoteKind.Single,
	});

	if (property) {
		if (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) {
			if (Node.isPropertyAssignment(property)) {
				const structure = property.getStructure();

				destination.addProperty({
					...structure,
					name: newPropertyName,
					initializer: initializer(structure.initializer as string),
				});
			}

			if (Node.isShorthandPropertyAssignment(property)) {
				const structure = property.getStructure();

				destination.addProperty({
					...structure,
					name: newPropertyName,
				});
			}

			const imports: ImportDeclaration[] = sourceFile
				.getImportDeclarations()
				.filter((importDeclaration: ImportDeclaration) => {
					return (
						importDeclaration.getNamedImports().filter((importSpecifier: ImportSpecifier) => {
							return (
								importSpecifier
									.getNameNode()
									.findReferencesAsNodes()
									.filter((node: Node) => {
										return isChildOf(node, property);
									}).length > 0
							);
						}).length > 0
					);
				})
				.flat();

			destination
				.getSourceFile()
				.addImportDeclarations(imports.map((importDeclaration: ImportDeclaration) => importDeclaration.getStructure()));
		}
	}
}

/**
 *
 * @param node
 * @param parent
 */
function isChildOf(node: Node, parent: Node): boolean {
	if (node === parent) {
		return true;
	}

	const p = node.getParent();

	if (p) {
		return isChildOf(p, parent);
	}

	return false;
}
