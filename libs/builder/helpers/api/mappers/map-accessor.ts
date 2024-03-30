import {
  AccessorDeclaration,
  GetAccessorDeclaration,
  GetAccessorDeclarationStructure,
  OptionalKind,
  SetAccessorDeclaration,
  SetAccessorDeclarationStructure,
  StructureKind,
} from 'ts-morph';

import { ApiMember } from '../types';
import { GetAccessorApi, mapGetAccessorApi } from './map-get-accessor-api';
import { mapSetAccessorApi, SetAccessorApi } from './map-set-accessor-api';

export interface AccessorApi {
  name: string;
  get?: GetAccessorApi;
  set?: SetAccessorApi;
}

/**
 *
 * @param accessors
 */
export function mapAccessorApi(
  accessors: Map<
    string,
    ApiMember<
      OptionalKind<GetAccessorDeclarationStructure> | SetAccessorDeclarationStructure,
      AccessorDeclaration
    >
  >,
): AccessorApi[] {
  const result = new Map<string, AccessorApi>();

  accessors.forEach((accessor) => {
    const { structure } = accessor;
    const existing = result.get(structure.name);

    if (!existing) {
      const getAccessor = accessors.get(
        `${StructureKind.GetAccessor}#${structure.name}`,
      ) as ApiMember<OptionalKind<GetAccessorDeclarationStructure>, GetAccessorDeclaration>;
      const setAccessor = accessors.get(
        `${StructureKind.SetAccessor}#${structure.name}`,
      ) as ApiMember<OptionalKind<SetAccessorDeclarationStructure>, SetAccessorDeclaration>;

      result.set(structure.name, {
        name: structure.name,
        get: getAccessor ? mapGetAccessorApi(getAccessor) : undefined,
        set: setAccessor ? mapSetAccessorApi(setAccessor) : undefined,
      });
    }
  });

  return Array.from(result.values());
}
