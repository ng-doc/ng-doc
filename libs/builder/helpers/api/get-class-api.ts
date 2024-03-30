import { asArray } from '@ng-doc/core';
import { ClassDeclaration } from 'ts-morph';

import { getClassApiMembers } from './helpers/get-class-api-members';
import {
  ConstructorApi,
  DocApi,
  mapConstructorApi,
  mapDecorators,
  mapDocApi,
  mapMethodApi,
  mapPropertyApi,
  MethodApi,
  PropertyApi,
} from './mappers';
import { AccessorApi, mapAccessorApi } from './mappers/map-accessor';

export interface ClassApi {
  name: string;
  extends?: string;
  isAbstract: boolean;
  decorators: string[];
  implements: string[];
  docs: DocApi[];
  constructors: ConstructorApi[];
  staticProperties: PropertyApi[];
  properties: PropertyApi[];
  staticMethods: MethodApi[];
  methods: MethodApi[];
  staticAccessors: AccessorApi[];
  accessors: AccessorApi[];
}

/**
 *
 * @param declaration
 */
export function getClassApi(declaration: ClassDeclaration): ClassApi {
  const structure = declaration.getStructure();

  return {
    name: structure.name ?? '[Unknown]',
    isAbstract: !!structure.isAbstract,
    decorators: mapDecorators(asArray(structure.decorators)),
    implements: asArray(structure.implements).map(String),
    extends: structure.extends ? String(structure.extends) : undefined,
    docs: mapDocApi(structure),
    constructors: asArray(declaration.getConstructors())
      .filter((ctor) => ctor.getScope() !== 'private')
      .map(mapConstructorApi),
    staticAccessors: getClassApiMembers(
      declaration,
      (structure) =>
        [...asArray(structure.getAccessors), ...asArray(structure.setAccessors)].filter(
          ({ isStatic }) => isStatic,
        ),
      mapAccessorApi,
      (member) => `${member.kind}#${member.name}`,
    ),
    accessors: getClassApiMembers(
      declaration,
      (structure) =>
        [...asArray(structure.getAccessors), ...asArray(structure.setAccessors)].filter(
          ({ isStatic }) => isStatic,
        ),
      mapAccessorApi,
      (member) => `${member.kind}#${member.name}`,
    ),
    staticProperties: getClassApiMembers(
      declaration,
      (structure) => asArray(structure.properties?.filter(({ isStatic }) => isStatic)),
      (members) => Array.from(members.values()).map(mapPropertyApi),
    ),
    properties: getClassApiMembers(
      declaration,
      (structure) => asArray(structure.properties?.filter(({ isStatic }) => !isStatic)),
      (members) => Array.from(members.values()).map(mapPropertyApi),
    ),
    staticMethods: getClassApiMembers(
      declaration,
      (structure) => asArray(structure.methods?.filter(({ isStatic }) => isStatic)),
      (members) => Array.from(members.values()).map(mapMethodApi),
    ),
    methods: getClassApiMembers(
      declaration,
      (structure) => asArray(structure.methods?.filter(({ isStatic }) => !isStatic)),
      (members) => Array.from(members.values()).map(mapMethodApi),
    ),
  };
}
