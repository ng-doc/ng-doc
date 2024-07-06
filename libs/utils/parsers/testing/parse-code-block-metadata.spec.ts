import { parseCodeBlockMetadata } from '../parse-code-block-metadata';

describe('parseCodeBlockMetadata', () => {
	it('should parse lineNumbers', () => {
		expect(parseCodeBlockMetadata('lineNumbers')).toStrictEqual({ lineNumbers: true });
	});

	it('should parse fileName', () => {
		expect(parseCodeBlockMetadata('fileName="test.ts"')).toStrictEqual({ name: 'test.ts' });
	});

	it('should parse file', () => {
		expect(parseCodeBlockMetadata('file="test.ts"')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: undefined,
			fileLineEnd: undefined,
		});
	});

	it('should parse fileLineStart', () => {
		expect(parseCodeBlockMetadata('file="test.ts"#L1')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: 1,
		});
	});

	it('should parse fileLineEnd', () => {
		expect(parseCodeBlockMetadata('file="test.ts"#L1-L2')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: 2,
		});
	});

	it('should parse fileLineStart with range', () => {
		expect(parseCodeBlockMetadata('file="test.ts"#L1-')).toStrictEqual({
			file: 'test.ts',
			fileLineStart: 0,
			fileLineEnd: undefined,
		});
	});

	it('should parse fileName with dots and dashes', () => {
		expect(parseCodeBlockMetadata('fileName="ng-doc.config.ts"')).toStrictEqual({
			name: 'ng-doc.config.ts',
		});
	});

	it('should parse highlighted single lines', () => {
		expect(parseCodeBlockMetadata('{1, 5, 6}')).toStrictEqual({
			highlightedLines: [1, 5, 6],
		});
	});

	it('should parse highlighted line range', () => {
		expect(parseCodeBlockMetadata('{1-5}')).toStrictEqual({
			highlightedLines: [1, 2, 3, 4, 5],
		});
	});

	it('should parse highlighted line range with single line', () => {
		expect(parseCodeBlockMetadata('{1-5, 7}')).toStrictEqual({
			highlightedLines: [1, 2, 3, 4, 5, 7],
		});
	});

	it('should parse highlighted lines without duplicates', () => {
		expect(parseCodeBlockMetadata('{1-5,2,4-7}')).toStrictEqual({
			highlightedLines: [1, 2, 3, 4, 5, 6, 7],
		});
	});

	it('should parse icon', () => {
		expect(parseCodeBlockMetadata('icon="icon"')).toStrictEqual({
			icon: 'icon',
		});
	});

  it('should parse multiple options', () => {
    expect(parseCodeBlockMetadata('file="test.ts" icon="icon"')).toStrictEqual({
      file: 'test.ts',
      fileLineStart: undefined,
      fileLineEnd: undefined,
      icon: 'icon',
    });
  })
});
