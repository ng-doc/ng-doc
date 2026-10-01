import { readFile } from 'node:fs/promises';

import type { IndexHtmlTransformer } from './types';

const MARKER = 'data-ng-doc-theme-restore';

export async function createThemeIndexTransformer(
  scriptUrl: URL = new URL('./restore-theme.js', import.meta.url),
): Promise<IndexHtmlTransformer> {
  const source = await readFile(scriptUrl, 'utf8');
  const tag = `<script ${MARKER}>${source}</script>`;
  return async (content) => {
    if (content.includes(MARKER)) return content;
    const head = /<head(?:\s[^>]*)?>/i.exec(content);
    if (head?.index !== undefined) {
      const offset = head.index + head[0].length;
      return `${content.slice(0, offset)}${tag}${content.slice(offset)}`;
    }
    const html = /<html(?:\s[^>]*)?>/i.exec(content);
    if (html?.index !== undefined) {
      const offset = html.index + html[0].length;
      return `${content.slice(0, offset)}<head>${tag}</head>${content.slice(offset)}`;
    }
    const doctype = /<!doctype\s+html[^>]*>/i.exec(content);
    if (doctype?.index !== undefined) {
      const offset = doctype.index + doctype[0].length;
      return `${content.slice(0, offset)}<head>${tag}</head>${content.slice(offset)}`;
    }
    return `<head>${tag}</head>${content}`;
  };
}
