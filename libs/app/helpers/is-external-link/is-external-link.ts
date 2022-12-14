/**
 *
 * @param url
 */
export function isExternalLink(url: string): boolean {
	const anchorElement: HTMLAnchorElement = document.createElement('a');

	anchorElement.href = url;

	return anchorElement.host !== window.location.host;
}
