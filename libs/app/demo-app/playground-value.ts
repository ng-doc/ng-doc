/**
 * A value as it crosses from a documentation page to the frame of an isolated playground: JSON
 * that both `postMessage` and a URL carry unchanged.
 * @internal
 */
export type ɵNgDocPlaygroundEncodedValue =
  | string
  | number
  | boolean
  | null
  | ɵNgDocPlaygroundEncodedValue[]
  | { [key: string]: ɵNgDocPlaygroundEncodedValue };

/**
 * The result of encoding a value: the encoded value, or the path of the first part that can't be
 * encoded and why.
 * @internal
 */
export type ɵNgDocPlaygroundEncoding =
  | { readonly ok: true; readonly value: ɵNgDocPlaygroundEncodedValue }
  | { readonly ok: false; readonly path: string; readonly reason: string };

/** The key of a tagged value: a value JSON has no form for (`undefined`, `NaN`, a `Date`, …). */
const TAG = '$ngdoc';

/** Deeper values are refused: a playground input never needs them, and a cycle would recurse. */
const MAX_DEPTH = 32;

/**
 * The longest encoded state an "Open in a new tab" URL carries; a longer one is left out.
 * @internal
 */
export const ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT = 8192;

/**
 * Encodes a value for the frame of an isolated playground. Only plain data is accepted:
 * strings, numbers (`NaN` and the infinities included), booleans, `null`, `undefined`, `Date`s,
 * arrays and plain objects (prototype `Object.prototype` or `null`, own enumerable data
 * properties). Anything else (a function, a symbol, a `bigint`, a class instance such as a
 * `TemplateRef`, a `Map` or a signal, a getter, a cycle) is refused rather than sent changed: a
 * structured clone would turn a class instance into a plain object without its behaviour, and
 * the demo would then run with a value that isn't the one the inspector shows.
 * @param value - The value of a playground input.
 * @internal
 */
export function ɵencodePlaygroundValue(value: unknown): ɵNgDocPlaygroundEncoding {
  try {
    return { ok: true, value: encode(value, '', 0, new Set()) };
  } catch (error) {
    if (error instanceof Unencodable) return { ok: false, path: error.path, reason: error.reason };
    throw error;
  }
}

/**
 * Decodes a value that {@link ɵencodePlaygroundValue} encoded. Throws on anything it can't have
 * produced, so a malformed message or URL never reaches the demo half-decoded.
 * @param value - An encoded value.
 * @internal
 */
export function ɵdecodePlaygroundValue(value: unknown): unknown {
  return decode(value, '', 0);
}

/**
 * The encoded values of an "Open in a new tab" URL: base64url of their JSON, or `undefined`
 * when it would be longer than {@link ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT}.
 * @param values - Encoded values, by input name.
 * @internal
 */
export function ɵplaygroundStateToUrl(
  values: Record<string, ɵNgDocPlaygroundEncodedValue>,
): string | undefined {
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);
  const text = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return text.length > ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT ? undefined : text;
}

/**
 * The encoded values of an "Open in a new tab" URL, or `undefined` when the parameter isn't one
 * that {@link ɵplaygroundStateToUrl} wrote.
 * @param text - The `state` query parameter.
 * @internal
 */
export function ɵplaygroundStateFromUrl(
  text: string,
): Record<string, ɵNgDocPlaygroundEncodedValue> | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length > ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT) {
    return undefined;
  }
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

    if (!isPlainObject(parsed)) return undefined;
    // Every value must decode; the decoded form is computed again where it is used.
    for (const value of Object.values(parsed)) decode(value, '', 0);
    return parsed as Record<string, ɵNgDocPlaygroundEncodedValue>;
  } catch {
    return undefined;
  }
}

