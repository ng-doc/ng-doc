import * as CSSWhat from 'css-what';
import {SelectorType} from 'css-what';
import {Selector, TagSelector} from 'css-what/lib/es/types';
import {NodeTag} from 'posthtml-parser';

import {NgDocHtmlParser} from '../classes';
import {NG_DOC_DYNAMIC_SELECTOR} from '../constants';
import {objectKeys} from './object-keys';

/**
 *
 * @param template
 * @param selector
 * @param content
 * @param inputs
 */
export function buildPlaygroundDemoTemplate(
	template: string,
	selector: string,
	content: Record<string, string>,
	inputs?: Record<string, string>,
): string {
	const parser: NgDocHtmlParser = new NgDocHtmlParser(template);
	const selectors: Selector[] = CSSWhat.parse(selector)[0];

	const rootElement: NodeTag | undefined = parser.find(NG_DOC_DYNAMIC_SELECTOR) ?? parser.find(selector);

	if (rootElement) {
		rootElement.attrs = {};
		parser.setAttributesFromSelectors(rootElement, selectors);

		if (String(rootElement.tag).toLowerCase() === NG_DOC_DYNAMIC_SELECTOR.toLowerCase()) {
			rootElement.tag =
				(selectors.find((selector: Selector) => selector.type === SelectorType.Tag) as TagSelector)?.name ?? 'div';
		}

		inputs && parser.fillAngularAttributes(rootElement, inputs);
	}

	return (
		replaceContent(parser.serialize(), content ?? {}, !!inputs)
			.replace(/=""/g, '')
			// Remove empty lines
			.replace(/^\s*\n/gm, '')
	);
}

/**
 *
 * @param htmlData
 * @param content
 * @param preview
 */
function replaceContent(htmlData: string, content: Record<string, string>, preview?: boolean): string {
	objectKeys(content).forEach((key: string) => {
		const condition: string = preview
			? content[key]
			: `
				<ng-container *ngIf="content['${key}']">
					${content[key]}
				</ng-container>`.trim();

		htmlData = htmlData.replace(new RegExp(`{{\\s*content.${key}\\s*}}`, 'gm'), condition ? `\n${condition}\n` : '');
	});

	return htmlData;
}
