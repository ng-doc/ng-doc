import {
  NG_DOC_SYNTAX_THEME_NAME,
  NgDocHeading,
  NgDocPageAnchor,
  NgDocSyntaxTheme,
  ngDocSyntaxTheme,
} from '@ng-doc/core';
import rehypeShiki, { type RehypeShikiOptions } from '@shikijs/rehype';
import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

import autolinkHeadingPlugin from './plugins/add-heading-anchors.plugin';
import cachedShikiPlugin, { NgDocHighlightCache } from './plugins/cached-shiki.plugin';
import highlightCodeLines from './plugins/highlight-code-lines';
import markElementsPlugin from './plugins/mark-elements.plugin';
import mermaidPlugin from './plugins/mermaid.plugin';
import sluggerPlugin from './plugins/slugger.plugin';
import wrapTablePlugin from './plugins/table-wrapper';

export type { NgDocHighlightBlock, NgDocHighlightCache } from './plugins/cached-shiki.plugin';

export interface NgDocHtmlProcessorConfig {
  lightTheme?: string;
  darkTheme?: string;
  headings?: NgDocHeading[];
  route?: string;
  /**
   * A cache of highlighted code blocks. With it, code is highlighted by a Shiki highlighter that is
   * set up once per thread and theme pair, and a block is highlighted only when the cache misses;
   * the result is the same as without it. Without it, every call sets the highlighter up again
   * and highlights every block.
   */
  highlight?: NgDocHighlightCache;
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
  const themes = {
    light: config.lightTheme ?? 'github-light',
    dark: config.darkTheme ?? 'ayu-dark',
  };

  try {
    const content = await unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeStringify)
      .use(mermaidPlugin)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      .use(
        config.highlight
          ? [
              [
                cachedShikiPlugin,
                {
                  cache: config.highlight,
                  themes,
                  identity: HIGHLIGHT_IDENTITY,
                  defaultLanguage: DEFAULT_LANGUAGE,
                  options: () => shikiOptions(themes),
                },
              ],
            ]
          : [[rehypeShiki, shikiOptions(themes)]],
      )
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

const DEFAULT_LANGUAGE = 'ts';

/**
 * What a cached block's options stand for in its key ({@link NgDocHighlightCache}). Bump `format`
 * whenever {@link shikiOptions} or the cached plugin change.
 */
const HIGHLIGHT_IDENTITY = {
  format: 1,
  defaultLanguage: DEFAULT_LANGUAGE,
  fallbackLanguage: 'text',
  addLanguageClass: true,
  parseMetaString: 'json-without-backslashes',
  tokenizeTimeLimit: 0,
} as const;

/**
 * The options both highlighting paths give `@shikijs/rehype`.
 * @param themes - The theme names.
 * @param themes.light - The light theme.
 * @param themes.dark - The dark theme.
 */
function shikiOptions(themes: { light: string; dark: string }): RehypeShikiOptions {
  return {
    defaultLanguage: DEFAULT_LANGUAGE,
    fallbackLanguage: 'text',
    addLanguageClass: true,
    parseMetaString: (meta: string) => JSON.parse(meta?.replace(/\\/g, '') || '{}'),
    // Shiki stops tokenizing a line after 500 ms by default and silently colours the rest of
    // it like the last token. A slow or pre-empted process then renders other HTML than a fast
    // one, so the build output would depend on machine load. No limit keeps it deterministic.
    tokenizeTimeLimit: 0,
    themes: {
      light: shikiTheme(themes.light),
      dark: shikiTheme(themes.dark),
    },
  } as RehypeShikiOptions;
}

/**
 * A Shiki theme by name. NgDoc's own theme is not bundled with Shiki, so its name resolves to a new
 * copy of it; any other name is left to Shiki.
 * @param name - The theme name.
 */
function shikiTheme(name: string): string | NgDocSyntaxTheme {
  return name === NG_DOC_SYNTAX_THEME_NAME ? ngDocSyntaxTheme() : name;
}
