import { createHash } from 'node:crypto';

import type { Dependency } from '../contracts';
import { nonPhysicalIdentity } from '../contracts';

/**
 * The one digest domain of the engine. Every persisted or compared digest (fingerprints, artifact
 * revisions, dependency digests, closure and evaluated digests, memo and cache keys) is a single
 * `sha256` over a canonical form built here, so two phases that digest the same value always agree,
 * on every machine and locale.
 *
 * - {@link canonicalJson} orders object keys by UTF-16 code units. `localeCompare` depends on ICU and
 *   the process locale (and ignores control characters such as `\0`), so it must never order what a
 *   digest or a key covers; use {@link compareCodeUnits}.
 * - {@link bytesDigest} is the content digest of a file: the digest of its bytes. Every reader of a
 *   file decodes those bytes (UTF-8; TypeScript and esbuild also drop a leading byte order mark),
 *   so whatever it compiled is a function of them. A reader that only holds the decoded text uses
 *   {@link contentDigest}, which is the same function over the UTF-8 encoding of that text.
 *
 * Output identities that generated files contain (content module ids and revisions, keyword
 * digests, output ids and file digests) keep their own fixed formulas: changing them would change
 * generated files. They still hash through {@link sha256Hex}.
 */

/** Orders two strings by UTF-16 code units, independent of locale and ICU. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The hex sha256 of a string (its UTF-8 encoding) or of bytes. */
export function sha256Hex(value: string | NodeJS.ArrayBufferView): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Canonical JSON: the text `JSON.stringify` would produce, with every object's keys in code-unit
 * order. As in JSON, `toJSON` is honoured, object members whose value is `undefined`, a function or
 * a symbol are omitted, such array items (and non-finite numbers) become `null`, and a `bigint`
 * throws. So `canonicalJson(value) === canonicalJson(JSON.parse(JSON.stringify(value)))`. A cycle
 * throws a `TypeError`.
 */
export function canonicalJson(value: unknown): string {
  return canonical(value, new Set()) ?? 'null';
}

function canonical(value: unknown, path: Set<object>): string | undefined {
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  )
    value = (value as { toJSON(): unknown }).toJSON();
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (path.has(value)) throw new TypeError('Converting circular structure to canonical JSON');
  path.add(value);
  let text: string;
  if (Array.isArray(value)) {
    // Array.from visits holes (map skips them), so a sparse array matches its JSON round trip.
    text = `[${Array.from(value, (item) => canonical(item, path) ?? 'null').join(',')}]`;
  } else {
    const fields: string[] = [];
    for (const key of Object.keys(value).sort(compareCodeUnits)) {
      const item = canonical((value as Record<string, unknown>)[key], path);
      if (item !== undefined) fields.push(`${JSON.stringify(key)}:${item}`);
    }
    text = `{${fields.join(',')}}`;
  }
  path.delete(value);
  return text;
}

/**
 * Strict canonical JSON for exact identities: `undefined` stays distinct from an absent member,
 * and anything JSON cannot represent exactly (functions, symbols, non-finite numbers, `-0`, holes,
 * class instances, cycles) has no identity, so the result is `undefined`.
 */
export function canonicalJsonStrict(value: unknown): string | undefined {
  try {
    return strict(value);
  } catch {
    // A cyclic or exotic input has no exact identity.
    return undefined;
  }
}

function strict(value: unknown): string | undefined {
  if (value === undefined) return 'u';
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Object.is(value, -0) ? JSON.stringify(value) : undefined;
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) return undefined;
      const item = strict(value[index]);
      if (item === undefined) return undefined;
      items.push(item);
    }
    return `[${items.join(',')}]`;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return undefined;
  }
  const fields: string[] = [];
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    const item = strict((value as Record<string, unknown>)[key]);
    if (item === undefined) return undefined;
    fields.push(`${JSON.stringify(key)}:${item}`);
  }
  return `{${fields.join(',')}}`;
}

/** The digest of a value: `sha256` of its {@link canonicalJson}. */
export function digestOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** The content digest of a file's bytes. */
export function bytesDigest(bytes: NodeJS.ArrayBufferView): string {
  return sha256Hex(bytes);
}

/**
 * The content digest of decoded text: {@link bytesDigest} of its UTF-8 encoding. It equals the
 * digest of the file the text was read from whenever decoding kept every byte (valid UTF-8 and no
 * byte order mark dropped); otherwise the two differ, which only ever reports the file as changed.
 */
export function contentDigest(text: string): string {
  return sha256Hex(text);
}

/**
 * The identity of a dependency: two dependencies with one identity describe the same observation
 * (a file's content or existence, one glob, one keyword, one semantic scope or closure, one
 * entry's evaluated value), so a dependency list holds at most one per identity.
 */
export function dependencyIdentity(dependency: Dependency): string {
  switch (dependency.kind) {
    case 'content':
    case 'existence':
      return `${dependency.kind}:${dependency.path}`;
    case 'semantic':
    case 'semantic-reference':
      return `${dependency.kind}:${dependency.scopeId}`;
    case 'semantic-closure':
    case 'evaluated':
      return nonPhysicalIdentity(dependency);
    case 'keyword':
      return `keyword:${dependency.key}`;
    case 'glob':
      return globIdentity(dependency);
  }
}

/** A glob's identity: its root and its include and exclude patterns, unambiguously quoted. */
export function globIdentity(
  glob: Pick<Extract<Dependency, { kind: 'glob' }>, 'root' | 'include' | 'exclude'>,
): string {
  return `glob:${glob.root}:${canonicalJson(glob.include)}:${canonicalJson(glob.exclude)}`;
}
