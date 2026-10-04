import { describe, expect, it } from 'vitest';

import { parseCodeBlockParams } from '../parse-code-block-params';

describe('parseCodeBlockParams', () => {
  it('should parse language', () => {
    expect(parseCodeBlockParams('ts')).toStrictEqual({ language: 'ts' });
  });

  it('should parse lineNumbers', () => {
    expect(parseCodeBlockParams('lineNumbers')).toStrictEqual({ lineNumbers: true });
  });

  it('should parse fileName', () => {
    expect(parseCodeBlockParams('fileName="test.ts"')).toStrictEqual({ name: 'test.ts' });
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
      name: 'ng-doc.config.ts',
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

  it('should parse icon', () => {
    expect(parseCodeBlockParams('ts icon="icon"')).toStrictEqual({
      language: 'ts',
      icon: 'icon',
    });
  });

  it.each([
    'c++',
    'c#',
    'f#',
    'objective-c',
    'objective-cpp',
    'f90',
    '1c',
    'actionscript-3',
    '文言',
  ])('should parse the Shiki language %s', (language) => {
    expect(parseCodeBlockParams(language)).toStrictEqual({ language });
  });

  it('should parse the parameters after a language with symbols', () => {
    expect(parseCodeBlockParams('c++ name="main.cpp" group="native" active {1-2}')).toStrictEqual({
      language: 'c++',
      name: 'main.cpp',
      group: 'native',
      active: true,
      highlightedLines: [1, 2],
    });
    expect(parseCodeBlockParams('c#{3}')).toStrictEqual({ language: 'c#', highlightedLines: [3] });
    expect(parseCodeBlockParams('f# file="./main.fs"#L2-L3')).toStrictEqual({
      language: 'f#',
      file: './main.fs',
      fileLineStart: 1,
      fileLineEnd: 3,
    });
  });

  it('should still reject an unknown parameter after the language', () => {
    expect(() => parseCodeBlockParams('c++ unknown')).toThrow(
      'Unable to parse code block options: "c++ unknown"',
    );
    expect(() => parseCodeBlockParams('ts name=main.ts')).toThrow();
  });

  describe('with snippets', () => {
    const snippets = { snippets: true };

    it.each([
      ['file="test.ts"', { file: 'test.ts', fileLineStart: undefined, fileLineEnd: undefined }],
      ['file="test.ts"#L1', { file: 'test.ts', fileLineStart: 0, fileLineEnd: 1 }],
      ['file="test.ts"#L1-L2', { file: 'test.ts', fileLineStart: 0, fileLineEnd: 2 }],
      ['file="test.ts"#L1-', { file: 'test.ts', fileLineStart: 0, fileLineEnd: undefined }],
      [
        'f# file="./main.fs"#L2-L3 {1}',
        {
          language: 'f#',
          file: './main.fs',
          fileLineStart: 1,
          fileLineEnd: 3,
          highlightedLines: [1],
        },
      ],
    ])('parses %s as without snippets', (options, expected) => {
      expect(parseCodeBlockParams(options, snippets)).toStrictEqual(expected);
      expect(parseCodeBlockParams(options)).toStrictEqual(expected);
    });

    it.each(['greeting', 'html-part', 'Lambda', 'L1-5', 'L', '2'])(
      'parses #%s after the file as a snippet id',
      (snippet) => {
        expect(
          parseCodeBlockParams(`typescript name="a.ts" file="./a.ts"#${snippet} {2}`, snippets),
        ).toStrictEqual({
          language: 'typescript',
          name: 'a.ts',
          file: './a.ts',
          fileLineStart: undefined,
          fileLineEnd: undefined,
          snippet,
          highlightedLines: [2],
        });
      },
    );

    it('rejects a snippet id without the option, as before', () => {
      expect(() => parseCodeBlockParams('ts file="./a.ts"#greeting')).toThrow(
        'Unable to parse code block options',
      );
    });

    it('keeps a fragment inside the quotes in the file path (no snippet)', () => {
      expect(parseCodeBlockParams('file="./a.ts#greeting"', snippets)).toStrictEqual({
        file: './a.ts#greeting',
        fileLineStart: undefined,
        fileLineEnd: undefined,
      });
    });
  });
});
