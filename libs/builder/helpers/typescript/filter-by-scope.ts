import {asArray} from '@ng-doc/core';
import {MethodDeclaration, Scope, ScopedNode} from 'ts-morph';

/**
 *
 * @param nodes
 * @param scope
 */
export function filterByScope<T extends ScopedNode>(nodes: T[], scope: Scope | Scope[]): T[] {
	return nodes.filter((node: T) => asArray(scope).includes(node.getScope()));
}
