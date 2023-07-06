/**
 * Stringify data to JSON. If data is undefined, return string 'undefined'.
 *
 * @param data - Data to stringify.
 */
export function stringify<T>(data: T): string {
	return data === undefined ? 'undefined' : JSON.stringify(data, null, 2);
}
