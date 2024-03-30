import { asArray } from '@ng-doc/core';
import {
  GetAccessorDeclaration,
  GetAccessorDeclarationStructure,
  OptionalKind,
  Scope,
} from 'ts-morph';

import { displayReturnType } from '../../typescript';
import { ApiMember, ParentApiRelation } from '../types';
import { mapDecorators } from './map-decorators';
import { DocApi, mapDocApi } from './map-docs';
import { mapParentRelation } from './map-parent-relation';

export interface GetAccessorApi {
  name: string;
  kind: 'get';
  decorators: string[];
  returnType: string;
  isAbstract: boolean;
  isStatic: boolean;
  isProtected: boolean;
  docs: DocApi[];
  parentRelation?: ParentApiRelation;
}

/**
 *
 * @param structure
 * @param member
 */
export function mapGetAccessorApi(
  member: ApiMember<OptionalKind<GetAccessorDeclarationStructure>, GetAccessorDeclaration>,
): GetAccessorApi {
  const { structure, declaration, docNode, parentRelation } = member;

  return {
    name: structure.name,
    kind: 'get',
    docs: mapDocApi(docNode),
    decorators: mapDecorators(asArray(structure.decorators)),
    returnType: displayReturnType(declaration),
    isAbstract: !!structure.isAbstract,
    isStatic: !!structure.isStatic,
    isProtected: structure.scope === Scope.Protected,
    parentRelation: mapParentRelation(parentRelation),
  };
}
