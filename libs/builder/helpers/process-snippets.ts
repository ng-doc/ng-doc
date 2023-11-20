import { escapeRegexp } from '@ng-doc/core';
import * as fs from 'fs';
import path from 'path';

import { NgDocSnippet } from '../interfaces';
import { parseSnippet } from '../parsers/parse-snippet';
import { formatCode } from './format-code';
import { getCodeTypeFromLang } from './get-code-type-from-lang';

const snippet = (id?: string | null) =>
	id
		? new RegExp(
				`\\n?\\r?^.*((\\/\\/|<!--|\\/\\*)\\s*)(snippet#${escapeRegexp(
					id,
				)}.*?(?=(-->|\\*\\/)?))\\s*(-->|\\*\\/)?$`,
				'gm',
		  )
		: new RegExp(
				`\\n?\\r?^.*((\\/\\/|<!--|\\/\\*)\\s*)(snippet.*?(?=(-->|\\*\\/)?))\\s*(-->|\\*\\/)?$`,
				'gm',
		  );

/**
 * Process snippets from code
 * @param code - code to process
 * @param basePath - base path to file
 */
export function processSnippets(code: string, basePath?: string): NgDocSnippet[] {
	const result: NgDocSnippet[] = [];
	const endings: Set<number> = new Set();
	const startRegexp = snippet();
	let match: RegExpExecArray | null;

	// eslint-disable-next-line no-cond-assign
	while ((match = startRegexp.exec(code))) {
		const isHTMLComment = match[2] === '<!--';

		if (match[3]?.includes('snippet-from-file=') && basePath) {
			const config = parseSnippet(match[3].trim());

			if (config) {
				const { title, lang, icon, opened, fromFile } = config;

				const language = lang || (isHTMLComment ? 'html' : 'ts');

				if (fromFile) {
					const snippetCode = fs.readFileSync(path.join(basePath, fromFile), 'utf-8');

					result.push({
						title: title ?? path.basename(fromFile),
						lang: language,
						icon,
						opened,
						code: formatCode(removeSnippets(snippetCode), getCodeTypeFromLang(language)).trim(),
					});
				}
			}
		} else if (!endings.has(match.index)) {
			const config = parseSnippet(match[3].trim());

			if (config) {
				const { id, title, lang, icon, opened } = config;
				const endRegexp = snippet(id);

				endRegexp.lastIndex = match.index + match[0].length;

				const matchEnd = endRegexp.exec(code);

				if (matchEnd) {
					endings.add(matchEnd.index);

					const snippetCode = code.slice(match.index + match[0].length, matchEnd.index);
					const language = lang || (isHTMLComment ? 'html' : 'ts');

					if (snippetCode) {
						result.push({
							title,
							lang: language,
							icon,
							opened,
							code: formatCode(removeSnippets(snippetCode), getCodeTypeFromLang(language)).trim(),
						});
					}
				}
			}
		}
	}

	return result;
}

/**
 *
 * @param code
 */
function removeSnippets(code: string): string {
	return code.replace(snippet(), '');
}
