import { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

import { hasClass, isHeading } from '../helpers';

const NO_ANCHOR_CLASS: string = 'no-anchor';

/**
 *
 * @param options
 * @param route
 */
export default function addHeadingAnchors(route?: string): any {
  return (tree: Root) =>
    visit(tree, 'element', (node: Element) => {
      if (
        route &&
        isHeading(node) &&
        node.properties &&
        node.properties['id'] &&
        !hasClass(node, NO_ANCHOR_CLASS)
      ) {
        node.children.push({
          type: 'element',
          tagName: 'ng-doc-heading-anchor',
          properties: {
            className: ['ng-doc-anchor'],
            anchor: node.properties['id'],
          },
          children: [],
        });

        node.properties = {
          ...node.properties,
          href: `${route}#${node.properties['id']}`,
          headingLink: 'true',
        };
      }
    });
}
