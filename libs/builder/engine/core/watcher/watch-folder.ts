import { asArray } from '@ng-doc/core';
import watcher from '@parcel/watcher';
import path from 'path';
import { Observable } from 'rxjs';

/**
 *
 * @param folderPath
 * @param type
 */
export function watchFolder(
	folderPath: string,
	type?: watcher.EventType | watcher.EventType[],
): Observable<watcher.Event[]> {
	return new Observable<watcher.Event[]>((subscriber) => {
		let unsubscribe = () => {};
		const dirPath = path.dirname(folderPath);

		/*
		 * Subscribe to changes in the directory containing the file.
		 * Filter out events for other files in the directory.
		 * It's necessary because @parcel/watcher doesn't support watching a single file.
		 */
		watcher
			.subscribe(dirPath, (err, events) => {
				if (type) {
					const fileEvents = events.filter((event) => asArray(type).includes(event.type));

					if (fileEvents.length) {
						subscriber.next(fileEvents);
					}
				} else {
					subscriber.next(events);
				}
			})
			.then((unsub) => (unsubscribe = unsub.unsubscribe));

		// Return a function that unsubscribes from the watcher when the Observable is unsubscribed.
		return () => {
			unsubscribe();
		};
	});
}
