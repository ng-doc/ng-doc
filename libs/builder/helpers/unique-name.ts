const names: Set<string> = new Set();
let id: number = 0;

/**
 *
 * @param name
 */
export function uniqueName(name: string): string {
	return names.has(name) ? `${name}${++id}` : name;
}
