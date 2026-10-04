import { addImports, editImports, getImports, ImportDeclaration, ImportSpecifier } from 'ng-morph';

/**
 * Adds a named import to a file unless the file already imports that name from the module.
 *
 * The name is added to an existing named-import declaration of the module. A namespace import
 * (`import * as router from '@angular/router'`) or a type-only import cannot take it, so a
 * separate declaration is added in that case.
 * @param filePath - The file to update.
 * @param namedImport - The exported name to import.
 * @param moduleSpecifier - The module that exports it.
 */
export function addUniqueImport(
  filePath: string,
  namedImport: string,
  moduleSpecifier: string,
): void {
  const declarations: ImportDeclaration[] = getImports(filePath, { moduleSpecifier });
  const imported: boolean = declarations.some(
    (declaration: ImportDeclaration) =>
      !declaration.isTypeOnly() &&
      declaration
        .getNamedImports()
        .some(
          (specifier: ImportSpecifier) =>
            !specifier.isTypeOnly() &&
            specifier.getName() === namedImport &&
            (specifier.getAliasNode()?.getText() ?? namedImport) === namedImport,
        ),
  );

  if (imported) {
    return;
  }

  const target: ImportDeclaration | undefined = declarations.find(
    (declaration: ImportDeclaration) =>
      !declaration.getNamespaceImport() && !declaration.isTypeOnly(),
  );

  if (target) {
    const modules: string[] = target
      .getNamedImports()
      .map((specifier: ImportSpecifier) => specifier.getText());

    editImports(target, () => ({
      namedImports: [...modules, namedImport],
    }));

    return;
  }

  addImports(filePath, {
    moduleSpecifier,
    namedImports: [namedImport],
  });
}
