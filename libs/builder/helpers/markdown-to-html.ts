import { escapeHtml } from '@ng-doc/core';
import * as fs from 'fs';
import { marked, RendererObject } from 'marked';
import { EOL } from 'node:os';
import * as path from 'path';

import { NgDocCodeBlockParams } from '../interfaces';
import { parseCodeBlockParams } from '../parsers';
import { removeLinesFromCode } from './remove-lines-from-code';
import { UTILS } from './utils';

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
  const renderer: RendererObject = {
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
      const metaString = UTILS.stringifyEntities(
        JSON.stringify({
          name: !group ? name : undefined,
          icon: !group ? icon : undefined,
          highlightedlines: JSON.stringify(highlightedLines),
        }).replace(/"/g, '\\"'),
      );

      const codeElement: string = `<pre><code class="language-${language ?? 'ts'}"
	      lang="${language}"
	      metastring="${metaString}">${escapeHtml(code)}</code></pre>`;

      return group
        ? `<div><ng-doc-tab group="${group}" name="${name}" icon="${icon ?? ''}" ${
            active ? 'active' : ''
          }>${codeElement}</ng-doc-tab></div>`
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
    html(html: string, block?: boolean): string {
      return block ? html : html.trim();
    },
  };

  marked.use({ renderer });

  return marked.parse(markdown, { async: false }) as string;
}
