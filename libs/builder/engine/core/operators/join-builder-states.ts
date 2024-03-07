import { asArray } from '@ng-doc/core';
import { Observable, of } from 'rxjs';

import {
  BuilderDone,
  BuilderError,
  BuilderPending,
  BuilderState,
  isBuilderError,
  isBuilderPending,
} from '../types';

/**
 *
 * @param tag
 * @param states
 * @param project
 */
export function joinBuilderStates<T, R>(
  tag: string,
  states: Array<BuilderState<T>>,
  project: (...args: T[]) => Observable<BuilderState<R>>,
): Observable<BuilderState<R>> {
  /**
   * If any of the states are pending, return an Observable of BuilderPending.
   */
  if (states.some(isBuilderPending)) {
    return of(new BuilderPending(tag));
  }

  const errors = states.filter(isBuilderError);

  /**
   * If there are any errors in the states, return an Observable of BuilderError.
   */
  if (errors.length) {
    return of(new BuilderError(tag, asArray(...errors.map(({ error }) => error))));
  }

  return project(...(states as Array<BuilderDone<T>>).map(({ result }) => result));
}
