import * as chokidar from 'chokidar';
import {Observable, Subject} from 'rxjs';

export class NgDocWatcher {
	private readonly watcher: chokidar.FSWatcher;
	private updated$: Subject<string> = new Subject();
	private added$: Subject<string> = new Subject();
	private deleted$: Subject<string> = new Subject();

	constructor(private files: string | string[]) {
		this.watcher = chokidar.watch(files);

		this.watcher
			.on('add', (filePath: string) => this.added$.next(filePath))
			.on('change', (filePath: string) => this.updated$.next(filePath))
			.on('unlink', (filePath: string) => this.deleted$.next(filePath));
	}

	onUpdate(): Observable<string> {
		return this.updated$.asObservable();
	}

	onAdd(): Observable<string> {
		return this.added$.asObservable();
	}

	onDelete(): Observable<string> {
		return this.deleted$.asObservable();
	}
}
