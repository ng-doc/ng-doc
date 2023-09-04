import { Observable, OperatorFunction } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { NgDocBuildResult } from '../../interfaces';
import { forkJoinOrEmpty } from '../../operators';
import { NgDocEntity } from '../entities/abstractions/entity';
import { NgDocEntityStore } from '../entity-store';
import { buildCandidates } from '../functions/build-candidates';

/**
 * Operator that updates the keyword map, builds the artifacts for each entity based on the
 * keyword relationships, and returns the built artifacts.
 *
 * @param store - The entity store.
 * @param additionalEntities - Additional entities to build.
 */
export function build(
	store: NgDocEntityStore,
	...additionalEntities: NgDocEntity[]
): OperatorFunction<NgDocEntity[], NgDocBuildResult[]> {
	return (source: Observable<NgDocEntity[]>) =>
		source.pipe(
			map((entities: NgDocEntity[]) =>
				buildCandidates(store, entities).filter((e: NgDocEntity) => e.isReadyForBuild),
			),
			switchMap((entities: NgDocEntity[]) =>
				forkJoinOrEmpty(
					entities.map((e: NgDocEntity) => {
						e.beforeBuild();

						return e.build();
					}),
				),
			),
			switchMap((output: NgDocBuildResult[]) =>
				forkJoinOrEmpty(
					buildCandidates(store, additionalEntities).map((e: NgDocEntity) => {
						e.beforeBuild();

						return e.build();
					}),
				).pipe(
					map((additionalOutput: NgDocBuildResult[]) => output.concat(additionalOutput).flat()),
				),
			),
		);
}
