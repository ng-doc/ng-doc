import {Observable, OperatorFunction} from 'rxjs';
import {tap} from 'rxjs/operators';

import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocEntityStore} from '../entity-store';

/**
 *
 * @param store
 */
export function updateCache<T>(store: NgDocEntityStore): OperatorFunction<T, T> {
	return (source: Observable<T>) =>
		source.pipe(
			tap(() => {
				store.asArray().forEach((entity: NgDocEntity) => entity.updateCache());
			}),
		);
}
