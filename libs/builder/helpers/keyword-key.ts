/**
 *
 * @param name
 */
export function keywordKey(name: string): string {
	return name
		.split('#')
		.map((part: string, index: number) => (index === 1 ? part.toLowerCase() : part))
		.join('#');
}
