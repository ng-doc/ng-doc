/**
 *
 * @param str
 */
export function noLineBreaks(str: string): string {
	return str.replace(/[\r\n]/gm, '');
}
