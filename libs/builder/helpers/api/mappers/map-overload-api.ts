import { asArray } from '@ng-doc/core';
import { ConstructorDeclaration, FunctionDeclaration, MethodDeclaration } from 'ts-morph';

import { displayReturnType } from '../../typescript';
import { findParamDocs } from '../helpers';
import { DocApi, mapDocApi } from './map-docs';
import { mapParameterApi, ParameterApi } from './map-parameter-api';

export interface OverloadApi {
  docs: DocApi[];
  returnType: string;
  parameters: ParameterApi[];
}

/**
 *
 * @param declaration
 */
export function mapOverloadApi(
  declaration: ConstructorDeclaration | MethodDeclaration | FunctionDeclaration,
): OverloadApi {
  const structure = declaration.getStructure();
  const docs = mapDocApi(structure);

  return {
    docs,
    returnType: displayReturnType(declaration),
    parameters: asArray(declaration.getParameters()).map((param) => {
      return mapParameterApi(param, findParamDocs(param.getName(), docs));
    }),
  };
}
