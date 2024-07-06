import { Element, Root } from 'hast';
import { SKIP, visitParents } from 'unist-util-visit-parents';

/**
 *
 * @param tree
 * @param headings
 */
export default function codePlugin(): any {
  return (tree: Root) => {
    visitParents(tree, 'element', (node: Element, ancestors) => {
      const parent = ancestors[ancestors.length - 1] as Element;
      const index = parent.children.indexOf(node);

      if (node.tagName === 'pre') {
        const codeNode = node.children[0] as Element;

        if (codeNode.tagName === 'code') {
          parent.children[index] = {
            type: 'element',
            tagName: 'ng-doc-code',
            properties: {
              name: codeNode.properties?.['name'],
              icon: codeNode.properties?.['icon'],
            },
            children: [node],
          }
        }
      }

      return SKIP;
    });
  };
}
