const names: Set<string> = new Set();
let id: number = 0;

/**
 *
 * @param name
 */
export function uniqueName(name: string): string {
	if (names.has(name)) {
		const newName: string = `${name}${id++}`;

		names.add(newName);

		return newName;
	} else {
		names.add(name);

		return name;
	}
}
