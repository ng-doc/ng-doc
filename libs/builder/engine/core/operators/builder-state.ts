import { catchError, filter, map, of, OperatorFunction, startWith, switchMap, tap } from 'rxjs';

import {
	BuilderDone,
	BuilderError,
	BuilderPending,
	BuilderState,
	isBuilderPending,
} from '../types';

let builderId = 0;
const STACK = new Set();

/**
 * Operator function that transforms a source Observable into an Observable of BuilderState.
 * It emits a BuilderPending state at the start, then a BuilderDone state when the source emits,
 * and a BuilderError state if the source errors out.
 * It also manages a global stack of pending builders.
 * @template T The type of the source Observable.
 * @returns {OperatorFunction<T, BuilderState<T>>} An OperatorFunction that can be used with pipe.
 */
export function builderState<T>(): OperatorFunction<T, BuilderState<T>> {
	const id = builderId++;

	return (source) => {
		return source.pipe(
			map((result) => new BuilderDone(result)),
			startWith(new BuilderPending()),
			catchError((error: Error) => of(new BuilderError([error]))),
			tap((state) => {
				state instanceof BuilderPending ? STACK.add(id) : STACK.delete(id);
			}),
		);
	};
}

/**
 * Operator function that buffers values from the source Observable until the global stack of pending builders is empty.
 * When the stack is empty, it emits all buffered values and clears the buffer.
 * @template T The type of the source Observable.
 * @returns {OperatorFunction<T, T>} An OperatorFunction that can be used with pipe.
 */
export function whenStackIsEmpty<T>(): OperatorFunction<
	BuilderState<T>,
	BuilderDone<T> | BuilderError
> {
	let buffer: Array<BuilderDone<T> | BuilderError> = [];

	return (source) => {
		return source.pipe(
			tap((value) => !isBuilderPending(value) && buffer.push(value)),
			filter(() => STACK.size === 0),
			switchMap(() => {
				const result = of(...buffer);

				buffer = [];

				return result;
			}),
		);
	};
}
