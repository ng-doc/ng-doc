import {isPresent} from '@ng-doc/core';
import {ClassDeclaration, ObjectLiteralExpression} from 'ts-morph';

import {getTargetForPlayground} from './get-playground-properties';
import {getPlaygroundsExpression} from './get-playgrounds-expression';
import {getPlaygroundsIds} from './get-playgrounds-ids';

/**
 *
 * @param expression
 */
export function getPlaygroundTargets(expression: ObjectLiteralExpression): ClassDeclaration[] {
	const playgroundExpression: ObjectLiteralExpression | undefined = getPlaygroundsExpression(expression);

	if (playgroundExpression) {
		const ids: string[] = getPlaygroundsIds(playgroundExpression);

		return ids.map((id: string) => getTargetForPlayground(playgroundExpression, id)).filter(isPresent);
	}

	return [];
}
