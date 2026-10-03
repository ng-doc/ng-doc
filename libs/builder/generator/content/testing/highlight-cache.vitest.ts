import { NG_DOC_SYNTAX_THEME_NAME } from '@ng-doc/core';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContentCompilerServices, Diagnostic } from '../../contracts';
import { HIGHLIGHT_CACHE_FLAG } from '../../kernel/flags';
import { GeneratorContentCompiler } from '../content-compiler';
import {
  type HighlightBlock,
  createHighlightSession,
  HIGHLIGHT_CACHE_LIMIT,
  HIGHLIGHT_CACHE_MISMATCH,
  highlightCacheSwitch,
  HighlightSession,
  resetHighlightCache,
} from '../highlight-cache';

// The cache of highlighted code blocks: `processHtml` with it is byte-equal to `processHtml`
// without it, with the cache cold, warm, read from a pack and corrupted, over every code block of
// NgDoc's own documentation; and the pack is read and written only as the generation allows.

const writes = vi.hoisted(() => ({ fail: undefined as NodeJS.ErrnoException | undefined }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: (...args: Parameters<typeof actual.writeFile>) =>
      writes.fail ? Promise.reject(writes.fail) : actual.writeFile(...args),
  };
});

const packages = vi.hoisted(() => ({ shiki: '1.10.3' as string | null }));
vi.mock('../../kernel/runtime-identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../kernel/runtime-identity')>();
  return {
    runtimePackages: () => ({ ...actual.runtimePackages(), shiki: packages.shiki }),
  };
});

const { processHtml } = await import('@ng-doc/utils');

const roots: string[] = [];
afterEach(() => {
  resetHighlightCache();
  vi.unstubAllEnvs();
  writes.fail = undefined;
  packages.shiki = '1.10.3';
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporary(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'highlight-cache-')));
  roots.push(root);
  return root;
}

const SITE_THEMES = { light: NG_DOC_SYNTAX_THEME_NAME, dark: NG_DOC_SYNTAX_THEME_NAME };
const site = path.resolve(import.meta.dirname, '../../../../../apps/ng-doc');

const configuration = (cacheRoot: string, themes = SITE_THEMES) => ({
  cacheEnabled: true,
  cacheRoot,
  themes,
});

const development = { mode: 'development' as const };

/** A content compiler: the corpus is rendered by its own Markdown renderer. */
const compiler = (highlight?: HighlightSession) =>
  new GeneratorContentCompiler(
    {
      configuration: { anchorHeadings: ['h1', 'h2', 'h3', 'h4'], themes: SITE_THEMES },
    } as unknown as ContentCompilerServices,
    highlight,
  );

const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory()
        ? files(path.join(directory, item.name))
        : [path.join(directory, item.name)],
    )
    .sort();

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Every code block of the site's guides, as the content compiler renders each Markdown file (code
 * snippets read from files included), and every demo source as a code block of its language; then
 * the edge cases.
 */
