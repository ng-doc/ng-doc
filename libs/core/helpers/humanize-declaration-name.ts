/**
 *
 * @param declarationName
 */
export function humanizeDeclarationName(declarationName: string): string {
	return declarationName
		.replace('Declaration', '')
		.replace(/([a-z])([A-Z])/g, '$1 $2');
}
