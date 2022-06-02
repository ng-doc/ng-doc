import {NgDocSnippet} from '../interfaces/snippet';
import {NgDocSnippetType} from '../types';
import {escapeRegexp} from './escape-regexp';

const HTMLSnippetStart: RegExp = /(<!--\s*ngDocTSSnippetStart(\(.+\))?\s*-->)/g;
const StylesSnippetStart: RegExp = /(\/\*\s*ngDocStyleSnippetStart(\(.+\))?\s*\*\/)/g;
const TypeScriptSnippetStart: RegExp = /(\/\/\s*ngDocHTMLSnippetStart(\(.+\))?\s*)/g;
const HTMLSnippetEnd: (group?: string) => RegExp = (group: string = '') => new RegExp(`(<!--\\s*ngDocHTMLSnippetEnd(\\(${escapeRegexp(group)}\\))?\\s*-->)`, 'g');
const StylesSnippetEnd: (group?: string) => RegExp = (group: string = '') => new RegExp(`(\\/\\*\\s*ngDocStyleSnippetEnd(\\(${escapeRegexp(group)}\\))?\\s*\\*\\/)`, 'g');
const TypeScriptSnippetEnd: (group?: string) => RegExp = (group: string = '') => new RegExp(`(\\/\\*\\s*ngDocTSSnippetEnd(\\(${escapeRegexp(group)}\\))?\\s*\\*\\/)`, 'g');


/**
 *	Finds and return all the snippets in the given string.
 *
 * @param {string} content - Content
 * @returns {NgDocSnippet[]} - Array of snippets
 */
export function processSnippets(content: string): NgDocSnippet[] {
	return [
		...findSnippet(content, 'html', HTMLSnippetStart, HTMLSnippetEnd),
		...findSnippet(content, 'styles', StylesSnippetStart, StylesSnippetEnd),
		...findSnippet(content, 'typescript', TypeScriptSnippetStart, TypeScriptSnippetEnd),
	]
}

/**
 *
 * @param content
 * @param type
 * @param snippetStart
 * @param snippetEnd
 */
function findSnippet(content: string, type: NgDocSnippetType, snippetStart: RegExp, snippetEnd: (group?: string) => RegExp): NgDocSnippet[] {
	const snippets: NgDocSnippet[] = [];
	let matchStart: RegExpExecArray | null;

	// eslint-disable-next-line no-cond-assign
	while (matchStart = snippetStart.exec(content)) {
		const matchEnd: RegExpExecArray | null = snippetEnd(matchStart[2]).exec(content);

		if (matchEnd) {
			const snippetCode: string = content.slice(matchStart.index + matchStart[0].length, matchEnd.index).trim();

			snippets.push({
				content: snippetCode,
				name: matchStart[2],
				type
			});
		}
	}
	return snippets;
}

