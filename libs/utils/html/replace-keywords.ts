import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified, VFileWithOutput } from 'unified';

import keywordsPlugin, { GetKeyword } from './plugins/keywords.plugin';
import markCodeBlocksPlugin from './plugins/mark-code-blocks.plugin';
import markElementsPlugin from './plugins/mark-elements.plugin';

export interface ReplaceKeywordsConfig {
  getKeyword: GetKeyword;
}

/**
 *
 * @param html
 * @param config
 * @param config.getKeyword
 * @param getKeyword
 */
export async function replaceKeywords(
  html: string,
  { getKeyword }: ReplaceKeywordsConfig,
): Promise<string> {
  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeStringify)
    .use(keywordsPlugin, { getKeyword })
    .use(markElementsPlugin)
    .use(markCodeBlocksPlugin)
    .process(html)
    .then((file: VFileWithOutput<string>) => file.toString());
}
