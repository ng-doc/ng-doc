import * as fs from 'fs';

/**
 * Extracts the category name from the given file path.
 *
 * @param {string} filePath The file path.
 * @returns {string | null} The category name.
 */
export function extractDefaultExportName(filePath: string): string | null {
	if (fs.existsSync(filePath)) {
		const fileContent: string = fs.readFileSync(filePath, 'utf8');
		const matchResult: RegExpMatchArray | null = /export\s*default\s*(\w*)/gm.exec(fileContent);

		return matchResult ? matchResult[1] : null;
	}
	return null;
}
