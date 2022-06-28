import {Observable, ReplaySubject} from 'rxjs';
import {debounceTime, map} from 'rxjs/operators';

import {asArray} from '../helpers';

export class ObservableSet<T> {
	private collection: Set<T> = new Set();
	private changes$: ReplaySubject<void> = new ReplaySubject<void>();

	changes(): Observable<T[]> {
		return this.changes$.pipe(
			debounceTime(10),
			map(() => asArray(this.collection)),
		);
	}

	add(...values: T[]): void {
		values.forEach((value: T) => this.collection.add(value));
		this.changes$.next();
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
