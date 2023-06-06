import {Observable, of, OperatorFunction} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';

import {NgDocBuildOutput, NgDocConfiguration} from '../../interfaces';
import {forkJoinOrEmpty} from '../../operators';
import {errorHandler} from '../../operators/error-handler';
import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocEntityStore} from '../entity-store';

/**
 * Post-processes the build output.
 * It is used to update the keyword map and to run the post-process function of each entity.
 *
 * @param store - The entity store.
 * @param config - The configuration.
 * @param additionalEntities - Additional entities to be build and post-processed.
 */
export function postProcess(
	store: NgDocEntityStore,
	config: NgDocConfiguration,
	...additionalEntities: NgDocEntity[]
): OperatorFunction<NgDocBuildOutput[], NgDocBuildOutput[]> {
	return (source: Observable<NgDocBuildOutput[]>) =>
		source.pipe(
			tap(() => store.updateKeywordMap(config.keywords)),
			switchMap((outputs: NgDocBuildOutput[]) =>
				forkJoinOrEmpty(
					outputs.map((output: NgDocBuildOutput) => handlePostProcess(output).pipe(errorHandler(output))),
				).pipe(
					switchMap((postProcessedOutputs: NgDocBuildOutput[]) =>
						forkJoinOrEmpty(additionalEntities.map((e: NgDocEntity) => e.build().pipe(errorHandler([])))).pipe(
							map((additionalOutputs: NgDocBuildOutput[][]) => additionalOutputs.flat()),
							switchMap((additionalOutputs: NgDocBuildOutput[]) =>
								forkJoinOrEmpty(
									additionalOutputs.map((output: NgDocBuildOutput) =>
										handlePostProcess(output).pipe(errorHandler(output)),
									),
								),
							),
							map((additionalPostProcessedOutputs: NgDocBuildOutput[]) => [
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
function handlePostProcess(output: NgDocBuildOutput): Observable<NgDocBuildOutput> {
	return output.postProcessFn
		? output.postProcessFn(output.content).pipe(map((content: string) => ({...output, content})))
		: of(output);
}
