import { isPresent } from '@ng-doc/core';
import {
  asyncScheduler,
  catchError,
  distinctUntilChanged,
  filter,
  map,
  merge,
  Observable,
  of,
  OperatorFunction,
  startWith,
  Subject,
  subscribeOn,
  switchMap,
  tap,
} from 'rxjs';

import {
  BuilderDone,
  BuilderError,
  BuilderPending,
  BuilderState,
  isBuilderPending,
} from '../types';

let builderId = 0;
const STACK = new Map<string, Set<number>>();
const STACK_TICK = new Subject<void>();

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
  const tagStack = STACK.get(tag) || new Set<number>();
  const id = builderId++;

  STACK.set(tag, tagStack);

  return (source) => {
    return source.pipe(
      subscribeOn(asyncScheduler),
      map((result) => new BuilderDone(tag, result)),
      startWith(new BuilderPending(tag)),
      catchError((error: Error) => of(new BuilderError(tag, [error]))),
      tap((state) => {
        state instanceof BuilderPending ? tagStack.add(id) : tagStack.delete(id);
        STACK_TICK.next();
      }),
    );
  };
}

/**
 * Operator function that buffers values from the source Observable until the global stack of pending builders is empty.
 * When the stack is empty, it emits all buffered values and clears the buffer.
 * @param tag
 * @template T The type of the source Observable.
 * @returns {OperatorFunction<T, T>} An OperatorFunction that can be used with pipe.
 */
export function whenStackIsEmpty<T>(
  tag?: string[],
): OperatorFunction<BuilderState<T>, BuilderDone<T> | BuilderError> {
  let buffer: Array<BuilderDone<T> | BuilderError> = [];

  return (source) => {
    return source.pipe(
      tap((value) => !isBuilderPending(value) && buffer.push(value)),
      filter(() => {
        const stacks = tag
          ? tag.map((tag) => STACK.get(tag)).filter(isPresent)
          : [...STACK.values()];

        return stacks.every((stack) => !stack.size);
      }),
      switchMap(() => {
        const result = of(...buffer);

        buffer = [];

        return result;
      }),
    );
  };
}

/**
 *
 * @param tags
 * @param triggers
 */
export function whenBuildersStackIsEmpty(tags?: string[]): Observable<void> {
  return merge(STACK_TICK).pipe(
    map(() => {
      const stacks = tags
        ? tags.map((tag) => STACK.get(tag)).filter(isPresent)
        : [...STACK.values()];

      return stacks.every((stack) => !stack.size);
    }),
    distinctUntilChanged(),
    filter(Boolean),
    map(() => void 0),
  );
}
