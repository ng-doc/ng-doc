import { asArray } from '@ng-doc/core';
import { Observable, OperatorFunction } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { NgDocBuildResult } from '../../interfaces';
import { forkJoinOrEmpty } from '../../operators';
import { errorHandler } from '../../operators/error-handler';
import { executePlugins } from '../entities/plugins';

/**
 *
 */
export function postBuild<T extends NgDocBuildResult>(): OperatorFunction<T[], T[]> {
	return (source: Observable<T[]>) =>
		source.pipe(
			switchMap((outputs: T[]) =>
				forkJoinOrEmpty(
					outputs.map((output: T) => handlePostBuild(output).pipe(errorHandler(output))),
				),
			),
		);
}

/**
 *
 * @param output
 */
function handlePostBuild<T extends NgDocBuildResult>(output: T): Observable<T> {
	return executePlugins(output.result, output.entity, asArray(output.postBuildPlugins)).pipe(
		map((result) => Object.assign({}, output, { result })),
	);
}
