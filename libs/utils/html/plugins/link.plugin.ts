import { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

import { hasRouterLink } from '../helpers';

/**
 * Replaces all anchor tags with `ng-doc-page-link` tags.
 */
export default function (): any {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'a' && !hasRouterLink(node)) {
        // just replace the tag name, all attributes will be handled as inputs
        node.tagName = 'ng-doc-page-link';

        if (node.properties) {
          node.properties['classes'] = node.properties['class'];

          delete node.properties['class'];
        }
      }
    });
  };
}
