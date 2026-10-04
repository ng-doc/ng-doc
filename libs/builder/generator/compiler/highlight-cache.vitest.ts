import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { HIGHLIGHT_CACHE_MISMATCH, resetHighlightCache } from '../content/highlight-cache';
import type { ArtifactSnapshot, CompilationResult } from '../contracts';
import { HIGHLIGHT_CACHE_FLAG } from '../kernel/flags';
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

// The cache of highlighted code blocks (`content/highlight-cache.ts`) in generation chains: with the
// switch on, off (`NGDOC_HIGHLIGHT_CACHE=0`, the plain plugin) and `verify`, every result is
// byte-identical (candidates, outputs, diagnostics, dependencies and the memo's facts), equal to
// the reference path (`incrementalReuse: false`) and to cold builds. A restart that renders with a
// warm pack hits every block and still equals a cold build.

beforeEach(() => {
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  resetHighlightCache();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  resetHighlightCache();
});

const guide = (value: number) =>
  [
    '# Code',
    '',
    '```typescript name="a.ts" {2}',
    `const a = ${value};`,
    'const b = 2;',
    '```',
    '',
    '```html name="twice.html"',
    '<p>twice</p>',
    '```',
    '',
    '```html name="twice.html"',
    '<p>twice</p>',
    '```',
    '',
    '```typescript group="g" name="x.ts"',
    'export const x = 1;',
    '```',
    '',
    '```html group="g" name="x.html"',
    '<p>x</p>',
    '```',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
    '',
    '```not-a-language',
    'plain',
    '```',
  ].join('\n');

const code = (): Record<string, string> => ({
  'docs/code/ng-doc.page.ts': page('Code', 'code'),
  'docs/code/index.md': guide(1),
});

type Mode = 'on' | 'off' | 'verify';
const settings: Record<Mode, Partial<CompilationOptions>> = {
  on: {},
  off: { highlightCache: false },
  verify: { highlightCache: 'verify' },
};

const pack = (f: Fixture): string | undefined => {
  const name = existsSync(f.path('cache'))
    ? readdirSync(f.path('cache')).find((item) => item.endsWith('.highlight.json'))
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
  resetHighlightCache();
  const service = f.create({ ...overrides, incrementalReuse: false });
  const result = await service.compile(
    { generation: 1, mode: 'development', changes: [] },
    new AbortController().signal,
    { lifetime: 'generation' },
  );
  return result;
}

/**
 * A server start, two edits of the code guide (a block changed, then back), and a restart in a
 * fresh runtime whose artifact cache is gone but whose pack is kept, so it renders every page.
 */
async function chain(f: Fixture, mode: Mode, overrides: Partial<CompilationOptions> = {}) {
  f.reset();
  resetHighlightCache();
  const results: CompilationResult[] = [];
  const memos: string[] = [];
  const service = f.create({ ...settings[mode], ...overrides });
  await settle();
  results.push(await generation(service, 1, undefined, []));
  memos.push(memo(f));
  const first = candidate(results[0]!, `${mode} start`);
  const edited = update(f.write('docs/code/index.md', guide(2)));
  await settle();
  results.push(await generation(service, 2, first, [edited]));
  memos.push(memo(f));
  const second = candidate(results[1]!, `${mode} edit`);
  const reverted = update(f.write('docs/code/index.md', guide(1)));
  await settle();
  results.push(await generation(service, 3, second, [reverted]));
  memos.push(memo(f));
  candidate(results[2]!, `${mode} revert`);
  const kept = pack(f);
  const packed = kept ? JSON.parse(readFileSync(kept, 'utf8')) : undefined;
  // The restart: the artifact cache and its records are gone, the pack is kept.
  for (const name of readdirSync(f.path('cache')))
    if (!name.endsWith('.highlight.json'))
      rmSync(path.join(f.path('cache'), name), { recursive: true, force: true });
  resetHighlightCache();
  const restart = f.create({ ...settings[mode], ...overrides });
  results.push(
    await restart.compile(
      { generation: 1, mode: 'development', changes: [] },
      new AbortController().signal,
      { lifetime: 'generation' },
    ),
  );
  memos.push(memo(f));
  candidate(results[3]!, `${mode} restart`);
  const swept = pack(f);
  return {
    results: results.map((result) => JSON.stringify(result)),
    candidates: results.map((result) => result.candidate),
    memos,
    packed,
    swept: swept ? JSON.parse(readFileSync(swept, 'utf8')) : undefined,
  };
}

