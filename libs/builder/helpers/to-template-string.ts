/**
 *
 * @param content
 */
export function toTemplateString(content: string): string {
	return content?.replace(/`/g, '\\`') ?? '';
}
