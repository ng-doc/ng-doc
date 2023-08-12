import * as P from 'parsimmon';

import {NgDocSnippetConfig} from '../interfaces';
import {param, paramValue} from './helpers';

/**
 *
 * @param string - string to parse
 */
export function parseSnippet(string: string): NgDocSnippetConfig | undefined {
	const parser = P.createLanguage<{
		keyword: string;
		id: {id: string | null};
		lang: {lang: string | undefined};
		icon: Record<'icon', string>;
		title: {title: string | undefined};
		opened: {opened: boolean | undefined};
		snippet: NgDocSnippetConfig;
		snippetFromFile: NgDocSnippetConfig;
		anySnippet: NgDocSnippetConfig;
	}>({
		keyword: () => P.string('snippet'),
		id: () =>
			P.string('#')
				.then(P.regexp(/[a-zA-Z0-9-]+/))
				.fallback(null)
				.map((id) => ({id})),
		lang: () =>
			P.string(':')
				.then(P.regexp(/[a-zA-Z0-9-]+/))
				.fallback(undefined)
				.map((lang) => ({lang})),
		icon: () => param('icon'),
		title: () => paramValue().map((title) => ({title})),
		opened: () =>
			P.string('opened')
				.result(true)
				.fallback(undefined)
				.map((opened) => ({opened})),

		snippet: ({keyword, id, lang, icon, title, opened}) =>
			keyword.then(
				P.seq(id, lang, P.whitespace.then(title.or(icon).or(opened).sepBy(P.whitespace)).fallback([])).map(
					([id, lang, rest]) => ({...id, ...lang, ...Object.assign({}, ...rest)}),
				),
			),
		snippetFromFile: ({lang, icon, title, opened}) =>
			P.seq(
				param('snippet-from-file', 'fromFile'),
				lang,
				P.whitespace.then(title.or(icon).or(opened).sepBy(P.whitespace)).fallback([]),
			).map(([id, lang, rest]) => ({...id, ...lang, ...Object.assign({}, ...rest)})),
		anySnippet: ({snippet, snippetFromFile}) => snippetFromFile.or(snippet),
	});

	const result = parser.anySnippet.parse(string);

	return result.status ? result.value : undefined;
}
