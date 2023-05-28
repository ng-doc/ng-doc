import {isPresent} from '@ng-doc/core';
import {ClassDeclaration, ObjectLiteralExpression} from 'ts-morph';

import {getTargetForPlayground} from './get-playground-properties';
import {getPlaygroundsIds} from './get-playgrounds-ids';

/**
 *
 * @param expression
 */
export function getPlaygroundTargets(expression: ObjectLiteralExpression): ClassDeclaration[] {
	const ids: string[] = getPlaygroundsIds(expression);

	return ids.map((id: string) => getTargetForPlayground(expression, id)).filter(isPresent)
}
