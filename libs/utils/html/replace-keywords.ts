import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

import keywordsPlugin, { GetKeyword } from './plugins/keywords.plugin';

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
    .process(html)
    .then((file) => file.toString());
}
