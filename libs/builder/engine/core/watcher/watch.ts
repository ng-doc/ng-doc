import { GLOBALS } from '@ng-doc/builder';
import * as watcher from '@parcel/watcher';
import { resolve } from 'path';
import { NEVER, Observable } from 'rxjs';
import { filter, map, share } from 'rxjs/operators';

let WATCHER: Observable<watcher.Event[]> | null = null;

/**
 *
 * @param path
 * @param dir
 */
export function watch(path: string, dir?: boolean): Observable<watcher.Event[]> {
  // One-shot builds don't need to react to file changes, so the watcher
  // is not started at all to let the process exit as soon as the build is done
  if (!GLOBALS.watch) {
    return NEVER;
  }

  path = resolve(path);

  if (!WATCHER) {
    let unsubscribe = () => {};
    let disposed = false;

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
        .then((unsub) => {
          // The teardown may run before this promise resolves (e.g. a one-shot build
          // that finishes while the watcher is still crawling the workspace);
          // in that case the subscription must be closed here, otherwise it keeps
          // the process alive forever (see #333)
          if (disposed) {
            unsub.unsubscribe();
          } else {
            unsubscribe = unsub.unsubscribe;
          }
        });

      return () => {
        disposed = true;
        unsubscribe();
        WATCHER = null;
      };
    }).pipe(share());
  }

  return WATCHER.pipe(
    map((events) =>
      events.filter((event) => {
        return dir ? event.path.startsWith(path) : event.path.endsWith(path);
      }),
    ),
    filter((events) => events.length > 0),
  );
}
