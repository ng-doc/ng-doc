import { NgDocPathAnchor } from '../interfaces';

/**
 * Extract path anchor from a given path
 * @param {string} path - The path to extract anchor from
 * @returns {NgDocPathAnchor} The extracted anchor
 */
export function extractPathAnchor(path: string): NgDocPathAnchor {
	const pathParts: string[] = path.split('#');

	return {
		path: pathParts[0] ?? '',
		anchor: pathParts[1] ?? '',
	};
}
