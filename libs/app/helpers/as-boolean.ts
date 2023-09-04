/**
 *
 * @param value
 */
export function asBoolean(value: unknown): boolean {
	if (typeof value === 'string') {
		return value.toLowerCase() === 'true'
			? true
			: value.toLowerCase() === 'false'
			? false
			: !!value;
	}
	return !!value;
}
