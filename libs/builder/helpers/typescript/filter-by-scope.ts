import {Scope, ScopedNode} from 'ts-morph';
import {asArray} from '@ng-doc/core';

export function filterByScope<T extends ScopedNode>(nodes: T[], scope: Scope | Scope[]): T[] {
	return nodes.filter((node: T) => asArray(scope).includes(node.getScope()));
}
