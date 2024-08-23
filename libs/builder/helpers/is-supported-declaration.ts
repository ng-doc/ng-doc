import { ExportedDeclarations, Node } from 'ts-morph';

import { NgDocSupportedDeclaration } from '../types/supported-declaration';

/**
 *
 * @param declaration
 */
export function isSupportedDeclaration(
  declaration: ExportedDeclarations,
): declaration is NgDocSupportedDeclaration {
  return (
    Node.isClassDeclaration(declaration) ||
    Node.isInterfaceDeclaration(declaration) ||
    Node.isEnumDeclaration(declaration) ||
    Node.isFunctionDeclaration(declaration) ||
    Node.isVariableDeclaration(declaration) ||
    Node.isTypeAliasDeclaration(declaration) ||
    Node.isModuleDeclaration(declaration)
  );
}
