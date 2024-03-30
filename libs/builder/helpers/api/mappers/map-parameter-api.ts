import { asArray } from '@ng-doc/core';
import { ParameterDeclaration } from 'ts-morph';

import { displayType } from '../../typescript';
import { mapDecorators } from './map-decorators';

export interface ParameterApi {
  name: string;
  docs: string[];
  decorators: string[];
  isReadonly: boolean;
  isOptional: boolean;
  isRest: boolean;
  type: string;
  initializer?: string;
}

/**
 *
 * @param declaration
 * @param docs
 */
export function mapParameterApi(declaration: ParameterDeclaration, docs: string[]): ParameterApi {
  const structure = declaration.getStructure();

  return {
    name: structure.name,
    docs,
    decorators: mapDecorators(asArray(structure.decorators)),
    isReadonly: !!structure.isReadonly,
    isOptional: !!structure.hasQuestionToken,
    isRest: !!structure.isRestParameter,
    type: displayType(declaration),
    initializer: structure.initializer ? String(structure.initializer) : undefined,
  };
}
