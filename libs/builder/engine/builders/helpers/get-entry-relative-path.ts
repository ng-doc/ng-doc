/**
 *
 * @param pagePaths
 * @param entryPath
 */
export function getEntryRelativePath(pagePaths: string[], entryPath: string): string {
	const pagePath = pagePaths.find((pagePath) => pagePath === entryPath);

	if (!pagePath) {
		throw new Error(`Entry path "${entryPath}" is not found in page paths`);
	}

	return pagePath;
}
