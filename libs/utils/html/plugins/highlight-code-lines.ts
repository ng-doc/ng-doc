import { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

import { attrValue, isCodeBlock, isElement } from '../helpers';

/**
 * Highlight code lines
 */
export default function highlightCodeLines() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, _i, parent: Root | Element | null) => {
      if (isCodeBlock(parent, node) && parent?.type === 'element') {
        const highlightedLines: number[] = JSON.parse(
          attrValue(parent, 'highlightedLines') ?? '[]',
        );

        highlightedLines.length &&
          node.children.filter(isElement).forEach((child: Element, i: number) => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (child.properties.class === 'line' && highlightedLines.includes(i + 1)) {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              child.properties.class = 'line highlighted';
            }
          });
      }
    });
  };
}
