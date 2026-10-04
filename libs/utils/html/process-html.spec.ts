import { NG_DOC_SYNTAX_THEME_NAME, ngDocSyntaxTheme } from '@ng-doc/core';
import rehypeShiki from '@shikijs/rehype';
import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { afterEach, describe, expect, it, vi } from 'vitest';

import autolinkHeadingPlugin from './plugins/add-heading-anchors.plugin';
import highlightCodeLines from './plugins/highlight-code-lines';
import markElementsPlugin from './plugins/mark-elements.plugin';
import mermaidPlugin from './plugins/mermaid.plugin';
import sluggerPlugin from './plugins/slugger.plugin';
import wrapTablePlugin from './plugins/table-wrapper';
import {
  NgDocHighlightBlock,
  NgDocHighlightCache,
  NgDocHtmlProcessorConfig,
  processHtml,
} from './process-html';

// Counts the transformers `@shikijs/rehype` creates: each one sets a highlighter up.
vi.mock('@shikijs/rehype', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shikijs/rehype')>();
  return { ...actual, default: vi.fn(actual.default) };
});

const factory = rehypeShiki as unknown as ReturnType<typeof vi.fn>;

/**
 * `processHtml` as it was before the cache, verbatim: the call without `highlight` must still be
 * exactly this.
 */
