import { EMPTY, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ObservableMap } from '../../classes/observable-map';
import { ObservableSet } from '../../classes/observable-set';
import { mergeFactory } from '../../engine/core/operators/merge-factory';
import { BuilderDone, BuilderError, BuilderPending, BuilderState } from '../../engine/core/types';
import { stableGeneratedId } from '../../helpers/stable-generated-id';

describe('legacy regression contracts', () => {
  it.each(['map', 'set'])('%s replays only the current snapshot', (kind) => {
    const store =
      kind === 'map' ? new ObservableMap<number, number>() : new ObservableSet<number>();
    for (let index = 0; index < 100; index++) {
      if (store instanceof ObservableMap) store.add([index, index]);
      else store.add(index);
    }
    const snapshots: number[][] = [];
    const subscription = store.changes().subscribe((snapshot) => snapshots.push(snapshot));
    subscription.unsubscribe();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toHaveLength(100);
  });

  it('cleanup of an old owner preserves the replacement at the same key', () => {
    const store = new ObservableMap<string, object>();
    const oldCleanup = store.add(['key', { revision: 1 }]);
    const replacement = { revision: 2 };
    store.add(['key', replacement]);
    oldCleanup();
    expect(store.get('key')).toBe(replacement);
  });

  it('tracks ownership even when replacement values are identical and cleanup repeats', () => {
    const store = new ObservableMap<string, string>();
    const old = store.add(['key', 'value']);
    const current = store.add(['key', 'value']);
    old();
    old();
    expect(store.get('key')).toBe('value');
    current();
    current();
    expect(store.size).toBe(0);
    const removed = store.add(['key', 'value']);
    store.clear();
    store.add(['key', 'new']);
    removed();
    expect(store.get('key')).toBe('new');
  });

  it('new subscriptions see constructor values and observe later deletions', () => {
    const map = new ObservableMap([['key', 1]]);
    const values: number[][] = [];
    const subscription = map.changes().subscribe((value) => values.push(value));
    map.delete('key');
    subscription.unsubscribe();
    expect(values).toEqual([[1], []]);
  });

  it('waits until every source has supplied its first result', () => {
    const first = new Subject<BuilderDone<string>>();
    const delayed = new Subject<BuilderDone<string>>();
    const project = vi.fn(async (...values: string[]) => values.join(','));
    const subscription = mergeFactory('fixture-merge', [first, delayed], project).subscribe();
    try {
      first.next(new BuilderDone('first', 'A'));
      expect(project).not.toHaveBeenCalled();
      delayed.next(new BuilderDone('second', 'B'));
      expect(project).toHaveBeenCalledWith('A', 'B');
    } finally {
      subscription.unsubscribe();
    }
  });

  it('forwards child states and waits through pending/error until every child is done', () => {
    const first = new Subject<BuilderState<string>>();
    const second = new Subject<BuilderState<string>>();
    const project = vi.fn(async (...values: string[]) => values.join(','));
    const mapper = vi.fn((value: string) => `mapped:${value}`);
    const states: Array<BuilderState<unknown>> = [];
    const subscription = mergeFactory(
      'states',
      [first, second],
      project,
      undefined as never,
      mapper,
    ).subscribe((state) => states.push(state));
    const pending = new BuilderPending('second');
    const error = new BuilderError('second', [new Error('bad input')]);
    first.next(new BuilderDone('first', 'A'));
    second.next(pending);
    second.next(error);
    expect(project).not.toHaveBeenCalled();
    expect(states).toContain(pending);
    expect(states).toContain(error);
    expect(mapper).toHaveBeenCalledWith('A');
    second.next(new BuilderDone('second', 'B', true));
    expect(project).toHaveBeenCalledWith('A', 'B');
    subscription.unsubscribe();
  });

  it('empty/cache-skipped source does not authorize a partial project call', () => {
    const first = new Subject<BuilderDone<string>>();
    const project = vi.fn(async () => 'output');
    const subscription = mergeFactory('empty', [first, EMPTY], project).subscribe();
    first.next(new BuilderDone('first', 'A'));
    expect(project).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('keeps readiness state isolated between subscriptions', () => {
    const first = new Subject<BuilderDone<string>>();
    const second = new Subject<BuilderDone<string>>();
    const project = vi.fn(async () => 'output');
    const merged = mergeFactory('subscriptions', [first, second], project);
    const old = merged.subscribe();
    first.next(new BuilderDone('first', 'old'));
    old.unsubscribe();
    const current = merged.subscribe();
    second.next(new BuilderDone('second', 'B'));
    expect(project).not.toHaveBeenCalled();
    first.next(new BuilderDone('first', 'new'));
    expect(project).toHaveBeenCalledWith('new', 'B');
    current.unsubscribe();
  });

  it('generated IDs are stable and distinguish project, entity, role and tuple boundaries', () => {
    const baseline = stableGeneratedId('project', 'docs/page', 'content');
    expect(stableGeneratedId('project', 'docs/page', 'content')).toBe(baseline);
    expect(baseline).toMatch(/^[a-f0-9]{24}$/);
    expect(
      new Set([
        baseline,
        stableGeneratedId('another', 'docs/page', 'content'),
        stableGeneratedId('project', 'docs/other', 'content'),
        stableGeneratedId('project', 'docs/page', 'wrapper'),
        stableGeneratedId('a:b', 'c', 'd'),
        stableGeneratedId('a', 'b:c', 'd'),
      ]).size,
    ).toBe(6);
  });
});
