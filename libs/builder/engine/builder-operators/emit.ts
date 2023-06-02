import {Observable, OperatorFunction} from 'rxjs';
import {tap} from 'rxjs/operators';

import {emitBuiltOutput} from '../../helpers';
import {NgDocBuiltOutput} from '../../interfaces';

/**
 * Operator that emits the built output after each source emission.
 */
export function emit(): OperatorFunction<NgDocBuiltOutput[], NgDocBuiltOutput[]> {
	return (source: Observable<NgDocBuiltOutput[]>) => source.pipe(tap((e: NgDocBuiltOutput[]) => emitBuiltOutput(...e)));
}
