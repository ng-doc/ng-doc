import { NgDocKeyword } from '@ng-doc/core';
import { describe, expect, it } from 'vitest';

import { postProcessHtml } from '../post-process-html';
import { replaceKeywords } from '../replace-keywords';

const KEYWORDS: Record<string, NgDocKeyword> = {
  NgDocPage: { title: 'NgDocPage', path: '/api/ng-doc-page' },
  'NgDocPage.title': { title: 'NgDocPage.title', path: '/api/ng-doc-page#title' },
  NgDocSize: { title: 'NgDocSize', path: '/api/ng-doc-size' },
  NgDocActions: { title: 'NgDocActions', path: '/api/ng-doc-actions' },
  'NgDocActions.demo': { title: 'NgDocActions.demo()', path: '/api/ng-doc-actions#demo' },
  provideNgDocApp: { title: 'provideNgDocApp', path: '/api/provide-ng-doc-app' },
  '*CodeBlocksPage': { title: 'Code blocks', path: '/docs/code-blocks', type: 'link' },
  '*CodeBlocksPage#code-groups': {
    title: 'Code groups',
    path: '/docs/code-blocks#code-groups',
    type: 'link',
  },
  group: { title: 'group', path: 'https://angular.dev/api/animations/group' },
  config: { title: 'config', path: 'https://rxjs.dev/api/index/const/config' },
  readonly: { title: 'readonly', path: 'https://angular.dev/api/forms/signals/readonly' },
  of: { title: 'of', path: 'https://rxjs.dev/api/index/function/of' },
  input: { title: 'input', path: 'https://angular.dev/api/core/input' },
  last: { title: 'last', path: 'https://rxjs.dev/api/operators/last' },
  'ng-doc-tab': { title: 'ng-doc-tab', path: '/api/ng-doc-tab', languages: ['html'] },
  'ng-doc-button': { title: 'ng-doc-button', path: '/api/ng-doc-button', languages: ['html'] },
};

const getKeyword = (key: string): NgDocKeyword | undefined => KEYWORDS[key];

/**
 * The text of every link, in order.
 * @param html - The HTML.
 */
function links(html: string): string[] {
  return Array.from(html.matchAll(/<a [^>]*>([^<]*)<\/a>/g), (match) => match[1]!);
}

/**
 * The links of inline code.
 * @param code - The code, as HTML.
 */
async function inline(code: string): Promise<string[]> {
  return links(await replaceKeywords(`<p><code>${code}</code></p>`, { getKeyword }));
}

/**
 * A highlighted code block: one span per token, as Shiki emits them (each token is its own text
 * node, so a member and its owner never share one), and its links.
 * @param lang - The block's language.
 * @param tokens - The tokens, as HTML.
 */
async function block(lang: string, tokens: string[]): Promise<string[]> {
  const spans = tokens.map((token) => `<span>${token}</span>`).join('');

  return links(
    await replaceKeywords(
      `<pre><code class="language-${lang}"><span class="line">${spans}</span></code></pre>`,
      { getKeyword },
    ),
  );
}

