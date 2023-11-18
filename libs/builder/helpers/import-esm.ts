/**
 * Hacky way to import ES modules dynamically.
 * @param modulePath
 */
export function importEsm<T>(modulePath: string): Promise<T> {
	return new Function(`return import('${modulePath}');`)();
}
