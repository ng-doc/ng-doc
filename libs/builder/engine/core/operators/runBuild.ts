import { Observable, ObservableInput, ObservedValueOf, of, OperatorFunction } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { BuilderState } from '../types';
import { builderState } from './builder-state';

/**
 *
 * @param project
 */
export function runBuild<T, O extends ObservableInput<any>>(
	project: (value: T, index: number) => O,
): OperatorFunction<T, BuilderState<ObservedValueOf<O>>> {
	return (source: Observable<T>) =>
		source.pipe(switchMap((args: T) => of(args).pipe(switchMap(project), builderState())));
}
