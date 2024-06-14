import { GLOBALS } from '@ng-doc/builder';
import * as watcher from '@parcel/watcher';
import { Observable } from 'rxjs';
import { filter, map, share } from 'rxjs/operators';

let WATCHER: Observable<watcher.Event[]> | null = null;

/**
 *
 * @param dirPath
 */
export function watch(dirPath: string): Observable<watcher.Event[]> {
  if (!WATCHER) {
    let unsubscribe = () => {};

    WATCHER = new Observable<watcher.Event[]>((subscriber) => {
      watcher
        .subscribe(
          GLOBALS.workspaceRoot,
          (err, events) => {
            if (err) {
              console.error(err);
              subscriber.error(err);

              return;
            }

            subscriber.next(events);
          },
          { ignore: ['node_modules'] },
        )
        .then((unsub) => (unsubscribe = unsub.unsubscribe));

      return () => {
        unsubscribe();
        WATCHER = null;
      };
    }).pipe(share());
  }

  return WATCHER.pipe(
    map((events) => events.filter((event) => event.path.endsWith(dirPath))),
    filter((events) => events.length > 0),
  );
}