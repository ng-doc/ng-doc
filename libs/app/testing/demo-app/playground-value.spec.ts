import {
  ɵdecodePlaygroundValue,
  ɵencodePlaygroundValue,
  ɵisNgDocPlaygroundFrameMessage,
  ɵNG_DOC_DEMO_MESSAGE_SOURCE,
  ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT,
  ɵNgDocPlaygroundEncodedValue,
  ɵplaygroundStateFromUrl,
  ɵplaygroundStateToUrl,
} from '@ng-doc/app/demo-app';
import { describe, expect, it } from 'vitest';

/**
 *
 * @param value
 */
function encoded(value: unknown): ɵNgDocPlaygroundEncodedValue {
  const result = ɵencodePlaygroundValue(value);

  if (!result.ok) throw new Error(`refused: ${result.path} ${result.reason}`);
  return result.value;
}

/**
 * Encodes, sends through JSON (as a message or a URL carries it) and decodes.
 * @param value
 */
function roundTrip(value: unknown): unknown {
  return ɵdecodePlaygroundValue(JSON.parse(JSON.stringify(encoded(value))));
}

class Point {
  constructor(readonly x: number) {}
}

describe('the value codec of isolated playgrounds', () => {
  it('carries plain data unchanged, including what JSON has no form for', () => {
    const date = new Date('2026-10-30T12:00:00.000Z');
    const values: unknown[] = [
      'text',
      '',
      0,
      -1.5,
      true,
      false,
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      date,
      [1, 'two', [undefined, null]],
      { label: 'Save', size: 'small', nested: { when: date, items: [] } },
      Object.assign(Object.create(null) as object, { bare: 1 }),
      { $ngdoc: 'undefined', other: 1 },
    ];

    for (const value of values) {
      expect(roundTrip(value), JSON.stringify(value)).toStrictEqual(
        value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === null
          ? { ...value }
          : value,
      );
    }
    expect(Number.isNaN((roundTrip(new Date(Number.NaN)) as Date).getTime())).toBe(true);
    // An array with a hole at index 1.
    const holey: number[] = [1];
    holey[2] = 3;
    expect(roundTrip(holey)).toStrictEqual([1, undefined, 3]);
  });

  it('is deterministic: the same value always encodes to the same text', () => {
    const value = { b: [1, undefined], a: new Date(0), c: { d: Number.NaN } };

    expect(JSON.stringify(encoded(value))).toBe(JSON.stringify(encoded(structuredClone(value))));
  });

  it('refuses what a structured clone would change, and names where it is', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic['self'] = cyclic;
    let deep: unknown = 'leaf';
    for (let level = 0; level < 40; level++) deep = [deep];
    const withGetter = Object.defineProperty({}, 'computed', { get: () => 1, enumerable: true });

    const refused: Array<[unknown, string, RegExp]> = [
      [() => 1, '', /function/],
      [{ onClick: () => 1 }, 'onClick', /function/],
      [Symbol('s'), '', /symbol/],
      [10n, '', /bigint/],
      [new Point(1), '', /instance of Point/],
      [{ items: [1, new Map()] }, 'items[1]', /instance of Map/],
      [new Set([1]), '', /instance of Set/],
      [/x/, '', /instance of RegExp/],
      [{ 'my-key': { [Symbol('k')]: 1 } }, '["my-key"]', /symbol keys/],
      [withGetter, 'computed', /getter/],
      [cyclic, 'self', /cyclic/],
      [
        deep,
        '[0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0][0]',
        /deeper/,
      ],
    ];

    for (const [value, path, reason] of refused) {
      const result = ɵencodePlaygroundValue(value);

      expect(result.ok, String(path)).toBe(false);
      if (!result.ok) {
        expect(result.path).toBe(path);
        expect(result.reason).toMatch(reason);
      }
    }
  });

  it('refuses to decode anything it did not encode', () => {
    for (const value of [
      { $ngdoc: 'function' },
      { $ngdoc: 'number', value: '1' },
      { $ngdoc: 'undefined', value: 1 },
      { $ngdoc: 'date', value: 'not a date' },
      { $ngdoc: 'object', value: [] },
      Number.NaN,
      new Point(1),
    ]) {
      expect(() => ɵdecodePlaygroundValue(value), JSON.stringify(value)).toThrow();
    }
  });

  it('carries a state through a URL parameter, up to its limit', () => {
    const state = {
      label: encoded('Grüße 👋'),
      when: encoded(new Date(0)),
      off: encoded(undefined),
    };
    const text = ɵplaygroundStateToUrl(state);

    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ɵplaygroundStateFromUrl(text ?? '')).toStrictEqual(state);
    expect(
      ɵplaygroundStateToUrl({ long: 'x'.repeat(ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT) }),
    ).toBeUndefined();
    for (const bad of ['%%%', btoa('[1]'), btoa('{"a":{"$ngdoc":"nope"}}'), btoa('{')]) {
      expect(ɵplaygroundStateFromUrl(bad), bad).toBeUndefined();
    }
  });
});

describe('the messages of isolated playgrounds', () => {
  const base = { source: ɵNG_DOC_DEMO_MESSAGE_SOURCE, version: 1 } as const;

  it('accepts the frame messages and nothing else', () => {
    const ready = {
      ...base,
      type: 'playground-ready',
      defaults: { size: 'small' },
      uncloneable: ['tpl'],
    };
    const applied = { ...base, type: 'playground-applied', fragment: '~inputs=label&label=Save' };
    const error = { ...base, type: 'playground-error', phase: 'apply', message: 'boom' };

    for (const value of [ready, applied, error]) {
      expect(ɵisNgDocPlaygroundFrameMessage(value), value.type).toBe(true);
    }
    for (const value of [
      { ...ready, uncloneable: [1] },
      { ...ready, defaults: { size: { $ngdoc: 'nope' } } },
      { ...applied, fragment: 1 },
      { ...error, phase: 'render' },
      { ...base, type: 'size', height: 10 },
      {
        ...base,
        type: 'playground-state',
        revision: 0,
        properties: {},
        content: {},
        recreate: false,
      },
    ]) {
      expect(ɵisNgDocPlaygroundFrameMessage(value), JSON.stringify(value)).toBe(false);
    }
  });
});
