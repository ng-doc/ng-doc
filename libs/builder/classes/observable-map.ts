import { asArray } from '@ng-doc/core';
import { Observable, ReplaySubject } from 'rxjs';
import { map } from 'rxjs/operators';

type DestroyFn = () => void;

export class ObservableMap<TKey, TValue> {
  private collection: Map<TKey, TValue> = new Map();
  private changes$: ReplaySubject<void> = new ReplaySubject<void>();

  constructor(values?: Array<[TKey, TValue]>) {
    this.collection = new Map(values);
  }

  get size(): number {
    return this.collection.size;
  }

  *[Symbol.iterator](): IterableIterator<[TKey, TValue]> {
    yield* this.collection;
  }

  keys(): TKey[] {
    return asArray(this.collection.keys());
  }

  asArray(): TValue[] {
    return asArray(this.collection.values());
  }

  changes(): Observable<TValue[]> {
    return this.changes$.pipe(map(() => this.asArray()));
  }

  add(...items: Array<[TKey, TValue]>): DestroyFn {
    items.forEach(([key, value]) => this.collection.set(key, value));

    this.changes$.next();

    return () => {
      items.forEach(([key]) => this.delete(key));
    };
  }

  get(key: TKey): TValue | undefined {
    return this.collection.get(key);
  }

  delete(key: TKey): void {
    this.collection.delete(key);

    this.changes$.next();
  }

  clear(): void {
    this.collection.clear();

    this.changes$.next();
  }
}
