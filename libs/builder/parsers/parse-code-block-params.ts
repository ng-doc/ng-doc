import * as P from 'parsimmon';

import {NgDocCodeBlockParams} from '../interfaces';

/**
 * Code block options parser
 *
 * @param options - Options string to parse
 */
export function parseCodeBlockParams(options: string): NgDocCodeBlockParams {
	const parser = P.createLanguage({
		language: () =>
			P.regexp(/[a-zA-Z]+/)
				.skip(P.optWhitespace)
				.map((language) => ({language})),
		lineNumbers: () => P.string('lineNumbers').map(() => ({lineNumbers: true})),
		content: () => P.regexp(/[a-zA-Z0-9\\./\-_]+/).wrap(P.string('"'), P.string('"')),

		fileName: (p) =>
			P.string('fileName')
				.then(P.string('='))
				.then(p['content'])
				.map((fileName) => ({fileName})),

		fileLineNumber: () =>
			P.string('L')
				.then(P.digits)
				.map((n) => Number(n)),
		fileLineRange: (p) =>
			P.seqMap(
				P.string('#').then(p['fileLineNumber']).map((num) => (num - 1)),
				P.string('-').then(p['fileLineNumber'].fallback(undefined)),
				(fileLineStart, fileLineEnd) => ({fileLineStart, fileLineEnd}),
			),
		fileLineStart: (p) =>
			P.string('#')
				.then(p['fileLineNumber'])
				.map((num) => (num - 1))
				.map((fileLineStart) => ({fileLineStart, fileLineEnd: fileLineStart + 1})),
		lineParams: (p) => p['fileLineRange'].or(p['fileLineStart']).fallback({}),

		filePath: (p) =>
			P.string('file')
				.then(P.string('='))
				.then(p['content'])
				.map((file) => ({file})),
		file: (p) =>
			P.seq(
				p['filePath'],
				p['lineParams'].map(({fileLineStart, fileLineEnd}) => ({fileLineStart, fileLineEnd})),
			)
				.map(([file, lineParams]) => ({...file, ...lineParams})),

		paramsParser: (p: P.Language) => p['lineNumbers'].or(p['fileName']).or(p['file']).sepBy(P.whitespace),
		languageWithParamsParser: (p) => P.seq(p['language'], p['paramsParser']).map((v) => v.flat()),
	});

	let result = parser['paramsParser'].parse(options);

	if (result.status) {
		return result.value.reduce(
			(acc: NgDocCodeBlockParams, cur: Partial<NgDocCodeBlockParams>) => ({...acc, ...cur}),
			{},
		);
	}

	result = parser['languageWithParamsParser'].parse(options);

	if (result.status) {
		return result.value.reduce(
			(acc: NgDocCodeBlockParams, cur: Partial<NgDocCodeBlockParams>) => ({...acc, ...cur}),
			{},
		);
	}

	throw new Error(`Unable to parse code block options: "${options}"`);
}