class Unencodable extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`${path || 'value'}: ${reason}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function child(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? path
      ? `${path}.${key}`
      : key
    : `${path}[${JSON.stringify(key)}]`;
}

function tagged(tag: string, value?: ɵNgDocPlaygroundEncodedValue): ɵNgDocPlaygroundEncodedValue {
  return value === undefined ? { [TAG]: tag } : { [TAG]: tag, value };
}

function encode(
  value: unknown,
  path: string,
  depth: number,
  ancestors: Set<object>,
): ɵNgDocPlaygroundEncodedValue {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : tagged('number', String(value));
    case 'undefined':
      return tagged('undefined');
    case 'function':
      throw new Unencodable(path, 'a function');
    case 'symbol':
      throw new Unencodable(path, 'a symbol');
    case 'bigint':
      throw new Unencodable(path, 'a bigint');
  }
  if (value === null) return null;
  if (depth >= MAX_DEPTH) throw new Unencodable(path, `nested deeper than ${MAX_DEPTH} levels`);
  if (value instanceof Date) {
    const time = value.getTime();

    return tagged('date', Number.isNaN(time) ? 'Invalid Date' : value.toISOString());
  }
  const object = value as object;

  if (ancestors.has(object)) throw new Unencodable(path, 'a cyclic reference');
  ancestors.add(object);
  try {
    if (Array.isArray(object)) {
      // A hole reads as `undefined`, as the code view prints it.
      return Array.from(object, (item: unknown, index: number) =>
        encode(item, child(path, index), depth + 1, ancestors),
      );
    }
    if (!isPlainObject(object)) {
      const name = (object as { constructor?: { name?: unknown } }).constructor?.name;

      throw new Unencodable(
        path,
        typeof name === 'string' && name ? `an instance of ${name}` : 'not a plain object',
      );
    }
    if (Object.getOwnPropertySymbols(object).length) {
      throw new Unencodable(path, 'an object with symbol keys');
    }
    const entries: Array<[string, ɵNgDocPlaygroundEncodedValue]> = [];

    for (const key of Object.keys(object)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);

      if (descriptor && !('value' in descriptor)) {
        throw new Unencodable(child(path, key), 'a getter');
      }
      entries.push([key, encode(descriptor?.value, child(path, key), depth + 1, ancestors)]);
    }
    const encoded = Object.fromEntries(entries);

    // An object of the user's that has the tag's key is wrapped, so it never reads as a tag.
    return Object.prototype.hasOwnProperty.call(object, TAG) ? tagged('object', encoded) : encoded;
  } finally {
    ancestors.delete(object);
  }
}

function decode(value: unknown, path: string, depth: number): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path || 'value'}: not a finite number`);
    return value;
  }
  if (depth >= MAX_DEPTH) throw new Error(`${path || 'value'}: nested too deep`);
  if (Array.isArray(value)) {
    return value.map((item: unknown, index: number) => decode(item, child(path, index), depth + 1));
  }
  if (!isPlainObject(value)) throw new Error(`${path || 'value'}: not an encoded value`);
  if (Object.prototype.hasOwnProperty.call(value, TAG)) {
    const keys = Object.keys(value).sort().join(',');
    const tag = value[TAG];
    const content = value['value'];

    if (tag === 'undefined' && keys === TAG) return undefined;
    if (tag === 'number' && keys === `${TAG},value`) {
      if (content === 'NaN') return Number.NaN;
      if (content === 'Infinity') return Number.POSITIVE_INFINITY;
      if (content === '-Infinity') return Number.NEGATIVE_INFINITY;
    }
    if (tag === 'date' && keys === `${TAG},value` && typeof content === 'string') {
      const date = new Date(content === 'Invalid Date' ? Number.NaN : content);

      if (content === 'Invalid Date' || !Number.isNaN(date.getTime())) return date;
    }
    if (tag === 'object' && keys === `${TAG},value` && isPlainObject(content)) {
      return decodeObject(content, path, depth);
    }
    throw new Error(`${path || 'value'}: not an encoded value`);
  }
  return decodeObject(value, path, depth);
}

function decodeObject(
  value: Record<string, unknown>,
  path: string,
  depth: number,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(value).map((key) => [key, decode(value[key], child(path, key), depth + 1)]),
  );
}
