import { Element, ElementContent, Root } from 'hast';
import { filter } from 'unist-util-filter';
import { visit } from 'unist-util-visit';

import { isCodeNode, isHeading } from '../helpers';

/**
 *
 * @param tree
 * @param headings
 */
export default function removeNotIndexableContentPlugin(): any {
  return (tree: Root) => {
    // The slugger wraps a heading's decorative leading emoji in an `aria-hidden` span. It is not
    // part of the heading's name: indexed, it became a search record of its own, under the
    // previous section.
    visit(tree, 'element', (node: Element) => {
      if (isHeading(node) && isHiddenSpan(node.children[0])) {
        node.children = node.children.slice(1);
      }
    });

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return filter(tree, { cascade: true }, (node: Element) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const preWithCode: boolean = node?.tagName === 'pre' && node?.children?.some(isCodeNode);
      const notIndexable: boolean = node?.properties?.['indexable'] === 'false';

      return !node?.tagName || (!preWithCode && !notIndexable);
    });
  };
}

/**
 * Whether the node is a span hidden from assistive technology, as the slugger renders the leading
 * emoji of a heading.
 * @param node - The first child of a heading.
 */
function isHiddenSpan(node: ElementContent | undefined): boolean {
  return (
    node?.type === 'element' &&
    node.tagName === 'span' &&
    node.properties?.['ariaHidden'] === 'true'
  );
}
