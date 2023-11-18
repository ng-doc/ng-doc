import { unique } from '@ng-doc/core';
import { Observable, OperatorFunction } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { isFileEntity } from '../../helpers';
import { NgDocEntity } from '../entities/abstractions/entity';
import { NgDocEntityStore } from '../entity-store';

/**
 *
 * @param store
 */
export function addBuildCandidates(
	store: NgDocEntityStore,
): OperatorFunction<NgDocEntity[], NgDocEntity[]> {
	return (source: Observable<NgDocEntity[]>) =>
		source.pipe(
			tap(() => {
				store
					.asArray()
					.forEach(
						(entity: NgDocEntity) =>
							!entity.destroyed && isFileEntity(entity) && entity.setParentDynamically(),
					);
			}),
			map((entities: NgDocEntity[]) =>
				unique(
					entities,
					entities.map((e: NgDocEntity) => e.buildCandidates).flat(),
					/*
					 * We need to add the build candidates of the entities which has errors or warnings too,
					 * just to rebuild their parents too e.g. to remove a broken page from a category.
					 */
					store
						.getAllWithErrorsOrWarnings()
						.map((e: NgDocEntity) => e.buildCandidates)
						.flat(),
				),
			),
		);
}
