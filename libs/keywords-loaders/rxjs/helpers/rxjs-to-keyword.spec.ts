import { describe, expect, it } from 'vitest';

import { rxjsPageToKeyword } from './rxjs-to-keyword';

describe('rxjsPageToKeyword', () => {
  it('links an RxJS page by its title, with the hover description', () => {
    expect(rxjsPageToKeyword({ title: 'debounce', path: 'api/operators/debounce' })).toEqual([
      'debounce',
      {
        title: 'debounce',
        url: 'https://rxjs.dev/api/operators/debounce',
        description: 'External link to the RxJS documentation.',
      },
    ]);
  });
});
