import { Tree } from '@angular-devkit/schematics';
import { ClassDeclaration, Expression, getBootstrapApplicationFn, Node } from 'ng-morph';

import { getInitializer } from './get-initializer';
import { getRootModule } from './get-root-module';

/**
 * Returns the root component: the component passed to `bootstrapApplication`, or the first
 * declaration of the module passed to `bootstrapModule`.
 * @param tree - The workspace tree.
 * @param mainPath - Path of the application's main file.
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
    const mainModule: ClassDeclaration | undefined = getRootModule(mainPath);
    const mainInitializer: Expression | undefined =
      mainModule && getInitializer(mainModule, 'NgModule', 'declarations');

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
