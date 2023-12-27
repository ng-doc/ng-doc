import { cold } from 'jest-marbles';

import { BuilderDone, BuilderPending } from '../../types';
import { builderState, whenStackIsEmpty } from '../builder-state';

describe('whenStackIsEmpty function', () => {
	it('should buffer values and emit them when stack is empty', () => {
		const source = cold('a-b-c', { a: 'result1', b: 'result2', c: 'result3' });
		const expected = cold('a-b-c', {
			a: new BuilderDone('result1'),
			b: new BuilderDone('result2'),
			c: new BuilderDone('result3'),
		});
		const result$ = source.pipe(builderState(), whenStackIsEmpty());

		expect(result$).toBeObservable(expected);
	});

	it('should not emit values when stack is not empty', () => {
		const source = cold('a', { a: new BuilderPending() });
		const result$ = source.pipe(whenStackIsEmpty());

		expect(result$).toBeObservable(cold(''));
	});
});
