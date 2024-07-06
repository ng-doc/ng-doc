import { Element } from 'hast';

/**
 *
 * @param node
 */
export function hasRouterLink(node: Element): boolean {
  return (
    node.tagName === 'a' &&
    !!node.properties &&
    (!!node.properties['routerLink'] || !!node.properties['[routerLink]'])
  );
}
