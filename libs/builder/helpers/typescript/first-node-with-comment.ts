import {JSDocableNode} from 'ts-morph';

/**
 * Returns first node that has JSDoc comment, will return first node, if there are no comment nodes
 *
 *
 * @param nodes
 */
export function firstNodeWithComment(nodes: JSDocableNode[]): JSDocableNode {
	return nodes.find((n: JSDocableNode) => n.getJsDocs().length) ?? nodes[0];
}
