import { describe, expect, it } from 'vitest';

import {
  isParentToRendererMessage,
  isRendererToParentMessage,
  messageBytes,
  reviveError,
  serializeError,
  SSR_RENDER_MAX_JSON_DEPTH,
  SSR_RENDER_MAX_MESSAGE_BYTES,
  SSR_RENDER_PROTOCOL_VERSION,
  validateEntry,
  validateJson,
  validateRequest,
} from '../ssr-renderer-protocol';

const epoch = 'renderer-epoch';
const request = {
  document: '<!doctype html>',
  url: 'https://example.test/docs',
  data: { ok: true },
};
const limits = {
  maxActive: 1,
  maxQueued: 1,
  maxDepth: 2,
  maxMessageBytes: 128,
  requestDeadlineMs: 1,
  startupDeadlineMs: 1,
  fenceDeadlineMs: 1,
  closeDeadlineMs: 1,
};

describe('SSR renderer protocol frames', () => {
  it('requires the frozen version, non-empty epoch, known frame type, and safe IDs', () => {
    expect(
      isParentToRendererMessage({
        version: SSR_RENDER_PROTOCOL_VERSION,
        epoch,
        type: 'render',
        id: 0,
        request,
      }),
    ).toBe(true);
    expect(isParentToRendererMessage({ version: 2, epoch, type: 'close' })).toBe(false);
    expect(isParentToRendererMessage({ version: 1, epoch: '', type: 'close' })).toBe(false);
    expect(isParentToRendererMessage({ version: 1, epoch, type: 'unknown' })).toBe(false);
    expect(isParentToRendererMessage({ version: 1, epoch, type: 'cancel', id: -1 })).toBe(false);
    expect(
      isParentToRendererMessage({ version: 1, epoch, type: 'fence', id: 1, sequence: 1.5 }),
    ).toBe(false);
  });

  it('admits only complete start frames and intentional render optionality', () => {
    expect(
      isParentToRendererMessage({
        version: 1,
        epoch,
        type: 'start',
        entry: '/entry',
        controlId: '/control',
        limits,
      }),
    ).toBe(true);
    expect(
      isParentToRendererMessage({ version: 1, epoch, type: 'start', entry: '/entry', limits }),
    ).toBe(false);
    expect(
      isParentToRendererMessage({ version: 1, epoch, type: 'render', id: 1, request: {} }),
    ).toBe(false);
    expect(() => validateRequest({ document: '', url: 'http://localhost' })).not.toThrow();
    expect(() =>
      validateRequest({ document: '', url: 'http://localhost', data: undefined }),
    ).not.toThrow();
  });

  it('requires direction-appropriate Vite HMR payload shapes', () => {
    expect(
      isParentToRendererMessage({ version: 1, epoch, type: 'hot', payload: { type: 'update' } }),
    ).toBe(false);
    expect(
      isRendererToParentMessage({
        version: 1,
        epoch,
        type: 'transport',
        payload: { type: 'custom', event: 'ngdoc:optional-data' },
      }),
    ).toBe(true);
    expect(
      isParentToRendererMessage({ version: 1, epoch, type: 'hot', payload: { type: 'ping' } }),
    ).toBe(true);
    expect(
      isParentToRendererMessage({
        version: 1,
        epoch,
        type: 'hot',
        payload: { type: 'custom', event: 'ngdoc:optional-data' },
      }),
    ).toBe(true);
    expect(
      isParentToRendererMessage({
        version: 1,
        epoch,
        type: 'hot',
        payload: { type: 'custom', event: 'ngdoc:test', data: { safe: true } },
      }),
    ).toBe(true);
  });

  it('validates renderer result/error/fence frames without confusing an error for HTML', () => {
    expect(
      isRendererToParentMessage({ version: 1, epoch, type: 'rendered', id: 1, html: '<p>ok</p>' }),
    ).toBe(true);
    expect(isRendererToParentMessage({ version: 1, epoch, type: 'rendered', id: 1, html: 1 })).toBe(
      false,
    );
    expect(
      isRendererToParentMessage({
        version: 1,
        epoch,
        type: 'render-error',
        id: 1,
        error: { name: 'Error', message: 'boom' },
      }),
    ).toBe(true);
    expect(
      isRendererToParentMessage({
        version: 1,
        epoch,
        type: 'render-error',
        id: 1,
        error: { name: 'Error' },
      }),
    ).toBe(false);
    expect(
      isRendererToParentMessage({ version: 1, epoch, type: 'fenced', id: 1, sequence: 0 }),
    ).toBe(true);
    expect(
      isRendererToParentMessage({
        version: 1,
        epoch,
        type: 'fence-error',
        id: 1,
        error: { name: 1, message: 'x' },
      }),
    ).toBe(false);
  });
});

