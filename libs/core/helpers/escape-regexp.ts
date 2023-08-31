/**
 *
 * @param str
 */
export function escapeRegexp(str: string): string {
	return str.replace(/[[\]/{}()*+?.\\^$|]/g, '\\$&');
}
