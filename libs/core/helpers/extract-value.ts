/**
 *
 * @param value
 */
export function extractValue(value: string): string | number | boolean | null | undefined {
	return new Function(`return ${value}`)();
}
