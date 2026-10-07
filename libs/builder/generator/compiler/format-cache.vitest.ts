import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type Mock, afterEach, beforeEach, expect, test, vi } from 'vitest';

import { FORMAT_CACHE_MISMATCH, resetFormatCache } from '../content/format-cache';
import { resetHighlightCache } from '../content/highlight-cache';
import type { ArtifactSnapshot, CompilationResult } from '../contracts';
import { FORMAT_CACHE_FLAG } from '../kernel/flags';
import { resetClosureStores } from './closure-store';
import { type CompilationOptions, resetIncrementalRetention, resetTargetedDryRun } from './index';
import {
  type Fixture,
  candidate,
  cleanup,
  fixture,
  generation,
  page,
  settle,
  update,
} from './testing/targeted-corpus';

// The cache of formatted code (`content/format-cache.ts`) in generation chains: with the switch on,
// off (`NGDOC_FORMAT_CACHE=0`) and `verify`, every result is byte-identical (candidates, outputs,
// diagnostics, dependencies and the memo's facts), equal to the reference path
// (`incrementalReuse: false`) and to cold builds. Editing `.prettierrc` formats again; a restart
// with a warm pack formats nothing it formatted before and still equals a cold build.

// Prettier as `formatCode` loads it, counted.
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

const reset = () => {
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  resetHighlightCache();
  resetFormatCache();
};
beforeEach(reset);
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  reset();
});

/** An API file whose signatures Prettier formats: literal types follow `singleQuote`. */
const formatted = (extra: string) =>
  [
    "/** Picks a mode. */ export function choose(mode: 'first' | \"second\", count = 1): 'first' | 'second' { return mode; }",
    `/** A component of modes. */ export class Modes { /** Creates it. */ constructor(private readonly mode: 'first' | 'second') {} /** The mode. */ get current(): 'first' | 'second' { return this.mode; } /** Selects it. */ select(mode: 'first' | 'second', ${extra}): void {} }`,
  ].join('\n');

const files = (): Record<string, string> => ({
  '.prettierrc': '{"singleQuote":true}',
  'docs/api-format.ts': formatted('force: boolean'),
  'docs/code/ng-doc.page.ts': page('Code', 'code'),
  'docs/code/index.md': '# Code\n\n{{ NgDocApi.details("docs/api-format.ts#choose") }}\n',
});

type Mode = 'on' | 'off' | 'verify';
const settings: Record<Mode, Partial<CompilationOptions>> = {
  on: {},
  off: { formatCache: false },
  verify: { formatCache: 'verify' },
};

const pack = (f: Fixture): string | undefined => {
  const name = existsSync(f.path('cache'))
    ? readdirSync(f.path('cache')).find((item) => item.endsWith('.format.json'))
    : undefined;
  return name && path.join(f.path('cache'), name);
};

/** The memo's facts that do not depend on file stamps: links and assemblies. */
const memo = (f: Fixture): string => {
  const name = readdirSync(f.path('cache')).find((item) => item.endsWith('.compiler-memo.json'));
  if (!name) return '';
  const value = JSON.parse(readFileSync(path.join(f.path('cache'), name), 'utf8'));
  return JSON.stringify({ link: value.link, assembly: value.assembly });
};

const outputs = (snapshot: ArtifactSnapshot | undefined) =>
  JSON.stringify(snapshot?.artifacts.map((artifact) => [artifact.id, artifact.outputs]));

/** A cold development build of the fixture's current tree, in a fresh runtime. */
async function cold(f: Fixture, overrides: Partial<CompilationOptions> = {}) {
  resetFormatCache();
  resetHighlightCache();
  return f
    .create({ ...overrides, incrementalReuse: false })
    .compile({ generation: 1, mode: 'development', changes: [] }, new AbortController().signal, {
      lifetime: 'generation',
    });
}

