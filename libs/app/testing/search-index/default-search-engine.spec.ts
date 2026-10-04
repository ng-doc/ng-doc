import '@angular/compiler';

import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { NgDocDefaultSearchEngine } from '@ng-doc/app/classes/default-search-engine';
import { NgDocSearchEngine } from '@ng-doc/app/classes/search-engine';
import { provideSearchEngine } from '@ng-doc/app/providers/search-engine';
import type { NgDocPageIndex } from '@ng-doc/core/interfaces';
import { EMPTY, firstValueFrom } from 'rxjs';
import { expect, test, vi } from 'vitest';

TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

/**
 * A search record whose title, section and content are the given title.
 * @param title - The title.
 * @param pageType - The type of the page.
 */
function record(title: string, pageType: NgDocPageIndex['pageType'] = 'guide'): NgDocPageIndex {
  return {
    breadcrumbs: ['Docs'],
    pageType,
    title,
    section: title,
    route: title,
    content: title,
  };
}

/**
 * Makes `fetch` answer with the given index for the duration of a test.
 * @param pages - The records of the index.
 */
function serve(pages: NgDocPageIndex[]): () => void {
  const originalFetch = globalThis.fetch;

  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: vi.fn().mockImplementation(async () => new Response(JSON.stringify(pages))),
  });

  return () =>
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
}

async function titles(engine: NgDocDefaultSearchEngine, query: string): Promise<string[]> {
  return (await firstValueFrom(engine.search(query))).map((result) => result.index.title);
}

test('does not fetch an HTTP index when constructing an unused SSR search engine', () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('Relative HTTP requests are unavailable in Node');
  });
  try {
    const engine = new NgDocDefaultSearchEngine();
    engine.search('unsubscribed');
    TestBed.configureTestingModule({ providers: [provideSearchEngine(NgDocDefaultSearchEngine)] });
    TestBed.inject(NgDocSearchEngine).search('also unsubscribed');
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    TestBed.resetTestingModule();
    fetchMock.mockRestore();
  }
});

test('delivers HTTP failures to the search subscriber and retries a later query', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementationOnce(() => {
      throw new Error('HTTP unavailable');
    })
    .mockResolvedValue(new Response(JSON.stringify([record('Recovered guide')])));
  try {
    const engine = new NgDocDefaultSearchEngine();
    await expect(titles(engine, 'recovered')).rejects.toThrow('HTTP unavailable');
    expect(await titles(engine, 'recovered')).toEqual(['Recovered guide']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    fetchMock.mockRestore();
  }
});

test('keeps the production HTTP index fallback for direct construction', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => [record('File guide')],
  } as Response);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
  try {
    const engine = new NgDocDefaultSearchEngine();
    expect(await titles(engine, 'file')).toEqual(['File guide']);
    expect(fetchMock).toHaveBeenCalledWith('assets/ng-doc/indexes.json');
  } finally {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  }
});

test('reuses the completed HTTP database after sequential query subscriptions', async () => {
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: vi.fn().mockResolvedValue(new Response(JSON.stringify([record('HTTP guide')]))),
  });
  try {
    const engine = new NgDocDefaultSearchEngine();
    expect((await firstValueFrom(engine.search('http'))).length).toBe(1);
    expect((await firstValueFrom(engine.search('http'))).length).toBe(1);
  } finally {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  }
});

test('provides the default engine with the HTTP index through Angular DI', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => [record('Legacy guide')],
  } as Response);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
  try {
    TestBed.configureTestingModule({ providers: [provideSearchEngine(NgDocDefaultSearchEngine)] });
    const engine = TestBed.inject(NgDocSearchEngine);
    expect(
      (await firstValueFrom(engine.search('legacy'))).map((result) => result.index.title),
    ).toEqual(['Legacy guide']);
  } finally {
    TestBed.resetTestingModule();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  }
});

test('keeps custom search engine constructor arguments unchanged', () => {
  class CustomSearch extends NgDocSearchEngine {
    constructor(readonly marker: string) {
      super();
    }
    search() {
      return EMPTY;
    }
  }
  TestBed.configureTestingModule({ providers: [provideSearchEngine(CustomSearch, 'custom')] });
  expect(TestBed.inject(NgDocSearchEngine)).toBeInstanceOf(CustomSearch);
  expect((TestBed.inject(NgDocSearchEngine) as CustomSearch).marker).toBe('custom');
  TestBed.resetTestingModule();
});

test('ranks guides above API references and keeps relevance order in each group', async () => {
  const restore = serve([
    record('Theme', 'api'),
    record('Theme service themes', 'api'),
    { ...record('Colors', 'guide'), content: 'Colors of a theme.' },
    record('Theme', 'guide'),
  ]);
  try {
    const results = await firstValueFrom(new NgDocDefaultSearchEngine().search('theme'));

    expect(results.map(({ index }) => [index.pageType, index.title])).toEqual([
      ['guide', 'Theme'],
      ['guide', 'Colors'],
      ['api', 'Theme'],
      ['api', 'Theme service themes'],
    ]);
  } finally {
    restore();
  }
});

test('keeps the limit as the total: guides get up to half, API references the rest', async () => {
  const restore = serve([
    ...Array.from({ length: 5 }, (_, index) => record(`Button ${index}`, 'api')),
    ...Array.from({ length: 5 }, (_, index) => ({
      ...record(`Buttons guide ${index}`, 'guide'),
      title: `Styling ${index}`,
      section: `Styling ${index}`,
    })),
  ]);
  try {
    const results = await firstValueFrom(
      new NgDocDefaultSearchEngine({ limit: 5 }).search('button'),
    );

    expect(results.map(({ index }) => index.pageType)).toEqual([
      'guide',
      'guide',
      'guide',
      'api',
      'api',
    ]);
  } finally {
    restore();
  }
});

test('gives one type the whole limit when the other has fewer matches', async () => {
  const guides = Array.from({ length: 5 }, (_, index) => ({
    ...record(`Buttons guide ${index}`, 'guide'),
    title: `Styling ${index}`,
    section: `Styling ${index}`,
  }));
  const apis = Array.from({ length: 5 }, (_, index) => record(`Button ${index}`, 'api'));
  const types = async (pages: NgDocPageIndex[]): Promise<string[]> => {
    const restore = serve(pages);
    try {
      const results = await firstValueFrom(
        new NgDocDefaultSearchEngine({ limit: 4 }).search('button'),
      );

      return results.map(({ index }) => index.pageType);
    } finally {
      restore();
    }
  };

  // One API reference leaves three places to the guides; one guide leaves three to the API.
  expect(await types([...guides, apis[0]])).toEqual(['guide', 'guide', 'guide', 'api']);
  expect(await types([guides[0], ...apis])).toEqual(['guide', 'api', 'api', 'api']);
  expect(await types(apis)).toEqual(['api', 'api', 'api', 'api']);
});

test('highlights the searched properties only', async () => {
  const restore = serve([record('Api guide')]);
  try {
    const [result] = await firstValueFrom(new NgDocDefaultSearchEngine().search('guide'));

    expect(Object.keys(result.positions).sort()).toEqual(['content', 'section', 'title']);
    expect(result.positions.title).toEqual([{ start: 4, length: 5 }]);
  } finally {
    restore();
  }
});
