import { asArray } from '@ng-doc/core';
import { Observable, ReplaySubject } from 'rxjs';
import { map } from 'rxjs/operators';

export class ObservableMap<T> {
	private collection: Map<string, T> = new Map();
	private changes$: ReplaySubject<void> = new ReplaySubject<void>();

	constructor(values?: Array<[string, T]>) {
		this.collection = new Map(values);
	}

	asArray(): T[] {
		return asArray(this.collection.values());
	}

	changes(): Observable<T[]> {
		return this.changes$.pipe(map(() => this.asArray()));
	}

	add(id: string, value: T): void {
		this.collection.set(id, value);

		this.changes$.next();
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
