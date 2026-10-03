import { describe, expect, it, vi } from 'vitest';

import { buildIndexes } from '../build-indexes';

// The engine loads `@ng-doc/utils` as an ES module at run time; load its sources instead.
vi.mock('../import-esm', () => ({ importEsm: () => import('@ng-doc/utils') }));

describe('buildIndexes', () => {
  it('names sections without the heading emoji and the whitespace around the text', async () => {
    const indexes = await buildIndexes({
      title: ' Dev server ',
      content:
        '<p>Intro</p>' +
        '<h2 id="choose-a-host"><span aria-hidden="true">🆚</span> Choose a host</h2>' +
        '<p>Body</p>',
      breadcrumbs: ['Build'],
      pageType: 'guide',
      route: 'docs/dev-server',
    });

    expect(indexes).toStrictEqual([
      {
        breadcrumbs: ['Build'],
        pageType: 'guide',
        title: 'Dev server',
        section: '',
        route: 'docs/dev-server',
        fragment: undefined,
        content: 'Intro',
      },
      {
        breadcrumbs: ['Build'],
        pageType: 'guide',
        title: 'Dev server',
        section: 'Choose a host',
        route: 'docs/dev-server',
        fragment: 'choose-a-host',
        content: 'Body',
      },
    ]);
  });
});
