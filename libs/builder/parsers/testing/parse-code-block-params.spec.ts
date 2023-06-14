import {parseCodeBlockParams} from '../parse-code-block-params';

describe('parseCodeBlockParams', () => {
	it('should parse language', () => {
		expect(parseCodeBlockParams('ts')).toStrictEqual({language: 'ts'});
	});

	it('should parse lineNumbers', () => {
		expect(parseCodeBlockParams('lineNumbers')).toStrictEqual({lineNumbers: true});
	});

	it('should parse fileName', () => {
		expect(parseCodeBlockParams('fileName="test.ts"')).toStrictEqual({fileName: 'test.ts'});
	});

	it('should parse file', () => {
		expect(parseCodeBlockParams('file="test.ts"')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: undefined,
			fileLineEnd: undefined,
		});
	});

	it('should parse fileLineStart', () => {
		expect(parseCodeBlockParams('file="test.ts"#L1')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: 1,
		});
	});

	it('should parse fileLineEnd', () => {
		expect(parseCodeBlockParams('file="test.ts"#L1-L2')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: 2,
		});
	});

	it('should parse fileLineStart with range', () => {
		expect(parseCodeBlockParams('file="test.ts"#L1-')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: undefined,
		});
	});

	it('should parse fileName with dots and dashes', () => {
		expect(parseCodeBlockParams('typescript fileName="ng-doc.config.ts"')).toStrictEqual({
			language: 'typescript',
			fileName: 'ng-doc.config.ts',
		});
	});

	it('should parse highlighted single lines', () => {
		expect(parseCodeBlockParams('ts {1, 5, 6}')).toStrictEqual({
			language: 'ts',
			highlightedLines: [1, 5, 6],
		});
	});

	it('should parse highlighted line range', () => {
		expect(parseCodeBlockParams('ts {1-5}')).toStrictEqual({
			language: 'ts',
			highlightedLines: [1, 2, 3, 4, 5],
		});
	});

	it('should parse highlighted line range with single line', () => {
		expect(parseCodeBlockParams('ts {1-5, 7}')).toStrictEqual({
			language: 'ts',
			highlightedLines: [1, 2, 3, 4, 5, 7],
		});
	});

	it('should parse highlighted lines without duplicates', () => {
		expect(parseCodeBlockParams('ts {1-5,2,4-7}')).toStrictEqual({
			language: 'ts',
			highlightedLines: [1, 2, 3, 4, 5, 6, 7],
		});
	});
});
