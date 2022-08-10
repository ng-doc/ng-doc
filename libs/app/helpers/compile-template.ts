import {NgDocHtmlParser} from '@ng-doc/app/classes';
import {NgDocPlaygroundFormData} from '@ng-doc/app/interfaces';
import {NgDocPlaygroundDynamicContent, NgDocPlaygroundProperties, NgDocPlaygroundProperty} from '@ng-doc/builder';
import {objectKeys} from '@ng-doc/core';
import * as CSSWhat from 'css-what';
import {SelectorType} from 'css-what';
import {Selector, TagSelector} from 'css-what/lib/es/types';
import {DefaultTreeAdapterMap} from 'parse5';

const NG_DOC_SELECTOR_NAME: string = 'ng-doc-selector';


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
	const parser: NgDocHtmlParser = new NgDocHtmlParser(template);
	const selectors: Selector[] = CSSWhat.parse(selector)[0];

	const rootElement: DefaultTreeAdapterMap['element'] | undefined =
		parser.find(NG_DOC_SELECTOR_NAME) ?? parser.find(selector);

	if (rootElement) {
		rootElement.attrs = [];
		selectorToAttributes(parser, rootElement, selectors);

		if (rootElement.tagName.toLowerCase() === NG_DOC_SELECTOR_NAME.toLowerCase()) {
			rootElement.tagName =
				(selectors.find((selector: Selector) => selector.type === SelectorType.Tag) as TagSelector)?.name ??
				'div';
		}

		propertiesToAttributes(parser, rootElement, properties, data);
	}

	return replaceContent(parser.serialize(), data, dynamicContent, destination).replace(/=""/g, '');
}

/**
 *
 * @param parser
 * @param element
 * @param selectors
 */
function selectorToAttributes(
	parser: NgDocHtmlParser,
	element: DefaultTreeAdapterMap['element'],
	selectors: Selector[],
): void {
	selectors.forEach((selector: Selector) => {
		if (selector.type === 'attribute') {
			parser.setAttribute(element, selector.name, selector.value);
		}
	});
}

/**
 *
 * @param parser
 * @param element
 * @param properties
 * @param data
 */
function propertiesToAttributes<P extends NgDocPlaygroundProperties>(
	parser: NgDocHtmlParser,
	element: DefaultTreeAdapterMap['element'],
	properties: P,
	data: NgDocPlaygroundFormData<P>,
): void {
	objectKeys(properties).forEach((key: keyof P) => {
		const property: NgDocPlaygroundProperty = properties[key];
		const propertyValue: unknown = data.properties[key];
		const valueIsString: boolean = typeof propertyValue === 'string';
		const inputValue: string = valueIsString ? `'${propertyValue}'` : `${propertyValue}`;

		if ((property.default ?? '') !== inputValue) {
			parser.setAttribute(element, `[${String(key)}]`, inputValue);
		}
	});
}

/**
 *
 * @param htmlData
 * @param data
 * @param dynamicContent
 * @param destination
 */
function replaceContent(
	htmlData: string,
	data: NgDocPlaygroundFormData,
	dynamicContent: Record<string, NgDocPlaygroundDynamicContent> | undefined,
	destination: 'preview' | 'dynamic' | 'compile',
): string {
	if (dynamicContent) {
		objectKeys(dynamicContent).forEach((key: string) => {
			const elementContent: string =
				destination === 'compile'
					? `<ng-container *ngIf="content.${key}">
								${dynamicContent[key].template}
						</ng-container>`
					: data.content[key]
					? dynamicContent[key].template
					: '';

			htmlData = htmlData.replace(
				new RegExp(`{{\\s*${key}\\s*}}`, 'gm'),
				elementContent ? `\n${elementContent}\n` : '',
			);
		});
	}

	return htmlData;
}
