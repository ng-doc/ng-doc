/**
 * Returns a dasherized title
 *
 * @param title - The title to dasherize
 */
export function getTitle(title: string): string {
	return title.replace(/^(\/)/g, '').replace(/(\/)$/g, '').replace(/\//g, '-');
}
