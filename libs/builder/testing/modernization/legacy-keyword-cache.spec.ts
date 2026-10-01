import { EMPTY, from, map } from 'rxjs';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { ObservableMap } from '../../classes/observable-map';
import { contentBuilder } from '../../engine/builders/shared/content.builder';
import { BuilderDone } from '../../engine/core/types';
import { UTILS } from '../../helpers';

let strategy: any;
let include: (key: string) => boolean;
let exclude: (key: string) => boolean;
const store = new ObservableMap<string, any>();
vi.mock('../../helpers', () => ({
  UTILS: { processHtml: vi.fn(), postProcessHtml: vi.fn() },
}));
vi.mock('@ng-doc/builder', () => ({
  createBuilder: (_triggers: unknown, project: () => unknown) => project(),
  createMainTrigger: () => ({}),
  createSecondaryTrigger: () => ({}),
  isBuilderDone: (state: unknown) => state instanceof BuilderDone,
  onKeywordsTouch: (a: typeof include, b: typeof exclude) => {
    include = a;
    exclude = b;
    return EMPTY;
  },
}));
vi.mock('../../engine/core/triggers/on-dependencies-change', () => ({
  onDependenciesChange: () => EMPTY,
}));
vi.mock('../../engine/core', () => ({
  get keywordsStore() {
    return store;
  },
  touchKeywords: vi.fn(),
  watchFile: () => EMPTY,
  runBuild: (_tag: string, build: () => Promise<string>, cache: any) => {
    strategy = cache;
    return () => from(build()).pipe(map((value) => new BuilderDone('content', value)));
  },
}));

const keyword = { title: 'Page', path: '/page', type: 'link' };
function build() {
  return contentBuilder({
    tag: 'fixture',
    context: { config: {} } as never,
    mainFilePath: '/page.md',
    cacheId: 'fixture',
    metadata: { path: '/page.ts', absoluteRoute: () => '/page' } as never,
    getContent: async (dependencies) => {
      dependencies.add('/include.md');
      return 'markdown';
    },
    getKeywords: () => [['*Page', keyword]],
  });
}
async function settle(source: ReturnType<typeof build>) {
  await new Promise<void>((resolve, reject) =>
    source.subscribe({ next: () => resolve(), error: reject }),
  );
}
describe('keyword state/cache contracts (isolated renderer)', () => {
  beforeEach(() => {
    store.clear();
    (UTILS.processHtml as Mock).mockResolvedValue({ content: 'html', anchors: [] });
    (UTILS.postProcessHtml as Mock).mockResolvedValue({
      content: 'result',
      usedKeywords: ['*Other'],
    });
  });
  it('serializes fresh exported keywords, dependencies and consumed bindings', async () => {
    await settle(build());
    expect(strategy.getData()).toEqual({
      dependencies: ['/include.md'],
      keywords: [['*Page', keyword]],
      usedKeywords: ['*Other'],
    });
  });
  it('touch predicates read replacement sets after processing and cache restoration', async () => {
    await settle(build());
    expect(include('*Other')).toBe(true);
    expect(exclude('*Page')).toBe(true);
    strategy.onCacheLoad({
      dependencies: [],
      keywords: [['*Restored', keyword]],
      usedKeywords: ['*Missing'],
    });
    expect(include('*Missing')).toBe(true);
    expect(include('*Other')).toBe(false);
    expect(exclude('*Restored')).toBe(true);
  });
});
