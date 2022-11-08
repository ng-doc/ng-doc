import * as chokidar from 'chokidar';
import * as minimatch from 'minimatch';
import {BehaviorSubject, Observable, Subject, Subscriber} from 'rxjs';
import {filter} from 'rxjs/operators';

import {bufferUntil} from '../operators';
import {PAGE_PATTERN} from './variables';
import asString = lunr.utils.asString;

export class NgDocWatcher {
	private readonly watcher: chokidar.FSWatcher;
	private readonly change$: Subject<string> = new Subject();
	private readonly add$: Subject<string> = new Subject();
	private readonly unlink$: Subject<string> = new Subject();

	constructor() {
		this.watcher = chokidar.watch([]);

		this.watcher
			.on('add', this.add$.next)
			.on('change', this.change$.next)
			.on('unlink', this.unlink$.next)
	}

	watch(paths: string | readonly string[]): this {
		this.watcher.add(paths);

		return this;
	}

	unwatch(paths: string | readonly string[]): void {
		this.watcher.unwatch(paths);
	}

	onAdd(filterPath?: string): Observable<string> {
		return this.add$.pipe(filter((path: string) => !filterPath || minimatch(path, filterPath)))
	}

	onChange(filterPath?: string): Observable<string> {
		return this.change$.pipe(filter((path: string) => !filterPath || minimatch(path, filterPath)))
	}

	onUnlink(filterPath?: string): Observable<string> {
		return this.unlink$.pipe(filter((path: string) => !filterPath || minimatch(path, filterPath)))
	}

	close(): void {
		this.watcher.close();
	}
}
