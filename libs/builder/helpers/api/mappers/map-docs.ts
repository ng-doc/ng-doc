import { asArray } from '@ng-doc/core';
import { JSDocableNodeStructure, JSDocStructure, OptionalKind } from 'ts-morph';

export type DocApi = JSDocStructure;

/**
 *
 * @param node
 */
export function mapDocApi(node?: JSDocableNodeStructure): DocApi[] {
  return asArray(node?.docs).filter(isJsDocSignature);
}

/**
 *
 * @param node
 */
function isJsDocSignature(node: OptionalKind<JSDocStructure> | string): node is JSDocStructure {
  return typeof node !== 'string';
}
