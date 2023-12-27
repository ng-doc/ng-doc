import { asArray } from '@ng-doc/core';
import watcher from '@parcel/watcher';
import path from 'path';
import { Observable } from 'rxjs';

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
	return new Observable<watcher.Event>((subscriber) => {
		let unsubscribe = () => {};
		const dirPath = path.dirname(filePath);

		/*
		 * Subscribe to changes in the directory containing the file.
		 * Filter out events for other files in the directory.
		 * It's necessary because @parcel/watcher doesn't support watching a single file.
		 */
		watcher
			.subscribe(dirPath, (err, events) => {
				const fileEvents = events.find(
					(event) => event.path === filePath && (!type || asArray(type).includes(event.type)),
				);

				// If there are any events for the file, emit them.
				if (fileEvents) {
					subscriber.next(fileEvents);
				}
			})
			.then((unsub) => (unsubscribe = unsub.unsubscribe));

		// Return a function that unsubscribes from the watcher when the Observable is unsubscribed.
		return () => {
			unsubscribe();
		};
	});
}
