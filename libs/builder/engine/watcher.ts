import * as chokidar from 'chokidar';
import {minimatch} from 'minimatch';
import {Observable, ReplaySubject, Subject} from 'rxjs';
import {filter, map} from 'rxjs/operators';

import {miniPattern} from '../helpers';
import {bufferDebounce, bufferUntilOnce} from '../operators';

/**
 *
 * @param source$
 * @param ready$
 * @param patterns
 */
function bufferAndFilter(
	source$: Observable<string>,
	ready$: Observable<unknown>,
	patterns: string[],
): Observable<string[]> {
	return source$.pipe(
		bufferUntilOnce(ready$),
		bufferDebounce(50),
		map((paths: string[][]) => paths.flat()),
		map((paths: string[]) => paths.filter((path) => patterns.some((p: string) => minimatch(path, miniPattern(p))))),
		filter((paths: string[]) => paths.length > 0),
	);
}

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

	onAdd(...filterPaths: string[]): Observable<string[]> {
		return bufferAndFilter(this.add$, this.ready$, filterPaths);
	}

	onChange(...filterPaths: string[]): Observable<string[]> {
		return bufferAndFilter(this.change$, this.ready$, filterPaths);
	}

	onUnlink(...filterPaths: string[]): Observable<string[]> {
		return bufferAndFilter(this.unlink$, this.ready$, filterPaths);
	}

	close(): void {
		this.watcher.close();
	}
}
