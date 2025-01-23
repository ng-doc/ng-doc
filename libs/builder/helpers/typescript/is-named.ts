import { Node } from 'ts-morph';

/**
 * Helper for use in templates to check if a node has a name.
 * @param node 
 * @returns 
 */
export function isNamed(node: Node | undefined): boolean {
  return Node.isNamed(node);
}
