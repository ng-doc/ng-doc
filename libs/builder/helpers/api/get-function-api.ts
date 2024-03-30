import { asArray } from '@ng-doc/core';
import { FunctionDeclaration, StructureKind } from 'ts-morph';

import { displayReturnType } from '../typescript';
import { findParamDocs } from './helpers';
import {
  DocApi,
  mapDocApi,
  mapOverloadApi,
  mapParameterApi,
  OverloadApi,
  ParameterApi,
} from './mappers';

export interface FunctionApi {
  name: string;
  isAsync: boolean;
  docs: DocApi[];
  returnType: string;
  parameters: ParameterApi[];
  overloads: OverloadApi[];
}

/**
 *
 * @param declaration
 */
export function getFunctionApi(declaration: FunctionDeclaration): FunctionApi {
  const structure = declaration.getStructure();

  if (structure.kind === StructureKind.FunctionOverload) {
    throw new Error('Function overloads are not supported');
  }

  const docs = mapDocApi(structure);

  return {
    name: structure.name || '[Unknown]',
    isAsync: !!structure.isAsync,
    docs,
    returnType: displayReturnType(declaration),
    parameters: asArray(declaration.getParameters()).map((param) => {
      return mapParameterApi(param, findParamDocs(param.getName(), docs));
    }),
    overloads: asArray(declaration.getOverloads()).map(mapOverloadApi),
  };
}
