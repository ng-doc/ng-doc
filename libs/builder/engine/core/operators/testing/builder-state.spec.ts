import { cold } from 'jest-marbles';
import { of, switchMap, throwError } from 'rxjs';

import { BuilderDone, BuilderError, BuilderPending } from '../../types';
import { builderState } from '../builder-state';

describe('builderState function', () => {
	it('should return BuilderDone when source is successful', () => {
		const source = of('result');
		const result$ = source.pipe(builderState());

		expect(result$).toBeObservable(
			cold('(ab|)', {
				a: new BuilderPending(),
				b: new BuilderDone('result'),
			}),
		);
	});

	it('should return BuilderError when source errors out', () => {
		const source = throwError(new Error('error'));
		const result$ = source.pipe(builderState());

		expect(result$).toBeObservable(
			cold('(ab|)', {
				a: new BuilderPending(),
				b: new BuilderError([new Error('error')]),
			}),
		);
	});

	it('should handle multiple emissions from source', () => {
		const source = cold('a---b---c', { a: 'result1', b: 'result2', c: 'result3' });
		const result$ = source.pipe(switchMap((v) => of(v).pipe(builderState())));

		expect(result$).toBeObservable(
			cold('(pa)(pb)(pc)', {
				p: new BuilderPending(),
				a: new BuilderDone('result1'),
				b: new BuilderDone('result2'),
				c: new BuilderDone('result3'),
			}),
		);
	});
});
