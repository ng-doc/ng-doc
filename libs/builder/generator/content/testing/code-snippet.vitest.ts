import { describe, expect, it } from 'vitest';

import { snippetRegion } from '../code-snippet';

describe('snippetRegion', () => {
  it('takes the first region of the id and removes every marker inside it', () => {
    const text = [
      'before();',
      '// snippet#part "Part" icon="star"',
      'one();',
      '// snippet',
      'untitled();',
      '// snippet',
      "const url = 'https://example.com'; //snippet-ish trailing comment",
      '/* snippet:css */',
      'two();',
      '// snippet#part',
      'between();',
      '// snippet#part',
      'later();',
      '// snippet#part',
    ].join('\n');
    expect(snippetRegion(text, 'part')).toEqual({
      status: 'found',
      code: ['one();', 'untitled();', 'two();'].join('\n'),
    });
  });

  it('drops blank lines around the region and the indentation its lines share', () => {
    const text = [
      'class A {',
      '\t// snippet#method',
      '',
      '\tmethod(): void {',
      '\t\tbody();',
      '',
      '\t}',
      '',
      '\t// snippet#method',
      '}',
    ].join('\r\n');
    expect(snippetRegion(text, 'method')).toEqual({
      status: 'found',
      code: ['method(): void {', '\tbody();', '', '}'].join('\n'),
    });
  });

  it('finds markers in HTML and block comments', () => {
    expect(snippetRegion('<!-- snippet#a -->\n<b>a</b>\n<!-- snippet#a -->', 'a')).toEqual({
      status: 'found',
      code: '<b>a</b>',
    });
    expect(snippetRegion('/* snippet#b */\n:host {}\n/* snippet#b */', 'b')).toEqual({
      status: 'found',
      code: ':host {}',
    });
  });

  it('gives an empty region as empty code', () => {
    expect(snippetRegion('// snippet#e\n\n// snippet#e', 'e')).toEqual({
      status: 'found',
      code: '',
    });
  });

  it('reports an id without a marker and a marker without its closing one', () => {
    expect(snippetRegion('// snippet#a\ncode();\n// snippet#a', 'b')).toEqual({
      status: 'unknown',
    });
    // An id is matched exactly, not as a prefix.
    expect(snippetRegion('// snippet#ab\ncode();\n// snippet#ab', 'a')).toEqual({
      status: 'unknown',
    });
    expect(snippetRegion('// snippet#a\ncode();', 'a')).toEqual({ status: 'unclosed' });
  });
});
