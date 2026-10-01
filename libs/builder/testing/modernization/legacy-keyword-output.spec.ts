import { defer, map, Subject } from 'rxjs';
import { expect, it, vi } from 'vitest';

import { ObservableMap } from '../../classes/observable-map';
import { ObservableSet } from '../../classes/observable-set';
import { keywordsBuilder } from '../../engine/builders/global/keywords.builder';
import { searchIndexesBuilder } from '../../engine/builders/global/search-indexes.builder';
import { createBuilder } from '../../engine/core/operators/create-builder';
import { BuilderDone } from '../../engine/core/types';

const store = new ObservableMap<string, any>();
const indexes = new ObservableSet<any>();
const after = new Subject<void>();
vi.mock('../../engine/core', () => ({
  get keywordsStore() {
    return store;
  },
  get IndexStore() {
    return indexes;
  },
  createBuilder: (...args: Parameters<typeof createBuilder>) => createBuilder(...args),
  createSecondaryTrigger: (trigger: unknown) => ({ type: 'secondary', trigger }),
  afterBuilders: () => after,
  runBuild: (_tag: string, build: () => Promise<any>) => () =>
    defer(build).pipe(map((value) => new BuilderDone('Keywords', value))),
}));
vi.mock('../../engine/builders/api-list/api-page-template.builder', () => ({
  API_PAGE_TEMPLATE_BUILDER_TAG: 'api',
}));
vi.mock('../../engine/builders/page/guide-template.builder', () => ({
  GUIDE_TEMPLATE_BUILDER_TAG: 'guide',
}));
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));
it('keyword output converges after late exports and removals without a main trigger', async () => {
  store.clear();
  const output: string[] = [];
  const subscription = keywordsBuilder({ outAssetsDir: '/assets' } as never).subscribe((state) => {
    if (state instanceof BuilderDone) output.push(state.result.content as string);
  });
  try {
    await wait();
    store.add(['*Late', { title: 'Late', path: '/late' }]);
    after.next();
    await wait();
    expect(JSON.parse(output.at(-1)!)).toHaveProperty('*Late');
    store.delete('*Late');
    after.next();
    await wait();
    expect(JSON.parse(output.at(-1)!)).toEqual({});
  } finally {
    subscription.unsubscribe();
  }
});

it('search output converges after late records and removals without a main trigger', async () => {
  indexes.clear();
  const output: string[] = [];
  const subscription = searchIndexesBuilder({ outAssetsDir: '/assets' } as never).subscribe(
    (state) => {
      if (state instanceof BuilderDone) output.push(state.result.content as string);
    },
  );
  const flush = () => new Promise((resolve) => setTimeout(resolve, 70));
  try {
    await flush();
    const cleanup = indexes.add({ title: 'Late', route: '/late' });
    await flush();
    expect(JSON.parse(output.at(-1)!)).toEqual([{ title: 'Late', route: '/late' }]);
    cleanup();
    await flush();
    expect(JSON.parse(output.at(-1)!)).toEqual([]);
  } finally {
    subscription.unsubscribe();
  }
});
