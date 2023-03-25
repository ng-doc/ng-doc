import {escapeHtml} from '@ng-doc/core';
import * as fs from 'fs';
import {marked as markedRender} from 'marked';
import {EOL} from 'node:os';
import * as path from 'path';

import {NgDocPageEntity} from '../engine';

const NOTE_ANCHOR: string = '<p><strong>Note</strong>';
const WARNING_ANCHOR: string = '<p><strong>Warning</strong>';

/**
 *
 * @param this
 * @param markdown
 * @param contextFolder
 * @param page
 */
export function marked(markdown: string, page?: NgDocPageEntity): string {
	const renderer: markedRender.RendererObject = {
		code(code: string, language: string | undefined): string {
			const parameters: string[] = language?.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
			const fileParameter: string | undefined = parameters.find((parameter: string) => parameter.startsWith('file='));
			const lang: string = parameters[0] ?? 'typescript';
			const fileName: string =
				parameters
					.find((parameter: string) => parameter.startsWith('fileName='))
					?.replace(/"/g, '')
					?.replace('fileName=', '') ?? '';
			const lineNumbers: boolean = parameters.includes('lineNumbers');

			if (fileParameter && page) {
				const result: [string, string] = loadFile(fileParameter, page.mdFolder);

				page.dependencies.add(result[0]);

				code = result[1];
			}

			return `<pre><code class="language-${lang}" lang="${lang}" fileName="${fileName}" lineNumbers="${lineNumbers}">${escapeHtml(
				code,
			)}</code></pre>`;
		},
		blockquote(quote: string): string {
			if (new RegExp(`^${NOTE_ANCHOR}`).test(quote)) {
				return `<ng-doc-blockquote type="note">${quote.replace(
					new RegExp(`^${NOTE_ANCHOR}\\s*`),
					'<p>',
				)}</ng-doc-blockquote>`;
			}

			if (new RegExp(`^${WARNING_ANCHOR}`).test(quote)) {
				return `<ng-doc-blockquote type="warning">${quote.replace(
					new RegExp(`^${WARNING_ANCHOR}\\s*`),
					'<p>',
				)}</ng-doc-blockquote>`;
			}

			return `<ng-doc-blockquote>${quote}</ng-doc-blockquote>`;
		},
	};

	markedRender.use({renderer});

	return markedRender.parse(markdown, {headerIds: false});
}

/**
 *
 * @param str
 * @param contextFolder
 */
function loadFile(str: string, contextFolder: string): [string, string] {
	const res: RegExpExecArray | null = /^file=(?<path>.+?)(?:(?:#(?:L(?<from>\d+)(?<dash>-)?)?)(?:L(?<to>\d+))?)?$/.exec(
		str,
	);

	if (!res || !res.groups || !res.groups['path']) {
		throw new Error(`Unable to parse file path ${str}`);
	}
	const relativeFilePath: string = path.join(contextFolder, res?.groups['path'].replace(/"/g, ''));
	const file = fs.readFileSync(relativeFilePath ?? '', 'utf8');
	const fileLines: string[] = file.split(EOL);

	const fromLine = res.groups['from'] ? parseInt(res.groups['from'], 10) : 0;
	const hasDash = !!res.groups['dash'] ?? false;
	const toLine = hasDash ? (res.groups['to'] ? parseInt(res.groups['to'], 10) : fileLines.length) : fromLine;

	return [relativeFilePath, fileLines.slice(fromLine - 1, toLine).join(EOL)];
}
