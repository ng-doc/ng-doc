import {vol} from 'memfs';

import {loadCache} from '../load-cache';

jest.mock('fs');

describe('loadCache', () => {
	beforeEach(() => {
		vol.reset();
	});

	it('should load cache', () => {
		vol.fromJSON({
			'.cache/098f6bcd4621d373cade4e832627b4f6.json': JSON.stringify({version: '0.0.0'})
		})

		expect(loadCache('test')).toEqual({version: '0.0.0'})
	})
});
