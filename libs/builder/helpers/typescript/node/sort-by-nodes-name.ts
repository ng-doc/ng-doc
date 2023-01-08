import {NameableNodeSpecific} from 'ts-morph';

/**
 *
 * @param nodes
 */
export function sortByNodesName<T extends NameableNodeSpecific>(nodes: T[]): T[] {
	return nodes.sort((a: T, b: T) => (a.getName() ?? '').localeCompare(b.getName() ?? ''));
}
