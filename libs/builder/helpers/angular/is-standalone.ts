import {Component} from '@angular/core';
import {ClassDeclaration} from 'ts-morph';

import {componentDecorator} from './component-decorator';

/**
 *
 * @param cls
 * @param notFoundResult
 */
export function isStandalone(cls: ClassDeclaration, notFoundResult: boolean = false): boolean {
	const decorator: Component | undefined = componentDecorator(cls);

	return decorator?.standalone ?? notFoundResult;
}
