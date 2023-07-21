/**
 *
 * @param object
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function objectKeys<T extends {}, K extends keyof T>(object: T): K[] {
	return Object.keys(object) as K[];
}
