/**
 *
 * @param tree
 * @param mainPath
 */
import { Tree } from '@angular-devkit/schematics';
import { ClassDeclaration, Expression, Node, saveActiveProject } from 'ng-morph';
import * as path from 'path';

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

	const appComponentDir: string = appComponent.getSourceFile().getDirectoryPath();

	const templateUrlPath: string = path.join(
		appComponentDir,
		templateInitializer?.getText().replace(/['"]/g, '') ?? 'app.component.html',
	);

	saveActiveProject();

	return templateUrlPath;
}
