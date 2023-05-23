import {vol} from 'memfs';

import {createCache} from '../create-cache';
import {NgDocCache} from '../interfaces';

jest.mock('fs');

describe('createCache', () => {
	beforeEach(() => {
		vol.reset();

		vol.fromJSON({
			'folder/file1': 'content',
			'folder/file2': 'content',
		});
	});

	it('should return an empty cache if nothing was provided', () => {
		const result: NgDocCache = createCache();

		expect(result).toStrictEqual({
			version: undefined,
			properties: undefined,
		});
	});

	it('should return a cache with files if files were provided', () => {
		const result: NgDocCache = createCache(undefined, ['folder/file1', 'folder/file2']);

		expect(result).toStrictEqual({
			version: undefined,
			properties: undefined,
			files: {
				'folder/file1': '9a0364b9e99bb480dd25e1f0284c8555',
				'folder/file2': '9a0364b9e99bb480dd25e1f0284c8555'
			},
		});
	})

	it('should return a cache with properties if properties were provided', () => {
		const result: NgDocCache = createCache(undefined, undefined, {property: 'value'});

		expect(result).toStrictEqual({
			version: undefined,
			properties: {property: 'value'},
		});
	})

	it('should return a cache with version if version was provided', () => {
		const result: NgDocCache = createCache('1.0.0');

		expect(result).toStrictEqual({
			version: '1.0.0',
			properties: undefined,
		});
	})
});
