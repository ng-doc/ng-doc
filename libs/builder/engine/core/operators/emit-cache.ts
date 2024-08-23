import { PENDING_CACHE } from '@ng-doc/builder';
import { OperatorFunction } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Creates an RxJS operator that triggers the execution of cached emit functions.
 * This operator is designed to be used in an RxJS pipeline where caching mechanisms
 * are in place to temporarily store emit functions. Upon invocation, it iterates over
 * the `PENDING_CACHE`, executing each cached emit function.
 *
 * The `PENDING_CACHE` is expected to be a collection (e.g., array) of functions that
 * are intended to be executed to emit values or perform actions that were deferred.
 *
 * This operator does not alter the stream's data directly but performs side effects
 * (the execution of emit functions) that may influence the application's state or behavior.
 * @template T The type of items in the observable stream.
 * @returns An OperatorFunction<T, T> that maintains the stream's data type and performs
 * the side effect of executing cached emit functions.
 */
export function emitCache<T>(): OperatorFunction<T, T> {
  return (source) => {
    return source.pipe(
      tap(() => {
        // Iterate over the PENDING_CACHE and execute each emit function
        PENDING_CACHE.forEach((emitCache) => emitCache());
        // Clear the PENDING_CACHE after all emit functions are executed
        PENDING_CACHE.length = 0;
      }),
    );
  };
}
