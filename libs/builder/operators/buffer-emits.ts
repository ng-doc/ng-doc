import {EMPTY, merge, Observable, OperatorFunction} from 'rxjs';
import {filter, map, switchMapTo, tap} from 'rxjs/operators';

export function bufferEmits<T>(emitter: Observable<unknown>): OperatorFunction<T, T[]> {
	return (source: Observable<T>) => {
		let buffer: T[] = [];
		let emitterCount: number = 0;

		return merge(
			source,
			emitter.pipe(
				tap(() => ++emitterCount),
				switchMapTo(EMPTY),
			),
		).pipe(
			tap((value: T) => buffer.push(value)),
			filter((v: T) => buffer.length === emitterCount),
			map(() => buffer),
			tap(() => {
				buffer = [];
				emitterCount = 0;
			}),
		);
	};
}
