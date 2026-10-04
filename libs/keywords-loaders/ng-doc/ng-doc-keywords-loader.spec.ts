import fetch from 'node-fetch';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ngDocKeywordsLoader } from './ng-doc-keywords-loader';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

const keywords = {
  NgDocPage: { title: 'NgDocPage', path: '/docs/api/interfaces/core/NgDocPage', type: 'interface' },
  '*Installation': { title: 'Installation', path: '/docs/get-started/installation' },
  '*Installation#prerequisites': {
    title: 'Prerequisites',
    path: '/docs/get-started/installation#prerequisites',
  },
};

/** Answers the next `keywords.json` request with {@link keywords}. */
function serve(): void {
  vi.mocked(fetch).mockResolvedValue({ json: async () => keywords } as never);
}

describe('ngDocKeywordsLoader', () => {
  afterEach(() => vi.mocked(fetch).mockReset());

  it('loads the API keywords of the site, and no page keywords by default', async () => {
    serve();

    const loaded = await ngDocKeywordsLoader({ endpoint: 'https://docs.example.com/' })();

    expect(fetch).toHaveBeenCalledWith('https://docs.example.com/assets/ng-doc/keywords.json');
    expect(loaded).toStrictEqual({
      NgDocPage: {
        title: 'NgDocPage',
        url: 'https://docs.example.com/docs/api/interfaces/core/NgDocPage',
        description: undefined,
        type: 'interface',
      },
    });
  });

  it('loads no page keywords with loadGuides: false, even with a prefix', async () => {
    serve();

    const loaded = await ngDocKeywordsLoader({
      endpoint: 'https://docs.example.com',
      loadGuides: false,
      guidesPrefix: 'Extra',
    })();

    expect(Object.keys(loaded)).toStrictEqual(['NgDocPage']);
  });

  it('loads the page keywords and their anchors with loadGuides, under the prefix', async () => {
    serve();

    const loaded = await ngDocKeywordsLoader({
      endpoint: 'https://docs.example.com',
      assetsPath: '/static/ng-doc',
      loadGuides: true,
      guidesPrefix: 'Extra',
    })();

    expect(fetch).toHaveBeenCalledWith('https://docs.example.com/static/ng-doc/keywords.json');
    expect(Object.keys(loaded)).toStrictEqual([
      'NgDocPage',
      '*ExtraInstallation',
      '*ExtraInstallation#prerequisites',
    ]);
    expect(loaded['*ExtraInstallation#prerequisites']).toStrictEqual({
      title: 'Prerequisites',
      url: 'https://docs.example.com/docs/get-started/installation#prerequisites',
      description: undefined,
      type: undefined,
    });
  });
});
