import * as fs from 'fs';
import * as path from 'path';

/**
 *	Finds the closest file in the given path.
 *
 * @param {string} currentFolder The current folder to search in.
 * @param {string} fileName The file name to search for.
 * @returns {string} The path to the closest file.
 */
export function findClosestFile(currentFolder: string, fileName: string): string | null {
	const currentPath: string = currentFolder;
	const filePath: string = path.join(currentPath, fileName);

	if (fs.existsSync(filePath)) {
		return filePath;
	}

	const parentPath: string = path.dirname(currentPath);

	if (parentPath === '/') {
		return null;
	}

	return findClosestFile(parentPath, fileName);
}
