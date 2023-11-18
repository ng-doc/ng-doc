import { Observable, OperatorFunction } from 'rxjs';
import { tap } from 'rxjs/operators';

import { NgDocEntity } from '../entities/abstractions/entity';
import { NgDocEntityStore } from '../entity-store';

/**
 * Operator that collects garbage from the entity store after each source emission.
 * @param store - The entity store.
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
