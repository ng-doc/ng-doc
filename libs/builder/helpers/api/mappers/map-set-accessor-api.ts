import { asArray } from '@ng-doc/core';
import {
  OptionalKind,
  Scope,
  SetAccessorDeclaration,
  SetAccessorDeclarationStructure,
} from 'ts-morph';

import { displayReturnType } from '../../typescript';
import { findParamDocs } from '../helpers';
import { ApiMember, ParentApiRelation } from '../types';
import { mapDecorators } from './map-decorators';
import { DocApi, mapDocApi } from './map-docs';
import { mapParameterApi, ParameterApi } from './map-parameter-api';
import { mapParentRelation } from './map-parent-relation';

export interface SetAccessorApi {
  name: string;
  docs: DocApi[];
  kind: 'set';
  decorators: string[];
  returnType: string;
  isAbstract: boolean;
  isStatic: boolean;
  isProtected: boolean;
  parameters: ParameterApi[];
  parentRelation?: ParentApiRelation;
}

/**
 *
 * @param structure
 * @param member
 */
export function mapSetAccessorApi(
  member: ApiMember<OptionalKind<SetAccessorDeclarationStructure>, SetAccessorDeclaration>,
): SetAccessorApi {
  const { structure, declaration, docNode, parentRelation } = member;
  const docs = mapDocApi(docNode);

  return {
    name: structure.name,
    kind: 'set',
    docs,
    decorators: mapDecorators(asArray(structure.decorators)),
    returnType: displayReturnType(declaration),
    isAbstract: !!structure.isAbstract,
    isStatic: !!structure.isStatic,
    isProtected: structure.scope === Scope.Protected,
    parameters: asArray(declaration.getParameters()).map((p) =>
      mapParameterApi(p, findParamDocs(p.getName(), docs)),
    ),
    parentRelation: mapParentRelation(parentRelation),
  };
}
