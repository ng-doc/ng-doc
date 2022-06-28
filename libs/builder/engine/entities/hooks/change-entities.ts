import {forkJoin, Observable} from 'rxjs';

import {NgDocEntity} from '../abstractions/entity';

/**
 * Runs onChange hook for entities
 *
 * @param {NgDocEntity[]} entities - entities that should be changed
 * @returns {NgDocEntity[]} - new entities
 */
export function changeEntities(entities: NgDocEntity[]): Observable<NgDocEntity[]> {
	return forkJoin(entities.map((e: NgDocEntity) => e.onChange()));
}
