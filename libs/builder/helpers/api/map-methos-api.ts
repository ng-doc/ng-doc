import { MethodDeclarationStructure, OptionalKind } from 'ts-morph';

export interface MethodApi {
  name: string;
  returnType: string;
  isAbstract: boolean;
  isStatic: boolean;
}

/**
 *
 * @param structure
 */
export function mapMethodApi(structure: OptionalKind<MethodDeclarationStructure>): MethodApi {
  return {
    name: structure.name,
    returnType: String(structure.returnType) ?? 'unknown',
    isAbstract: !!structure.isAbstract,
    isStatic: !!structure.isStatic,
  };
}
