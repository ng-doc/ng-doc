import {vol} from 'memfs';

import {createCache} from '../create-cache';
import {NgDocCache} from '../interfaces';
import {isCacheValid} from '../is-cache-valid';
import {updateCache} from '../update-cache';

jest.mock('fs');

describe('isCacheValid', () => {
	beforeEach(() => {
		vol.reset();
	});

	it('should return true if cache is valid', () => {
		vol.fromJSON({
			'file1': 'content1',
			'file2': 'content2',
		})

		const cache: NgDocCache = createCache('0.0.0', ['file1', 'file2']);

		updateCache('test', cache);

		expect(isCacheValid('test', createCache('0.0.0', ['file1', 'file2']))).toBe(true);
	})

	it('should return false if version has changed', () => {
		vol.fromJSON({
			'file1': 'content1',
			'file2': 'content2',
		})

		const cache: NgDocCache = createCache('0.0.0', ['file1', 'file2']);

		updateCache('test', cache);

		expect(isCacheValid('test', createCache('1.0.0', ['file1', 'file2']))).toBe(false);
	})

	it('should return false if files have changed', () => {
		vol.fromJSON({
			'file1': 'content1',
			'file2': 'content2',
			'file3': 'content3',
		})

		const cache: NgDocCache = createCache('0.0.0', ['file1', 'file2']);

		updateCache('test', cache);

		expect(isCacheValid('test', createCache('0.0.0', ['file1', 'file3']))).toBe(false);
	})

	it('should return false if files content have changed', () => {
		vol.fromJSON({
			'file1': 'content1',
			'file2': 'content2',
		})

		const cache: NgDocCache = createCache('0.0.0', ['file1', 'file2']);

		updateCache('test', cache);

		vol.writeFileSync('file1', 'content1 changed');

		expect(isCacheValid('test', createCache('0.0.0', ['file1', 'file2']))).toBe(false);
	})
});
