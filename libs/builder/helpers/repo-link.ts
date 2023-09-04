import { NgDocRepoConfig } from '../interfaces';
import { slash } from './slash';

/**
 *
 * @param repoConfig
 * @param repoConfig.url
 * @param repoConfig.mainBranch
 * @param filePath
 * @param scope
 * @param lineNumber
 */
export function editFileInRepoUrl(
	{ url, mainBranch }: NgDocRepoConfig,
	filePath: string,
	scope: string,
	lineNumber?: number,
): string {
	if (url && mainBranch) {
		const rUrl = url.replace(/\/$/, '');
		const fPath = slash(filePath).replace(/^\//, '');

		return `${rUrl}/edit/${mainBranch}/${fPath}?message=docs(${scope}): describe your changes here...${
			lineNumber ? `#L${lineNumber}` : ''
		}`;
	}

	return filePath;
}

/**
 *
 * @param repoConfig
 * @param repoConfig.url
 * @param repoConfig.releaseBranch
 * @param filePath
 * @param lineNumber
 */
export function viewFileInRepoUrl(
	{ url, releaseBranch }: NgDocRepoConfig,
	filePath: string,
	lineNumber?: number,
): string {
	if (url && releaseBranch) {
		const rUrl = url.replace(/\/$/, '');
		const fPath = slash(filePath).replace(/^\//, '');

		return `${rUrl}/blob/${releaseBranch}/${fPath}${lineNumber ? `#L${lineNumber}` : ''}`;
	}

	return filePath;
}
