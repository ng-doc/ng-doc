import { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 *
 */
export default function (): any {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      const table: boolean = node?.tagName === 'table';

      if (table) {
        const wrapper = {
          type: 'element',
          tagName: 'div',
          properties: {
            className: 'ng-doc-table-wrapper',
          },
          children: [node],
        };

        // @ts-expect-error - parent is a hast node
        parent.children[index] = wrapper;
      }
    });
  };
}
