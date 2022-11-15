import * as chokidar from 'chokidar';
import minimatch from 'minimatch';
import {Observable, Subject} from 'rxjs';
import {filter} from 'rxjs/operators';

export class NgDocWatcher {
	private readonly watcher: chokidar.FSWatcher;
	private readonly change$: Subject<string> = new Subject();
	private readonly add$: Subject<string> = new Subject();
	private readonly unlink$: Subject<string> = new Subject();

	constructor() {
		this.watcher = chokidar.watch([]);

		this.watcher
			.on('add', (path: string) => this.add$.next(path))
			.on('change', (path: string) => this.change$.next(path))
			.on('unlink', (path: string) => this.unlink$.next(path));
	}

	watch(paths: string | readonly string[]): this {
		this.watcher.add(paths);

		return this;
	}

	unwatch(paths: string | readonly string[]): void {
		this.watcher.unwatch(paths);
	}

	onAdd(...filterPaths: string[]): Observable<string> {
		return this.add$.pipe(filter((path: string) => !filterPaths || filterPaths.some((p: string) => minimatch(path, p))));
	}

	onChange(...filterPaths: string[]): Observable<string> {
		return this.change$.pipe(filter((path: string) => !filterPaths || filterPaths.some((p: string) => minimatch(path, p))));
	}

	onUnlink(...filterPaths: string[]): Observable<string> {
		return this.unlink$.pipe(filter((path: string) => !filterPaths || filterPaths.some((p: string) => minimatch(path, p))));
	}

	close(): void {
		this.watcher.close();
	}
}
