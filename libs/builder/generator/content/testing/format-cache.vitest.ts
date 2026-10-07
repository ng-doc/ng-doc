import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withFormatCodeCache } from '../../../helpers/format-cache';
import { formatCode } from '../../../helpers/format-code';
import { FORMAT_CACHE_FLAG } from '../../kernel/flags';
import {
  createFormatSession,
  FORMAT_CACHE_LIMIT,
  formatCacheSwitch,
  FormatSession,
  resetFormatCache,
} from '../format-cache';

// The cache of formatted code (`content/format-cache.ts`): `formatCode` with a session returns
// exactly what it returns without one, cold, warm, from a pack and from a damaged pack; the
// configuration is resolved once per session; keys cover code, parser, configuration and plugins.

// Prettier as `formatCode` loads it, counted: the cache must spare calls, never change results.
const prettier = vi.hoisted(() => ({
  format: undefined as unknown as Mock<(...args: unknown[]) => string>,
  resolveConfig: undefined as unknown as Mock<(...args: unknown[]) => object | null>,
}));
vi.mock('@prettier/sync', async (importOriginal) => {
  const actual = await importOriginal<{ default: Record<string, (...args: unknown[]) => never> }>();
  const base = actual.default;
  prettier.format = vi.fn((...args: unknown[]) => base['format']!(...args));
  prettier.resolveConfig = vi.fn((...args: unknown[]) => base['resolveConfig']!(...args));
  return {
    ...actual,
    default: { ...base, format: prettier.format, resolveConfig: prettier.resolveConfig },
  };
});

