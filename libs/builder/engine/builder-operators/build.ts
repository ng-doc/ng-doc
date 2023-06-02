import {Observable, OperatorFunction} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';

import {NgDocBuiltOutput, NgDocConfiguration} from '../../interfaces';
import {forkJoinOrEmpty} from '../../operators';
import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocEntityStore} from '../entity-store';
import {buildCandidates} from '../functions/build-candidates';

/**
 *
 * @param store
 * @param config
 * @param {...any} additionalEntities
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
			switchMap((entities: NgDocEntity[]) => forkJoinOrEmpty(entities.map((e: NgDocEntity) => e.buildArtifacts()))),
			switchMap((output: NgDocBuiltOutput[][]) =>
				forkJoinOrEmpty(additionalEntities.map((e: NgDocEntity) => e.buildArtifacts())).pipe(
					map((additionalOutput: NgDocBuiltOutput[][]) => [...output, ...additionalOutput].flat()),
				),
			),
		);
}
