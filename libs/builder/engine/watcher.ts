import * as chokidar from 'chokidar';
import {BehaviorSubject, Observable, ReplaySubject, Subject} from 'rxjs';
import {filter} from 'rxjs/operators';

import {bufferUntil} from '../operators';

export class NgDocWatcher {
	private readonly watcher: chokidar.FSWatcher;
	private updated$: Subject<string> = new Subject();
	private added$: Subject<string> = new Subject();
	private deleted$: Subject<string> = new Subject();
	private ready$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

	constructor(private files: string | string[]) {
		this.watcher = chokidar.watch(files);

		this.watcher
			.on('ready', () => this.ready$.next(true))
			.on('add', (filePath: string) => this.added$.next(filePath))
			.on('change', (filePath: string) => this.updated$.next(filePath))
			.on('unlink', (filePath: string) => this.deleted$.next(filePath));
	}

	get update(): Observable<string> {
		return this.updated$.asObservable();
	}

	get add(): Observable<string[]> {
		return this.added$.pipe(bufferUntil(this.ready$.pipe(filter((ready: boolean) => ready))));
	}

	get remove(): Observable<string> {
		return this.deleted$.asObservable();
	}

	close(): void {
		this.watcher.close();
	}
}
