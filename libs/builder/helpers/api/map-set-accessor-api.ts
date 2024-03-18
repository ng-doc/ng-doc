import { asArray } from '@ng-doc/core';
import { OptionalKind, SetAccessorDeclarationStructure } from 'ts-morph';

export interface SetAccessorApi {
  name: string;
  decorators: string[];
  returnType: string;
  isAbstract: boolean;
  isStatic: boolean;
}

/**
 *
 * @param structure
 */
export function mapSetAccessorApi(
  structure: OptionalKind<SetAccessorDeclarationStructure>,
): SetAccessorApi {
  return {
    name: structure.name,
    decorators: asArray(structure.decorators).map(String),
    returnType: String(structure.returnType) ?? 'unknown',
    isAbstract: !!structure.isAbstract,
    isStatic: !!structure.isStatic,
  };
}
