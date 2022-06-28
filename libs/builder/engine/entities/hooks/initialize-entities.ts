import {forkJoin, Observable} from 'rxjs';
import {mapTo} from 'rxjs/operators';

import {NgDocEntity} from '../abstractions/entity';

/**
 * Runs onInit hook for entities
 *
 * @param {NgDocEntity[]} entities - entities that should be initialized
 * @returns {NgDocEntity[]} - initialized entities
 */
export function initializeEntities(entities: NgDocEntity[]): Observable<NgDocEntity[]> {
	return forkJoin(entities.filter((e: NgDocEntity) => !e.destroyed).map((e: NgDocEntity) => e.init())).pipe(
		mapTo(entities),
	);
}
