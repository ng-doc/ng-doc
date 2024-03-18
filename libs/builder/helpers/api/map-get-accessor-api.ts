import { asArray } from '@ng-doc/core';
import { GetAccessorDeclarationStructure, OptionalKind } from 'ts-morph';

export interface GetAccessorApi {
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
export function mapGetAccessorApi(
  structure: OptionalKind<GetAccessorDeclarationStructure>,
): GetAccessorApi {
  return {
    name: structure.name,
    decorators: asArray(structure.decorators).map(String),
    returnType: String(structure.returnType) ?? 'unknown',
    isAbstract: !!structure.isAbstract,
    isStatic: !!structure.isStatic,
  };
}
