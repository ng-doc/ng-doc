import { NgDocCodeBlockParams, parseCodeBlockParams } from '@ng-doc/builder';
import { escapeHtml } from '@ng-doc/core';
import * as fs from 'fs';
import { marked } from 'marked';
import { EOL } from 'node:os';
import * as path from 'path';

import { removeLinesFromCode } from './remove-lines-from-code';

const blockquoteRegex: RegExp = /^<p><strong>(\w+)<\/strong>\s*/;

/**
 *
 * @param this
 * @param markdown
 * @param contextFolder
 * @param page
 * @param context
 * @param addDependency
 */
export function markdownToHtml(
	markdown: string,
	context?: string,
	addDependency?: (dep: string) => void,
): string {
	const renderer: marked.RendererObject = {
		code(code: string, lang: string | undefined): string {
			const {
				language,
				file,
				name,
				highlightedLines,
				fileLineStart,
				fileLineEnd,
				group,
				active,
				icon,
			}: NgDocCodeBlockParams = parseCodeBlockParams(lang?.trim() ?? 'typescript');

			if (file && context) {
				const relativeFilePath: string = path.join(context, file);
				const fileContent: string = fs
					.readFileSync(relativeFilePath ?? '', 'utf8')
					.split(EOL)
					.slice(fileLineStart, fileLineEnd)
					.join(EOL)
					.trim();

				addDependency && addDependency(relativeFilePath);

				code = removeLinesFromCode(fileContent);
			}

			const codeElement: string = `<pre><code class="language-${language ?? 'ts'}"
	      lang="${language}"
	      name="${!group && name ? name : ''}"
	      icon="${!group && icon ? icon : ''}"
	      highlightedLines="${JSON.stringify(highlightedLines ?? [])}">${escapeHtml(
				code,
			)}</code></pre>`;

			return group
				? `<ng-doc-tab group="${group}" name="${name}" icon="${icon ?? ''}" ${
						active ? 'active' : ''
				  }>${codeElement}</ng-doc-tab>`
				: codeElement;
		},
		blockquote(quote: string): string {
			const match = quote.match(blockquoteRegex);

			if (match) {
				return `<ng-doc-blockquote type="${match[1].toLowerCase()}">${quote.replace(
					blockquoteRegex,
					'<p>',
				)}</ng-doc-blockquote>`;
			}

			return `<ng-doc-blockquote>${quote}</ng-doc-blockquote>`;
		},
	};

	marked.use({ renderer });

	return marked.parse(markdown, { headerIds: false });
}
