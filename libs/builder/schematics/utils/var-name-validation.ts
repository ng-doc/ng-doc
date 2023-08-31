/**
 *
 * @param name
 */
export function varNameValidation(name: string): void {
	if (!/^[a-zA-Z_$][a-zA-Z_$0-9]*$/.test(name)) {
		throw new Error(
			`Variable name cannot be generated automatically based on the name "${name}". Please provide "--name" option with valid variable name.`,
		);
	}
}
