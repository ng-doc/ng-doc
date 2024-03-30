import { asArray } from '@ng-doc/core';
import {
  OptionalKind,
  PropertyDeclaration,
  PropertyDeclarationStructure,
  PropertySignature,
  PropertySignatureStructure,
  Scope,
} from 'ts-morph';

import { displayType } from '../../typescript';
import { ApiMember, ParentApiRelation } from '../types';
import { mapDecorators } from './map-decorators';
import { DocApi, mapDocApi } from './map-docs';
import { mapParentRelation } from './map-parent-relation';

export interface PropertyApi {
  name: string;
  docs: DocApi[];
  type: string;
  decorators: string[];
  isAbstract: boolean;
  isStatic: boolean;
  isReadonly: boolean;
  isProtected: boolean;
  parentRelation?: ParentApiRelation;
}

/**
 *
 * @param structure
 * @param member
 */
export function mapPropertyApi(
  member: ApiMember<OptionalKind<PropertyDeclarationStructure>, PropertyDeclaration>,
): PropertyApi {
  const { structure, declaration, docNode, parentRelation } = member;

  return {
    name: structure.name,
    docs: mapDocApi(docNode),
    decorators: mapDecorators(asArray(structure.decorators)),
    type: displayType(declaration),
    isAbstract: !!structure.isAbstract,
    isStatic: !!structure.isStatic,
    isReadonly: !!structure.isReadonly,
    isProtected: structure.scope === Scope.Protected,
    parentRelation: mapParentRelation(parentRelation),
  };
}

/**
 *
 * @param member
 */
export function mapPropertySignatureApi(
  member: ApiMember<OptionalKind<PropertySignatureStructure>, PropertySignature>,
): PropertyApi {
  const { structure, declaration, docNode, parentRelation } = member;

  return {
    name: structure.name,
    docs: mapDocApi(docNode),
    decorators: [],
    type: displayType(declaration),
    isAbstract: false,
    isStatic: false,
    isReadonly: false,
    isProtected: false,
    parentRelation: mapParentRelation(parentRelation),
  };
}
