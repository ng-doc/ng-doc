import * as chokidar from 'chokidar';
import {Observable, Subject} from 'rxjs';

export class NgDocWatcher {
	private readonly watcher: chokidar.FSWatcher;
	private updated$: Subject<string> = new Subject();
	private added$: Subject<string> = new Subject();
	private deleted$: Subject<string> = new Subject();

	constructor(
		private files: string | string[],
		private onAdd?: (file: string) => void,
		private onUpdate?: (file: string) => void,
		private onDelete?: (file: string) => void,
	) {
		this.watcher = chokidar.watch(files);

		this.watcher
			.on('add', (filePath: string) => {
				this.added$.next(filePath);
				this.onAdd && this.onAdd(filePath);
			})
			.on('change', (filePath: string) => {
				this.updated$.next(filePath);
				this.onUpdate && this.onUpdate(filePath);
			})
			.on('unlink', (filePath: string) => {
				this.deleted$.next(filePath);
				this.onDelete && this.onDelete(filePath);
			});
	}

	get update(): Observable<string> {
		return this.updated$.asObservable();
	}

	get add(): Observable<string> {
		return this.added$.asObservable();
	}

	get delete(): Observable<string> {
		return this.deleted$.asObservable();
	}
}
