import {StaticableNode} from 'ts-morph';

/**
 *
 * @param nodes
 * @param isStatic
 */
export function filterByStatic<T extends StaticableNode>(nodes: T[], isStatic: boolean): T[] {
	return nodes.filter((node: T) => node.isStatic() === isStatic);
}
