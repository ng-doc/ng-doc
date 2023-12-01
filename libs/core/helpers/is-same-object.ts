/**
 *
 * @param a
 * @param b
 */
export function isSameObject<T extends Record<string, unknown>>(a: T, b: T): boolean {
	return Object.keys(a).every((key) => {
		if (typeof a[key] === 'object' && typeof b[key] === 'object') {
			return isSameObject(
				(a[key] as Record<string, unknown>) ?? {},
				(b[key] as Record<string, unknown>) ?? {},
			);
		}

		return a[key] === b[key];
	});
}
