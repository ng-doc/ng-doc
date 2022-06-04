import * as fs from 'fs';
import * as path from 'path';

/**
 *	Finds the closest file in the given path.
 *
 * @param {string} rootFolder The root folder where it needs to stop the search.
 * @param {string} currentFolder The current folder to search in.
 * @param {string} fileName The file name to search for.
 * @returns {string} The path to the closest file.
 */
export function findClosestFile(rootFolder: string, currentFolder: string, fileName: string): string | null {
	const currentPath: string = currentFolder;
	const filePath: string = path.join(currentPath, fileName);

	if (fs.existsSync(filePath)) {
		return filePath;
	}

	const parentPath: string = path.dirname(currentPath);

	if (parentPath === rootFolder) {
		return null;
	}
	return findClosestFile(rootFolder, parentPath, fileName);
}
