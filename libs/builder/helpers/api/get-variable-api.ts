import { VariableDeclaration } from 'ts-morph';

import { displayType } from '../typescript';
import { DocApi, mapDocApi } from './mappers';

export interface VariableApi {
  name: string;
  type: string;
  kind: string;
  docs: DocApi[];
}

/**
 *
 * @param declaration
 */
export function getVariableApi(declaration: VariableDeclaration): VariableApi {
  const statement = declaration.getVariableStatement();

  if (!statement) {
    throw new Error(`Variable declaration is not part of a statement`);
  }

  const structure = statement.getStructure();

  return {
    name: declaration.getName(),
    kind: declaration.getVariableStatement()?.getDeclarationKind() ?? 'const',
    type: displayType(declaration),
    docs: mapDocApi(structure),
  };
}
