import {NgDocCodeBlockParams, parseCodeBlockParams} from '@ng-doc/builder';
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
		code(code: string, lang: string | undefined): string {
			const {language, file, fileName, linesToHighlight, fileLineStart, fileLineEnd}: NgDocCodeBlockParams = parseCodeBlockParams(lang?.trim() ?? 'typescript');

			// file path regexp


			if (file && page) {
				const relativeFilePath: string = path.join(page.mdFolder, file);
				const fileContent: string = fs.readFileSync(relativeFilePath ?? '', 'utf8')
					.split(EOL)
					.slice(fileLineStart, fileLineEnd)
					.join(EOL)

				page.dependencies.add(relativeFilePath);

				code = fileContent;
			}

			return `<pre><code class="language-${language ?? 'ts'}"
	      lang="${language}"
	      data-fileName="${fileName ?? ''}"
	      data-lineNumbers="${linesToHighlight}"
	      data-linesToHighlight="${JSON.stringify(linesToHighlight)}">${escapeHtml(code)}</code></pre>`;
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