describe('SSR renderer JSON request boundary', () => {
  it('accepts only JSON snapshots, including null-prototype records', () => {
    const nullRecord = Object.assign(Object.create(null), { value: ['safe', 1, null] });
    expect(() => validateJson(nullRecord)).not.toThrow();
    expect(() => validateRequest(request)).not.toThrow();
    expect(() =>
      validateRequest({ document: '<html>', url: 'https://example.test', data: nullRecord }),
    ).not.toThrow();
  });

  it('rejects non-finite values, functions, bigint, symbols, accessors, prototypes, cycles, and sparse arrays', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const accessor = {};
    Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 'read' });
    const symbolKey = { value: true };
    Object.defineProperty(symbolKey, Symbol('hidden'), { enumerable: true, value: true });
    // A hole is the input under test.
    // eslint-disable-next-line no-sparse-arrays
    const sparse = ['first', , 'third'];
    const namedArray = ['first'];
    Object.assign(namedArray, { named: 'nope' });

    for (const value of [
      Infinity,
      NaN,
      () => undefined,
      1n,
      symbolKey,
      accessor,
      new Date(),
      cyclic,
      sparse,
      namedArray,
    ]) {
      expect(() => validateJson(value)).toThrow(/NGDOC_SSR_RENDER_JSON/);
    }
  });

  it('enforces the exact nesting bound', () => {
    expect(() => validateJson([[0]], 2)).not.toThrow();
    expect(() => validateJson([[[0]]], 2)).toThrow(/maximum JSON depth/);
    let tooDeep: unknown = null;
    for (let index = 0; index <= SSR_RENDER_MAX_JSON_DEPTH; index++) tooDeep = [tooDeep];
    expect(() => validateJson(tooDeep)).toThrow(/maximum JSON depth/);
  });

  it('rejects unsafe request containers before snapshotting', () => {
    const accessorRequest = { url: 'https://example.test' };
    Object.defineProperty(accessorRequest, 'document', { enumerable: true, get: () => '<html>' });
    const symbolRequest = { document: '<html>', url: 'https://example.test' };
    Object.defineProperty(symbolRequest, Symbol('request'), { enumerable: true, value: true });
    const inheritedRequest = Object.create({ document: '<html>', url: 'https://example.test' });

    expect(() => validateRequest(accessorRequest)).toThrow(/NGDOC_SSR_RENDER_(REQUEST|JSON)/);
    expect(() => validateRequest(symbolRequest)).toThrow(/NGDOC_SSR_RENDER_(REQUEST|JSON)/);
    expect(() => validateRequest(inheritedRequest)).toThrow(/NGDOC_SSR_RENDER_(REQUEST|JSON)/);
  });

  it('measures UTF-8 envelopes and reports unencodable cycles as over limit', () => {
    expect(messageBytes({ value: '€' })).toBe(Buffer.byteLength(JSON.stringify({ value: '€' })));
    expect(messageBytes({ value: 'x'.repeat(SSR_RENDER_MAX_MESSAGE_BYTES) })).toBeGreaterThan(
      SSR_RENDER_MAX_MESSAGE_BYTES,
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(messageBytes(cyclic)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('SSR renderer error and entry guards', () => {
  it('preserves bounded cause details and code through serialization', () => {
    const error = Object.assign(new Error('render failed'), { code: 'E_RENDER' });
    const serialized = serializeError(error);
    expect(serialized).toMatchObject({ name: 'Error', message: 'render failed', code: 'E_RENDER' });
    const revived = reviveError(serialized, 'TEST_RENDER');
    expect(revived).toMatchObject({
      name: 'Error',
      message: '[TEST_RENDER] render failed',
      code: 'E_RENDER',
    });
    expect(revived.stack).toContain('Caused by child');
  });

  it('rejects empty and NUL-bearing trusted entry IDs', () => {
    expect(() => validateEntry('/entry.mjs')).not.toThrow();
    expect(() => validateEntry('')).toThrow(/NGDOC_SSR_RENDER_ENTRY/);
    expect(() => validateEntry('/entry\0.mjs')).toThrow(/NGDOC_SSR_RENDER_ENTRY/);
  });
});
