import * as prettier from 'prettier';
import * as htmlParser from 'prettier/parser-html';

/**
 *
 * @param html
 */
export function formatHtml(html: string): string {
	return prettier.format(html, {
		parser: 'html',
		plugins: [htmlParser],
		printWidth: 70,
		tabWidth: 4,
	});
}
