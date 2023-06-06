import {Observable, OperatorFunction} from 'rxjs';
import {tap} from 'rxjs/operators';

import {emitBuiltOutput} from '../../helpers';
import {NgDocBuildOutput} from '../../interfaces';
import {errorHandler} from '../../operators/error-handler';

/**
 * Operator that emits the built output after each source emission.
 */
export function emit(): OperatorFunction<NgDocBuildOutput[], NgDocBuildOutput[]> {
	return (source: Observable<NgDocBuildOutput[]>) =>
		source.pipe(
			tap((e: NgDocBuildOutput[]) => emitBuiltOutput(e)),
			errorHandler([]),
		);
}
