import { asArray } from '@ng-doc/core';
import { AbstractableNodeStructure, ClassDeclaration } from 'ts-morph';

import { getAllMembers } from '../typescript/method/get-all-members';
import { GetAccessorApi, mapGetAccessorApi } from './map-get-accessor-api';
import { mapMethodApi, MethodApi } from './map-methos-api';
import { mapPropertyApi, PropertyApi } from './map-property-api';
import { mapSetAccessorApi, SetAccessorApi } from './map-set-accessor-api';

export interface ClassApi {
  name: string;
  extends?: string;
  isAbstract: boolean;
  decorators: string[];
  implements: string[];
  properties: PropertyApi[];
  methods: MethodApi[];
  getAccessors: GetAccessorApi[];
  setAccessors: SetAccessorApi[];
}

/**
 *
 * @param declaration
 */
export function getClassApi(declaration: ClassDeclaration): ClassApi {
  const structure = declaration.getStructure();
  const filter = (node: AbstractableNodeStructure, cls: ClassDeclaration) =>
    !node.isAbstract || (node.isAbstract && cls === declaration);

  return {
    name: structure.name ?? '[Unknown]',
    isAbstract: !!structure.isAbstract,
    decorators: asArray(structure.decorators).map(({ name }) => name),
    implements: asArray(structure.implements).map(String),
    extends: String(structure.extends),
    getAccessors: getAllMembers(
      declaration,
      (structure) => asArray(structure.getAccessors).map(mapGetAccessorApi),
      (member) => member.name,
      filter,
    ),
    setAccessors: getAllMembers(
      declaration,
      (structure) => asArray(structure.setAccessors).map(mapSetAccessorApi),
      (member) => member.name,
      filter,
    ),
    properties: getAllMembers(
      declaration,
      (structure) => asArray(structure.properties).map(mapPropertyApi),
      (member) => member.name,
      filter,
    ),
    methods: getAllMembers(
      declaration,
      (structure) => asArray(structure.methods).map(mapMethodApi),
      (member) => member.name,
      filter,
    ),
  };
}
