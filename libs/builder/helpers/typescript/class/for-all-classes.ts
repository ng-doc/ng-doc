import { ClassDeclaration } from 'ts-morph';

/**
 *
 * @param cls
 * @param fn
 */
export function forAllClasses(
	cls: ClassDeclaration,
	fn: (c: ClassDeclaration) => boolean | void,
): void {
	let baseClass: ClassDeclaration | undefined = cls;

	while (baseClass && !fn(baseClass)) {
		baseClass = baseClass.getBaseClass();
	}
}
