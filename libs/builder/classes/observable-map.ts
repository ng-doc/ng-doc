import { asArray } from '@ng-doc/core';
import { Observable, ReplaySubject } from 'rxjs';
import { map } from 'rxjs/operators';

type DestroyFn = () => void;

export class ObservableMap<T> {
  private collection: Map<string, T> = new Map();
  private changes$: ReplaySubject<void> = new ReplaySubject<void>();

  constructor(values?: Array<[string, T]>) {
    this.collection = new Map(values);
  }

  get size(): number {
    return this.collection.size;
  }

  asArray(): T[] {
    return asArray(this.collection.values());
  }

  changes(): Observable<T[]> {
    return this.changes$.pipe(map(() => this.asArray()));
  }

  add(...items: Array<[string, T]>): DestroyFn {
    items.forEach(([id, value]) => this.collection.set(id, value));

    this.changes$.next();

    return () => {
      items.forEach(([id]) => this.delete(id));
    };
  }

  get(id: string): T | undefined {
    return this.collection.get(id);
  }

  delete(id: string): void {
    this.collection.delete(id);

    this.changes$.next();
  }

  clear(): void {
    this.collection.clear();

    this.changes$.next();
  }
}
