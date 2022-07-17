import {NgDocPlaygroundFormData} from '@ng-doc/app/interfaces';
import {NgDocPlaygroundDynamicContent, NgDocPlaygroundProperties, NgDocPlaygroundProperty} from '@ng-doc/builder';
import {objectKeys} from '@ng-doc/core';

/**
 * <{{ngDocSelector}}></{{ngDocSelector}}>
 */

/**
 *
 * @param template
 * @param selector
 * @param properties
 * @param dynamicContent
 * @param data
 * @param destination
 */
export function compileTemplate(
	template: string,
	selector: string,
	properties: NgDocPlaygroundProperties,
	data: NgDocPlaygroundFormData,
	dynamicContent?: Record<string, NgDocPlaygroundDynamicContent>,
	destination: 'preview' | 'dynamic' | 'compile' = 'dynamic',
): string {
	const selectorMatch: RegExpMatchArray | null = /(<)?(\w*\s+)?({{\s*ngDocSelector\s*}})/g.exec(template);
	const tag: string = ((selectorMatch && selectorMatch[2]) ?? extractTagFromSelector(selector)).trim();
	const attributes: string = extractAttributesFromSelector(selector);
	const inputs: string = convertPropertiesToInputs(properties, data);

	template = template
		.replace(/<\w*\s*{{\s*ngDocSelector\s*}}\w*\s*>/gm, `<${(tag + ' ' + attributes + ' ' + inputs).trim()}>`)
		.replace(/<\/\w*\s*{{\s*ngDocSelector\s*}}\w*\s*>/gm, `</${tag}>`);

	if (dynamicContent) {
		objectKeys(dynamicContent).forEach((key: string) => {
			const contentTemplate: string =
				destination === 'compile'
					? `<ng-container *ngIf="content.${key}">
								${dynamicContent[key].template}
							</ng-container>`
					: data.content[key]
					? dynamicContent[key].template
					: '';

			template = template.replace(
				new RegExp(`{{\\s*${key}\\s*}}`, 'gm'),
				contentTemplate ? `\n${contentTemplate}\n` : '',
			);
		});
	}

	return template;
}

/**
 *
 * @param selector
 */
function extractTagFromSelector(selector: string): string {
	const match: RegExpMatchArray | null = /^([^[\]]*)(\[.*])?$/gm.exec(selector);

	return (match && match[1]) || 'div';
}

/**
 *
 * @param selector
 */
function extractAttributesFromSelector(selector: string): string {
	const match: RegExpMatchArray | null = /^([^[\]]*)(\[.*])?$/gm.exec(selector);

	return (match && match[2]) ?? '';
}

/**
 *
 * @param properties
 * @param data
 */
function convertPropertiesToInputs<P extends NgDocPlaygroundProperties>(
	properties: P,
	data: NgDocPlaygroundFormData<P>,
): string {
	return objectKeys(properties).reduce((inputs: string, key: keyof P) => {
		const property: NgDocPlaygroundProperty = properties[key];
		const propertyValue: unknown = data.properties[key];
		const valueIsString: boolean = typeof propertyValue === 'string';
		const inputValue: string = valueIsString ? `'${propertyValue}'` : `${propertyValue}`;

		if ((property.default ?? '') !== inputValue) {
			inputs += `[${String(key)}]="${inputValue}" `;
		}

		return inputs;
	}, '').trim();
}