/** The steps after the start: `.prettierrc` edited, an API signature edited, `.prettierrc` back. */
const steps: Array<[string, (f: Fixture) => Array<ReturnType<typeof update>>]> = [
  ['double quotes', (f) => [update(f.write('.prettierrc', '{"singleQuote":false}'))]],
  [
    'a signature edited',
    (f) => [update(f.write('docs/api-format.ts', formatted("force: 'yes' | 'no'")))],
  ],
  ['single quotes again', (f) => [update(f.write('.prettierrc', '{"singleQuote":true}'))]],
];

/**
 * A server start, the steps, and a restart in a fresh runtime whose artifact cache is gone but
 * whose pack is kept, so it renders every page. `after` runs after each generation (cold builds).
 */
async function chain(
  f: Fixture,
  mode: Mode,
  overrides: Partial<CompilationOptions> = {},
  after?: () => Promise<void>,
) {
  f.reset();
  reset();
  const results: CompilationResult[] = [];
  const memos: string[] = [];
  const service = f.create({ ...settings[mode], ...overrides });
  await settle();
  results.push(await generation(service, 1, undefined, []));
  memos.push(memo(f));
  let previous = candidate(results[0]!, `${mode} start`);
  await after?.();
  for (const [index, [name, apply]] of steps.entries()) {
    const changes = apply(f);
    await settle();
    results.push(await generation(service, index + 2, previous, changes));
    memos.push(memo(f));
    previous = candidate(results.at(-1)!, `${mode} ${name}`);
    await after?.();
  }
  const kept = pack(f);
  const packed = kept ? JSON.parse(readFileSync(kept, 'utf8')) : undefined;
  for (const name of readdirSync(f.path('cache')))
    if (!name.endsWith('.format.json'))
      rmSync(path.join(f.path('cache'), name), { recursive: true, force: true });
  resetFormatCache();
  resetHighlightCache();
  prettier.format.mockClear();
  prettier.resolveConfig.mockClear();
  const restart = f.create({ ...settings[mode], ...overrides });
  results.push(
    await restart.compile(
      { generation: 1, mode: 'development', changes: [] },
      new AbortController().signal,
      { lifetime: 'generation' },
    ),
  );
  memos.push(memo(f));
  candidate(results.at(-1)!, `${mode} restart`);
  return {
    results: results.map((result) => JSON.stringify(result)),
    candidates: results.map((result) => result.candidate),
    memos,
    packed,
    restart: {
      formats: prettier.format.mock.calls.length,
      resolves: prettier.resolveConfig.mock.calls.length,
    },
  };
}

test('differential: chains with the cache on, off and verify are byte-identical, equal the reference path and cold builds, and .prettierrc edits format again', async () => {
  const f = fixture(true, {}, files);
  const colds: string[] = [];
  const reference = await chain(f, 'on', { incrementalReuse: false }, async () => {
    colds.push(JSON.stringify((await cold(f)).candidate));
  });
  const on = await chain(f, 'on');
  const off = await chain(f, 'off');
  const verify = await chain(f, 'verify');
  for (const [index, result] of on.results.entries()) {
    const label = index === 0 ? 'start' : steps[index - 1]?.[0] ?? 'restart';
    expect(off.results[index], `off ${label}`).toBe(result);
    expect(verify.results[index], `verify ${label}`).toBe(result);
    expect(off.memos[index], `off memo ${label}`).toBe(on.memos[index]);
    expect(verify.memos[index], `verify memo ${label}`).toBe(on.memos[index]);
    expect(JSON.stringify(on.candidates[index]), `reference ${label}`).toBe(
      JSON.stringify(reference.candidates[index]),
    );
    if (index < colds.length)
      expect(JSON.stringify(on.candidates[index]), `cold ${label}`).toBe(colds[index]);
  }
  expect(on.results.join()).not.toContain(FORMAT_CACHE_MISMATCH);
  // The restart renders every page from the pack and equals the last generation.
  expect(outputs(on.candidates[4])).toBe(outputs(on.candidates[3]));

  // `.prettierrc` reaches the published signatures, both ways.
  const text = (snapshot: ArtifactSnapshot | undefined) => outputs(snapshot);
  // A formatted signature's string literal, highlighted: `> 'first'` with single quotes.
  const single = "> 'first'";
  expect(text(on.candidates[0])).toContain(single);
  expect(text(on.candidates[1])).not.toBe(text(on.candidates[0]));
  expect(text(on.candidates[1])).not.toContain(single);
  expect(text(on.candidates[3])).toContain(single);
  expect(text(on.candidates[3])).toContain('yes');
  expect(text(on.candidates[0])).not.toContain('yes');

  // Only the cache keeps a pack; a restart with it formats nothing and resolves once.
  expect(off.packed).toBeUndefined();
  expect(reference.packed).toBeUndefined();
  expect(Object.keys(on.packed.entries).length).toBeGreaterThan(0);
  expect(on.restart).toEqual({ formats: 0, resolves: 1 });
  expect(off.restart.formats).toBeGreaterThan(1);
  expect(off.restart.resolves).toBe(off.restart.formats);
  // `verify` formats every hit again.
  expect(verify.restart.formats).toBe(off.restart.formats);
}, 600_000);

