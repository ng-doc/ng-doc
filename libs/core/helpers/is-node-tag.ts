import {Node, NodeTag} from 'posthtml-parser';

/**
 *
 * @param node
 */
export function isNodeTag(node: Node): node is NodeTag {
	return typeof node !== 'string' && typeof node !== 'number';
}
