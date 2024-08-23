import { asArray, isPresent } from '@ng-doc/core';
import watcher from '@parcel/watcher';
import path from 'path';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { watch } from './watch';

/**
 * Function to watch a specific file for changes.
 * @param {string} filePath - The path of the file to watch.
 * @param type - The type of event to watch for.
 * @returns {Observable<watcher.Event>} - An Observable that emits an event whenever the file changes.
 */
export function watchFile(
  filePath: string,
  type?: watcher.EventType | watcher.EventType[],
): Observable<watcher.Event> {
  return watch(filePath).pipe(
    map((events) => {
      return events.find((event) => {
        const isFolder = path.extname(event.path) === '';

        if (
          event.type === type &&
          isFolder &&
          event.type === 'delete' &&
          filePath.startsWith(event.path)
        ) {
          return true;
        }

        return event.path === filePath && (!type || asArray(type).includes(event.type));
      });
    }),
    filter(isPresent),
  );
}