function corpus(): string[] {
  const render = compiler() as unknown as {
    markdownToHtml(markdown: string, context: string, d: unknown[], g: Diagnostic[]): string;
  };
  const documents: string[] = [];
  for (const file of files(path.join(site, 'docs'))) {
    const extension = path.extname(file);
    if (extension === '.md')
      documents.push(render.markdownToHtml(readFileSync(file, 'utf8'), path.dirname(file), [], []));
    else if (['.ts', '.html', '.scss', '.css'].includes(extension))
      documents.push(
        `<pre><code class="language-${extension.slice(1)}" lang="${extension.slice(1)}" metastring="{\\&quot;name\\&quot;:\\&quot;${path.basename(file)}\\&quot;}">${escape(readFileSync(file, 'utf8'))}</code></pre>`,
      );
  }
  const block = (language: string | undefined, text: string, meta = '') =>
    `<pre><code${language ? ` class="language-${language}" lang="${language}"` : ''} metastring="${meta}">${text}</code></pre>`;
  documents.push(
    block(undefined, 'const noLanguageClass = 1;'),
    block('not-a-language', 'falls back to text'),
    block(
      'typescript',
      'a();\nb();\nc();',
      '{\\&quot;highlightedlines\\&quot;:\\&quot;[2]\\&quot;}',
    ),
    `<pre><code class="language-mermaid" lang="mermaid">graph TD; A--&gt;B</code></pre>`,
    block('typescript', ''),
    block('typescript', 'const crlf = 1;\r\nconst lines = 2;\r\n'),
    `${block('html', '&lt;p&gt;twice&lt;/p&gt;')}${block('html', '&lt;p&gt;twice&lt;/p&gt;')}`,
    `<div><ng-doc-tab group="g" name="a.ts" icon=""><pre><code class="language-typescript" lang="typescript" metastring="">const tab = 1;</code></pre></ng-doc-tab></div><div><ng-doc-tab group="g" name="a.html" icon="" active><pre><code class="language-html" lang="html" metastring="">&lt;p&gt;tab&lt;/p&gt;</code></pre></ng-doc-tab></div>`,
    '<h2>No code</h2><p>Only text.</p>',
  );
  return documents;
}

const MALFORMED = `<pre><code class="language-typescript" metastring="">ok();</code></pre><pre><code class="language-typescript" metastring="{broken">x</code></pre>`;

const options = (highlight?: HighlightSession) => ({
  headings: ['h1', 'h2', 'h3', 'h4'],
  route: 'docs/page',
  lightTheme: SITE_THEMES.light,
  darkTheme: SITE_THEMES.dark,
  ...(highlight ? { highlight: highlight.call() } : {}),
});

const packOf = (root: string) => readdirSync(root).find((name) => name.endsWith('.highlight.json'));

