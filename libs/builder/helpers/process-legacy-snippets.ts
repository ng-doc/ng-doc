import {escapeRegexp} from '@ng-doc/core/helpers/escape-regexp';

import {NgDocSnippet} from '../interfaces/snippet';
import {NgDocSnippetType} from '../types';

const HTMLSnippetStart: RegExp = /^.*(<!--\s*NgDocHTMLSnippetStart(\(.+\))?\s*-->).*$/gm;
const StylesSnippetStart: RegExp = /^.*(\/\*\s*NgDocStyleSnippetStart(\(.+\))?\s*\*\/).*$/gm;
const TypeScriptSnippetStart: RegExp = /^.*(\/\*\s*NgDocCodeSnippetStart(\(.+\))?\s*\*\/).*$/gm;
const HTMLSnippetEnd: (group?: string, escape?: boolean) => RegExp = (group: string = '', escape: boolean = true) =>
	new RegExp(`^.*(<!--\\s*NgDocHTMLSnippetEnd(\\(${escape ? escapeRegexp(group) : group}\\))?\\s*-->).*$`, 'gm');
const StylesSnippetEnd: (group?: string, escape?: boolean) => RegExp = (group: string = '', escape: boolean = true) =>
	new RegExp(`^.*(\\/\\*\\s*NgDocStyleSnippetEnd(\\(${escape ? escapeRegexp(group) : group}\\))?\\s*\\*\\/).*$`, 'gm');
const TypeScriptSnippetEnd: (group?: string, escape?: boolean) => RegExp = (
	group: string = '',
	escape: boolean = true,
) =>
	new RegExp(`^.*(\\/\\*\\s*NgDocCodeSnippetEnd(\\(${escape ? escapeRegexp(group) : group}\\))?\\s*\\*\\/).*$`, 'gm');

/**
 *	Finds and return all the snippets in the given string.
 *
 * @deprecated - Use `processSnippets` instead
 * @param content - Content
 * @returns - Array of snippets
 */
export function processLegacySnippets(content: string): NgDocSnippet[] {
	return [
		...findSnippet(content, 'HTML', HTMLSnippetStart, HTMLSnippetEnd),
		...findSnippet(content, 'styles', StylesSnippetStart, StylesSnippetEnd),
		...findSnippet(content, 'TypeScript', TypeScriptSnippetStart, TypeScriptSnippetEnd),
	];
}

/**
 * Finds the snippets in the given content.
 *
 * @param content - Content
 * @param type - Snippet type
 * @param snippetStart - Snippet start
 * @param snippetEnd - Snippet end
 */
function findSnippet(
	content: string,
	type: NgDocSnippetType,
	snippetStart: RegExp,
	snippetEnd: (group?: string) => RegExp,
): NgDocSnippet[] {
	const snippets: NgDocSnippet[] = [];
	const startRegexp: RegExp = new RegExp(snippetStart);
	let matchStart: RegExpExecArray | null;

	// eslint-disable-next-line no-cond-assign
	while ((matchStart = startRegexp.exec(content))) {
		const group = matchStart[2]?.slice(1, matchStart[2].length - 1);
		const matchEnd: RegExpExecArray | null = snippetEnd(group).exec(content);

		if (matchEnd) {
			const snippetCode: string = content.slice(matchStart.index + matchStart[0].length, matchEnd.index).trim();

			if (snippetCode) {
				snippets.push({
					content: removeSnippetsInCode(snippetCode),
					name: group,
					type,
				});
			}
		}
	}
	return snippets;
}

/**
 * Removes the snippets from the given code.
 *
 * @param code - Code
 */
function removeSnippetsInCode(code: string): string {
	return code
		.replace(HTMLSnippetStart, '')
		.replace(StylesSnippetStart, '')
		.replace(TypeScriptSnippetStart, '')
		.replace(HTMLSnippetEnd('.*', false), '')
		.replace(StylesSnippetEnd('.*', false), '')
		.replace(TypeScriptSnippetEnd('.*', false), '');
}
