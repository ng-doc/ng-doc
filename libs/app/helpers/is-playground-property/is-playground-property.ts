import {NgDocPlaygroundProperty} from '@ng-doc/core';
import {objectKeys} from '@ng-doc/core';

/**
 *
 * @param obj
 */
export function isPlaygroundProperty(obj: Record<string, any>): obj is NgDocPlaygroundProperty {
	return objectKeys(obj).includes('type');
}
