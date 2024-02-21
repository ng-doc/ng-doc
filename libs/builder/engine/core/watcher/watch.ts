import * as watcher from '@parcel/watcher';
import * as path from 'path';
import { Observable, Subject } from 'rxjs';
import { filter, map, share } from 'rxjs/operators';

const WATCHER_POOL = new Map<string, Observable<watcher.Event[]>>();
const WATCHER_POOL_COUNT = new Map<string, number>();

/**
 *
 * @param dirPath
 */
export function watch(dirPath: string): Observable<watcher.Event[]> {
  const parentDir = Array.from(WATCHER_POOL.keys()).find((p) =>
    path.relative(dirPath, p).startsWith('..'),
  );

  if (parentDir) {
    return WATCHER_POOL.get(parentDir)!.pipe(
      map((events) => events.filter((event) => event.path.startsWith(dirPath))),
      filter((events) => events.length > 0),
    );
  }

  const watcherSubject = new Subject<watcher.Event[]>();
  let unsubscribe = () => {};

  watcher
    .subscribe(dirPath, (err, events) => {
      if (err) {
        watcherSubject.error(err);
        return;
      }

      watcherSubject.next(events);
    })
    .then((unsub) => (unsubscribe = unsub.unsubscribe));

  WATCHER_POOL.set(
    dirPath,
    new Observable<watcher.Event[]>((subscriber) => {
      watcherSubject.subscribe(subscriber);

      WATCHER_POOL_COUNT.set(dirPath, (WATCHER_POOL_COUNT.get(dirPath) || 0) + 1);

      return () => {
        const count = WATCHER_POOL_COUNT.get(dirPath)! - 1;

        if (count === 0) {
          unsubscribe();
          watcherSubject.complete();
          WATCHER_POOL.delete(dirPath);
          WATCHER_POOL_COUNT.delete(dirPath);
        } else {
          WATCHER_POOL_COUNT.set(dirPath, count);
        }
      };
    }).pipe(share()),
  );

  return WATCHER_POOL.get(dirPath)!;
}
