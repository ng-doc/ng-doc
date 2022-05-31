import {Observable, Subject} from 'rxjs';

import {asArray} from '../helpers';
import {NgDocBuildable} from './buildable';

export class NgDocBuildableStore implements Iterable<NgDocBuildable> {
	private buildables: Map<string, NgDocBuildable> = new Map();
	private changed$: Subject<NgDocBuildable> = new Subject();

	*[Symbol.iterator](): Iterator<NgDocBuildable> {
		for (const value of asArray(this.buildables.values())) {
			yield value;
		}
	}

	get changes(): Observable<NgDocBuildable> {
		return this.changed$.asObservable();
	}

	get(path: string): NgDocBuildable | undefined {
		return this.buildables.get(path);
	}

	set(path: string, buildable: NgDocBuildable): void {
		this.buildables.set(path, buildable);
		this.changed$.next(buildable);
	}

	has(path: string): boolean {
		return this.buildables.has(path);
	}

	touch(path: string): void {
		if (this.buildables.has(path)) {
			this.changed$.next(this.get(path));
		}
	}

	delete(path: string): void {
		this.buildables.delete(path);
		this.changed$.next();
	}
}
