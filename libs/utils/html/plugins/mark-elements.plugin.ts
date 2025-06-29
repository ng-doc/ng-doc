import { asArray, NG_DOC_ELEMENT } from '@ng-doc/core';
import { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Marks all elements with the NG_DOC_ELEMENT class name
 * @param tree
 * @param headings
 */
export default function markElementsPlugin(): any {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.properties) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        node.properties['className'] = [...asArray(node.properties.className), NG_DOC_ELEMENT];
      }
    });
  };
}
