import { ExportedDeclarations, Node } from 'ts-morph';

import { ClassApi, getClassApi } from './get-class-api';
import { EnumApi, getEnumApi } from './get-enum-api';
import { FunctionApi, getFunctionApi } from './get-function-api';
import { getInterfaceApi, InterfaceApi } from './get-interface-api';
import { getTypeAliasApi, TypeAliasApi } from './get-type-alias-api';
import { getVariableApi, VariableApi } from './get-variable-api';

export type Api = ClassApi | InterfaceApi | EnumApi | FunctionApi | TypeAliasApi | VariableApi;

/**
 *
 * @param declaration
 */
export function getApiForDeclaration(declaration: ExportedDeclarations): Api {
  if (Node.isClassDeclaration(declaration)) {
    return getClassApi(declaration);
  } else if (Node.isInterfaceDeclaration(declaration)) {
    return getInterfaceApi(declaration);
  } else if (Node.isEnumDeclaration(declaration)) {
    return getEnumApi(declaration);
  } else if (Node.isFunctionDeclaration(declaration)) {
    return getFunctionApi(declaration);
  } else if (Node.isVariableDeclaration(declaration)) {
    return getVariableApi(declaration);
  } else if (Node.isTypeAliasDeclaration(declaration)) {
    return getTypeAliasApi(declaration);
  } else {
    throw new Error(`Unsupported declaration type: ${declaration.getKindName()}`);
  }
}
