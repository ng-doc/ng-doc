import { Tree } from '@angular-devkit/schematics';
import * as path from 'path';

/**
 *    Finds the closest file in the given path.
 *
 * @param tree
 * @param {string} currentFolder The current folder to search in.
 * @param {string} fileName The file name to search for.
 * @returns {string} The path to the closest file.
 */
export function findClosestFile(
	tree: Tree,
	currentFolder: string,
	fileName: string,
): string | null {
	const currentPath: string = currentFolder;
	const filePath: string = path.join(currentPath, fileName);

	if (tree.get(filePath)) {
		return filePath;
	}

	const parentPath: string = path.dirname(currentPath);

	if (['/', '.', ''].includes(parentPath)) {
		return null;
	}

	return findClosestFile(tree, parentPath, fileName);
}
