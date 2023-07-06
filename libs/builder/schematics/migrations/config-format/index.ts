import {Rule, Tree} from '@angular-devkit/schematics';
import {minimatch} from 'minimatch';
import {
	createProject,
	ExportedDeclarations,
	getSourceFiles,
	Node,
	saveActiveProject,
	setActiveProject,
	SourceFile,
} from 'ng-morph';

import {API_PATTERN, CATEGORY_PATTERN, PAGE_PATTERN} from '../../../engine/variables';
import {getObjectExpressionFromDefault} from '../../utils';
import {NgDocConfigFormatSchema} from './schema';

/**
 * Migrates the configuration to the new format.
 *
 * @param options
 */
export function migrate(options: NgDocConfigFormatSchema): Rule {
	return (tree: Tree) => {
		setActiveProject(
			createProject(tree, options.path, [PAGE_PATTERN, CATEGORY_PATTERN, API_PATTERN, '**/**/ng-doc.config.ts']),
		);

		const sourceFiles = getSourceFiles('**/*.ts');

		for (const sourceFile of sourceFiles) {
			const path = sourceFile.getFilePath();

			if (minimatch(path, PAGE_PATTERN)) {
				migrateConfig(sourceFile, 'NgDocPage', 'page');
			} else if (minimatch(path, CATEGORY_PATTERN)) {
				migrateConfig(sourceFile, 'NgDocCategory', 'category');
			} else if (minimatch(path, API_PATTERN)) {
				migrateConfig(sourceFile, 'NgDocApi', 'api');
			} else if (minimatch(path, '**/**/ng-doc.config.ts')) {
				migrateConfig(sourceFile, 'NgDocConfiguration', 'config', '@ng-doc/builder');
			}
		}

		saveActiveProject();
	};
}

/**
 *
 * @param sourceFile
 * @param intName
 * @param fnName
 * @param module
 */
function migrateConfig(sourceFile: SourceFile, intName: string, fnName: string, module: string = '@ng-doc/core'): void {
	const variable: ExportedDeclarations | undefined = sourceFile.getExportedDeclarations()?.get('default')?.[0];

	if (Node.isVariableDeclaration(variable)) {
		const objectExpression = getObjectExpressionFromDefault(sourceFile);

		if (!objectExpression || !variable) {
			return;
		}

		const importDeclaration =
			sourceFile.getImportDeclarations().find((id) => id.getModuleSpecifierValue() === module) ??
			sourceFile.addImportDeclarations([{moduleSpecifier: module}])[0];

		importDeclaration
			.getNamedImports()
			.filter((ni) => ni.getName() === intName)
			.forEach((ni) => ni.remove());

		importDeclaration.addNamedImports([{name: fnName}]);

		const objectText = objectExpression.getText();

		sourceFile.removeDefaultExport();

		sourceFile.addStatements(`export default ${fnName}(${objectText});`);

		variable.remove();

		// couldn't find a way to add a new line before the export keyword
		const text = sourceFile.getText();
		const exportKeyword = 'export default';
		const index = text.indexOf(exportKeyword);

		sourceFile.replaceText([index, index + exportKeyword.length], '\nexport default');
	}
}
