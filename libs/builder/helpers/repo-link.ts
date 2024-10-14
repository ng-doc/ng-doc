import { NgDocRepoConfig } from '../interfaces';
import { posix } from './posix';

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
    { url, mainBranch, platform = 'github' }: NgDocRepoConfig,
    filePath: string,
    scope: string,
    lineNumber?: number,
): string {
    if (url && mainBranch) {
        const rUrl = url.replace(/\/$/, '');
        const fPath = posix(filePath).replace(/^\//, '');
        let editUrl = '';

        if (platform === 'github') {
            editUrl = `${rUrl}/edit/${mainBranch}/${fPath}?message=docs(${scope}): describe your changes here...${
                lineNumber ? `#L${lineNumber}` : ''
            }`;
        } else if (platform === 'gitlab') {
            editUrl = `${rUrl}/-/edit/${mainBranch}/${fPath}?message=docs(${scope}): describe your changes here...${
                lineNumber ? `#L${lineNumber}` : ''
            }`;
        }

        return editUrl;
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
    { url, releaseBranch, platform = 'github' }: NgDocRepoConfig,
    filePath: string,
    lineNumber?: number,
): string {
    if (url && releaseBranch) {
        const rUrl = url.replace(/\/$/, '');
        const fPath = posix(filePath).replace(/^\//, '');
        let viewUrl = '';

        if (platform === 'github') {
            viewUrl = `${rUrl}/blob/${releaseBranch}/${fPath}${lineNumber ? `#L${lineNumber}` : ''}`;
        } else if (platform === 'gitlab') {
            viewUrl = `${rUrl}/-/blob/${releaseBranch}/${fPath}${lineNumber ? `#L${lineNumber}` : ''}`;
        }

        return viewUrl;
    }

    return filePath;
}