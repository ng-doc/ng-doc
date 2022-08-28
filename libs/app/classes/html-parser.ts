import {asArray} from '@ng-doc/core';
import * as CSSWhat from 'css-what';
import {AttributeSelector, SelectorType} from 'css-what';
import {Selector, TagSelector} from 'css-what/lib/es/types';
import {DefaultTreeAdapterMap, parseFragment, serialize} from 'parse5';
import {Attribute} from 'parse5/dist/common/token';

export class NgDocHtmlParser {
	private readonly parsedHTML: DefaultTreeAdapterMap['documentFragment'];

	constructor(private html: string) {
		this.parsedHTML = parseFragment(html);
	}

	find(selector: string): DefaultTreeAdapterMap['element'] | undefined {
		const selectors: Selector[] = CSSWhat.parse(selector)[0];
		const tagSelectors: TagSelector[] = selectors.filter(
			(selector: Selector) => selector.type === SelectorType.Tag,
		) as TagSelector[];
		const attrSelectors: AttributeSelector[] = selectors.filter(
			(selector: Selector) => selector.type === SelectorType.Attribute,
		) as AttributeSelector[];

		const nodes: Array<DefaultTreeAdapterMap['childNode']> = [...this.parsedHTML.childNodes];

		while (nodes.length) {
			const shiftNode: DefaultTreeAdapterMap['childNode'] | undefined = nodes.shift();
			const node: DefaultTreeAdapterMap['element'] | undefined =
				shiftNode?.nodeName.slice(0, 1) === '#' ? undefined : (shiftNode as DefaultTreeAdapterMap['element']);

			if (
				tagSelectors.every(
					(tagSelector: TagSelector) => tagSelector.name.toLowerCase() === node?.nodeName.toLowerCase(),
				) &&
				attrSelectors.every((attrSelector: AttributeSelector) =>
					node?.attrs.find(
						(attr: Attribute) => attr.name === attrSelector.name && attr.value === attrSelector.value,
					),
				)
			) {
				return node;
			} else {
				nodes.push(...asArray((node as DefaultTreeAdapterMap['element'] | undefined)?.childNodes));
			}
		}

		return undefined;
	}

	removeAttribute(node: DefaultTreeAdapterMap['element'], name: string): void {
		const existingAttribute: number = node.attrs.findIndex((attr: Attribute) => attr.name === name || attr.name === `[${name}]`);

		if (existingAttribute > -1) {
			node.attrs.splice(existingAttribute, 1);
		}
	}

	setAttribute(node: DefaultTreeAdapterMap['element'], name: string, value?: string): void {
		const existingAttribute: Attribute | undefined = node.attrs.find((attr: Attribute) => attr.name === name);

		if (existingAttribute) {
			existingAttribute.value = value ?? '';
		} else {
			node.attrs.push({name, value: value ?? ''});
		}
	}

	serialize(): string {
		return serialize(this.parsedHTML);
	}
}
