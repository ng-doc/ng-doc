import {Tree} from '@angular-devkit/schematics';

/**
 * Extracts the category name from the given file path.
 *
 * @param tree
 * @param {string} filePath The file path.
 * @returns {string | null} The category name.
 */
export function extractDefaultExportName(tree: Tree, filePath: string): string | null {
	if (tree.get(filePath)) {
		const fileContent: string = tree.readText(filePath);
		const matchResult: RegExpMatchArray | null = /export\s*default\s*(\w*)/gm.exec(fileContent);

		return matchResult ? matchResult[1] : null;
	}
	return null;
}