const roots: string[] = [];
beforeEach(() => {
  resetFormatCache();
  prettier.format?.mockClear();
  prettier.resolveConfig?.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetFormatCache();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function workspace(prettierrc?: string): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-format-')));
  roots.push(root);
  if (prettierrc !== undefined) writeFileSync(path.join(root, '.prettierrc'), prettierrc);
  return root;
}

/** Code `formatCode` formats in the new engine: signatures and snippets of every parser. */
const SAMPLES: Array<[string, Parameters<typeof formatCode>[1]]> = [
  ["constructor(\n\tprivate readonly a: string, \n\tb: 'x' | 'y'\n):;", 'TypeScript'],
  ['get value():  number;', 'TypeScript'],
  ['export function f<T extends object>(value: T, mode?: \'a\' | "b"): T;', 'JavaScript'],
  ['<div   class="a"><span>text</span></div>', 'HTML'],
  ['.a{color:red;  background : blue}', 'SCSS'],
  ['.a{color:red}', 'CSS'],
  ['# Title\n\n* item\n* other', 'Markdown'],
  ['const broken = (;', 'TypeScript'],
  ['plain text', 'Text' as never],
  ['  keep  ', null],
];

const formatAll = (root: string) => SAMPLES.map(([code, type]) => formatCode(code, type, root));

describe('formatCode with a format session', () => {
  it('formats exactly as without a session: cold, warm, from a pack and from a damaged pack', async () => {
    const root = workspace('{"singleQuote":false,"printWidth":40}');
    const cache = path.join(root, 'cache');
    const expected = formatAll(root);
    expect(expected[2]).toContain('"a" | "b"');
    // Signatures such as a bare constructor are rejected by Prettier and stay as they are.
    expect(expected[0]).toBe(SAMPLES[0]![0]);
    const session = () => new FormatSession(false, path.join(cache, 'p.format.json'));
    const cold = session();
    expect(withFormatCodeCache(cold, () => formatAll(root))).toEqual(expected);
    // Warm: the same runtime formats nothing again.
    const format = prettier.format;
    const resolve = prettier.resolveConfig;
    format.mockClear();
    resolve.mockClear();
    const warm = session();
    expect(withFormatCodeCache(warm, () => formatAll(root))).toEqual(expected);
    expect(resolve).toHaveBeenCalledTimes(1);
    // Syntax errors are cached too; only the call without a parser formats again.
    expect(format).toHaveBeenCalledTimes(1);
    await cold.save(true);
    const file = readdirSync(cache).find((name) => name.endsWith('.format.json'))!;
    const packed = JSON.parse(readFileSync(path.join(cache, file), 'utf8'));
    expect(Object.keys(packed.entries)).toHaveLength(8);
    // A new runtime reads the pack.
    resetFormatCache();
    format.mockClear();
    const restarted = session();
    expect(withFormatCodeCache(restarted, () => formatAll(root))).toEqual(expected);
    expect(format).toHaveBeenCalledTimes(1);
    // A damaged pack (another version, unparsable, a non-string entry) is not read.
    for (const damaged of [
      JSON.stringify({ ...packed, version: 99 }),
      '{',
      JSON.stringify({ ...packed, entries: { a: 1 } }),
      JSON.stringify([]),
    ]) {
      writeFileSync(path.join(cache, file), damaged);
      resetFormatCache();
      format.mockClear();
      expect(withFormatCodeCache(session(), () => formatAll(root))).toEqual(expected);
      expect(format).toHaveBeenCalledTimes(9);
    }
  });

  it('resolves the configuration once per session and again in the next one', () => {
    const root = workspace('{"singleQuote":true}');
    const resolve = prettier.resolveConfig;
    const first = new FormatSession(false, undefined);
    const code = 'type A = \'a\' | "b";';
    expect(withFormatCodeCache(first, () => formatCode(code, 'TypeScript', root))).toBe(
      "type A = 'a' | 'b';",
    );
    withFormatCodeCache(first, () => formatCode(`${code} // again`, 'TypeScript', root));
    expect(resolve).toHaveBeenCalledTimes(1);
    // The next generation reads the edited configuration.
    writeFileSync(path.join(root, '.prettierrc'), '{"singleQuote":false}');
    const second = new FormatSession(false, undefined);
    expect(withFormatCodeCache(second, () => formatCode(code, 'TypeScript', root))).toBe(
      'type A = "a" | "b";',
    );
    expect(resolve).toHaveBeenCalledTimes(2);
    // Without a directory: the process's working directory, also resolved once.
    withFormatCodeCache(second, () => formatCode(code, 'TypeScript'));
    withFormatCodeCache(second, () => formatCode(code, 'HTML'));
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('verify formats every hit again, uses the fresh result and counts differences', () => {
    const root = workspace('{"singleQuote":true}');
    const code = "type A = 'a';";
    const known = new FormatSession(false, undefined);
    withFormatCodeCache(known, () => formatCode(code, 'TypeScript', root));
    const verify = new FormatSession(true, undefined);
    expect(withFormatCodeCache(verify, () => formatCode(code, 'TypeScript', root))).toBe(code);
    expect(verify.mismatches).toBe(0);
    // A wrong entry (as a tampered pack would hold) is repaired and counted.
    const format = prettier.format;
    const tampered = new FormatSession(false, undefined);
    let key = '';
    const spying = {
      config: tampered.config.bind(tampered),
      format: (input: { code: string; parser: string; config: object | null }, run: () => string) =>
        tampered.format(input as never, () => {
          key = run();
          return 'tampered';
        }),
    };
    resetFormatCache();
    expect(withFormatCodeCache(spying, () => formatCode(code, 'TypeScript', root))).toBe(
      'tampered',
    );
    expect(key).toBe(code);
    expect(withFormatCodeCache(tampered, () => formatCode(code, 'TypeScript', root))).toBe(
      'tampered',
    );
    format.mockClear();
    const verifying = new FormatSession(true, undefined);
    expect(withFormatCodeCache(verifying, () => formatCode(code, 'TypeScript', root))).toBe(code);
    expect(format).toHaveBeenCalledOnce();
    expect(verifying.mismatches).toBe(1);
    expect(
      withFormatCodeCache(new FormatSession(false, undefined), () =>
        formatCode(code, 'TypeScript', root),
      ),
    ).toBe(code);
    // A configuration edited within a verify session is counted and used.
    writeFileSync(path.join(root, '.prettierrc'), '{"singleQuote":false}');
    expect(withFormatCodeCache(verifying, () => formatCode(code, 'TypeScript', root))).toBe(
      'type A = "a";',
    );
    expect(verifying.mismatches).toBe(2);
    expect(withFormatCodeCache(verifying, () => formatCode(code, 'TypeScript', root))).toBe(
      'type A = "a";',
    );
    expect(verifying.mismatches).toBe(2);
  });

  it('caches only configurations it can identify exactly', () => {
    const root = workspace();
    const session = new FormatSession(false, undefined);
    const format = vi.fn(() => 'formatted');
    const cached = (config: object | null) => {
      const resolved = session.config(`${root}/${JSON.stringify(config)}`, () => config as never);
      format.mockClear();
      session.format({ code: 'x', parser: 'typescript', config: resolved }, format);
      session.format({ code: 'x', parser: 'typescript', config: resolved }, format);
      return format.mock.calls.length === 1;
    };
    expect(cached(null)).toBe(true);
    expect(cached({ semi: false })).toBe(true);
    // A plugin package that resolves from the directory: its version is part of the key.
    mkdirSync(path.join(root, 'node_modules/prettier-plugin-fixture'), { recursive: true });
    writeFileSync(
      path.join(root, 'node_modules/prettier-plugin-fixture/package.json'),
      '{"name":"prettier-plugin-fixture","version":"1.2.3"}',
    );
    expect(cached({ plugins: ['prettier-plugin-fixture'] })).toBe(true);
    expect(cached({ plugins: ['prettier-plugin-missing'] })).toBe(false);
    expect(cached({ plugins: ['./local-plugin.js'] })).toBe(false);
    expect(cached({ plugins: [path.join(root, 'plugin.js')] })).toBe(false);
    expect(cached({ plugins: [{ parsers: {} }] })).toBe(false);
    expect(cached({ value: Number.NaN })).toBe(false);
    // A configuration this session did not resolve is formatted every time.
    format.mockClear();
    session.format({ code: 'x', parser: 'typescript', config: { semi: true } }, format);
    session.format({ code: 'x', parser: 'typescript', config: { semi: true } }, format);
    expect(format).toHaveBeenCalledTimes(2);
    // A failing format stores nothing and throws.
    const resolved = session.config(root, () => ({ tabWidth: 4 }));
    const failing = vi.fn(() => {
      throw new Error('syntax');
    });
    expect(() =>
      session.format({ code: 'y', parser: 'typescript', config: resolved }, failing),
    ).toThrow('syntax');
    expect(() =>
      session.format({ code: 'y', parser: 'typescript', config: resolved }, failing),
    ).toThrow('syntax');
    expect(failing).toHaveBeenCalledTimes(2);
    // A Prettier syntax error is deterministic: stored, and thrown again without formatting.
    const rejected = vi.fn(() => {
      throw Object.assign(new SyntaxError('Expression expected.'), { loc: { start: 1 } });
    });
    expect(() =>
      session.format({ code: 'z', parser: 'typescript', config: resolved }, rejected),
    ).toThrow(SyntaxError);
    expect(() =>
      session.format({ code: 'z', parser: 'typescript', config: resolved }, rejected),
    ).toThrow(SyntaxError);
    expect(rejected).toHaveBeenCalledOnce();
    // A failing resolution is not remembered.
    const unresolvable = vi.fn(() => {
      throw new Error('bad config');
    });
    expect(() => session.config(`${root}/bad`, unresolvable)).toThrow('bad config');
    expect(() => session.config(`${root}/bad`, unresolvable)).toThrow('bad config');
    expect(unresolvable).toHaveBeenCalledTimes(2);
  });

  it('keys differ by code, parser and configuration', () => {
    const session = new FormatSession(false, undefined);
    const a = session.config('/a', () => ({ semi: true }));
    const b = session.config('/b', () => ({ semi: false }));
    const calls: string[] = [];
    const run = (label: string) => () => {
      calls.push(label);
      return label;
    };
    expect(session.format({ code: 'x', parser: 'typescript', config: a }, run('1'))).toBe('1');
    expect(session.format({ code: 'x', parser: 'css', config: a }, run('2'))).toBe('2');
    expect(session.format({ code: 'x', parser: 'typescript', config: b }, run('3'))).toBe('3');
    expect(session.format({ code: 'y', parser: 'typescript', config: a }, run('4'))).toBe('4');
    expect(session.format({ code: 'x', parser: 'typescript', config: a }, run('5'))).toBe('1');
    expect(calls).toEqual(['1', '2', '3', '4']);
  });
});

describe('the format pack', () => {
  const entry = (session: FormatSession, code: string) => {
    const config = session.config('/workspace', () => ({ semi: true }));
    return session.format({ code, parser: 'typescript', config }, () => `formatted ${code}`);
  };

  it('keeps the used keys of a complete generation, adds to a partial one, and skips unchanged writes', async () => {
    const root = workspace();
    const file = path.join(root, 'cache', 'p.format.json');
    const keys = () => Object.keys(JSON.parse(readFileSync(file, 'utf8')).entries).length;
    const first = new FormatSession(false, file);
    entry(first, 'a');
    entry(first, 'b');
    await first.save(true);
    expect(keys()).toBe(2);
    const partial = new FormatSession(false, file);
    entry(partial, 'c');
    await partial.save(false);
    expect(keys()).toBe(3);
    const complete = new FormatSession(false, file);
    entry(complete, 'c');
    await complete.save(true);
    expect(keys()).toBe(1);
    // The same keys again: the file is not written.
    const before = readFileSync(file, 'utf8');
    writeFileSync(file, before);
    const same = new FormatSession(false, file);
    entry(same, 'c');
    const write = vi.spyOn(JSON, 'stringify');
    await same.save(true);
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    // A session that formatted nothing leaves the pack alone.
    await new FormatSession(false, file).save(true);
    expect(keys()).toBe(1);
    // No pack: nothing is written.
    await new FormatSession(false, undefined).save(true);
    // A pack that cannot be written is best effort.
    const blocked = path.join(root, 'blocked');
    writeFileSync(blocked, '');
    const failing = new FormatSession(false, path.join(blocked, 'p.format.json'));
    entry(failing, 'd');
    await expect(failing.save(true)).resolves.toBeUndefined();
  });

  it('keeps only the current generation beyond the limit, and starts again from the pack', async () => {
    const root = workspace();
    const file = path.join(root, 'cache', 'p.format.json');
    const large = 'x'.repeat(FORMAT_CACHE_LIMIT / 2);
    const first = new FormatSession(false, file);
    entry(first, `${large}1`);
    entry(first, `${large}2`);
    await first.save(false);
    const second = new FormatSession(false, file);
    entry(second, 'small');
    await second.save(false);
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).entries)).toHaveLength(1);
    // The runtime's map outgrew the limit: a new session clears it.
    const format = vi.fn(() => 'again');
    const third = new FormatSession(false, file);
    const config = third.config('/workspace', () => ({ semi: true }));
    expect(third.format({ code: 'small', parser: 'typescript', config }, format)).toBe(
      'formatted small',
    );
    expect(format).not.toHaveBeenCalled();
  });
});

