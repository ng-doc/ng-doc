import {asArray, NgDocBuilderContext} from '@ng-doc/core';
import * as chokidar from 'chokidar';
import * as path from 'path';
import {ENTRY_POINT_PATTERN} from './variables';
import {Observable, Subject} from 'rxjs';
import {map} from 'rxjs/operators';

export class NgDocWatcher {
  private readonly watcher: chokidar.FSWatcher;
  private initialized: Subject<void> = new Subject();
  private updated$: Subject<string> = new Subject();
  private added$: Subject<string> = new Subject();
  private deleted$: Subject<string> = new Subject();

  constructor(private readonly context: NgDocBuilderContext) {
    this.watcher = chokidar.watch(
      asArray(this.context.options.ngDoc.pages).map((pagesPath: string) =>
        path.join(pagesPath, ENTRY_POINT_PATTERN),
      ),
    );

    this.watcher
      .on('ready', () => this.initialized.next())
      .on('add', (filePath: string) => this.added$.next(filePath))
      .on('change', (filePath: string) => this.updated$.next(filePath))
      .on('unlink', (filePath: string) => this.deleted$.next(filePath));
  }

  public onInitialized(): Observable<string[]> {
    return this.initialized.pipe(
      map(() => {
        const files = this.watcher.getWatched();

        return new Array<string>().concat(
          ...Object.keys(files).map((dir: string) =>
            files[dir].map((file: string) =>
              path.relative(this.context.context.workspaceRoot, path.join(dir, file)),
            ),
          ),
        );
      }),
    );
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
