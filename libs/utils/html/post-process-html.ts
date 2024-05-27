import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified, VFileWithOutput } from 'unified';

import keywordsPlugin, { AddKeyword } from './plugins/keywords.plugin';

export interface PostProcessHtmlConfig {
  addUsedKeyword: AddKeyword;
}

/**
 *
 * @param html
 * @param config
 * @param config.addUsedKeyword
 * @param addUsedKeyword
 */
export async function postProcessHtml(
  html: string,
  { addUsedKeyword }: PostProcessHtmlConfig,
): Promise<string> {
  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeStringify)
    .use(keywordsPlugin, { addUsedKeyword })
    .process(html)
    .then((file: VFileWithOutput<string>) => file.toString());
}
