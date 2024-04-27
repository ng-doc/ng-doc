import { NodeTag } from 'posthtml-parser';

import { NgDocHtmlParser } from '../classes';
import { NG_DOC_DYNAMIC_SELECTOR } from '../constants';
import { isPresent } from './is-present';

/**
 *
 * @param template
 * @param componentSelectors
 */
export function getAssignedInputs(template: string, componentSelectors: string[]): string[] {
	const parser: NgDocHtmlParser = new NgDocHtmlParser(template);
	const rootElement: NodeTag | undefined =
		parser.find(NG_DOC_DYNAMIC_SELECTOR) ??
		parser.find(componentSelectors.find((selector) => parser.find(selector))!);

	if (!rootElement) {
		throw new Error(
			`Root element not found. Make sure that the template contains the component selector or the dynamic "${NG_DOC_DYNAMIC_SELECTOR}" selector.`,
		);
	}

	return Object.entries(rootElement.attrs ?? {})
		.filter(([, value]) => isPresent(value))
		.map(([key]) => key.replace(/\[|\]/g, ''));
}
