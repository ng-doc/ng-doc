import { TypeAliasDeclaration } from 'ts-morph';

import { DocApi, mapDocApi } from './mappers';

export interface TypeAliasApi {
  name: string;
  docs: DocApi[];
  type: string;
}

/**
 *
 * @param typeAlias
 */
export function getTypeAliasApi(typeAlias: TypeAliasDeclaration): TypeAliasApi {
  const structure = typeAlias.getStructure();

  return {
    name: structure.name,
    docs: mapDocApi(structure),
    type: String(structure.type),
  };
}
