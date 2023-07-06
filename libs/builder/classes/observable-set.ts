import {asArray} from '@ng-doc/core';
import {Observable, ReplaySubject} from 'rxjs';
import {map} from 'rxjs/operators';

export class ObservableSet<T> {
	private collection: Set<T> = new Set();
	private changes$: ReplaySubject<void> = new ReplaySubject<void>();

	constructor(values?: T[]) {
		values && this.add(...values);
	}

	asArray(): T[] {
		return asArray(this.collection);
	}
	changes(): Observable<T[]> {
		return this.changes$.pipe(map(() => asArray(this.collection)));
	}

	add(...values: T[]): void {
		if (values.some((value: T) => !this.collection.has(value))) {
			values.forEach((value: T) => this.collection.add(value));
			values.length && this.changes$.next();
		}
	}

	delete(value: T): void {
		this.collection.delete(value);
		this.changes$.next();
	}

	clear(): void {
		this.collection.clear();
		this.changes$.next();
	}
}
