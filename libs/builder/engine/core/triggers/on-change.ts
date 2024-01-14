import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 *
 * @param store
 * @param store.changes
 */
export function onChange(store: { changes: () => Observable<unknown> }): Observable<void> {
	return store.changes().pipe(map(() => void 0));
}
