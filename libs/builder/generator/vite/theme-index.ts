import { readFile } from 'node:fs/promises';

const MARKER = 'data-ng-doc-theme-restore';

/** Transforms the application's index.html. */
export type ThemeIndexTransformer = (content: string) => Promise<string>;

/**
 * Loads the theme restore script once and returns a transformer that inlines it at the start of
 * the document head, so the reader's theme applies before the application starts. A document that
 * already carries the script is returned unchanged.
 */
export async function createThemeIndexTransformer(
  scriptUrl: URL = new URL('./restore-theme.js', import.meta.url),
): Promise<ThemeIndexTransformer> {
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

let transformer: Promise<ThemeIndexTransformer> | undefined;

/**
 * The plugin's `transformIndexHtml` handler. The script is a sibling of the bundled Vite entries
 * (the build copies it to `vite/restore-theme.js`), so the default URL resolves from every entry.
 */
export function transformNgDocIndex(html: string): Promise<string> {
  transformer ??= createThemeIndexTransformer();
  return transformer.then((transform) => transform(html));
}
