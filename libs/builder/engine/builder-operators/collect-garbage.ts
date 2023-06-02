import {Observable, OperatorFunction} from 'rxjs';
import {tap} from 'rxjs/operators';

import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocEntityStore} from '../entity-store';

/**
 *
 * @param {...any} additionalEntities
 * @param store
 */
export function collectGarbage<T>(store: NgDocEntityStore): OperatorFunction<T, T> {
	return (source: Observable<T>) =>
		source.pipe(
			tap(() => {
				store.asArray().forEach((entity: NgDocEntity) => {
					if (entity.destroyed) {
						entity.removeArtifacts();
						store.delete(entity.id);
					}
				});
			}),
		);
}
