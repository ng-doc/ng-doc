import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified, VFileWithOutput } from 'unified';

import keywordsPlugin, { GetKeyword } from './plugins/keywords.plugin';
import markCodeBlocksPlugin from './plugins/mark-code-blocks.plugin';

export interface ReplaceKeywordsConfig {
  getKeyword?: GetKeyword;
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
  config?: ReplaceKeywordsConfig,
): Promise<string> {
  const { getKeyword } = config || {};

  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeStringify)
    .use(keywordsPlugin, { getKeyword })
    .use(markCodeBlocksPlugin)
    .process(html)
    .then((file: VFileWithOutput<string>) => file.toString());
}
