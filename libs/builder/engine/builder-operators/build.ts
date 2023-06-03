import {Observable, OperatorFunction} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';

import {NgDocBuiltOutput, NgDocConfiguration} from '../../interfaces';
import {forkJoinOrEmpty} from '../../operators';
import {errorHandler} from '../../operators/error-handler';
import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocEntityStore} from '../entity-store';
import {buildCandidates} from '../functions/build-candidates';

/**
 * Operator that updates the keyword map, builds the artifacts for each entity based on the
 * keyword relationships, and returns the built artifacts.
 *
 * @param store - The entity store.
 * @param config - The NgDoc configuration.
 * @param additionalEntities - Additional entities to build.
 */
export function build(
	store: NgDocEntityStore,
	config: NgDocConfiguration,
	...additionalEntities: NgDocEntity[]
): OperatorFunction<NgDocEntity[], NgDocBuiltOutput[]> {
	return (source: Observable<NgDocEntity[]>) =>
		source.pipe(
			tap(() => store.updateKeywordMap(config.keywords)),
			map((entities: NgDocEntity[]) => buildCandidates(store, entities)),
			switchMap((entities: NgDocEntity[]) =>
				forkJoinOrEmpty(entities.map((e: NgDocEntity) => e.build().pipe(errorHandler([])))),
			),
			switchMap((output: NgDocBuiltOutput[][]) =>
				forkJoinOrEmpty(additionalEntities.map((e: NgDocEntity) => e.build())).pipe(
					map((additionalOutput: NgDocBuiltOutput[][]) => [...output, ...additionalOutput].flat()),
				),
			),
		);
}
