import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified, VFileWithOutput } from 'unified';

import keywordsPlugin, { AddKeyword } from './plugins/keywords.plugin';

export interface ExtractKeywordsConfig {
  addUsedKeyword: AddKeyword;
}

/**
 *
 * @param html
 * @param config
 * @param config.addUsedKeyword
 * @param addUsedKeyword
 */
export async function extractKeywords(
  html: string,
  { addUsedKeyword }: ExtractKeywordsConfig,
): Promise<string> {
  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeStringify)
    .use(keywordsPlugin, { addUsedKeyword })
    .process(html)
    .then((file: VFileWithOutput<string>) => file.toString());
}
