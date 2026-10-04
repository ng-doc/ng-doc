import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import {
  type CompilationRequest,
  type Dependency,
  type DiscoverySnapshot,
  type PageArtifact,
  GENERATOR_SCHEMA_VERSION,
} from '../contracts';
import type { ClosureRecord } from '../semantic/semantic-closure';
import {
  closureStorePath,
  loadClosureStore,
  resetClosureStores,
  saveClosureStore,
} from './closure-store';
import type { CompilationOptions } from './index';

// The persistent store of closure records: when a generation keeps one, what it writes (the
// records of the candidate's closures, file names interned) and reads back, and that an absent,
// invalid or foreign file only yields an empty store.

const roots: string[] = [];
afterEach(() => {
  resetClosureStores();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const compiler = { compilerVersion: 'v1', toolchainDigest: 't1', configurationDigest: 'c1' };

function root(): string {
  const value = realpathSync(mkdtempSync(path.join(tmpdir(), 'closure-store-')));
  roots.push(value);
  return value;
}

const closure = (digest: string): Dependency => ({
  kind: 'semantic-closure',
  scopeId: 'site',
  key: `renderFragment:${digest}@shape`,
  digest,
});

/** An artifact holding `own` closures itself and `ir` closures in its one IR. */
const artifact = (own: string[], ir: string[]): PageArtifact =>
  ({
    dependencies: own.map(closure),
    content: [{ ir: { dependencies: [...ir.map(closure), { kind: 'glob', pattern: '*' }] } }],
  }) as unknown as PageArtifact;

const records: Record<string, ClosureRecord> = {
  a: { files: ['/src/a.ts', '/src/shared.ts'], derived: [] },
  b: { files: ['/src/shared.ts'], derived: ['/src/b.ts#B'], wide: { 'k@shape': 'w' } },
};

test('the store is kept only by development generations with reuse, the cache, closures and the targeted rebuild', () => {
  const options = { projectId: 'site' } as CompilationOptions;
  const development = { mode: 'development' } as CompilationRequest;
  const configuration = {
    cacheEnabled: true,
    cacheRoot: '/cache',
  } as DiscoverySnapshot['configuration'];
  const file = closureStorePath(options, development, configuration, 'on');
  // A file of the cache root, in the platform's spelling: it is only read and written, never
  // recorded as a dependency.
  const name = path.basename(file ?? '');
  expect(name).toMatch(/^[0-9a-f]{64}\.semantic-closures\.json$/);
  expect(file).toBe(path.join('/cache', name));
  expect(closureStorePath(options, development, configuration, 'verify')).toBe(file);
  for (const [changed, request, mode, settings] of [
    [{}, { mode: 'production' }, 'on', configuration],
    [{ incrementalReuse: false }, development, 'on', configuration],
    [{ targetedRebuild: false }, development, 'on', configuration],
    [{}, development, 'off', configuration],
    [{}, development, 'on', { ...configuration, cacheEnabled: false }],
  ] as const)
    expect(
      closureStorePath(
        { ...options, ...changed } as CompilationOptions,
        request as CompilationRequest,
        settings,
        mode,
      ),
    ).toBeUndefined();
  // Verify of the targeted rebuild keeps it.
  expect(
    closureStorePath(
      { ...options, targetedRebuild: 'verify' } as CompilationOptions,
      development,
      configuration,
      'on',
    ),
  ).toBe(file);
});

test('writes the records of the candidate closures it knows, reads them back, and skips an unchanged store', async () => {
  const file = path.join(root(), 'nested', 'store.json');
  const lookups: string[] = [];
  const record = (digest: string) => {
    lookups.push(digest);
    return records[digest];
  };
  await saveClosureStore(
    file,
    compiler,
    [artifact(['b'], ['a', 'unknown']), artifact([], ['a'])],
    record,
  );
  expect(lookups.sort()).toEqual(['a', 'b', 'unknown']);
  const written = JSON.parse(readFileSync(file, 'utf8'));
  // Every file once, and records by digest; a digest without a record is left out.
  expect(written.files).toEqual(['/src/a.ts', '/src/shared.ts']);
  expect(written.records).toEqual([
    ['a', [0, 1], []],
    ['b', [1], ['/src/b.ts#B'], { 'k@shape': 'w' }],
  ]);
  // Records handed out without the program's file order: the store keeps none.
  expect(written.order).toEqual([]);
  resetClosureStores();
  const loaded = loadClosureStore(file, compiler);
  expect(Object.fromEntries(loaded)).toEqual(records);
  expect(loaded.order).toBeUndefined();

  // The same closures again: the file it read is not written again.
  const stamp = statSync(file, { bigint: true }).mtimeNs;
  await saveClosureStore(file, compiler, [artifact(['b'], ['a'])], record);
  expect(statSync(file, { bigint: true }).mtimeNs).toBe(stamp);
  // Other closures, or a file that changed on disk since, are written.
  await saveClosureStore(file, compiler, [artifact([], ['a'])], record);
  expect(JSON.parse(readFileSync(file, 'utf8')).records).toEqual([['a', [0, 1], []]]);
  // Another writer replaced the file with the same size and time: its content differs from what
  // this process wrote, so the same closures are written again.
  const replaced = readFileSync(file, 'utf8').replace('"c1"', '"c9"');
  const times = statSync(file);
  writeFileSync(file, replaced);
  utimesSync(file, times.atime, times.mtime);
  await saveClosureStore(file, compiler, [artifact([], ['a'])], record);
  expect(JSON.parse(readFileSync(file, 'utf8')).configurationDigest).toBe('c1');
  rmSync(file);
  await saveClosureStore(file, compiler, [artifact([], ['a'])], record);
  expect(Object.keys(Object.fromEntries(loadClosureStore(file, compiler)))).toEqual(['a']);

  // A store another compiler, generator schema or configuration wrote is not read.
  expect(written.generatorSchemaVersion).toBe(GENERATOR_SCHEMA_VERSION);
  expect(loadClosureStore(file, { ...compiler, compilerVersion: 'v2' }).size).toBe(0);
  expect(loadClosureStore(file, { ...compiler, toolchainDigest: 't2' }).size).toBe(0);
  expect(loadClosureStore(file, { ...compiler, configurationDigest: 'c2' }).size).toBe(0);
  const current = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(
    file,
    JSON.stringify({ ...current, generatorSchemaVersion: GENERATOR_SCHEMA_VERSION + 1 }),
  );
  expect(loadClosureStore(file, compiler).size).toBe(0);
});

test('a save removes the stale temporary files of an interrupted save, not a recent one', async () => {
  const directory = root();
  const file = path.join(directory, 'store.json');
  const stale = `${file}.dead.tmp`;
  const recent = `${file}.live.tmp`;
  const other = path.join(directory, 'other.json.dead.tmp');
  for (const item of [stale, recent, other]) writeFileSync(item, '{');
  const old = new Date(Date.now() - 120_000);
  utimesSync(stale, old, old);
  utimesSync(other, old, old);
  await saveClosureStore(file, compiler, [artifact([], ['a'])], (digest) => records[digest]);
  expect(readdirSync(directory).sort()).toEqual(
    ['other.json.dead.tmp', 'store.json', 'store.json.live.tmp'].sort(),
  );
});

test('keeps the file order of the program the records hold on', async () => {
  const file = path.join(root(), 'store.json');
  const order = ['/lib.d.ts', '/src/a.ts', '/src/shared.ts'];
  const withOrder = (digest: string) => records[digest] && { ...records[digest]!, order };
  await saveClosureStore(file, compiler, [artifact([], ['a'])], withOrder);
  expect(JSON.parse(readFileSync(file, 'utf8')).order).toEqual(order);
  resetClosureStores();
  const loaded = loadClosureStore(file, compiler);
  expect(loaded.order).toEqual(order);
  // The records themselves are stored without it.
  expect(loaded.get('a')).toEqual(records['a']);
  // The same closures on a program of another order are written again.
  const stamp = statSync(file, { bigint: true }).mtimeNs;
  await saveClosureStore(file, compiler, [artifact([], ['a'])], withOrder);
  expect(statSync(file, { bigint: true }).mtimeNs).toBe(stamp);
  const reordered = [...order].reverse();
  await saveClosureStore(file, compiler, [artifact([], ['a'])], (digest) => ({
    ...records[digest]!,
    order: reordered,
  }));
  expect(JSON.parse(readFileSync(file, 'utf8')).order).toEqual(reordered);
});

test('an absent, unreadable or invalid store is empty, and a failed write is only skipped', async () => {
  const directory = root();
  const file = path.join(directory, 'store.json');
  expect(loadClosureStore(file, compiler).size).toBe(0);
  const valid = {
    schemaVersion: 2,
    generatorSchemaVersion: GENERATOR_SCHEMA_VERSION,
    ...compiler,
    files: ['/a.ts'],
    records: [['a', [0], []]],
    order: ['/lib.d.ts', '/a.ts'],
  };
  expect((writeFileSync(file, JSON.stringify(valid)), loadClosureStore(file, compiler).size)).toBe(
    1,
  );
  for (const invalid of [
    'not json',
    'null',
    '[]',
    // A store written before the program's file order was kept (schema 1), or without one.
    { ...valid, schemaVersion: 1 },
    { ...valid, order: undefined },
    { ...valid, order: [1] },
    { ...valid, compilerVersion: 1 },
    { ...valid, toolchainDigest: null },
    { ...valid, configurationDigest: 1 },
    { ...valid, generatorSchemaVersion: '2' },
    { ...valid, files: [1] },
    { ...valid, records: {} },
    { ...valid, records: ['a'] },
    { ...valid, records: [['a', [0]]] },
    { ...valid, records: [[1, [0], []]] },
    { ...valid, records: [['a', 0, []]] },
    { ...valid, records: [['a', [1], []]] },
    { ...valid, records: [['a', [-1], []]] },
    { ...valid, records: [['a', [0.5], []]] },
    { ...valid, records: [['a', [0], [1]]] },
    { ...valid, records: [['a', [0], [], null]] },
    { ...valid, records: [['a', [0], [], []]] },
    { ...valid, records: [['a', [0], [], { key: 1 }]] },
  ]) {
    writeFileSync(file, typeof invalid === 'string' ? invalid : JSON.stringify(invalid));
    expect(loadClosureStore(file, compiler).size, JSON.stringify(invalid)).toBe(0);
  }
  // A store path under a regular file cannot be written: nothing is thrown.
  await saveClosureStore(
    path.join(file, 'store.json'),
    compiler,
    [artifact([], ['a'])],
    (digest) => (digest === 'a' ? records['a'] : undefined),
  );
});
