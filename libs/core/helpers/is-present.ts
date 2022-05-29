/**
 *
 * @param value
 */
export function isPresent<T>(value: T | null | undefined): value is T {
	return value !== undefined && value !== null && (typeof value !== 'string' || value !== '');
}
