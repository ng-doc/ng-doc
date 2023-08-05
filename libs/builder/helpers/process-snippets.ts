import {escapeRegexp} from '@ng-doc/core';

import {NgDocSnippet} from '../interfaces';
import {parseSnippet} from '../parsers/parse-snippet';
import {formatCode} from './format-code';
import {getCodeTypeFromLang} from './get-code-type-from-lang';

const snippet = (id?: string | null) =>
	id
		? new RegExp(
				`\\n?\\r?^.*((\\/\\/|<!--|\\/\\*)\\s*)(snippet#${escapeRegexp(id)}.*?(?=(-->|\\*\\/)?))\\s*(-->|\\*\\/)?$`,
				'gm',
		  )
		: new RegExp(`\\n?\\r?^.*((\\/\\/|<!--|\\/\\*)\\s*)(snippet.*?(?=(-->|\\*\\/)?))\\s*(-->|\\*\\/)?$`, 'gm');

/**
 *
 * @param code
 */
export function processSnippets(code: string): NgDocSnippet[] {
	const result: NgDocSnippet[] = [];
	const endings: Set<number> = new Set();
	const startRegexp = snippet();
	let match: RegExpExecArray | null;

	// eslint-disable-next-line no-cond-assign
	while ((match = startRegexp.exec(code))) {
		if (!endings.has(match.index)) {
			const config = parseSnippet(match[3].trim());

			if (config) {
				const isHTMLComment = match[2] === '<!--';
				const {id, title, lang, icon, opened} = config;
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
