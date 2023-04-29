/**
 * Check if the OS theme is dark
 */
export function isDarkOsTheme(): boolean {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
