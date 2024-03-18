import { OptionalKind, PropertyDeclarationStructure } from 'ts-morph';

export interface PropertyApi {
  name: string;
  type: string;
  isAbstract: boolean;
  isStatic: boolean;
  isReadonly: boolean;
}

/**
 *
 * @param structure
 */
export function mapPropertyApi(structure: OptionalKind<PropertyDeclarationStructure>): PropertyApi {
  return {
    name: structure.name,
    type: String(structure.type) ?? 'unknown',
    isAbstract: !!structure.isAbstract,
    isStatic: !!structure.isStatic,
    isReadonly: !!structure.isReadonly,
  };
}
