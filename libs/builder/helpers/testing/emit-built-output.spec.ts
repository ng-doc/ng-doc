import {vol} from 'memfs';

import {emitBuiltOutput} from '../emit-built-output';

jest.mock('fs');

describe('emitBuiltOutput', () => {
	beforeEach(() => {
		vol.reset();
	})

	it('should emit file', () => {
		const filePath: string = '/path/to/file.html';
		const fileContent: string = 'file content';

		emitBuiltOutput({
			filePath,
			content: fileContent
		});

		expect(vol.toJSON()).toStrictEqual({
			[filePath]: fileContent
		});
	})

	it('should emit multiple files', () => {
		const filePath1: string = '/path/to/file1.html';
		const fileContent1: string = 'file content 1';
		const filePath2: string = '/path/to/file2.html';
		const fileContent2: string = 'file content 2';

		emitBuiltOutput({
			filePath: filePath1,
			content: fileContent1
		}, {
			filePath: filePath2,
			content: fileContent2
		});

		expect(vol.toJSON()).toStrictEqual({
			[filePath1]: fileContent1,
			[filePath2]: fileContent2
		});
	})
})