describe('the format cache switch', () => {
  it('reads the option and NGDOC_FORMAT_CACHE', () => {
    expect(formatCacheSwitch({})).toBe('on');
    expect(formatCacheSwitch({ formatCache: true })).toBe('on');
    expect(formatCacheSwitch({ formatCache: false })).toBe('off');
    expect(formatCacheSwitch({ formatCache: 'verify' })).toBe('verify');
    vi.stubEnv(FORMAT_CACHE_FLAG, 'verify');
    expect(formatCacheSwitch({})).toBe('verify');
    expect(formatCacheSwitch({ formatCache: false })).toBe('off');
    vi.stubEnv(FORMAT_CACHE_FLAG, 'off');
    expect(formatCacheSwitch({ formatCache: 'verify' })).toBe('off');
  });

  it('creates a session with a pack only for development with the cache', () => {
    const configuration = { cacheEnabled: true, cacheRoot: '/cache' };
    const development = { mode: 'development' as const };
    // The pack path is joined with the platform's separator (backslashes on Windows).
    expect(
      createFormatSession({ projectId: 'p' }, development, configuration)?.pack?.replaceAll(
        '\\',
        '/',
      ),
    ).toMatch(/^\/cache\/[0-9a-f]+\.format\.json$/);
    expect(
      createFormatSession({ projectId: 'p' }, { mode: 'production' }, configuration)?.pack,
    ).toBeUndefined();
    expect(
      createFormatSession({ projectId: 'p' }, development, {
        ...configuration,
        cacheEnabled: false,
      })?.pack,
    ).toBeUndefined();
    expect(
      createFormatSession({ projectId: 'p', formatCache: 'verify' }, development, configuration)
        ?.verify,
    ).toBe(true);
    expect(
      createFormatSession({ projectId: 'p', formatCache: false }, development, configuration),
    ).toBeUndefined();
    expect(
      createFormatSession({ projectId: 'p', incrementalReuse: false }, development, configuration),
    ).toBeUndefined();
  });
});
