import {Component} from '@angular/core';
import {ObjectLiteralElementLike, ObjectLiteralExpression} from 'ts-morph';

import {getPropertyAssignment} from './common/get-property-assignment';
import {stringExpressionResolver} from './string-expression.resolver';

/**
 *	Resolves the component decorator and return its properties.
 *
 * @param {ObjectLiteralExpression} objectLiteralExpression The object literal expression to extract target.
 * @returns {Component} The component decorator properties.
 */
export function componentDecoratorResolver(objectLiteralExpression: ObjectLiteralExpression): Component {
	const templateProperty: ObjectLiteralElementLike | undefined = objectLiteralExpression.getProperty('templateUrl');
	const styleUrlsProperty: ObjectLiteralElementLike | undefined = objectLiteralExpression.getProperty('styleUrls');

	return {
		templateUrl: stringExpressionResolver(getPropertyAssignment(templateProperty)),
		styleUrls: stringExpressionResolver(getPropertyAssignment(styleUrlsProperty)),
	};
}
