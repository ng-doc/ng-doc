import { cold } from 'jest-marbles';
import { of } from 'rxjs';

import { BuilderDone, BuilderError, BuilderPending } from '../../types';
import { factory } from '../factory';

describe('factory function', () => {
	it('should return BuilderDone when all builders are successful', () => {
		const builders = [of(new BuilderDone('result1')), of(new BuilderDone('result2'))];

		const result$ = factory(builders, (a, b) => a + b);

		expect(result$).toBeObservable(cold('(a|)', { a: new BuilderDone('result1result2') }));
	});

	it('should return BuilderError when any builder fails', () => {
		const builders = [of(new BuilderDone('result1')), of(new BuilderError([new Error()]))];
		const buildFn = jest.fn();

		const result$ = factory(builders, buildFn);

		expect(result$).toBeObservable(cold('(a|)', { a: new BuilderError([new Error()]) }));
	});

	it('should return BuilderPending when any builder is pending', () => {
		const builders = [of(new BuilderDone('result1')), of(new BuilderPending())];
		const buildFn = jest.fn();

		const result$ = factory(builders, buildFn);

		expect(result$).toBeObservable(cold('(a|)', { a: new BuilderPending() }));
	});

	it('should handle buildFn throwing an error', () => {
		const builders = [cold('(a|)', { a: new BuilderDone('result') })];

		const result$ = factory(builders, () => {
			throw new Error();
		});

		expect(result$).toBeObservable(cold('(a|)', { a: new BuilderError([new Error()]) }));
	});

	it('should trigger buildFn only once if multiple builders emit done state', () => {
		const builders = [
			cold('(apa-|)', {
				a: new BuilderDone('result1'),
				p: new BuilderPending(),
			}),
			cold('(a-pa|)', {
				a: new BuilderDone('result2'),
				p: new BuilderPending(),
			}),
		];

		const result$ = factory(builders, (a: string, b: string) => a + b);

		expect(result$).toBeObservable(cold('(a|)', { a: new BuilderDone('result1result2') }));
	});
});
