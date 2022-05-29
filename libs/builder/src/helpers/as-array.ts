import {isIterable} from './is-iterable';
import {isPresent} from './is-present';

/**
 *
 * @param data
 */
export function asArray<T>(data: T | T[] | Iterable<T> | null | undefined): T[] {
	if (!isPresent(data)) {
		return [];
	}
	return Array.isArray(data) ? data : isIterable(data) ? Array.from(data) : [data];
}
