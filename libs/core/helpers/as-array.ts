import {isIterable} from './is-iterable';
import {isPresent} from './is-present';

type AsArrayType<T> = T | T[] | Iterable<T> | null | undefined;

/**
 *
 * @param data
 * @param {...any} items
 */
export function asArray<T>(...items: Array<AsArrayType<T>>): T[] {
	return items.map((data: AsArrayType<T>) => {
		if (!isPresent(data)) {
			return [];
		}
		return Array.isArray(data) ? data : isIterable(data) ? Array.from(data) : [data];
	}).flat()
}
