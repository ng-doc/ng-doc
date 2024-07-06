import { remark } from 'remark';
import remarkHtml from 'remark-html';

import { blockquote } from './handlers/blockquote.handler';
import { code } from './handlers/code.handler';

/**
 *
 * @param markdown
 */
export function markdownToHtml(markdown: string): string {
  return remark()
    .use(remarkHtml, {
      sanitize: false,
      allowDangerousCharacters: true,
      allowDangerousHtml: true,
      preferUnquoted: false,
      handlers: {
        blockquote,
        code: code(),
      },
    })
    .processSync(markdown)
    .toString();
}
