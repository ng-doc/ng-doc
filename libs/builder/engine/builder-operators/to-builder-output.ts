import {Observable, OperatorFunction} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {NgDocBuilderOutput, NgDocBuildResult} from '../../interfaces';
import {forkJoinOrEmpty} from '../../operators';

/**
 * Converts the build result to a builder output.
 */
export function toBuilderOutput<T extends NgDocBuildResult>(): OperatorFunction<T[], NgDocBuilderOutput[]> {
	return (source: Observable<T[]>) =>
		source.pipe(
			switchMap((outputs: T[]) => forkJoinOrEmpty(outputs.map((output: T) => output.toBuilderOutput(output.result)))),
		);
}
