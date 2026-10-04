import { describe, expect, it } from 'vitest';

import type { Dependency, EntryDescriptor } from '../../contracts';
import { createDependencyRefresher, UNREFRESHED_DIGEST } from '..';
import { indexEntry } from '../unit-index';

// `evaluated` dependencies are refreshed from the generation's fresh discovery snapshot, never from
// disk, and the fresh-discovery equality check compares them on their own.

const digest = (character: string) => character.repeat(64);

describe('evaluated dependencies', () => {
  it('refresh from the discovery source: equal, changed, and an entry it does not name', async () => {
    const recorded: Dependency[] = [
      { kind: 'evaluated', entryId: 'kept', digest: digest('a') },
      { kind: 'evaluated', entryId: 'changed', digest: digest('b') },
      { kind: 'evaluated', entryId: 'removed', digest: digest('c') },
    ];
    const refresher = createDependencyRefresher({
      evaluated: new Map([
        ['kept', digest('a')],
        ['changed', digest('d')],
      ]),
    });
    const refreshed = await refresher.refresh(recorded, []);
    expect(refreshed.diagnostics).toEqual([]);
    expect(refreshed.dependencies).toEqual([
      { kind: 'evaluated', entryId: 'kept', digest: digest('a') },
      { kind: 'evaluated', entryId: 'changed', digest: digest('d') },
      { kind: 'evaluated', entryId: 'removed', digest: UNREFRESHED_DIGEST },
    ]);
    // The same list refreshes to the same digest while the source is unchanged.
    const again = await refresher.refresh([recorded[0]!], []);
    expect(again.dependencies).toEqual([recorded[0]]);
  });

  it('are masked in the indexed entry and kept beside it', () => {
    const entry = (evaluated: string): EntryDescriptor => ({
      kind: 'category',
      id: 'project:category:1',
      source: { path: '/docs/ng-doc.category.ts' },
      title: 'Category',
      route: 'category',
      absoluteRoute: 'category',
      breadcrumbs: ['Category'],
      runtimeImport: { source: '/docs/ng-doc.category.ts', exportName: 'default' },
      dependencies: [
        { kind: 'content', path: '/docs/ng-doc.category.ts', digest: digest('f') },
        { kind: 'evaluated', entryId: 'project:category:1', digest: evaluated },
      ],
    });
    const first = indexEntry(entry(digest('1')));
    const second = indexEntry(entry(digest('2')));
    expect(first.masked).toBe(second.masked);
    expect([first.evaluated, second.evaluated]).toEqual([digest('1'), digest('2')]);
    const { dependencies: _dependencies, ...bare } = entry(digest('1'));
    expect(indexEntry({ ...bare, dependencies: [] }).evaluated).toBeUndefined();
  });
});
