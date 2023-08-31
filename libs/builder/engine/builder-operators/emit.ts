import {Observable, OperatorFunction} from 'rxjs';
import {tap} from 'rxjs/operators';

import {emitBuiltOutput} from '../../helpers';
import {NgDocBuilderOutput} from '../../interfaces';
import {errorHandler} from '../../operators/error-handler';

/**
 * Operator that emits the built output after each source emission.
 */
export function emit(): OperatorFunction<NgDocBuilderOutput[], NgDocBuilderOutput[]> {
	return (source: Observable<NgDocBuilderOutput[]>) =>
		source.pipe(
			tap((e: NgDocBuilderOutput[]) => emitBuiltOutput(e)),
			errorHandler([]),
		);
}
