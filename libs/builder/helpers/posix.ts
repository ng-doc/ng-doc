import * as path from 'path';

/**
 * Converts a file path to posix format
 * @param filePath - The file path to convert
 */
export function posix(filePath: string): string {
	return filePath
		.split(path.sep)
		.join(path.posix.sep)
		.replace(/^[a-zA-Z]:/, '');
}
