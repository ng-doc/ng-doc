import {forkJoin, Observable} from 'rxjs';

import {NgDocEntity} from '../abstractions/entity';

/**
 * Runs destroy hook for entities
 *
 * @param {NgDocEntity[]} entities - entities that should be destroyed
 * @returns {NgDocEntity[]} - new entities
 */
export function destroyEntities(entities: NgDocEntity[]): Observable<NgDocEntity[]> {
	return forkJoin(entities.map((e: NgDocEntity) => e.destroy()));
}
