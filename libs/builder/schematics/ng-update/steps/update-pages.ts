import { Rule, Tree } from '@angular-devkit/schematics';
import { updateWorkspace } from '@schematics/angular/utility/workspace';
import {
  createProject,
  ExportedDeclarations,
  getSourceFiles,
  Node,
  ObjectLiteralExpression,
  saveActiveProject,
  setActiveProject,
  SourceFile,
  SyntaxKind,
} from 'ng-morph';
import path from 'path';

/**
 *
 */
export function updatePages(): Rule {
  return async (tree: Tree) => {
    return updateWorkspace(() => {
      setActiveProject(createProject(tree, './', ['**/**/ng-doc.page.ts']));

      const sourceFiles = getSourceFiles('**/**/ng-doc.page.ts');

      for (const sourceFile of sourceFiles) {
        const objectExpression = getObjectExpressionFromDefault(sourceFile);

        if (!objectExpression) {
          continue;
        }

        removeTitleFromMarkdown(tree, objectExpression);
        moveKeywordIntoMarkdown(tree, objectExpression);
      }

      saveActiveProject();
    });
  };
}

/**
 *
 * @param sourceFile
 */
function getObjectExpressionFromDefault(
  sourceFile: SourceFile,
): ObjectLiteralExpression | undefined {
  const defaultExport: ExportedDeclarations | undefined = sourceFile
    .getExportedDeclarations()
    ?.get('default')?.[0];

  if (Node.isVariableDeclaration(defaultExport)) {
    return defaultExport?.getFirstChildByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  }

  return undefined;
}

/**
 *
 * @param tree
 * @param objectExpression
 */
function removeTitleFromMarkdown(tree: Tree, objectExpression: ObjectLiteralExpression) {
  const directoryPath = objectExpression.getSourceFile().getDirectoryPath();
  const mdPathProperty = objectExpression.getProperty('mdFile');

  if (mdPathProperty && Node.isPropertyAssignment(mdPathProperty)) {
    const mdPathValue = mdPathProperty.getInitializer()?.getText();

    if (mdPathValue) {
      const mdPath = path.join(directoryPath, mdPathValue.replace(/['"]/g, ''));
      const mdFile = tree.readText(mdPath);

      if (mdFile) {
        const newMdFile = mdFile.replace(/^\s*#?(\s)*{{(\s)*NgDocPage\.title(\s)*}}/m, '');

        tree.overwrite(mdPath, newMdFile);

        console.log('Removed title from:', mdPath);
      }
    }
  }
}

/**
 *
 * @param tree
 * @param objectExpression
 */
function moveKeywordIntoMarkdown(tree: Tree, objectExpression: ObjectLiteralExpression) {
  const directoryPath = objectExpression.getSourceFile().getDirectoryPath();
  const mdPathProperty = objectExpression.getProperty('mdFile');
  const keywordProperty = objectExpression.getProperty('keyword');

  if (
    mdPathProperty &&
    Node.isPropertyAssignment(mdPathProperty) &&
    keywordProperty &&
    Node.isPropertyAssignment(keywordProperty)
  ) {
    const mdPathValue = mdPathProperty.getInitializer()?.getText();
    const keywordValue = keywordProperty.getInitializer()?.getText();

    if (mdPathValue && keywordValue) {
      const mdPath = path.join(directoryPath, mdPathValue.replace(/['"]/g, ''));
      const mdFile = tree.readText(mdPath);

      if (mdFile) {
        const newMdFile = `---\nkeyword: ${keywordValue}\n---\n${mdFile}`;

        tree.overwrite(mdPath, newMdFile);
      }

      keywordProperty.remove();

      console.log('Moved keyword into:', mdPath);
    }
  }
}
