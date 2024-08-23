import { catchError, map, of, OperatorFunction, startWith } from 'rxjs';

import { BuilderDone, BuilderError, BuilderPending, BuilderState } from '../types';
import { addToStack } from './stack';

/**
 * Operator function that transforms a source Observable into an Observable of BuilderState.
 * It emits a BuilderPending state at the start, then a BuilderDone state when the source emits,
 * and a BuilderError state if the source errors out.
 * It also manages a global stack of pending builders.
 * @param stage
 * @param tag
 * @template T The type of the source Observable.
 * @returns {OperatorFunction<T, BuilderState<T>>} An OperatorFunction that can be used with pipe.
 */
export function builderState<T>(tag: string): OperatorFunction<T, BuilderState<T>> {
  return (source) =>
    source.pipe(
      map((result) => new BuilderDone(tag, result)),
      startWith(new BuilderPending(tag)),
      catchError((error: Error) => of(new BuilderError(tag, [error]))),
      addToStack(tag),
    );
}
