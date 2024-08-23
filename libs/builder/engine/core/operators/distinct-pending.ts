import { distinctUntilChanged, OperatorFunction } from 'rxjs';

import { BuilderState, isBuilderPending } from '../types';

/**
 *
 */
export function distinctPending<T>(): OperatorFunction<BuilderState<T>, BuilderState<T>> {
  return (source) =>
    source.pipe(distinctUntilChanged((a, b) => a.state === b.state && isBuilderPending(a)));
}
