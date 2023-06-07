/**
 * Converts a pattern to a minimatch pattern.
 *
 * Minimatch patterns don't support backslashes (on Windows), so we convert them to forward slashes for patterns.
 * https://github.com/isaacs/minimatch#windows
 *
 * @param pattern
 */
export function miniPattern(pattern: string): string {
	return pattern.replace(/\\/g, '/');
}
