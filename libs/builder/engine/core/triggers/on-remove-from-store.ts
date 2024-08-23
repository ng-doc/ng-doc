import { asyncScheduler, Observable, pairwise, subscribeOn } from 'rxjs';
import { filter, map } from 'rxjs/operators';

/**
 *
 * @param store
 * @param store.changes
 * @param store.size
 */
export function onRemoveFromStore(store: {
  changes: () => Observable<unknown>;
  size: number;
}): Observable<void> {
  return store.changes().pipe(
    map(() => store.size),
    pairwise(),
    map(([prev, next]) => prev > next),
    filter(Boolean),
    map(() => void 0),
    subscribeOn(asyncScheduler),
  );
}
