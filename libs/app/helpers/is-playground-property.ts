import { objectKeys } from '@ng-doc/core/helpers/object-keys';
import { NgDocPlaygroundProperty } from '@ng-doc/core/interfaces';

/**
 *
 * @param obj
 */
export function isPlaygroundProperty(obj: Record<string, any>): obj is NgDocPlaygroundProperty {
  return objectKeys(obj).includes('type');
}
