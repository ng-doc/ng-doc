import {Element, ElementContent, Root} from 'hast';
import {visit} from 'unist-util-visit';

import {isElement, isText, lineBreak, textElement} from '../helpers';

/**
 * Adds lines to code blocks
 */
export default function codeBlockLinesPlugin() {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element, _i, parent: Root | Element | null) => {
			if (parent?.type === 'element' && parent.tagName === 'pre' && node.tagName === 'code') {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				node.properties['className'] = [...(node.properties?.['className'] ?? []), 'code-lines'];
				// Wraps each line in a span
				node.children = addLines(node);

				// Adds a line break to the end of each line
				node.children.forEach((child: ElementContent) => {
					if (child.type === 'element' && child.tagName === 'span') {
						const lastChild: ElementContent = child.children[child.children.length - 1];

						if (!isText(lastChild) || (isText(lastChild) && !hasLineBreak(lastChild))) {
							child.children.push(lineBreak());
						}
					}
				});
			}
		});
	};
}

/**
 * Adds lines to a node recursively and returns them
 *
 * @param node - The node to add lines to
 * @param lines - The current lines
 * @param copyParent - Whether to copy the parent node to save the original node styles
 */
function addLines(node: Element, lines: Element[] = [], copyParent?: boolean): Element[] {
	const line = () => lines[lines.length - 1] ?? (lines.push(createLine()) && lines[lines.length - 1]);

	node.children.forEach((child: ElementContent) => {
		if (isText(child) && hasLineBreak(child)) {
			const split: string[] = child.value.split(/\n/);

			split.forEach((content: string, i: number) => {
				copyParent
					? line().children.push({...node, children: [textElement(content)]})
					: line().children.push(textElement(content));

				i !== split.length - 1 && lines.push(createLine());
			});
		} else if (isElement(child) && child.children.some(hasLineBreak)) {
			addLines(child, lines, true);
		} else {
			line().children.push(child);
		}
	});

	return lines;
}

/**
 * Creates a new line element
 *
 * @param children - The children the line should have initially
 */
function createLine(...children: ElementContent[]): Element {
	return {type: 'element', tagName: 'span', properties: {class: ['line']}, children};
}

/**
 * Checks if a node has a line break
 *
 * @param node - The node to check
 */
function hasLineBreak(node: ElementContent): boolean {
	return (isText(node) && /\r?\n/.test(node.value)) || (isElement(node) && node.children.some(hasLineBreak));
}
