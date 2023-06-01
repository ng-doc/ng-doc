import {Component, Directive} from '@angular/core';
import {ClassDeclaration} from 'ts-morph';

import {componentDecorator} from './component-decorator';
import {directiveDecorator} from './directive-decorator';

/**
 *
 * @param cls
 * @param notFoundResult
 */
export function isStandalone(cls: ClassDeclaration, notFoundResult: boolean = false): boolean {
	const decorator: Component | Directive | undefined = componentDecorator(cls) ?? directiveDecorator(cls);

	return decorator?.standalone ?? notFoundResult;
}
