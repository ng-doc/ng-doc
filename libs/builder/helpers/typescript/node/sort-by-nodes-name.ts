import { NameableNodeSpecific } from 'ts-morph';

import { compareText } from '../../text-order';

/**
 * Sorts nodes by name in the shared text order, so API members are listed in the same order
 * whatever the process locale.
 * @param nodes - The nodes, sorted in place.
 * @returns The same array.
 */
export function sortByNodesName<T extends NameableNodeSpecific>(nodes: T[]): T[] {
  return nodes.sort((a: T, b: T) => compareText(a.getName() ?? '', b.getName() ?? ''));
}
