import { Component, Directive, Pipe } from '@angular/core';
import { ClassDeclaration } from 'ts-morph';

import { getComponentDecorator } from './get-component-decorator';
import { getDirectiveDecorator } from './get-directive-decorator';
import { getPipeDecorator } from './get-pipe-decorator';

/**
 *
 * @param cls
 * @param notFoundResult
 */
export function isStandalone(cls: ClassDeclaration): boolean {
	const decorator: Component | Directive | Pipe | undefined =
		getComponentDecorator(cls) ?? getDirectiveDecorator(cls) ?? getPipeDecorator(cls);

	return !!decorator?.standalone;
}
