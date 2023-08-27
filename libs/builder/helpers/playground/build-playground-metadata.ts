import { Component, Directive, Pipe } from '@angular/core';
import {
	buildPlaygroundDemoPipeTemplate,
	buildPlaygroundDemoTemplate,
	NgDocPlaygroundProperties,
} from '@ng-doc/core';
import { ClassDeclaration, ObjectLiteralExpression } from 'ts-morph';

import { NgDocPlaygroundMetadata } from '../../interfaces';
import {
	getComponentDecorator,
	getDirectiveDecorator,
	getPipeDecorator,
	isStandalone,
} from '../angular';
import { extractSelectors } from '../extract-selectors';
import { getContentForPlayground } from './get-content-for-playground';
import { getPlaygroundComponentInputs, getPlaygroundPipeInputs } from './get-playground-inputs';
import { getPlaygroundTemplateInputs } from './get-playground-template-inputs';
import { getTargetForPlayground } from './get-target-for-playground';
import { getTemplateForPlayground } from './get-template-for-playground';

/**
 * Collects all the information about a playground that is needed to render and build it.
 *
 * @param id - The id of the playground
 * @param playground - The playground object
 * @param additionalProps
 */
export function buildPlaygroundMetadata(
	id: string,
	playground: ObjectLiteralExpression,
	additionalProps?: NgDocPlaygroundProperties,
): NgDocPlaygroundMetadata {
	const target: ClassDeclaration | undefined = getTargetForPlayground(playground);

	if (!target) {
		throw new Error(`Can't find "target" for playground "${id}"`);
	}

	const decorator: Component | Directive | Pipe | undefined =
		getComponentDecorator(target) ?? getDirectiveDecorator(target) ?? getPipeDecorator(target);

	if (!decorator) {
		throw new Error(
			`Invalid target class for playground "${id}". Make sure that the class is decorated with @Component, @Directive or @Pipe.`,
		);
	}

	const template: string = getTemplateForPlayground(playground);
	const content: Record<string, string> = getContentForPlayground(playground);
	const standalone: boolean = isStandalone(target);

	if ('selector' in decorator) {
		const selector: string = decorator.selector!.replace(/[\n\s]/gm, '');
		const properties: NgDocPlaygroundProperties = {
			...getPlaygroundComponentInputs(target),
			...additionalProps,
		};
		const templateInputs: Record<string, string> = getPlaygroundTemplateInputs(properties);

		return {
			selector: selector,
			standalone,
			template,
			templateForComponents: extractSelectors(target).reduce(
				(templateForComponents: Record<string, string>, selector: string) => {
					return {
						...templateForComponents,
						[selector]: buildPlaygroundDemoTemplate(
							template,
							selector,
							content,
							templateInputs,
							false,
						),
					};
				},
				{},
			),
			class: target,
			properties,
			content,
		};
	} else if ('name' in decorator) {
		const name: string = decorator.name!.replace(/[\n\s]/gm, '');
		const properties: NgDocPlaygroundProperties = getPlaygroundPipeInputs(target);
		const templateInputs: Record<string, string> = getPlaygroundTemplateInputs(properties);

		return {
			name,
			standalone,
			template,
			templateForComponents: {
				[name]: buildPlaygroundDemoPipeTemplate(template, name, content, templateInputs, false),
			},
			class: target,
			properties,
			content,
		};
	} else {
		throw new Error(
			`Invalid target for playground "${id}". Make sure that your @Component/@Directive has a "selector" property or "name" property if you are using @Pipe.`,
		);
	}
}
