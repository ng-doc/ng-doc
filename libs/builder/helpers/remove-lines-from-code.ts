const LINE_BREAK = /\r?\n/;
const IGNORE_COMMENT = /\n?\r?^.*((\/\/|<!--|\/\*)\s*)(ng-doc-ignore-line)(\s*([0-9]))?.*$/;

/**
 * Remove lines from code that are marked with `ng-doc-ignore-line`
 *
 * @param code - The code to remove lines from
 */
export function removeLinesFromCode(code: string): string {
	const lines = code.split(LINE_BREAK);
	let linesToIgnore = 0;

	return lines
		.reduce((lines, line, i) => {
			const match = IGNORE_COMMENT.exec(line);

			if (match) {
				linesToIgnore = Math.max(linesToIgnore, parseInt(match[5] ?? '1'));
			} else if (linesToIgnore === 0) {
				lines.push(line);
			} else if (linesToIgnore > 0) {
				linesToIgnore--;
			}

			return lines;
		}, [] as string[])
		.join('\n');
}
