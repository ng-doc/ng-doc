import { isPresent } from '@ng-doc/core';
import {
  filter,
  finalize,
  map,
  merge,
  Observable,
  of,
  OperatorFunction,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { debounceTime, distinctUntilChanged, take } from 'rxjs/operators';

import { BuilderPending, BuilderState, EndStates, isBuilderPending } from '../types';

let builderId = 0;

// const BUILDER_STEPS = ['load-entry-files', '']

export const STACK = new Map<string, Set<number>>();
const STACK_TICK = new Subject<void>();

/**
 *
 * @param tag
 */
export function addToStack<T>(tag: string): OperatorFunction<BuilderState<T>, BuilderState<T>> {
  const tagStack = STACK.get(tag) || new Set<number>();
  const id = builderId++;

  STACK.set(tag, tagStack);

  return (source) => {
    return source.pipe(
      tap({
        next: (state) => {
          state instanceof BuilderPending ? tagStack.add(id) : tagStack.delete(id);

          // state instanceof BuilderPending
          //   ? console.log('added:', tag, tagStack.size)
          //   : console.log('removed:', tag, tagStack.size);

          STACK_TICK.next();
        },
      }),
      finalize(() => {
        tagStack.delete(id);
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
): OperatorFunction<BuilderState<T>, Array<EndStates<T>>> {
  let buffer: Array<EndStates<T>> = [];

  return (source) => {
    return source.pipe(
      tap((value) => !isBuilderPending(value) && buffer.push(value)),
      filter(() => {
        const stacks = tag
          ? tag.map((tag) => STACK.get(tag)).filter(isPresent)
          : [...STACK.values()];

        return !stacks.some((stack) => stack.size);
      }),
      switchMap(() => of(buffer)),
      tap(() => (buffer = [])),
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
    debounceTime(0),
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

/**
 *
 * @param tags
 */
export function afterBuilders(tags: string[]): Observable<void> {
  const stackChanges = STACK_TICK.pipe(
    map(() => (tags ? tags.map((tag) => STACK.get(tag)).filter(isPresent) : [...STACK.values()])),
  );

  return stackChanges.pipe(
    debounceTime(0),
    filter((stacks) => stacks.some((stack) => stack.size)),
    switchMap(() =>
      stackChanges.pipe(
        filter((stacks) => !stacks.some((stack) => stack.size)),
        take(1),
      ),
    ),
    map(() => void 0),
  );
}