describe('processHtml with the highlight cache', () => {
  const documents = corpus();

  it('is byte-equal to highlighting every block, over every code block of the site', async () => {
    expect(documents.length).toBeGreaterThan(70);
    const expected = [];
    for (const html of documents) expected.push(await processHtml(html, options()));
    const blocks = expected.reduce(
      (total, result) => total + (result.content.match(/<pre class="shiki/g)?.length ?? 0),
      0,
    );
    expect(blocks).toBeGreaterThan(350);
    expect(expected.every((result) => !result.error)).toBe(true);

    const root = temporary();
    const run = async (label: string) => {
      const session = createHighlightSession(
        { projectId: 'site' },
        development,
        configuration(root),
      );
      for (const [index, html] of documents.entries())
        expect(await processHtml(html, options(session)), `${label} ${index}`).toEqual(
          expected[index],
        );
      return session!;
    };
    // Cold, then warm from this runtime's memory, then saved and read by a fresh runtime.
    await (await run('cold')).save(true);
    const pack = path.join(root, packOf(root)!);
    const written = readFileSync(pack, 'utf8');
    await run('warm');
    resetHighlightCache();
    const fromPack = await run('pack');
    await fromPack.save(true);
    expect(readFileSync(pack, 'utf8')).toBe(written);

    // A pack whose every entry is corrupt only misses.
    const parsed = JSON.parse(written) as { entries: Record<string, string> };
    for (const key of Object.keys(parsed.entries)) parsed.entries[key] = '[{"type":"text"}]';
    writeFileSync(pack, JSON.stringify(parsed));
    resetHighlightCache();
    await (await run('corrupt')).save(true);
    expect(readFileSync(pack, 'utf8')).toBe(written);
  }, 300_000);

  it('processing the same document twice from memory gives identical output', async () => {
    const session = createHighlightSession({ projectId: 'site' }, development, {
      ...configuration(temporary()),
      cacheEnabled: false,
    });
    const html = documents.find((item) => (item.match(/<pre>/g)?.length ?? 0) > 3)!;
    const first = await processHtml(html, options(session));
    const second = await processHtml(html, options(session));
    const third = await processHtml(html, options(session));
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('keeps the error of a failing block and stores nothing for it', async () => {
    const expected = await processHtml(MALFORMED, options());
    expect(expected.error).toBeDefined();
    const root = temporary();
    const session = createHighlightSession({ projectId: 'site' }, development, configuration(root));
    const call = session!.call();
    const result = await processHtml(MALFORMED, { ...options(), highlight: call });
    expect(String(result.error)).toBe(String(expected.error));
    await session!.save(true);
    const pack = JSON.parse(readFileSync(path.join(root, packOf(root)!), 'utf8'));
    // Only the block before the failing one.
    expect(Object.keys(pack.entries)).toHaveLength(1);
  });
});

describe('the key', () => {
  const block: HighlightBlock = {
    options: { format: 1 },
    themes: { light: 'a', dark: 'b' },
    lang: 'ts',
    meta: '',
    code: 'x',
  };
  const key = (
    changed: Partial<HighlightBlock> = {},
    themes = SITE_THEMES as { light: string; dark: string },
  ) =>
    createHighlightSession({ projectId: 'site' }, development, configuration('/cache', themes))!
      .call()
      .key({ ...block, ...changed });

  it('changes with every part of the block, each theme and the Shiki release', () => {
    const base = key();
    expect(key()).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    const variants = [
      key({ code: 'y' }),
      key({ lang: 'js' }),
      key({ meta: '{}' }),
      key({ options: { format: 2 } }),
      key({ themes: { light: 'c', dark: 'b' } }),
      key({}, { light: 'github-light', dark: NG_DOC_SYNTAX_THEME_NAME }),
      key({}, { light: NG_DOC_SYNTAX_THEME_NAME, dark: 'github-dark' }),
    ];
    packages.shiki = '9.9.9';
    variants.push(key());
    packages.shiki = null;
    variants.push(key());
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1);
  });
});

describe('the switch and the session', () => {
  it('reads the option and NGDOC_HIGHLIGHT_CACHE', () => {
    expect(highlightCacheSwitch({})).toBe('on');
    expect(highlightCacheSwitch({ highlightCache: true })).toBe('on');
    expect(highlightCacheSwitch({ highlightCache: false })).toBe('off');
    expect(highlightCacheSwitch({ highlightCache: 'verify' })).toBe('verify');
    vi.stubEnv(HIGHLIGHT_CACHE_FLAG, 'verify');
    expect(highlightCacheSwitch({})).toBe('verify');
    expect(highlightCacheSwitch({ highlightCache: false })).toBe('off');
    vi.stubEnv(HIGHLIGHT_CACHE_FLAG, 'off');
    expect(highlightCacheSwitch({ highlightCache: 'verify' })).toBe('off');
  });

  it('keeps a pack only in development with the cache, and none on the reference path', () => {
    const root = temporary();
    const on = createHighlightSession({ projectId: 'site' }, development, configuration(root));
    expect(on?.pack).toBe(path.join(root, packOf(root) ?? path.basename(on!.pack!)));
    expect(path.basename(on!.pack!)).toMatch(/^[0-9a-f]{64}\.highlight\.json$/);
    expect(on?.verify).toBe(false);
    const production = createHighlightSession(
      { projectId: 'site' },
      { mode: 'production' },
      configuration(root),
    );
    expect(production).toBeDefined();
    expect(production?.pack).toBeUndefined();
    const uncached = createHighlightSession({ projectId: 'site' }, development, {
      ...configuration(root),
      cacheEnabled: false,
    });
    expect(uncached?.pack).toBeUndefined();
    expect(
      createHighlightSession(
        { projectId: 'site', incrementalReuse: false },
        development,
        configuration(root),
      ),
    ).toBeUndefined();
    expect(
      createHighlightSession(
        { projectId: 'site', highlightCache: false },
        development,
        configuration(root),
      ),
    ).toBeUndefined();
    expect(
      createHighlightSession(
        { projectId: 'site', highlightCache: 'verify' },
        development,
        configuration(root),
      )?.verify,
    ).toBe(true);
  });

  it('keeps entries across generations of a runtime, and proves the themes it highlighted', async () => {
    const first = new HighlightSession(SITE_THEMES, false, undefined).call();
    expect(first.loads(SITE_THEMES)).toBe(false);
    first.set('k', '[]');
    expect(first.loads(SITE_THEMES)).toBe(true);
    expect(first.loads({ light: 'github-light', dark: NG_DOC_SYNTAX_THEME_NAME })).toBe(false);
    const next = new HighlightSession(SITE_THEMES, false, undefined).call();
    expect(next.get('k')).toBe('[]');
    expect(next.get('missing')).toBeUndefined();
    expect(next.loads(SITE_THEMES)).toBe(true);
    // Other themes are another context.
    expect(
      new HighlightSession({ light: 'github-light', dark: 'ayu-dark' }, false, undefined)
        .call()
        .loads({ light: 'github-light', dark: 'ayu-dark' }),
    ).toBe(false);
  });

  it('starts again from the pack when the map outgrows the limit', () => {
    const call = new HighlightSession(SITE_THEMES, false, undefined).call();
    call.set('big', 'x'.repeat(HIGHLIGHT_CACHE_LIMIT + 1));
    call.set('small', '[]');
    expect(new HighlightSession(SITE_THEMES, false, undefined).call().get('small')).toBe(undefined);
  });
});

describe('the pack', () => {
  const session = (root: string, verify = false) =>
    createHighlightSession(
      { projectId: 'site', ...(verify ? { highlightCache: 'verify' as const } : {}) },
      development,
      configuration(root),
    )!;
  const html = `<pre><code class="language-typescript" metastring="">const one = 1;</code></pre><pre><code class="language-css" metastring="">a { color: red; }</code></pre>`;

  async function warm(root: string): Promise<{ file: string; text: string }> {
    const first = session(root);
    await processHtml(html, options(first));
    await first.save(true);
    const file = path.join(root, packOf(root)!);
    resetHighlightCache();
    return { file, text: readFileSync(file, 'utf8') };
  }

  it('is written once, sorted, and not again while it holds the same entries', async () => {
    const root = temporary();
    const { file, text } = await warm(root);
    const pack = JSON.parse(text);
    expect(pack.version).toBe(1);
    expect(pack.context).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(pack.entries)).toEqual(Object.keys(pack.entries).sort());
    expect(Object.keys(pack.entries)).toHaveLength(2);
    utimesSync(file, new Date(1_000_000), new Date(1_000_000));
    const before = statSync(file);
    const again = session(root);
    await processHtml(html, options(again));
    await again.save(true);
    expect(statSync(file).mtimeMs).toBe(before.mtimeMs);
    // Edited behind its back: written again.
    writeFileSync(file, text.replace('"version":1', '"version": 1'));
    await again.save(true);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });

  it('keeps the earlier entries unless the generation rendered every content', async () => {
    const root = temporary();
    const { file } = await warm(root);
    const other =
      '<pre><code class="language-typescript" metastring="">const two = 2;</code></pre>';
    const partial = session(root);
    await processHtml(other, options(partial));
    await partial.save(false);
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).entries)).toHaveLength(3);
    const complete = session(root);
    await processHtml(other, options(complete));
    await complete.save(true);
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).entries)).toHaveLength(1);
  });

  it('keeps only the generation entries when the earlier ones would exceed the limit', async () => {
    const root = temporary();
    const big = session(root);
    big.call().set('big', 'x'.repeat(HIGHLIGHT_CACHE_LIMIT));
    await big.save(true);
    const file = path.join(root, packOf(root)!);
    // The pack with the oversized entry is read, and dropped by the next generation's save.
    resetHighlightCache();
    const next = session(root);
    await processHtml(html, options(next));
    await next.save(false);
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).entries)).toHaveLength(2);
  }, 60_000);

  it.each([
    ['truncated', (text: string) => text.slice(0, text.length / 2)],
    ['of another version', (text: string) => text.replace('"version":1', '"version":2')],
    [
      'of another context',
      (text: string) => text.replace(/"context":"[0-9a-f]+"/, '"context":"x"'),
    ],
    ['with an entry that is not a string', (text: string) => text.replace(/:"\[/, ':[0,"[')],
    ['not an object', () => '[]'],
    ['without entries', () => '{"version":1,"context":"x"}'],
  ])('a pack that is %s is not read and leaves output unchanged', async (_, damage) => {
    const root = temporary();
    const { file, text } = await warm(root);
    writeFileSync(file, damage(text));
    const expected = await processHtml(html, options());
    const fresh = session(root);
    const call = fresh.call();
    expect(await processHtml(html, { ...options(), highlight: call })).toEqual(expected);
    expect(call.loads(SITE_THEMES)).toBe(true); // proven by highlighting, not by the pack
    await fresh.save(true);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });

  it('an unreadable pack is a miss', async () => {
    const root = temporary();
    const { file } = await warm(root);
    rmSync(file);
    mkdirSync(file);
    const expected = await processHtml(html, options());
    const fresh = session(root);
    expect(await processHtml(html, options(fresh))).toEqual(expected);
    // Saving over a directory fails, and is only best effort.
    await expect(fresh.save(true)).resolves.toBeUndefined();
  });

  it('a failed save (ENOSPC) leaves output unchanged and leaves no temporary file', async () => {
    const root = temporary();
    const expected = await processHtml(html, options());
    const first = session(root);
    expect(await processHtml(html, options(first))).toEqual(expected);
    writes.fail = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    await expect(first.save(true)).resolves.toBeUndefined();
    expect(readdirSync(root)).toEqual([]);
    writes.fail = undefined;
    await first.save(true);
    expect(packOf(root)).toBeDefined();
  });

  it('sweeps the stale temporary files of an interrupted save', async () => {
    const root = temporary();
    const first = session(root);
    await processHtml(html, options(first));
    await first.save(true);
    const name = packOf(root)!;
    const stale = path.join(root, `${name}.dead.tmp`);
    const recent = path.join(root, `${name}.live.tmp`);
    writeFileSync(stale, 'x');
    writeFileSync(recent, 'x');
    utimesSync(stale, new Date(0), new Date(0));
    const next = session(root);
    await processHtml(`<pre><code class="language-ts">changed();</code></pre>`, options(next));
    await next.save(true);
    expect(readdirSync(root).sort()).toEqual([name, `${name}.live.tmp`].sort());
  });

  it('verify highlights a tampered entry again, uses the fresh result and reports it', async () => {
    const root = temporary();
    const { file, text } = await warm(root);
    const pack = JSON.parse(text) as { entries: Record<string, string> };
    const [first] = Object.keys(pack.entries);
    pack.entries[first!] = pack.entries[first!]!.replace(
      '"properties":{',
      '"properties":{"x":"1",',
    );
    writeFileSync(file, JSON.stringify(pack));
    const expected = await processHtml(html, options());

    // Through the content compiler: the fresh result, and one warning.
    const verified = session(root, true);
    const diagnostics: Diagnostic[] = [];
    const processed = await (
      compiler(verified) as unknown as {
        process(
          html: string,
          route: string,
          dependencies: unknown[],
          diagnostics: Diagnostic[],
          signal: AbortSignal,
        ): Promise<{ html: string } | undefined>;
      }
    ).process(html, 'docs/page', [], diagnostics, new AbortController().signal);
    expect(processed?.html).toBeDefined();
    expect(processed?.html).not.toContain('x="1"');
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: HIGHLIGHT_CACHE_MISMATCH, severity: 'warning' }),
    ]);
    // The repaired entry is written back.
    await verified.save(true);
    expect(readFileSync(file, 'utf8')).toBe(text);

    // Without verify, a tampered entry would have been used.
    resetHighlightCache();
    writeFileSync(file, JSON.stringify(pack));
    const used = await processHtml(html, options(session(root)));
    expect(used.content).toContain('x="1"');
    expect(used.content).not.toBe(expected.content);
  });
});
