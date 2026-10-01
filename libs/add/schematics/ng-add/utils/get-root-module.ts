import {
  CallExpression,
  ClassDeclaration,
  getSourceFiles,
  Node,
  SourceFile,
  SyntaxKind,
} from 'ng-morph';

/**
 * Finds the `bootstrapModule(...)` call of an NgModule application.
 *
 * The platform is not checked: Angular 22 applications call `platformBrowser().bootstrapModule`,
 * older ones `platformBrowserDynamic().bootstrapModule`, and both must be found.
 * @param mainPath - Path of the application's main file.
 */
export function getBootstrapModuleFn(mainPath: string): CallExpression | undefined {
  const [sourceFile]: SourceFile[] = getSourceFiles(mainPath);

  return sourceFile
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call: CallExpression) => {
      const expression = call.getExpression();

      return (
        Node.isPropertyAccessExpression(expression) && expression.getName() === 'bootstrapModule'
      );
    });
}

/**
 * Returns the class of the module passed to `bootstrapModule`.
 * @param mainPath - Path of the application's main file.
 */
export function getRootModule(mainPath: string): ClassDeclaration | undefined {
  const [module] = getBootstrapModuleFn(mainPath)?.getArguments() ?? [];
  const [definition] = Node.isIdentifier(module) ? module.getDefinitionNodes() : [];

  return Node.isClassDeclaration(definition) ? definition : undefined;
}
