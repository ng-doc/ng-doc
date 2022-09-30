import {addImports, editImports, getImports, ImportDeclaration, ImportSpecifier} from 'ng-morph';

/**
 *
 * @param filePath
 * @param namedImport
 * @param moduleSpecifier
 */
export function addUniqueImport(filePath: string, namedImport: string, moduleSpecifier: string) {
	const existingNamedImport: ImportDeclaration[] = getImports(filePath, {
		namedImports: namedImport,
		moduleSpecifier,
	});

	if (existingNamedImport.length) {
		return;
	}

	const existingDeclaration: ImportDeclaration[] = getImports(filePath, {
		moduleSpecifier,
	});

	if (existingDeclaration.length) {
		const modules: string[] = existingDeclaration[0]
			.getNamedImports()
			.map((namedImport: ImportSpecifier) => namedImport.getText());

		editImports(existingDeclaration[0], () => ({
			namedImports: [...modules, namedImport],
		}));

		return;
	}

	addImports(filePath, {
		moduleSpecifier: moduleSpecifier,
		namedImports: [namedImport],
	});
}
