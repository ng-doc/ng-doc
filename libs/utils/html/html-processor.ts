import { NgDocHeading, NgDocPageAnchor } from '@ng-doc/core';
import twig from 'highlight.js/lib/languages/twig';
import rehypeHighlight from 'rehype-highlight';
import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import rehypeStringify from 'rehype-stringify';
import { unified, VFileWithOutput } from 'unified';

import addHeadingAnchorsPlugin from './plugins/add-heading-anchors.plugin';
import codePlugin from './plugins/code.plugin';
import codeBlockLinesPlugin from './plugins/code-block-lines.plugin';
import highlightCodeLines from './plugins/highlight-code-lines';
import linkPlugin from './plugins/link.plugin';
import markElementsPlugin from './plugins/mark-elements.plugin';
import mermaidPlugin from './plugins/mermaid.plugin';
import parsePlugin from './plugins/parse.plugin';
import sluggerPlugin from './plugins/slugger.plugin';
import tableWrapperPlugin from './plugins/table-wrapper.plugin';

export interface NgDocHtmlProcessorConfig {
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
export async function htmlProcessor(
  html: string,
  config: NgDocHtmlProcessorConfig,
): Promise<NgDocHtmlProcessorOutput> {
  const anchors = new Set<NgDocPageAnchor>();

  try {
    const content= await unified()
      .use(parsePlugin)
      .use(rehypeStringify)
      .use(mermaidPlugin)
      .use(rehypeHighlight, { ignoreMissing: true, languages: { twig } })
      .use(codeBlockLinesPlugin)
      .use(highlightCodeLines)
      .use(tableWrapperPlugin)
      .use(sluggerPlugin, anchors.add.bind(anchors), config.headings)
      .use(rehypeMinifyWhitespace)
      .use(addHeadingAnchorsPlugin, config.route)
      .use(markElementsPlugin)
      .use(linkPlugin)
      .use(codePlugin)
      .process(html)
      .then((file: VFileWithOutput<string>) => file.toString());

    return { content, anchors: Array.from(anchors) };
  } catch (error) {
    return { content: html, anchors: [], error };
  }
}
