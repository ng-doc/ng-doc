import { inject, NgZone } from '@angular/core';
import {
  MonoTypeOperatorFunction,
  Observable,
  Observer,
  Operator,
  pipe,
  Subscriber,
  TeardownLogic,
} from 'rxjs';

class NgDocZoneDetachSourceOperator<T> implements Operator<T, T> {
  constructor(private readonly ngZone: NgZone) {}

  call(observer: Observer<T>, source: Observable<T>): TeardownLogic {
    return this.ngZone.runOutsideAngular(() => source.subscribe(observer));
  }
}

/**
 *
 * @param ngZone
 */
function zoneDetachSource<T>(ngZone: NgZone): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) => source.lift(new NgDocZoneDetachSourceOperator<T>(ngZone));
}

/**
 *
 * @param ngZone
 */
function zoneDetach<T>(ngZone: NgZone): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) =>
    new Observable((subscriber: Subscriber<T>) =>
      source.subscribe({
        next: (value: T) => ngZone.runOutsideAngular(() => subscriber.next(value)),
        error: (error: unknown) => ngZone.runOutsideAngular(() => subscriber.error(error)),
        complete: () => ngZone.runOutsideAngular(() => subscriber.complete()),
      }),
    );
}

/**
 *
 * @param ngZone
 */
export function ngDocZoneAttach<T>(ngZone?: NgZone): MonoTypeOperatorFunction<T> {
  ngZone = ngZone || inject(NgZone);

  return (source: Observable<T>) =>
    new Observable((subscriber: Subscriber<T>) =>
      source.subscribe({
        next: (value: T) => ngZone.run(() => subscriber.next(value)),
        error: (error: unknown) => ngZone.run(() => subscriber.error(error)),
        complete: () => ngZone.run(() => subscriber.complete()),
      }),
    );
}

/**
 *
 * @param ngZone
 */
export function ngDocZoneDetach<T>(ngZone?: NgZone): MonoTypeOperatorFunction<T> {
  ngZone = ngZone || inject(NgZone);

  return pipe(zoneDetach(ngZone), zoneDetachSource(ngZone));
}

/**
 *
 * @param ngZone
 */
export function ngDocZoneOptimize<T>(ngZone?: NgZone): MonoTypeOperatorFunction<T> {
  ngZone = ngZone || inject(NgZone);

  return pipe(zoneDetach(ngZone), zoneDetachSource(ngZone), ngDocZoneAttach(ngZone));
}
