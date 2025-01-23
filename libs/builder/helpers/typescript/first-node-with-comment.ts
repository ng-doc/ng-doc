import { Node } from 'ts-morph';

/**
 * Returns first node that has JSDoc comment, will return first node, if there are no comment nodes
 * @param nodes
 */
export function firstNodeWithComment<T extends Node>(nodes: T[]): T | undefined {
  return nodes.find((n: Node) => Node.isJSDocable(n) && n.getJsDocs().length) ?? nodes[0];
}
