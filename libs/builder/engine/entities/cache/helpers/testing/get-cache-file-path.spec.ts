import { vol } from 'memfs';

import { getCacheFilePath } from '../get-cache-file-path';

jest.mock('fs');

describe('getCacheFilePath', () => {
	beforeEach(() => {
		vol.reset();
	});

	it('should return correct path', () => {
		const cacheFilePath: string = getCacheFilePath('test');

		expect(cacheFilePath).toBe('.cache/098f6bcd4621d373cade4e832627b4f6.json');
	});
});
