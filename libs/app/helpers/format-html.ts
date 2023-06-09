/**
 *
 * @param html
 */
export async function formatHtml(html: string): Promise<string> {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	const formatter = await import('esthetic');

	return formatter.default.html(html.trim(), {
		wrap: 50,
		markup: {
			forceIndent: true,
		}
	});
}
