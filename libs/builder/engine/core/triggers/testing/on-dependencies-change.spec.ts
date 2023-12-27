import { cold } from 'jest-marbles';
import { NEVER, of } from 'rxjs';

import { ObservableSet } from '../../../../classes';
import * as watcher from '../../watcher/watch-file';
import { onDependenciesChange } from '../on-dependencies-change';

jest.mock('../../watcher/watch-file');

describe('onDependenciesChange function', () => {
	it('should emit void when file update event occurs', () => {
		const dependencies = new ObservableSet<string>(['filePath1', 'filePath2']);

		jest
			.spyOn(watcher, 'watchFile')
			.mockImplementation((path) => of({ type: path === 'filePath1' ? 'update' : 'delete', path }));

		const result$ = onDependenciesChange(dependencies);

		expect(result$).toBeObservable(cold('(a)', { a: undefined }));
	});

	it('should debounce file updates', () => {
		const dependencies = new ObservableSet<string>(['filePath1', 'filePath2']);

		jest.spyOn(watcher, 'watchFile').mockImplementation((path) => of({ type: 'update', path }));

		const result$ = onDependenciesChange(dependencies);

		expect(result$).toBeObservable(cold('(a)', { a: undefined }));
	});

	it('should not emit void when file delete event occurs', () => {
		const dependencies = new ObservableSet<string>(['filePath1', 'filePath2']);

		jest.spyOn(watcher, 'watchFile').mockImplementation(() => NEVER);

		const result$ = onDependenciesChange(dependencies);

		expect(result$).toBeObservable(cold('', { a: undefined }));
	});
});
