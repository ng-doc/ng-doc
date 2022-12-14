/**
 *
 * @param object
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function objectKeys<T extends {}>(object: T): Array<keyof T> {
	return Object.keys(object) as Array<keyof T>;
}
