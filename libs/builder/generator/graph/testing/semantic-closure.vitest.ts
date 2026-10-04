import { describe, expect, it } from 'vitest';

import type { Dependency } from '../../contracts';
import { createDependencyRefresher, UNREFRESHED_DIGEST } from '..';

const closure = (key: string, digest: string): Dependency => ({
  kind: 'semantic-closure',
  scopeId: 'site',
  key,
  digest,
});
const reference: Dependency = {
  kind: 'semantic-reference',
  scopeId: 'site',
  digest: 'program-1',
  reason: 'whole program',
};

describe('semantic refresh sources', () => {
  it('recomputes each closure through its source; an unknown one refreshes as changed', async () => {
    const seen: string[] = [];
    const refresher = createDependencyRefresher({
      semanticClosure: (dependency) => {
        seen.push(dependency.key);
        return dependency.key === 'held'
          ? dependency.digest
          : dependency.key === 'moved'
            ? 'new'
            : undefined;
      },
    });
    const refreshed = await refresher.refresh(
      [closure('held', 'a'), closure('moved', 'b'), closure('lost', 'c'), reference],
      [],
    );
    expect(seen.sort()).toEqual(['held', 'lost', 'moved']);
    expect(refreshed.dependencies).toHaveLength(4);
    expect(refreshed.dependencies).toEqual(
      expect.arrayContaining([
        closure('held', 'a'),
        closure('lost', UNREFRESHED_DIGEST),
        closure('moved', 'new'),
        // Without a reference source, a reference refreshes as itself (its descriptor carries it).
        reference,
      ]),
    );
  });

  it('refreshes a semantic reference to the current program digest where descriptors do not carry it', async () => {
    const current = await createDependencyRefresher({
      semanticReference: () => 'program-1',
    }).refresh([reference], []);
    expect(current.dependencies).toEqual([reference]);
    const moved = await createDependencyRefresher({ semanticReference: () => 'program-2' }).refresh(
      [reference],
      [],
    );
    expect(moved.dependencies).toEqual([{ ...reference, digest: 'program-2' }]);
    const unknown = await createDependencyRefresher({ semanticReference: () => undefined }).refresh(
      [reference],
      [],
    );
    expect(unknown.dependencies).toEqual([{ ...reference, digest: UNREFRESHED_DIGEST }]);
  });
});