describe('keywordsPlugin', () => {
  describe('inline code', () => {
    it('links code that is one keyword reference as a whole', async () => {
      expect(await inline('NgDocPage')).toEqual(['NgDocPage']);
      expect(await inline('NgDocPage.title')).toEqual(['NgDocPage.title']);
      expect(
        await replaceKeywords('<p><code>*CodeBlocksPage#code-groups</code></p>', { getKeyword }),
      ).toBe('<p><a href="/docs/code-blocks#code-groups" class="ngde">Code groups</a></p>');
      expect(
        await replaceKeywords('<p><code>*CodeBlocksPage?tab=api</code></p>', { getKeyword }),
      ).toBe('<p><a href="/docs/code-blocks?tab=api" class="ngde">Code blocks</a></p>');
    });

    it('keeps failing on a missing page keyword or anchor of a whole reference', async () => {
      await expect(inline('*MissingPage')).rejects.toThrow(
        'Route with keyword "*MissingPage" is missing.',
      );
      await expect(inline('NgDocPage.missing')).rejects.toThrow(
        'Route with keyword "NgDocPage.missing" is missing.',
      );
    });

    it('leaves file names, paths, commands and prose plain', async () => {
      // `config` is a keyword: before, `vite.ng-doc.config.mjs` linked it with the anchor `mjs`
      // and failed the build.
      expect(await inline('vite.ng-doc.config.mjs')).toEqual([]);
      expect(await inline('a.b.config.mjs')).toEqual([]);
      expect(await inline('node_modules/config/index.d.ts')).toEqual([]);
      expect(await inline('ng-doc config')).toEqual([]);
      expect(await inline('.ng-doc-tab')).toEqual([]);
      expect(await inline('Route with keyword "config" is missing.')).toEqual([]);
      expect(
        await inline('NgDoc: update failed (1 error); the site keeps the last version'),
      ).toEqual([]);
    });

    it('leaves HTML in inline code plain', async () => {
      expect(await inline('&#x3C;ng-doc-tab>')).toEqual([]);
      expect(await inline('&#x3C;ng-doc-tab group="…" name="…">')).toEqual([]);
    });

    it('links the references of code-like inline code as in a TypeScript block', async () => {
      expect(await inline('provideNgDocApp()')).toEqual(['provideNgDocApp']);
      expect(await inline('Array&#x3C;NgDocPage>')).toEqual(['NgDocPage']);
      expect(await inline('NgDocPage[]')).toEqual(['NgDocPage']);
      expect(await inline('NgDocSize | undefined')).toEqual(['NgDocSize']);
      expect(await inline("size = input&#x3C;NgDocSize>('small')")).toEqual(['input', 'NgDocSize']);
      expect(await inline('provideNgDocApp(config?: NgDocPage)')).toEqual([
        'provideNgDocApp',
        'NgDocPage',
      ]);
      expect(await inline('provideNgDocApp(config?)')).toEqual(['provideNgDocApp']);
      expect(await inline('export class NgDocPage')).toEqual(['NgDocPage']);
      expect(await inline('{{ NgDocActions.demo("Demo") }}')).toEqual(['NgDocActions.demo()']);
    });

    it('does not link keys, attributes, strings and query parameters in code-like inline code', async () => {
      expect(await inline('group="…"')).toEqual([]);
      expect(await inline("group: '…'")).toEqual([]);
      expect(await inline("'enabled' | 'group'")).toEqual([]);
      expect(await inline('?group=')).toEqual([]);
    });

    it('does not fail on a missing anchor inside code-like inline code', async () => {
      expect(await inline('NgDocPage.missing()')).toEqual([]);
    });
  });

  describe('TypeScript code blocks', () => {
    it('links imports, type annotations, class names, calls and arguments', async () => {
      expect(
        await block('typescript', [
          'import',
          ' { ',
          'NgDocSize',
          ' } ',
          'from',
          " '@ng-doc/ui-kit'",
          ';',
        ]),
      ).toEqual(['NgDocSize']);
      expect(
        await block('ts', ['const', ' size', ': ', 'NgDocSize', ' = ', "'small'", ';']),
      ).toEqual(['NgDocSize']);
      expect(await block('ts', ['export', ' class', ' NgDocPage', ' {}'])).toEqual(['NgDocPage']);
      expect(await block('ts', ['provideNgDocApp', '(', 'group', ')'])).toEqual([
        'provideNgDocApp',
        'group',
      ]);
      expect(await block('ts', ['of', '(', '1', ')'])).toEqual(['of']);
      expect(await block('ts', ['type', ' Size', ' = ', 'NgDocSize', ';'])).toEqual(['NgDocSize']);
      expect(await block('ts', ['export', ' type', ' NgDocSize', ' = ', "'s'", ';'])).toEqual([
        'NgDocSize',
      ]);
    });

    it('does not link object keys, declared names and strings', async () => {
      expect(
        await block('typescript', [
          '  primaryColor',
          ': { ',
          'label',
          ': ',
          "'Primary color'",
          ', ',
          'group',
          ': ',
          "'Colors'",
          ' },',
        ]),
      ).toEqual([]);
      expect(await block('ts', ['  group', '?: ', 'string', ';'])).toEqual([]);
      expect(await block('ts', ['  readonly', ' group', '!: ', 'NgDocSize', ';'])).toEqual([
        'NgDocSize',
      ]);
      expect(await block('ts', ['  group', ' = ', 'input', '();'])).toEqual(['input']);
      expect(await block('ts', ['"group"', ' + ', '`config ${', 'group', '}`'])).toEqual(['group']);
      expect(await block('ts', ['// group', '\n', '/* config */'])).toEqual([]);
    });

    it('reads the code around a word past comments', async () => {
      expect(await block('ts', ['// Ends with a dot.', '\n', 'provideNgDocApp', '()'])).toEqual([
        'provideNgDocApp',
      ]);
      expect(await block('ts', ['group', ' /* key */ ', ':', ' 1'])).toEqual([]);
    });

    it('links generic constraints and defaults', async () => {
      expect(
        await block('ts', [
          'class',
          ' A',
          '&#x3C;',
          'T',
          ' extends',
          ' NgDocPage',
          ' = ',
          'NgDocPage',
          '>',
        ]),
      ).toEqual(['NgDocPage', 'NgDocPage']);
    });

    it('links the custom elements of an inline template', async () => {
      const keywords = {
        ...KEYWORDS,
        'ng-content': { title: 'ng-content', path: 'https://angular.dev/api/core/ng-content' },
      };
      const html = await replaceKeywords(
        '<pre><code class="language-ts"><span>`&#x3C;ng-content>&#x3C;/ng-content>' +
          '&#x3C;input [value]="ng-content" /> ng-content`</span></code></pre>',
        { getKeyword: (key: string) => keywords[key] },
      );

      expect(links(html)).toEqual(['ng-content', 'ng-content']);
    });

    it('links only the control flow blocks of an inline template', async () => {
      expect(
        await block('angular-ts', [
          'template',
          ': ',
          '`',
          '@if (group) { &#x3C;input [value]="config" /> }',
          '`',
        ]),
      ).toEqual([]);
      const keywords = {
        ...KEYWORDS,
        '@if': { title: '@if', path: 'https://angular.dev/api/core/@if' },
      };
      const html = await replaceKeywords(
        '<pre><code class="language-ts"><span>`\n  @if (a) { input }`</span></code></pre>',
        { getKeyword: (key: string) => keywords[key] },
      );

      expect(links(html)).toEqual(['@if']);
    });

    it('links a value in a ternary and a case label', async () => {
      expect(await block('ts', ['a', ' ? ', 'group', ' : ', 'config'])).toEqual([
        'group',
        'config',
      ]);
      expect(await block('ts', ['case', ' group', ':'])).toEqual(['group']);
    });

    it('does not link reserved words unless they are called', async () => {
      expect(
        await block('ts', ['  readonly', ' size', ' = ', 'input', '<', 'NgDocSize', '>();']),
      ).toEqual(['input', 'NgDocSize']);
      expect(await block('ts', ['readonly', '(', 'path', ')'])).toEqual(['readonly']);
    });

    it('links a member after a dot only as a whole Owner.member keyword', async () => {
      expect(await block('ts', ['NgDocPage', '.', 'title'])).toEqual(['NgDocPage', 'title']);
      expect(
        await replaceKeywords(
          '<pre><code class="language-ts"><span>NgDocPage</span><span>.</span><span>title</span></code></pre>',
          { getKeyword },
        ),
      ).toContain('<a href="/api/ng-doc-page#title"');
      expect(await block('ts', ['this', '.', 'group', '.', 'config'])).toEqual([]);
      expect(await block('ts', ['options', '?.', 'group'])).toEqual([]);
      expect(await block('ts', ['...', 'group'])).toEqual(['group']);
    });

    it('does not link names the code binds itself', async () => {
      expect(
        await block('ts', [
          'const',
          ' config',
          ': ',
          'NgDocPage',
          ' = {};\n',
          'export',
          ' default',
          ' config',
          ';',
        ]),
      ).toEqual(['NgDocPage']);
      expect(
        await block('ts', [
          'import',
          ' { config } ',
          'from',
          " './app.config'",
          ';\n',
          'bootstrap',
          '(',
          'config',
          ');',
        ]),
      ).toEqual([]);
      expect(
        await block('ts', ['import', ' { config } ', 'from', " 'rxjs'", ';\n', 'config', ';']),
      ).toEqual(['config', 'config']);
    });

    it('keeps language restrictions', async () => {
      expect(await block('ts', ['ng-doc-tab'])).toEqual([]);
      expect(await block('css', ['NgDocPage'])).toEqual([]);
    });
  });

  describe('HTML code blocks', () => {
    it('links selectors in tag and attribute names', async () => {
      expect(
        await block('html', ['&#x3C;', 'ng-doc-tab', '>', '&#x3C;/', 'ng-doc-tab', '>']),
      ).toEqual(['ng-doc-tab', 'ng-doc-tab']);
      expect(
        await block('html', ['&#x3C;', 'button', ' ng-doc-button', '>Go&#x3C;/', 'button', '>']),
      ).toEqual(['ng-doc-button']);
    });

    it('does not link attribute values, comments or keywords without the HTML language', async () => {
      expect(
        await block('html', [
          '&#x3C;',
          'div',
          ' class',
          '=',
          '"ng-doc-button"',
          ' group',
          '=',
          '"a"',
          '>',
        ]),
      ).toEqual([]);
      expect(await block('html', ['&#x3C;!-- ', 'ng-doc-tab', ' -->'])).toEqual([]);
      expect(await block('html', ['&#x3C;', 'a', ' x', '=', 'ng-doc-tab', '>'])).toEqual([]);
    });
  });

  describe('used keywords', () => {
    it('records only the words that may link', async () => {
      const { usedKeywords } = await postProcessHtml(
        '<p><code>vite.ng-doc.config.mjs</code><code>NgDocPage.title</code><code>group="…"</code></p>' +
          '<pre><code class="language-ts"><span>NgDocPage</span><span>.</span><span>title</span>' +
          "<span>, </span><span>group</span><span>: </span><span>'x'</span></code></pre>",
      );

      expect(usedKeywords.sort()).toEqual(['NgDocPage', 'NgDocPage.title']);
    });
  });
});
