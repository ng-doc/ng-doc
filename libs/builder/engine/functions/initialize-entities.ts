import {forkJoin, Observable, of} from 'rxjs';
import {mapTo} from 'rxjs/operators';

import {NgDocEntity} from '../entities/abstractions/entity';

/**
 * Runs onInit hook for entities
 *
 * @param {NgDocEntity[]} entities - entities that should be initialized
 * @returns {NgDocEntity[]} - initialized entities
 */
export function initializeEntities(entities: NgDocEntity[]): Observable<NgDocEntity[]> {
	return forkJoin(entities.map((e: NgDocEntity) => (e.destroyed ? of(e) : e.init()))).pipe(mapTo(entities));
}
