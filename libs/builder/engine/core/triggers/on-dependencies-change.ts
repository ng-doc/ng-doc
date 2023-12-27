import { map, merge, Observable } from 'rxjs';
import { debounceTime, startWith, switchMap } from 'rxjs/operators';

import { ObservableSet } from '../../../classes';
import { watchFile } from '../watcher';

/**
 * Function to trigger an action when any of the provided dependencies changes.
 *
 * This function returns an Observable that emits a void value whenever any of the files in the provided dependencies set changes.
 * The Observable is created by merging Observables that emit on file changes for each dependency.
 * When a file changes, the function filters out events that are not updates, maps the event to a void value, and emits the void value.
 * @param {ObservableSet<string>} dependencies - An ObservableSet of file paths to watch for changes.
 * @returns {Observable<void>} - An Observable that emits a void value whenever any of the files in the provided dependencies set changes.
 */
export function onDependenciesChange(dependencies: ObservableSet<string>): Observable<void> {
	return dependencies.changes().pipe(
		startWith(dependencies.asArray()),
		switchMap((deps: string[]) =>
			merge(...deps.map((dep) => watchFile(dep, 'update').pipe(map(() => void 0)))).pipe(
				debounceTime(0),
			),
		),
	);
}
