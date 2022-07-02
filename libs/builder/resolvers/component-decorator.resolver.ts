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
	const selectorProperty: ObjectLiteralElementLike | undefined = objectLiteralExpression.getProperty('selector');
	const templateProperty: ObjectLiteralElementLike | undefined = objectLiteralExpression.getProperty('templateUrl');
	const styleUrlsProperty: ObjectLiteralElementLike | undefined = objectLiteralExpression.getProperty('styleUrls');

	return {
		selector: stringExpressionResolver(getPropertyAssignment(selectorProperty)),
		templateUrl: stringExpressionResolver(getPropertyAssignment(templateProperty)),
		styleUrls: stringExpressionResolver(getPropertyAssignment(styleUrlsProperty)),
	};
}
