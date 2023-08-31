/**
 *
 * @param tree
 * @param mainPath
 */
import { Tree } from '@angular-devkit/schematics';
import { ClassDeclaration, Expression, Node, saveActiveProject } from 'ng-morph';

import { getAppComponent } from './get-app-component';
import { getInitializer } from './get-initializer';

/**
 *
 * @param tree
 * @param mainPath
 */
export function getAppTemplatePath(tree: Tree, mainPath: string): string | undefined {
	const appComponent: ClassDeclaration | undefined = getAppComponent(tree, mainPath);

	if (!Node.isClassDeclaration(appComponent)) {
		return;
	}

	const templateInitializer: Expression | undefined = getInitializer(
		appComponent,
		'Component',
		'templateUrl',
	);

	const appComponentPath: string[] = appComponent.getSourceFile().getFilePath().split('/');

	const templateUrlPath: string = `${appComponentPath
		.splice(0, appComponentPath.length - 1)
		.join('/')}/${templateInitializer?.getText().replace(/['"]/g, '')}`;

	saveActiveProject();

	return templateUrlPath;
}
