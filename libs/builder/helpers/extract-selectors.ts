import {Component, Directive} from '@angular/core';
import {Node} from 'ts-morph';

import {NgDocSupportedDeclarations} from '../types';
import {componentDecorator, directiveDecorator} from './angular';

/**
 *
 * @param declaration
 */
export function extractSelectors(declaration: NgDocSupportedDeclarations): string[] {
	if (Node.isClassDeclaration(declaration)) {
		const decorator: Component | Directive | undefined = componentDecorator(declaration) ?? directiveDecorator(declaration);

		if (decorator) {
			return decorator.selector?.split(',').map((s: string) => s.trim()) ?? [];
		}
	}

	return [];
}