test('generation chains with the cache on, off and verify are byte-identical, and equal the reference path and cold builds', async () => {
  const f = fixture(true, {}, code);
  const on = await chain(f, 'on');
  const off = await chain(f, 'off');
  const verify = await chain(f, 'verify');
  expect(on.results[0]).toContain('class=\\"shiki');
  for (const [index, result] of on.results.entries()) {
    expect(off.results[index], `off ${index}`).toBe(result);
    expect(verify.results[index], `verify ${index}`).toBe(result);
    expect(off.memos[index], `off memo ${index}`).toBe(on.memos[index]);
    expect(verify.memos[index], `verify memo ${index}`).toBe(on.memos[index]);
  }
  expect(on.results.join()).not.toContain(HIGHLIGHT_CACHE_MISMATCH);

  // Only the cache keeps a pack. After the edits it holds both versions of the edited block (the
  // edits were targeted); the restart rendered every page, and keeps only the blocks it used.
  expect(off.packed).toBeUndefined();
  expect(off.swept).toBeUndefined();
  const before = Object.keys(on.packed.entries);
  const after = Object.keys(on.swept.entries);
  expect(after.length).toBeLessThan(before.length);
  expect(after.every((key) => before.includes(key))).toBe(true);
  expect(verify.swept).toEqual(on.swept);

  // The reference path keeps no pack, and its results are the chain's.
  const reference = await chain(f, 'on', { incrementalReuse: false });
  expect(reference.packed).toBeUndefined();
  for (const [index, snapshot] of on.candidates.entries())
    expect(JSON.stringify(reference.candidates[index]), `reference ${index}`).toBe(
      JSON.stringify(snapshot),
    );

  // A cold build of the reverted tree equals the restart (and the start).
  const fresh = await cold(f);
  expect(JSON.stringify(fresh.candidate)).toBe(JSON.stringify(on.candidates[3]));
  expect(JSON.stringify(fresh.candidate)).toBe(JSON.stringify(on.candidates[0]));
  expect(outputs(on.candidates[1])).not.toBe(outputs(on.candidates[0]));
}, 600_000);

test('the environment switch turns the cache off and on verify', async () => {
  const f = fixture(true, {}, code);
  vi.stubEnv(HIGHLIGHT_CACHE_FLAG, '0');
  const off = await chain(f, 'on');
  expect(off.packed).toBeUndefined();
  vi.stubEnv(HIGHLIGHT_CACHE_FLAG, 'verify');
  const verify = await chain(f, 'on');
  vi.unstubAllEnvs();
  const on = await chain(f, 'on');
  expect(verify.results).toEqual(on.results);
  expect(off.results).toEqual(on.results);
}, 600_000);

test('production and cache: false keep no pack, and equal the switch off', async () => {
  const compile = async (
    f: Fixture,
    cache: boolean,
    mode: 'production' | 'development',
    highlight: Mode,
  ) => {
    f.reset();
    resetHighlightCache();
    const service = f.create(settings[highlight]);
    const result = await service.compile(
      { generation: 1, mode, changes: [] },
      new AbortController().signal,
      { lifetime: 'generation' },
    );
    candidate(result, `${mode} ${cache}`);
    return { result: JSON.stringify(result), pack: pack(f) };
  };
  for (const [cache, mode] of [
    [true, 'production'],
    [false, 'development'],
  ] as const) {
    const f = fixture(cache, {}, code);
    const on = await compile(f, cache, mode, 'on');
    const off = await compile(f, cache, mode, 'off');
    expect(on.pack).toBeUndefined();
    expect(on.result).toBe(off.result);
  }
}, 600_000);

test('verify reports a tampered pack entry and publishes the fresh highlighting', async () => {
  const f = fixture(true, {}, code);
  const on = await chain(f, 'on');
  const file = pack(f)!;
  const tampered = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, string> };
  for (const key of Object.keys(tampered.entries))
    tampered.entries[key] = tampered.entries[key]!.replace(
      '"properties":{',
      '"properties":{"data-tampered":"",',
    );
  const restart = (mode: Mode) => {
    writeFileSync(file, JSON.stringify(tampered));
    for (const name of readdirSync(f.path('cache')))
      if (!name.endsWith('.highlight.json'))
        rmSync(path.join(f.path('cache'), name), { recursive: true, force: true });
    resetHighlightCache();
    return f
      .create(settings[mode])
      .compile({ generation: 1, mode: 'development', changes: [] }, new AbortController().signal, {
        lifetime: 'generation',
      });
  };
  const verified = await restart('verify');
  expect(outputs(verified.candidate)).toBe(outputs(on.candidates[3]));
  const warnings = verified.diagnostics.filter((item) => item.code === HIGHLIGHT_CACHE_MISMATCH);
  expect(warnings.length).toBeGreaterThan(0);
  expect(warnings.every((item) => item.severity === 'warning')).toBe(true);
  // Without verify the tampered entries would be published: the tamper is real.
  const trusted = await restart('on');
  expect(outputs(trusted.candidate)).toContain('data-tampered');
}, 600_000);
