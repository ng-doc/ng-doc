import { asArray } from '@ng-doc/core';
import watcher from '@parcel/watcher';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { watch } from './watch';

/**
 *
 * @param folderPath
 * @param type
 */
export function watchFolder(
  folderPath: string,
  type?: watcher.EventType | watcher.EventType[],
): Observable<watcher.Event[]> {
  return watch(folderPath).pipe(
    map((events) => {
      /*
       * Subscribe to changes in the directory containing the file.
       * Filter out events for other files in the directory.
       * It's necessary because @parcel/watcher doesn't support watching a single file.
       */
      if (type) {
        const fileEvents = events.filter((event) => asArray(type).includes(event.type));

        if (fileEvents.length) {
          return fileEvents;
        }
      } else {
        return events;
      }

      return [];
    }),
    filter((events) => events.length > 0),
  );
}
