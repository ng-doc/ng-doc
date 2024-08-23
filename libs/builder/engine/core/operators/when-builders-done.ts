import { filter, map, OperatorFunction } from 'rxjs';

import { BuilderDone, BuilderState } from '../types';

/**
 * Operator function that transforms a source Observable of BuilderState array into an Observable of results array.
 * It filters out states that are not done and maps the done states to their results.
 * @template T The type of the result.
 * @returns {OperatorFunction<Array<BuilderState<T>>, Array<T>>} An OperatorFunction that can be used with pipe.
 */
export function whenBuildersDone<T>(): OperatorFunction<Array<BuilderState<T>>, T[]> {
  return (source) => {
    return source.pipe(
      // Filter out states that are not done.
      filter((states) => states.every((state) => state instanceof BuilderDone)),
      // Map the done states to their results.
      map((states) => (states as Array<BuilderDone<T>>).map((state) => state.result)),
    );
  };
}
