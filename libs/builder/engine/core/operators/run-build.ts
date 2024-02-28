import {
  BehaviorSubject,
  finalize,
  Observable,
  ObservableInput,
  ObservedValueOf,
  of,
  OperatorFunction,
  withLatestFrom,
} from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';

import { BuilderState } from '../types';
import { builderState } from './builder-state';

const builders = new Set<BehaviorSubject<boolean>>();

/**
 * Refreshes the state of all builders.
 * By default, all builders can be run only once, but this function allows them to be run again.
 */
export function refreshBuildersStates(): void {
  builders.forEach((b) => b.next(true));
}

/**
 *
 * @param tag
 * @param project
 * @param stage
 */
export function runBuild<T, O extends ObservableInput<any>>(
  tag: string,
  project: (value: T, index: number) => O,
): OperatorFunction<T, BuilderState<ObservedValueOf<O>>> {
  const fresh = new BehaviorSubject<boolean>(true);

  builders.add(fresh);

  return (source: Observable<T>) =>
    source.pipe(
      withLatestFrom(fresh),
      filter(([, isFresh]) => isFresh),
      map(([v]) => {
        fresh.next(false);

        return v;
      }),
      switchMap((args: T) => of(args).pipe(switchMap(project), builderState(tag))),
      finalize(() => builders.delete(fresh)),
    );
}
