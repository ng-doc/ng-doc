import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified, VFileWithOutput } from 'unified';

import keywordsPlugin from './plugins/keywords.plugin';

export interface PostProcessHtmlOutput {
  content: string;
  usedKeywords: string[];
  error?: unknown;
}

/**
 *
 * @param html
 * @param config
 * @param config.addUsedKeyword
 * @param addUsedKeyword
 */
export async function postProcessHtml(html: string): Promise<PostProcessHtmlOutput> {
  const usedKeywords = new Set<string>();

  try {
    const content = await unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeStringify)
      .use(keywordsPlugin, { addUsedKeyword: usedKeywords.add.bind(usedKeywords) })
      .process(html)
      .then((file: VFileWithOutput<string>) => file.toString());

    return { content, usedKeywords: Array.from(usedKeywords) };
  } catch (error) {
    return { content: html, usedKeywords: [], error };
  }
}