test('the environment switch turns the cache off and on verify', async () => {
  const f = fixture(true, {}, files);
  vi.stubEnv(FORMAT_CACHE_FLAG, '0');
  const off = await chain(f, 'on');
  expect(off.packed).toBeUndefined();
  vi.stubEnv(FORMAT_CACHE_FLAG, 'verify');
  const verify = await chain(f, 'on');
  vi.unstubAllEnvs();
  const on = await chain(f, 'on');
  expect(verify.results).toEqual(on.results);
  expect(off.results).toEqual(on.results);
  expect(verify.restart.formats).toBe(off.restart.formats);
}, 600_000);

test('production and cache: false keep no pack, and equal the switch off', async () => {
  for (const [cache, mode] of [
    [true, 'production'],
    [false, 'development'],
  ] as const) {
    const f = fixture(cache, {}, files);
    const compile = async (format: Mode) => {
      f.reset();
      reset();
      const result = await f
        .create(settings[format])
        .compile({ generation: 1, mode, changes: [] }, new AbortController().signal, {
          lifetime: 'generation',
        });
      candidate(result, `${mode} ${cache}`);
      return { result: JSON.stringify(result), pack: pack(f) };
    };
    const on = await compile('on');
    const off = await compile('off');
    expect(on.pack).toBeUndefined();
    expect(on.result).toBe(off.result);
  }
}, 600_000);

test('verify reports a tampered pack entry and publishes the fresh formatting', async () => {
  const f = fixture(true, {}, files);
  const on = await chain(f, 'on');
  const file = pack(f)!;
  const tampered = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, string> };
  for (const key of Object.keys(tampered.entries))
    if (tampered.entries[key]!.startsWith('='))
      tampered.entries[key] = `${tampered.entries[key]} /* tampered */`;
  const restart = (mode: Mode) => {
    writeFileSync(file, JSON.stringify(tampered));
    for (const name of readdirSync(f.path('cache')))
      if (!name.endsWith('.format.json'))
        rmSync(path.join(f.path('cache'), name), { recursive: true, force: true });
    reset();
    return f
      .create(settings[mode])
      .compile({ generation: 1, mode: 'development', changes: [] }, new AbortController().signal, {
        lifetime: 'generation',
      });
  };
  const verified = await restart('verify');
  expect(outputs(verified.candidate)).toBe(outputs(on.candidates[4]));
  const warnings = verified.diagnostics.filter((item) => item.code === FORMAT_CACHE_MISMATCH);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]!.severity).toBe('warning');
  // Without verify the tampered entries would be published: the tamper is real.
  const trusted = await restart('on');
  expect(outputs(trusted.candidate)).toContain('tampered');
}, 600_000);