async function reference(html: string, config: NgDocHtmlProcessorConfig) {
  const anchors = new Set<unknown>();
  const shikiTheme = (name: string) =>
    name === NG_DOC_SYNTAX_THEME_NAME ? ngDocSyntaxTheme() : name;
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
        tokenizeTimeLimit: 0,
        themes: {
          light: shikiTheme(config.lightTheme ?? 'github-light'),
          dark: shikiTheme(config.darkTheme ?? 'ayu-dark'),
        },
      })
      .use(highlightCodeLines)
      .use(wrapTablePlugin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(sluggerPlugin, anchors.add.bind(anchors) as any, config.headings)
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

/** A cache in a map. `loads` says whether the themes are known to load. */
function mapCache(
  options: {
    loads?: boolean;
    verify?: boolean;
    entries?: Map<string, string>;
    key?: (block: NgDocHighlightBlock) => string;
  } = {},
) {
  const entries = options.entries ?? new Map<string, string>();
  const mismatches: string[] = [];
  const blocks: NgDocHighlightBlock[] = [];
  const cache: NgDocHighlightCache = {
    key: (block) => {
      blocks.push(block);
      return options.key ? options.key(block) : JSON.stringify(block);
    },
    get: (key) => entries.get(key),
    set: (key, value) => void entries.set(key, value),
    loads: () => options.loads ?? entries.size > 0,
    verify: options.verify ?? false,
    mismatch: (key) => void mismatches.push(key),
  };
  return { cache, entries, mismatches, blocks };
}

const code = (language: string | undefined, text: string, meta = '') =>
  `<pre><code${language === undefined ? '' : ` class="language-${language}" lang="${language}"`} metastring="${meta}">${text}</code></pre>`;

const meta = (value: object) => JSON.stringify(value).replace(/"/g, '\\&quot;');

const CASES: Record<string, string> = {
  'heading and TypeScript': `<h2>Usage</h2><p>Text <code>inline</code>.</p>${code('typescript', 'const a: number = 1;\nexport class A {}')}`,
  'no language class': code(undefined, 'let value = 1;'),
  'an unknown language falls back': code('no-such-language', 'plain text'),
  'highlighted lines and a name': code(
    'typescript',
    'const a = 1;\nconst b = 2;\nconst c = 3;',
    meta({ name: 'a.ts', highlightedlines: '[1,3]' }),
  ),
  mermaid: `<pre><code class="language-mermaid" lang="mermaid">graph TD; A--&gt;B</code></pre>`,
  'an empty block': code('typescript', ''),
  'CRLF line endings': code('typescript', 'const a = 1;\r\nconst b = 2;\r\n'),
  'duplicates in one document': `${code('html', '&lt;div&gt;x&lt;/div&gt;')}<p>between</p>${code('html', '&lt;div&gt;x&lt;/div&gt;')}${code('html', '&lt;div&gt;x&lt;/div&gt;')}`,
  'group tabs': `<div><ng-doc-tab group="g" name="a.ts" icon=""><pre><code class="language-typescript" lang="typescript" metastring="">const a = 1;</code></pre></ng-doc-tab></div><div><ng-doc-tab group="g" name="a.html" icon="" active><pre><code class="language-html" lang="html" metastring="">&lt;p&gt;a&lt;/p&gt;</code></pre></ng-doc-tab></div>`,
  'a pre without a code element first': `<pre> <code class="language-ts">x</code></pre><pre>plain</pre>`,
  'a block nested in a block': `<pre><code class="language-ts">outer</code><pre><code class="language-ts">inner</code></pre></pre>`,
  'no code at all': `<h1>Title</h1><p>Only text.</p><table><tr><td>cell</td></tr></table>`,
  'Angular control flow and @let': code(
    'angular-html',
    '@let name = user.name;\n@if (name) {\n  &lt;b&gt;{{ name }}&lt;/b&gt;\n} @else {\n  @defer (on viewport) { x }\n}',
  ),
};

const THEMES: Array<[string, NgDocHtmlProcessorConfig]> = [
  ['the legacy default themes', {}],
  ["NgDoc's theme", { lightTheme: NG_DOC_SYNTAX_THEME_NAME, darkTheme: NG_DOC_SYNTAX_THEME_NAME }],
];

const config = (base: NgDocHtmlProcessorConfig): NgDocHtmlProcessorConfig => ({
  ...base,
  headings: ['h1', 'h2', 'h3', 'h4'],
  route: 'docs/page',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(THEMES)('processHtml with %s', (_, themes) => {
  it.each(Object.entries(CASES))(
    '%s: unchanged without a cache, equal with one',
    async (_, html) => {
      const expected = await reference(html, config(themes));
      expect(expected.error).toBeUndefined();
      expect(await processHtml(html, config(themes))).toEqual(expected);

      const { cache, entries } = mapCache();
      // Cold, warm, and warm again: nodes from the cache are never shared with a later document.
      for (let pass = 0; pass < 3; pass++)
        expect(await processHtml(html, { ...config(themes), highlight: cache })).toEqual(expected);
      expect(entries.size > 0).toBe(expected.content.includes('class="shiki'));
    },
  );

  it('highlights a document of every case once and reuses each block', async () => {
    const html = Object.values(CASES).join('<hr>');
    const expected = await reference(html, config(themes));
    const { cache, entries } = mapCache();
    expect(await processHtml(html, { ...config(themes), highlight: cache })).toEqual(expected);
    const stored = new Map(entries);
    expect(await processHtml(html, { ...config(themes), highlight: cache })).toEqual(expected);
    expect(entries).toEqual(stored);
  });
});

describe('Angular templates', () => {
  // The tokens of a highlighted block with NgDoc's theme, which names the colour of each token.
  async function tokens(text: string): Promise<Map<string, string>> {
    const { content } = await processHtml(code('angular-html', text), {
      lightTheme: NG_DOC_SYNTAX_THEME_NAME,
      darkTheme: NG_DOC_SYNTAX_THEME_NAME,
    });
    const colours = new Map<string, string>();
    for (const [, colour, token] of content.matchAll(
      /<span style="color:var\(--ng-doc-syntax-([a-z]+)\)[^"]*"[^>]*>([^<]*)<\/span>/g,
    ))
      colours.set(token!.trim(), colour!);
    return colours;
  }

  it('highlights @let and the control flow blocks as template blocks', async () => {
    const colours = await tokens(
      '@let total = price * count;\n@if (total &gt; 0) {\n  {{ total }}\n} @else {\n  @for (item of items; track item) { x }\n}\n@switch (mode) { @case (1) { a } }\n@defer (on viewport) { b }',
    );
    for (const block of ['@let', '@if', '@else', '@for', '@switch', '@case', '@defer'])
      expect(colours.get(block), block).toBe('keyword');
  });
});

// Every list of languages gets a highlighter of its own, which loads every bundled grammar.
describe('extra languages', { timeout: 60_000 }, () => {
  const NGDOC_THEMES = {
    lightTheme: NG_DOC_SYNTAX_THEME_NAME,
    darkTheme: NG_DOC_SYNTAX_THEME_NAME,
  };
  // A grammar that colours `hello` as a keyword.
  const grammar = (name: string, scopeName: string) => ({
    name,
    scopeName,
    patterns: [{ match: '\\bhello\\b', name: `keyword.control.${name}` }],
    repository: {},
  });
  const custom = grammar('ngdoc-test', 'source.ngdoc-test');
  const keyword = 'color:var(--ng-doc-syntax-keyword)';

  it('highlights a registered language with or without a cache, and only where it is registered', async () => {
    const html = code('ngdoc-test', 'hello world');
    const registered = { ...NGDOC_THEMES, langs: [custom] };
    const expected = await processHtml(html, registered);
    expect(expected.error).toBeUndefined();
    expect(expected.content).toContain(keyword);
    expect(expected.content).toContain('language-ngdoc-test');

    // Without the registration the block falls back to text, before and after a registered one.
    const plain = await processHtml(html, NGDOC_THEMES);
    expect(plain.content).not.toContain(keyword);
    expect(plain.content).toContain('language-text');
    expect(await processHtml(html, registered)).toEqual(expected);
    expect(await processHtml(html, NGDOC_THEMES)).toEqual(plain);

    const { cache, blocks } = mapCache();
    for (let pass = 0; pass < 2; pass++)
      expect(await processHtml(html, { ...registered, highlight: cache })).toEqual(expected);
    const unregistered = mapCache();
    expect(await processHtml(html, { ...NGDOC_THEMES, highlight: unregistered.cache })).toEqual(
      plain,
    );
    // The languages are part of a block's key, by the digest of their JSON.
    expect(blocks[0]!.languages).toMatch(/^[0-9a-f]{64}$/);
    expect(unregistered.blocks[0]).not.toHaveProperty('languages');
    const other = mapCache();
    await processHtml(html, {
      ...registered,
      langs: [{ ...custom, displayName: 'Test' }],
      highlight: other.cache,
    });
    expect(other.blocks[0]!.languages).not.toBe(blocks[0]!.languages);
  });

  it('replaces a bundled language with a registration of the same name', async () => {
    const html = code('ini', 'hello');
    expect((await processHtml(html, NGDOC_THEMES)).content).not.toContain(keyword);
    const replaced = { ...NGDOC_THEMES, langs: [[grammar('ini', 'source.ini')]] };
    const expected = await processHtml(html, replaced);
    expect(expected.content).toContain(keyword);
    expect(await processHtml(html, { ...replaced, highlight: mapCache().cache })).toEqual(expected);
  });

  it('fails every document, with or without code, when a language cannot load', async () => {
    const broken = {
      ...NGDOC_THEMES,
      langs: [{ ...custom, embeddedLangs: ['no-such-language'] }],
    };
    for (const document of [code('ts', 'const a = 1;'), '<p>No code.</p>']) {
      const expected = await processHtml(document, broken);
      expect(String(expected.error)).toContain('no-such-language');
      const result = await processHtml(document, {
        ...broken,
        highlight: mapCache({ loads: false }).cache,
      });
      expect(String(result.error)).toBe(String(expected.error));
    }
  });
});

describe('the highlight cache', () => {
  const html = `${code('typescript', 'const cached = true;')}${code('css', '.a { color: red; }')}`;

  it('keys a block by everything it depends on', async () => {
    const { cache, blocks } = mapCache();
    await processHtml(`${code('typescript', 'a', meta({ name: 'x' }))}${code(undefined, 'b')}`, {
      ...config({}),
      highlight: cache,
    });
    expect(blocks).toEqual([
      expect.objectContaining({
        themes: { light: 'github-light', dark: 'ayu-dark' },
        lang: 'typescript',
        meta: '{\\"name\\":\\"x\\"}',
        code: 'a',
      }),
      // Without a class: the default language, before any fallback; no meta.
      expect.objectContaining({ lang: 'ts', meta: '', code: 'b' }),
    ]);
    expect(blocks[0]!.options).toEqual({
      format: 2,
      defaultLanguage: 'ts',
      fallbackLanguage: 'text',
      addLanguageClass: true,
      parseMetaString: 'json-without-backslashes',
      tokenizeTimeLimit: 0,
    });
  });

  it('never sets a highlighter up for a document whose blocks all hit', async () => {
    // Keys without the themes, so that blocks highlighted with one pair hit for a pair that no
    // other test loads, for which no highlighter exists yet.
    const key = (block: NgDocHighlightBlock) => JSON.stringify({ ...block, themes: undefined });
    const loaded = { lightTheme: 'min-light', darkTheme: 'min-dark' };
    const unloaded = { lightTheme: 'slack-ochin', darkTheme: 'slack-dark' };
    const warm = mapCache({ key });
    const expected = await processHtml(html, { ...config(loaded), highlight: warm.cache });
    expect(expected).toEqual(await reference(html, config(loaded)));

    factory.mockClear();
    const { cache } = mapCache({ key, entries: new Map(warm.entries), loads: true });
    expect(await processHtml(html, { ...config(unloaded), highlight: cache })).toEqual(expected);
    expect(await processHtml('<p>No code.</p>', { ...config(unloaded), highlight: cache })).toEqual(
      await processHtml('<p>No code.</p>', config(loaded)),
    );
    expect(factory).toHaveBeenCalledTimes(1); // the plain call just above
    factory.mockClear();

    // Until the cache shows that the themes load, a document without code loads them, once.
    const unproven = mapCache({ loads: false });
    await processHtml('<p>No code.</p>', { ...config(unloaded), highlight: unproven.cache });
    await processHtml('<p>Again.</p>', { ...config(unloaded), highlight: unproven.cache });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('sets one highlighter up per theme pair, where the plain plugin sets one up per call', async () => {
    const themes = { lightTheme: 'vitesse-light', darkTheme: 'vitesse-dark' };
    factory.mockClear();
    for (let index = 0; index < 3; index++)
      await processHtml(code('typescript', `const n = ${index};`), {
        ...config(themes),
        highlight: mapCache().cache,
      });
    expect(factory).toHaveBeenCalledTimes(1);
    factory.mockClear();
    for (let index = 0; index < 3; index++)
      await processHtml(code('typescript', `const n = ${index};`), config(themes));
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('fails at the same block with the same error, and stores no failure', async () => {
    const broken = `${code('typescript', 'const ok = 1;')}${code('typescript', 'x', '{not json')}${code('css', 'a{}')}`;
    const expected = await reference(broken, config({}));
    expect(expected.error).toBeDefined();
    const { cache, entries } = mapCache();
    for (let pass = 0; pass < 2; pass++) {
      const result = await processHtml(broken, { ...config({}), highlight: cache });
      expect(String(result.error)).toBe(String(expected.error));
      expect(result.content).toBe(expected.content);
      expect(result.anchors).toEqual([]);
    }
    // The block before the failing one was stored; the failing one and those after it were not.
    expect([...entries.keys()].map((key) => JSON.parse(key).code)).toEqual(['const ok = 1;']);
  });

  it('fails every document, with or without code, when a theme cannot load', async () => {
    const themes = { lightTheme: 'no-such-theme', darkTheme: 'ayu-dark' };
    for (const document of [html, '<p>No code.</p>']) {
      const expected = await reference(document, config(themes));
      expect(expected.error).toBeDefined();
      for (let pass = 0; pass < 2; pass++) {
        const result = await processHtml(document, {
          ...config(themes),
          highlight: mapCache({ loads: false }).cache,
        });
        expect(String(result.error)).toBe(String(expected.error));
      }
    }
  });

  it.each([
    ['not JSON', '{'],
    ['not an array', '{"type":"element"}'],
    ['an empty array', '[]'],
    ['a text node', '[{"type":"text","value":"x"}]'],
    ['an element without children', '[{"type":"element","tagName":"pre","properties":{}}]'],
    [
      'an element with a malformed child',
      '[{"type":"element","tagName":"pre","properties":{},"children":[{"type":"comment"}]}]',
    ],
    [
      'an element with array properties',
      '[{"type":"element","tagName":"pre","properties":[],"children":[]}]',
    ],
    ['an empty root', '[{"type":"root","children":[]}]'],
    ['a root of a text node', '[{"type":"root","children":[{"type":"text","value":"x"}]}]'],
    ['a root without children', '[{"type":"root"}]'],
  ])('treats an entry that is %s as a miss', async (_, value) => {
    const expected = await reference(html, config({}));
    const warm = mapCache();
    await processHtml(html, { ...config({}), highlight: warm.cache });
    const corrupt = new Map([...warm.entries.keys()].map((key) => [key, value]));
    const { cache, entries } = mapCache({ entries: corrupt, loads: true });
    expect(await processHtml(html, { ...config({}), highlight: cache })).toEqual(expected);
    expect(entries).toEqual(warm.entries);
  });

  it('verify highlights every hit again, uses that result and reports a difference', async () => {
    const expected = await reference(html, config({}));
    const warm = mapCache();
    await processHtml(html, { ...config({}), highlight: warm.cache });
    const [first, second] = [...warm.entries.keys()];
    // `@shikijs/rehype` puts the root of the highlighted fragment in place of the block.
    const tampered = JSON.parse(warm.entries.get(first!)!) as Array<{
      type: string;
      children: Array<{ properties: object }>;
    }>;
    expect(tampered[0]!.type).toBe('root');
    const pre = tampered[0]!.children[0]!;
    pre.properties = { ...pre.properties, 'data-tampered': '' };
    const entries = new Map(warm.entries).set(first!, JSON.stringify(tampered));

    const used = mapCache({ entries: new Map(entries), loads: true });
    expect((await processHtml(html, { ...config({}), highlight: used.cache })).content).toContain(
      'data-tampered',
    );

    const verified = mapCache({ entries, verify: true, loads: true });
    expect(await processHtml(html, { ...config({}), highlight: verified.cache })).toEqual(expected);
    expect(verified.mismatches).toEqual([first]);
    expect(verified.entries.get(first!)).toBe(warm.entries.get(first!));
    expect(verified.entries.get(second!)).toBe(warm.entries.get(second!));
  });

  it('never stops tokenizing on a slow clock, cached or not', async () => {
    const long = `const value = [${Array.from({ length: 200 }, (_, index) => `'item ${index}'`).join(', ')}];`;
    const document = code('typescript', long);
    const expected = await reference(document, config({}));
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1_000));
    expect(await processHtml(document, config({}))).toEqual(expected);
    expect(await processHtml(document, { ...config({}), highlight: mapCache().cache })).toEqual(
      expected,
    );
    expect(now).toBeGreaterThan(0);
  });
});
