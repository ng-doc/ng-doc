import {asArray} from '@ng-doc/core';
import {Observable, OperatorFunction} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';

import {NgDocBuildResult, NgDocConfiguration} from '../../interfaces';
import {forkJoinOrEmpty} from '../../operators';
import {errorHandler} from '../../operators/error-handler';
import {NgDocEntity} from '../entities/abstractions/entity';
import {runPlugins} from '../entities/plugins';
import {NgDocEntityStore} from '../entity-store';

/**
 * Post-processes the build output.
 * It is used to update the keyword map and to run the post-process function of each entity.
 *
 * @param store - The entity store.
 * @param config - The configuration.
 * @param additionalEntities - Additional entities to be build and post-processed.
 */
export function postProcess<T extends NgDocBuildResult>(
	store: NgDocEntityStore,
	config: NgDocConfiguration,
	...additionalEntities: NgDocEntity[]
): OperatorFunction<T[], T[]> {
	return (source: Observable<T[]>) =>
		source.pipe(
			tap(() => store.updateKeywordMap()),
			switchMap((outputs: T[]) =>
				forkJoinOrEmpty(outputs.map((output: T) => handlePostProcess(output).pipe(errorHandler(output)))).pipe(
					switchMap((postProcessedOutputs: T[]) =>
						forkJoinOrEmpty(additionalEntities.map((e) => e.build() as Observable<T>)).pipe(
							switchMap((additionalOutputs: T[]) =>
								forkJoinOrEmpty(
									additionalOutputs.map((output: T) => handlePostProcess(output).pipe(errorHandler(output))),
								),
							),
							map((additionalPostProcessedOutputs: T[]) => [
								...postProcessedOutputs,
								...additionalPostProcessedOutputs,
							]),
						),
					),
				),
			),
		);
}

/**
 *
 * @param output
 */
function handlePostProcess<T extends NgDocBuildResult>(output: T): Observable<T> {
	return runPlugins(output.result, output.entity, asArray(output.postProcessPlugins)).pipe(
		map((result) => Object.assign({}, output, {result})),
	);
}
