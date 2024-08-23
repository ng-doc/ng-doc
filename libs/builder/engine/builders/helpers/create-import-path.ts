import path from 'path';

import { posix } from '../../../helpers';

/**
 * Creates a relative import path from the current directory to the destination path.
 * @param {string} currentDir - The current directory path.
 * @param {string} destinationPath - The destination path.
 * @returns {string} The relative import path from the current directory to the destination path.
 */
export function createImportPath(currentDir: string, destinationPath: string): string {
	// Use the posix function from the helpers module to ensure the path is in POSIX format.
	// Then, use the relative method from the path module to get the relative path from the current directory to the destination path.
	// Finally, remove the .ts extension from the path.
	return posix(path.relative(currentDir, destinationPath)).replace(/\.ts$/, '');
}
