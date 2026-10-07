import {
  NG_DOC_SYNTAX_THEME_NAME,
  NgDocHeading,
  NgDocPageAnchor,
  NgDocSyntaxTheme,
  ngDocSyntaxTheme,
} from '@ng-doc/core';
import rehypeShiki, { type RehypeShikiOptions } from '@shikijs/rehype';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import type { Root } from 'hast';
import { createHash } from 'node:crypto';
import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { type LanguageRegistration, bundledLanguages, createHighlighter } from 'shiki';
import { unified } from 'unified';

import autolinkHeadingPlugin from './plugins/add-heading-anchors.plugin';
import cachedShikiPlugin, { NgDocHighlightCache } from './plugins/cached-shiki.plugin';
import highlightCodeLines from './plugins/highlight-code-lines';
import markElementsPlugin from './plugins/mark-elements.plugin';
import mermaidPlugin from './plugins/mermaid.plugin';
import sluggerPlugin from './plugins/slugger.plugin';
import wrapTablePlugin from './plugins/table-wrapper';
import { blockLanguages, createGrammarlessHighlighter, shikiGrammars } from './shiki-grammars';

export type { NgDocHighlightBlock, NgDocHighlightCache } from './plugins/cached-shiki.plugin';

/** A Shiki language registration: a TextMate grammar as plain JSON, with its name. */
export interface NgDocHighlightLanguage {
  readonly name: string;
  readonly scopeName: string;
}

export interface NgDocHtmlProcessorConfig {
  lightTheme?: string;
  darkTheme?: string;
  /**
   * Languages that code blocks can use besides those bundled with Shiki. A registration named like
   * a bundled language replaces it. With languages, code is highlighted by a highlighter of its
   * own, created once per thread for these languages and themes.
   */
  langs?: readonly NgDocHighlightLanguage[];
  /**
   * Which bundled Shiki grammars the highlighter loads: `all` (the default) sets it up with every
   * bundled grammar, as `@shikijs/rehype` does; `used` loads only the grammars the document's code
   * blocks can reach, into a highlighter kept per thread and theme pair, which takes a fraction of
   * the time and gives the same HTML. With `langs`, every grammar is loaded.
   */
  grammars?: 'all' | 'used';
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
  const langs = config.langs?.length ? config.langs : undefined;
  const used = !langs && config.grammars === 'used';

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
                  ...(langs ? { languages: languagesId(langs) } : {}),
                  ...(used ? { grammars: 'used' as const } : {}),
                  identity: HIGHLIGHT_IDENTITY,
                  defaultLanguage: DEFAULT_LANGUAGE,
                  transformer: () =>
                    langs
                      ? withLanguages(themes, langs)
                      : used
                        ? withUsedGrammars(themes)
                        : (rehypeShiki as unknown as (options: RehypeShikiOptions) => Transformer)(
                            shikiOptions(themes),
                          ),
                },
              ],
            ]
          : langs
            ? [[() => withLanguages(themes, langs)]]
            : used
              ? [[() => withUsedGrammars(themes)]]
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
  format: 2,
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

type Transformer = (tree: Root) => Promise<void> | void;

/**
 * The highlighters with extra languages in this thread, by themes and languages. Each loads every
 * bundled language and the given ones once; nothing loads into it later, so a block highlights
 * the same whatever was highlighted before, and documents with other languages (or none) never
 * see these.
 */
const languageHighlighters = new Map<string, ReturnType<typeof createHighlighter>>();
const languageIds = new WeakMap<readonly NgDocHighlightLanguage[], string>();

/**
 * The identity of a list of languages: the digest of its JSON.
 * @param langs
 */
function languagesId(langs: readonly NgDocHighlightLanguage[]): string {
  let id = languageIds.get(langs);
  if (id === undefined) {
    id = createHash('sha256').update(JSON.stringify(langs)).digest('hex');
    languageIds.set(langs, id);
  }
  return id;
}

/**
 * The `@shikijs/rehype` transformer over the highlighter with these languages, with the options of
 * the plain plugin. A highlighter that failed to load is forgotten, so that the next document tries
 * again and fails with the same error.
 * @param themes - The theme names.
 * @param themes.light - The light theme.
 * @param themes.dark - The dark theme.
 * @param langs - The extra languages.
 */
function withLanguages(
  themes: { light: string; dark: string },
  langs: readonly NgDocHighlightLanguage[],
): Transformer {
  const id = `${themes.light}\n${themes.dark}\n${languagesId(langs)}`;
  return async (tree) => {
    let highlighter = languageHighlighters.get(id);
    if (!highlighter) {
      highlighter = createHighlighter({
        themes: [shikiTheme(themes.light), shikiTheme(themes.dark)],
        // Later registrations of a name replace earlier ones, so the given languages win.
        langs: [...Object.keys(bundledLanguages), ...(langs as unknown as LanguageRegistration[])],
      });
      languageHighlighters.set(id, highlighter);
      const created = highlighter;
      created.catch(() => {
        if (languageHighlighters.get(id) === created) languageHighlighters.delete(id);
      });
    }
    const transform = (
      rehypeShikiFromHighlighter as unknown as (
        highlighter: unknown,
        options: RehypeShikiOptions,
      ) => Transformer
    )(await highlighter, shikiOptions(themes));
    await transform(tree);
  };
}

/**
 * The highlighters that load only the grammars code blocks use, by theme pair, in this thread. A
 * highlighter that failed to load is forgotten, so that the next document tries again and fails
 * with the same error.
 */
const usedHighlighters = new Map<string, ReturnType<typeof createGrammarlessHighlighter>>();

/**
 * The `@shikijs/rehype` transformer, with the options of the plain plugin, over this thread's
 * highlighter for the theme pair, after it has loaded the grammars of the tree's code blocks
 * (`./shiki-grammars`).
 * @param themes - The theme names.
 * @param themes.light - The light theme.
 * @param themes.dark - The dark theme.
 */
function withUsedGrammars(themes: { light: string; dark: string }): Transformer {
  const id = `${themes.light}\n${themes.dark}`;
  return async (tree) => {
    let highlighter = usedHighlighters.get(id);
    if (!highlighter) {
      highlighter = createGrammarlessHighlighter([
        shikiTheme(themes.light),
        shikiTheme(themes.dark),
      ] as Parameters<typeof createGrammarlessHighlighter>[0]);
      usedHighlighters.set(id, highlighter);
      const created = highlighter;
      created.catch(() => {
        if (usedHighlighters.get(id) === created) usedHighlighters.delete(id);
      });
    }
    const [grammars, ready] = await Promise.all([shikiGrammars(), highlighter]);
    grammars.load(ready, blockLanguages(tree, DEFAULT_LANGUAGE));
    const transform = (
      rehypeShikiFromHighlighter as unknown as (
        highlighter: unknown,
        options: RehypeShikiOptions,
      ) => Transformer
    )(ready, shikiOptions(themes));
    await transform(tree);
  };
}
