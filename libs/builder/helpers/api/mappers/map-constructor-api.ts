import { asArray } from '@ng-doc/core';
import { ConstructorDeclaration } from 'ts-morph';

import { displayReturnType } from '../../typescript';
import { findParamDocs } from '../helpers';
import { DocApi, mapDocApi } from './map-docs';
import { mapOverloadApi, OverloadApi } from './map-overload-api';
import { mapParameterApi, ParameterApi } from './map-parameter-api';

export interface ConstructorApi {
  isProtected: boolean;
  docs: DocApi[];
  returnType: string;
  parameters: ParameterApi[];
  overloads: OverloadApi[];
}

/**
 *
 * @param declaration
 */
export function mapConstructorApi(declaration: ConstructorDeclaration): ConstructorApi {
  const structure = declaration.getStructure();
  const docs = mapDocApi(structure);

  return {
    isProtected: structure.scope === 'protected',
    docs,
    returnType: displayReturnType(declaration),
    parameters: asArray(declaration.getParameters()).map((param) => {
      return mapParameterApi(param, findParamDocs(param.getName(), docs));
    }),
    overloads: asArray(declaration.getOverloads()).map(mapOverloadApi),
  };
}
