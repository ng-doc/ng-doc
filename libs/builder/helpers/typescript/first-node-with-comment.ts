import { JSDocableNode } from 'ts-morph';

/**
 * Returns first node that has JSDoc comment, will return first node, if there are no comment nodes
 * @param nodes
 */
export function firstNodeWithComment<T extends JSDocableNode>(nodes: T[]): T | undefined {
  return nodes.find((n: JSDocableNode) => n.getJsDocs().length) ?? nodes[0];
}
