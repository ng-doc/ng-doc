/**
 *
 * @param tree
 * @param mainPath
 */
import {Tree} from '@angular-devkit/schematics';
import {
	ClassDeclaration,
	createProject,
	Expression,
	getMainModule,
	Node,
	saveActiveProject,
	setActiveProject
} from 'ng-morph';

import {getInitializer} from './get-initializer';

/**
 *
 * @param tree
 * @param mainPath
 */
export function getAppTemplatePath(tree: Tree, mainPath: string): string | undefined {
	setActiveProject(createProject(tree, '/', ['**/*.ts', '**/*.json']));

	const mainModule: ClassDeclaration = getMainModule(mainPath);
	const mainInitializer: Expression | undefined = getInitializer(mainModule, 'NgModule', 'declarations');

	if (!Node.isArrayLiteralExpression(mainInitializer)) {
		return;
	}

	const appIdentifier: Expression | undefined = mainInitializer.getElements()[0];

	if (!Node.isIdentifier(appIdentifier)) {
		return;
	}

	const appComponent: Node | undefined = appIdentifier.getDefinitionNodes()[0];

	if (!Node.isClassDeclaration(appComponent)) {
		return;
	}

	const templateInitializer: Expression | undefined = getInitializer(appComponent, 'Component', 'templateUrl');

	const appComponentPath: string[] = appComponent.getSourceFile().getFilePath().split('/');

	const templateUrlPath: string = `${appComponentPath
		.splice(0, appComponentPath.length - 1)
		.join('/')}/${templateInitializer?.getText().replace(/['"]/g, '')}`;

	saveActiveProject();

	return templateUrlPath;
}
