import { asArray } from '@ng-doc/core';
import {
  MethodDeclaration,
  MethodDeclarationStructure,
  MethodSignature,
  MethodSignatureStructure,
  OptionalKind,
  Scope,
} from 'ts-morph';

import { displayReturnType } from '../../typescript';
import { findParamDocs } from '../helpers';
import { ApiMember, ParentApiRelation } from '../types';
import { mapDecorators } from './map-decorators';
import { DocApi, mapDocApi } from './map-docs';
import { mapOverloadApi, OverloadApi } from './map-overload-api';
import { mapParameterApi, ParameterApi } from './map-parameter-api';
import { mapParentRelation } from './map-parent-relation';

export interface MethodApi {
  name: string;
  docs: DocApi[];
  decorators: string[];
  returnType: string;
  isAbstract: boolean;
  isStatic: boolean;
  isProtected: boolean;
  isAsync: boolean;
  overloads: OverloadApi[];
  parameters: ParameterApi[];
  parentRelation?: ParentApiRelation;
}

/**
 *
 * @param structure
 * @param member
 */
export function mapMethodApi(
  member: ApiMember<OptionalKind<MethodDeclarationStructure>, MethodDeclaration>,
): MethodApi {
  const { structure, declaration, docNode, parentRelation } = member;
  const docs = mapDocApi(docNode);

  return {
    name: structure.name,
    docs,
    decorators: mapDecorators(asArray(structure.decorators)),
    returnType: displayReturnType(declaration),
    isAbstract: !!structure.isAbstract,
    isStatic: !!structure.isStatic,
    isProtected: structure.scope === Scope.Protected,
    isAsync: !!structure.isAsync,
    parameters: asArray(declaration.getParameters()).map((param) => {
      return mapParameterApi(param, findParamDocs(param.getName(), docs));
    }),
    overloads: asArray(declaration.getOverloads()).map(mapOverloadApi),
    parentRelation: mapParentRelation(parentRelation),
  };
}

/**
 *
 * @param member
 */
export function mapMethodSignatureApi(
  member: ApiMember<OptionalKind<MethodSignatureStructure>, MethodSignature>,
): MethodApi {
  const { structure, declaration, docNode, parentRelation } = member;
  const docs = mapDocApi(docNode);

  return {
    name: structure.name,
    docs,
    decorators: [],
    returnType: displayReturnType(declaration),
    isAbstract: false,
    isStatic: false,
    isProtected: false,
    isAsync: false,
    parameters: asArray(declaration.getParameters()).map((param) => {
      return mapParameterApi(param, findParamDocs(param.getName(), docs));
    }),
    overloads: [],
    parentRelation: mapParentRelation(parentRelation),
  };
}
