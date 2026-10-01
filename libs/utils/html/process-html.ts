import {
  NG_DOC_SYNTAX_THEME_NAME,
  NgDocHeading,
  NgDocPageAnchor,
  NgDocSyntaxTheme,
  ngDocSyntaxTheme,
} from '@ng-doc/core';
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      .use(rehypeShiki, {
        defaultLanguage: 'ts',
        fallbackLanguage: 'text',
        addLanguageClass: true,
        parseMetaString: (meta: string) => JSON.parse(meta?.replace(/\\/g, '') || '{}'),
        // Shiki stops tokenizing a line after 500 ms by default and silently colours the rest of
        // it like the last token. A slow or pre-empted process then renders other HTML than a fast
        // one, so the build output would depend on machine load. No limit keeps it deterministic.
        tokenizeTimeLimit: 0,
        themes: {
          light: shikiTheme(config.lightTheme ?? 'github-light'),
          dark: shikiTheme(config.darkTheme ?? 'ayu-dark'),
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

/**
 * A Shiki theme by name. NgDoc's own theme is not bundled with Shiki, so its name resolves to a new
 * copy of it; any other name is left to Shiki.
 * @param name - The theme name.
 */
function shikiTheme(name: string): string | NgDocSyntaxTheme {
  return name === NG_DOC_SYNTAX_THEME_NAME ? ngDocSyntaxTheme() : name;
}
