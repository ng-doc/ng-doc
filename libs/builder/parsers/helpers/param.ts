import * as P from 'parsimmon';
import {Parser} from 'parsimmon';

import {paramValue} from './param-value';

/**
 *
 * @param key
 * @param newKeyName
 */
export function param<T extends string, N extends string | undefined = undefined>(
	key: T,
	newKeyName?: N,
): Parser<Record<N extends string ? N : T, string>> {
	return P.string(key)
		.then(P.string('='))
		.then(paramValue())
		.map((value) => ({[newKeyName ?? key]: value} as Record<N extends string ? N : T, string>));
}
