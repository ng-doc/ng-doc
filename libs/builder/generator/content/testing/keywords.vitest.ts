import { describe, expect, it } from 'vitest';

// The generator loads the HTML utilities lazily (see content-compiler.ts); so does this test.
const { replaceKeywords } = await import('@ng-doc/utils');

const known = new Map([
  [
    'Known',
    {
      key: 'Known',
      title: 'Known title',
      path: 'docs/known',
      type: 'link' as const,
    },
  ],
  [
    'Thing',
    {
      key: 'Thing',
      title: 'Thing',
      path: 'api/thing',
    },
  ],
]);

describe('replaceKeywords', () => {
  it('fails on a missing guide or API-anchor keyword', async () => {
    const getKeyword = (key: string) => known.get(key);

    await expect(replaceKeywords('<p><code>*missing</code></p>', { getKeyword })).rejects.toThrow(
      'Route with keyword "*missing" is missing.',
    );
    await expect(
      replaceKeywords('<p><code>Thing#missing</code></p>', { getKeyword }),
    ).rejects.toThrow('Route with keyword "Thing#missing" is missing.');
  });

  it('links known inline keys and keeps block keywords to their allowed languages', async () => {
    const getKeyword = (key: string) => known.get(key);

    expect(await replaceKeywords('<p><code>Known</code></p>', { getKeyword })).toContain(
      '<a href="docs/known" class="ngde">Known title</a>',
    );
    const html = await replaceKeywords('<pre><code class="language-css">Known</code></pre>', {
      getKeyword,
    });

    expect(html).toContain('<code class="language-css">Known</code>');
    expect(html).not.toContain('<a');
  });
});
