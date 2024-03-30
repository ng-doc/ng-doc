import { asArray } from '@ng-doc/core';
import { EnumDeclaration } from 'ts-morph';

import { DocApi, EnumMemberApi, mapDocApi, mapEnumMemberApi } from './mappers';

export interface EnumApi {
  name: string;
  docs: DocApi[];
  members: EnumMemberApi[];
}

/**
 *
 * @param declaration
 */
export function getEnumApi(declaration: EnumDeclaration): EnumApi {
  const structure = declaration.getStructure();

  return {
    name: structure.name,
    docs: mapDocApi(structure),
    members: asArray(declaration.getMembers()).map(mapEnumMemberApi),
  };
}
