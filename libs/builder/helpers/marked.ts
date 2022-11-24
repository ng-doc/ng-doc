import {escapeHtml} from '@ng-doc/core';
import {marked as markedRender} from 'marked';

const NOTE_ANCHOR: string = '<p><strong>Note</strong>';
const WARNING_ANCHOR: string = '<p><strong>Warning</strong>';

/**
 *
 * @param this
 * @param markdown
 */
export function marked(markdown: string): string {
	const renderer: markedRender.RendererObject = {
		code(code: string, language: string | undefined): string {
			const lang: string = language ?? 'typescript';
			
			return `<pre><code class="language-${lang}" lang="${lang}">${escapeHtml(code)}</code></pre>`;
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

	return markedRender.parse(markdown);
}
