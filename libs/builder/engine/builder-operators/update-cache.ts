import {Observable, OperatorFunction} from 'rxjs';
import {tap} from 'rxjs/operators';

import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocEntityStore} from '../entity-store';

/**
 * Operator that updates cache of all entities in the store
 *
 * @param store - store to update cache for
 */
export function updateCache<T>(store: NgDocEntityStore): OperatorFunction<T, T> {
	return (source: Observable<T>) =>
		source.pipe(
			tap(() => {
				store.asArray().forEach((entity: NgDocEntity) => entity.updateCache());
			}),
		);
}
