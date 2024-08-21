import { NgDocHeading, NgDocPageAnchor } from '@ng-doc/core';
import rehypeShiki from '@shikijs/rehype';
import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

import autolinkHeadingPlugin from './plugins/add-heading-anchors.plugin';
import highlightCodeLines from './plugins/highlight-code-lines';
import markElementsPlugin from './plugins/mark-elements.plugin';
import mermaidPlugin from './plugins/mermaid.plugin';
import sluggerPlugin from './plugins/slugger.plugin';
import wrapTablePlugin from './plugins/table-wrapper';

export interface NgDocHtmlProcessorConfig {
  lightTheme?: string;
  darkTheme?: string;
  headings?: NgDocHeading[];
  route?: string;
}

export interface NgDocHtmlProcessorOutput {
  content: string;
  anchors: NgDocPageAnchor[];
  error?: unknown;
}

/**
 *
 * @param html
 * @param config
 */
export async function processHtml(
  html: string,
  config: NgDocHtmlProcessorConfig,
): Promise<NgDocHtmlProcessorOutput> {
  const anchors = new Set<NgDocPageAnchor>();

  try {
    const content = await unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeStringify)
      .use(mermaidPlugin)
      // @ts-expect-error - rehype-shiki types are not up to date
      .use(rehypeShiki, {
        defaultLanguage: 'ts',
        fallbackLanguage: 'text',
        addLanguageClass: true,
        parseMetaString: (meta: string) => JSON.parse(meta?.replace(/\\/g, '') || '{}'),
        themes: {
          light: config.lightTheme ?? 'github-light',
          dark: config.darkTheme ?? 'ayu-dark',
        },
      })
      .use(highlightCodeLines)
      .use(wrapTablePlugin)
      .use(sluggerPlugin, anchors.add.bind(anchors), config.headings)
      .use(rehypeMinifyWhitespace)
      .use(autolinkHeadingPlugin, config.route)
      .use(markElementsPlugin)
      .process(html)
      .then((file) => file.toString());

    return { content, anchors: Array.from(anchors) };
  } catch (error) {
    return { content: html, anchors: [], error };
  }
}
