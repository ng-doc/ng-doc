/**
 * Hacky way to import ES modules dynamically.
 *
 * @param modulePath
 */
export function importEsModule<T>(modulePath: string): Promise<T> {
	return new Function(`return import('${modulePath}');`)();
}
