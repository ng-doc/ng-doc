import * as chokidar from 'chokidar';
import {Observable, ReplaySubject, Subject} from 'rxjs';
import {buffer} from 'rxjs/operators';

export class NgDocWatcher {
	private readonly watcher: chokidar.FSWatcher;
	private updated$: Subject<string> = new Subject();
	private added$: Subject<string> = new Subject();
	private deleted$: Subject<string> = new Subject();
	private ready$: ReplaySubject<boolean> = new ReplaySubject<boolean>();

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
		return this.added$.pipe(buffer(this.ready$));
	}

	get remove(): Observable<string> {
		return this.deleted$.asObservable();
	}

	close(): void {
		this.watcher.close();
	}
}
