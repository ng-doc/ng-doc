import * as chokidar from 'chokidar';
import {minimatch} from 'minimatch';
import {Observable, ReplaySubject, Subject} from 'rxjs';
import {filter} from 'rxjs/operators';

import {miniPattern} from '../helpers';
import {miniPattern} from '../helpers';

export class NgDocWatcher {
	private readonly watcher: chokidar.FSWatcher;
	private readonly change$: Subject<string> = new Subject();
	private readonly add$: Subject<string> = new Subject();
	private readonly unlink$: Subject<string> = new Subject();
	private readonly ready$: ReplaySubject<void> = new ReplaySubject(1);

	constructor(files?: string[]) {
		this.watcher = chokidar.watch(files ?? [], {
			/*  `useFsEvents` causes problems on Mac when chokidar doesn't fire `unlink` event if the file has been moved */
			useFsEvents: false,
		});

		this.watcher
			.on('add', (path: string) => this.add$.next(path))
			.on('change', (path: string) => this.change$.next(path))
			.on('unlink', (path: string) => this.unlink$.next(path))
			.on('ready', () => this.ready$.next());
	}

	watch(paths: string | readonly string[]): this {
		this.watcher.add(paths);

		return this;
	}

	unwatch(paths: string | readonly string[]): void {
		this.watcher.unwatch(paths);
	}

	onAdd(...filterPaths: string[]): Observable<string> {
		return this.add$.pipe(
			filter((path: string) => !filterPaths || filterPaths.some((p: string) => minimatch(path, miniPattern(p)))),
		);
	}

	onChange(...filterPaths: string[]): Observable<string> {
		return this.change$.pipe(
			filter((path: string) => !filterPaths || filterPaths.some((p: string) => minimatch(path, miniPattern(p)))),
		);
	}

	onUnlink(...filterPaths: string[]): Observable<string> {
		return this.unlink$.pipe(
			filter((path: string) => !filterPaths || filterPaths.some((p: string) => minimatch(path, miniPattern(p)))),
		);
	}

	onReady(): Observable<void> {
		return this.ready$;
	}

	close(): void {
		this.watcher.close();
	}
}
