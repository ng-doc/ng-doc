import {
  ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT,
  ɵNgDocPlaygroundState,
  ɵplaygroundStateFromFragment,
  ɵplaygroundStateToFragment,
} from '@ng-doc/app/demo-app';
import { describe, expect, it } from 'vitest';

/**
 *
 * @param state
 */
function fragmentOf(state: ɵNgDocPlaygroundState): string {
  const result = ɵplaygroundStateToFragment(state);

  if (!result.ok) throw new Error(`refused: ${result.path} ${result.reason}`);
  return result.fragment;
}

const state = (
  properties: Record<string, unknown>,
  extra: Partial<ɵNgDocPlaygroundState> = {},
): ɵNgDocPlaygroundState => ({
  inputs: Object.keys(properties),
  properties,
  content: [],
  recreate: false,
  ...extra,
});

describe('the URL fragment of an isolated playground', () => {
  it('writes simple values as readable parameters', () => {
    expect(fragmentOf(state({ label: 'Save', size: 2, disabled: true }))).toBe(
      '~inputs=label,size,disabled&label=Save&size=2&disabled=true',
    );
    expect(fragmentOf(state({ label: 'Grüße & more' }))).toBe(
      '~inputs=label&label=Gr%C3%BC%C3%9Fe%20%26%20more',
    );
  });

  it('quotes a string that would read as another type', () => {
    const fragment = fragmentOf(state({ a: 'true', b: '12', c: '"x"', d: '' }));

    expect(fragment).toBe('~inputs=a,b,c,d&a=%22true%22&b=%2212%22&c=%22%5C%22x%5C%22%22&d=');
    expect(ɵplaygroundStateFromFragment(fragment).properties).toStrictEqual({
      a: 'true',
      b: '12',
      c: '"x"',
      d: '',
    });
  });

  it('carries every other value in one encoded parameter, with the content and Recreate', () => {
    const properties = {
      label: 'Save',
      tags: ['a', 'b'],
      when: new Date('2026-10-30T00:00:00.000Z'),
      off: undefined,
      nothing: null,
      zero: -0,
      wide: Number.POSITIVE_INFINITY,
    };
    const fragment = fragmentOf(
      state(properties, { content: ['icon', 'my slot'], recreate: true }),
    );

    expect(fragment).toMatch(
      /^~inputs=label,tags,when,off,nothing,zero,wide&label=Save&~v=[A-Za-z0-9_-]+&~content=icon,my%20slot&~recreate=1$/,
    );
    const read = ɵplaygroundStateFromFragment(`#${fragment}`);

    expect(read.inputs).toEqual(Object.keys(properties));
    expect(read.content).toEqual(['icon', 'my slot']);
    expect(read.recreate).toBe(true);
    expect(read.properties).toStrictEqual(properties);
    expect(Object.is(read.properties['zero'], -0)).toBe(true);
  });

  it('round-trips through location.hash without the leading #', () => {
    const value = state({ label: 'a=b&c', list: [1, 2] });

    expect(ɵplaygroundStateFromFragment(fragmentOf(value))).toStrictEqual(value);
  });

  it("carries the action's data", () => {
    const value = state({ label: 'Save' }, { data: { label: 'Rounded', when: new Date(0) } });
    const fragment = fragmentOf(value);

    expect(fragment).toMatch(/^~inputs=label&label=Save&~data=[A-Za-z0-9_-]+$/);
    expect(ɵplaygroundStateFromFragment(fragment)).toStrictEqual(value);
    // No data, no parameter: the fragment of a playground without it doesn't change.
    expect(fragmentOf(state({ label: 'Save' }, { data: {} }))).toBe('~inputs=label&label=Save');
    expect(ɵplaygroundStateFromFragment('~inputs=a')).not.toHaveProperty('data');
    expect(ɵplaygroundStateToFragment(state({}, { data: { onClick: () => 1 } }))).toEqual({
      ok: false,
      path: 'data.onClick',
      reason: 'a function',
    });
  });

  it('names the input whose value cannot be sent', () => {
    const result = ɵplaygroundStateToFragment(
      state({ label: 'ok', options: { onSelect: () => undefined } }),
    );

    expect(result).toEqual({ ok: false, path: 'options.onSelect', reason: 'a function' });
  });

  it('refuses a state too long for the URL', () => {
    const result = ɵplaygroundStateToFragment(
      state({ text: 'x'.repeat(ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT) }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.path).toBe('');
  });

  it('refuses a fragment it did not write', () => {
    for (const fragment of [
      '',
      'label=Save',
      '~inputs=a&noequals',
      '~inputs=a&~unknown=1',
      '~inputs=a&~v=%%%',
      '~inputs=a&~data=%%%',
      '~inputs=a&a=%22unterminated',
      '~inputs=a&a=%2212%22x',
    ]) {
      expect(() => ɵplaygroundStateFromFragment(fragment), fragment).toThrow();
    }
  });
});
