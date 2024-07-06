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
    // const content = await unified()
    //   .use(parsePlugin)
    //   .use(rehypeStringify)
    //   .use(keywordsPlugin, { addUsedKeyword: usedKeywords.add.bind(usedKeywords) })
    //   .process(html)
    //   .then((file: VFileWithOutput<string>) => file.toString());

    return { content: html, usedKeywords: Array.from(usedKeywords) };
  } catch (error) {
    return { content: html, usedKeywords: [], error };
  }
}
