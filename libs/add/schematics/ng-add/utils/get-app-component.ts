import { Tree } from '@angular-devkit/schematics';
import {
	ClassDeclaration,
	Expression,
	getBootstrapApplicationFn,
	getMainModule,
	Node,
} from 'ng-morph';

import { getInitializer } from './get-initializer';

/**
 *
 * @param tree
 * @param mainPath
 */
export function getAppComponent(tree: Tree, mainPath: string): ClassDeclaration | undefined {
	const bootstrapApplicationFn = getBootstrapApplicationFn(mainPath);

	if (bootstrapApplicationFn) {
		const component = bootstrapApplicationFn.getArguments()[0];

		if (Node.isIdentifier(component)) {
			const componentDeclaration = component.getDefinitionNodes()[0];

			if (Node.isClassDeclaration(componentDeclaration)) {
				return componentDeclaration;
			}
		}
	} else {
		const mainModule: ClassDeclaration = getMainModule(mainPath);
		const mainInitializer: Expression | undefined = getInitializer(
			mainModule,
			'NgModule',
			'declarations',
		);

		if (Node.isArrayLiteralExpression(mainInitializer)) {
			const appIdentifier: Expression | undefined = mainInitializer.getElements()[0];

			if (Node.isIdentifier(appIdentifier)) {
				const appComponent: Node | undefined = appIdentifier.getDefinitionNodes()[0];

				if (Node.isClassDeclaration(appComponent)) {
					return appComponent;
				}
			}
		}
	}

	return undefined;
}
