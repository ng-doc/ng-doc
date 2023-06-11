import {parseCodeBlockParams} from '../parse-code-block-params';

describe('parseCodeBlockParams', () => {
	it('should parse language', () => {
		expect(parseCodeBlockParams('ts')).toStrictEqual({language: 'ts'});
	})

	it('should parse lineNumbers', () => {
		expect(parseCodeBlockParams('lineNumbers')).toStrictEqual({lineNumbers: true});
	})

	it('should parse fileName', () => {
		expect(parseCodeBlockParams('fileName="test.ts"')).toStrictEqual({fileName: 'test.ts'});
	})

	it('should parse file', () => {
		expect(parseCodeBlockParams('file="test.ts"')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: undefined,
			fileLineEnd: undefined,
		});
	})

	it('should parse fileLineStart', () => {
		expect(parseCodeBlockParams('file="test.ts"#L1')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: 1,
		});
	})

	it('should parse fileLineEnd', () => {
		expect(parseCodeBlockParams('file="test.ts"#L1-L2')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: 2,
		});
	})

	it('should parse fileLineStart with range', () => {
		expect(parseCodeBlockParams('file="test.ts"#L1-')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: undefined,
		});
	})

	it('should parse fileName with dots and dashes', () => {
		expect(parseCodeBlockParams('typescript fileName="ng-doc.config.ts"')).toStrictEqual({
			language: 'typescript',
			fileName: 'ng-doc.config.ts',
		});
	})
})
