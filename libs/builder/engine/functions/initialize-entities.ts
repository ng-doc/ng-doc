import {EMPTY, forkJoin, Observable, of} from 'rxjs';
import {mapTo, switchMap} from 'rxjs/operators';

import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocFileEntity} from '../entities/abstractions/file.entity';

/**
 * Runs onInit hook for entities
 *
 * @param {NgDocEntity[]} entities - entities that should be initialized
 * @returns {NgDocEntity[]} - initialized entities
 */
export function initializeEntities(entities: NgDocEntity[]): Observable<NgDocEntity[]> {
	return forkJoin([
		entities.map((entity: NgDocEntity) => (entity instanceof NgDocFileEntity ? entity.emit() : EMPTY)),
	]).pipe(
		switchMap(() =>
			forkJoin(entities.map((e: NgDocEntity) => (e.destroyed ? of(e) : e.init()))).pipe(mapTo(entities)),
		),
	);
}
