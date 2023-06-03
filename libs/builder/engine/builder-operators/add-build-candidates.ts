import {unique} from '@ng-doc/core';
import {Observable, OperatorFunction} from 'rxjs';
import {map, tap} from 'rxjs/operators';

import {isFileEntity} from '../../helpers';
import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocEntityStore} from '../entity-store';

/**
 *
 * @param store
 */
export function addBuildCandidates(store: NgDocEntityStore): OperatorFunction<NgDocEntity[], NgDocEntity[]> {
	return (source: Observable<NgDocEntity[]>) =>
		source.pipe(
			tap(() => {
				store.asArray().forEach((entity: NgDocEntity) => isFileEntity(entity) && entity.setParentDynamically());
			}),
			map((entities: NgDocEntity[]) => unique(entities, entities.map((e: NgDocEntity) => e.buildCandidates).flat())),
		);
}
