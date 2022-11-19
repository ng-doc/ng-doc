import {asArray, isNodeTag, isPresent} from '@ng-doc/core';
import * as CSSWhat from 'css-what';
import {AttributeSelector, SelectorType} from 'css-what';
import {Selector, TagSelector} from 'css-what/lib/es/types';
import {Node, NodeTag, parser} from 'posthtml-parser';
import {render} from 'posthtml-render';

export class NgDocHtmlParser {
	private readonly parsedHTML: Node[];

	constructor(private html: string) {
		this.parsedHTML = parser(html);
	}

	find(selector: string): NodeTag | undefined {
		const selectors: Selector[] = CSSWhat.parse(selector)[0];
		const tagSelectors: TagSelector[] = selectors.filter(
			(selector: Selector) => selector.type === SelectorType.Tag,
		) as TagSelector[];
		const attrSelectors: AttributeSelector[] = selectors.filter(
			(selector: Selector) => selector.type === SelectorType.Attribute,
		) as AttributeSelector[];

		const nodes: Node[] = [...this.parsedHTML];

		while (nodes.length) {
			const shiftNode: Node | undefined = nodes.shift();
			const node: NodeTag | undefined =
				!isPresent(shiftNode) || !isNodeTag(shiftNode) ? undefined : shiftNode;

			if (
				tagSelectors.every(
					(tagSelector: TagSelector) => tagSelector.name.toLowerCase() === String(node?.tag).toLowerCase(),
				) &&
				attrSelectors.every((attrSelector: AttributeSelector) => {
					const attrValue: unknown = node && node.attrs && node?.attrs[attrSelector.name];

					return (
						Object.keys(node?.attrs ?? {}).includes(attrSelector.name) && attrValue === attrSelector.value
					);
				})
			) {
				return node;
			} else {
				nodes.push(...asArray(node?.content).flat());
			}
		}

		return undefined;
	}

	removeAttribute(node: Node, name: string): void {
		if (isNodeTag(node) && Object.keys(node?.attrs ?? {}).includes(name) && node.attrs) {
			delete node.attrs[name];
		}
		if (isNodeTag(node) && Object.keys(node?.attrs ?? {}).includes(`[${name}]`) && node.attrs) {
			delete node.attrs[`[${name}]`];
		}
	}

	setAttribute(node: Node, name: string, value?: string): void {
		if (isNodeTag(node)) {
			if (!node.attrs) {
				node.attrs = {};
			}

			node.attrs[name] = value ?? '';
		}
	}

	serialize(): string {
		return render(this.parsedHTML);
	}
}
