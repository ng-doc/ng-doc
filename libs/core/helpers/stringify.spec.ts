import { describe, expect, it } from 'vitest';

import { stringify } from './stringify';

describe('stringify', () => {
  it('writes JSON, and undefined as its name', () => {
    expect(stringify({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(stringify('x')).toBe('"x"');
    expect(stringify(undefined)).toBe('undefined');
  });

  it('always returns a string, also for values JSON has no text for', () => {
    expect(stringify(Symbol('s'))).toBe('Symbol(s)');
    expect(typeof stringify(() => 1)).toBe('string');
  });
});
