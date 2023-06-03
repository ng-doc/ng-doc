import {asArray} from './as-array';

/**
 * Returns only unique items from the given arrays
 *
 * @param items - arrays of items
 */
export function unique<T>(...items: T[][]): T[] {
	return asArray(new Set(...items));
}
