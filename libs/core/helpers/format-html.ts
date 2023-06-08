/**
 *
 * @param html
 */
export async function formatHtml(html: string): Promise<string> {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	const formatterModule = await import('js-beautify/js/lib/beautify-html.js');
	const formatter = formatterModule?.html_beautify ?? formatterModule?.default?.html_beautify;

	return formatter(html.trim());
}
