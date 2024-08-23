import { Node } from 'ts-morph';

import { NgDocSupportedDeclaration } from '../types';
import { hasJsDocTag } from './get-js-doc';

/**
 *
 * @param declaration
 */
export function isPublicDeclaration(declaration: NgDocSupportedDeclaration): boolean {
  const node = Node.isVariableDeclaration(declaration)
    ? declaration.getVariableStatement()!
    : declaration;

  return !hasJsDocTag(node, 'internal');
}
