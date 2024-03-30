import { asArray } from '@ng-doc/core';
import { InterfaceDeclaration } from 'ts-morph';

import { getInterfaceApiMembers } from './helpers';
import {
  DocApi,
  mapDocApi,
  mapMethodSignatureApi,
  mapPropertySignatureApi,
  MethodApi,
  PropertyApi,
} from './mappers';

export interface InterfaceApi {
  name: string;
  extends: string[];
  docs: DocApi[];
  methods: MethodApi[];
  properties: PropertyApi[];
}

/**
 *
 * @param declaration
 */
export function getInterfaceApi(declaration: InterfaceDeclaration): InterfaceApi {
  const structure = declaration.getStructure();

  return {
    name: structure.name ?? '[Unknown]',
    extends: asArray(structure.extends).map(String),
    docs: mapDocApi(structure),
    properties: getInterfaceApiMembers(
      declaration,
      (structure) => asArray(structure.properties),
      (members) => Array.from(members.values()).map(mapPropertySignatureApi),
    ),
    methods: getInterfaceApiMembers(
      declaration,
      (structure) => asArray(structure.methods),
      (members) => Array.from(members.values()).map(mapMethodSignatureApi),
    ),
  };
}
