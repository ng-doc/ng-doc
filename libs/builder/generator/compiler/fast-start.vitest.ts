import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ts } from 'ts-morph';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { GeneratorContentCompiler } from '../content/content-compiler';
import type {
  CompilationContext,
  CompilationProgressUpdate,
  CompilationResult,
} from '../contracts';
import { FAST_START_FLAG, SHAPE_CLOSURE_FLAG } from '../kernel/flags';
import { hostPath } from '../kernel/paths';
import { resetClosureStores } from './closure-store';
import { hash } from './common';
import { FAST_START_MISMATCH, resetFastStarts, runtimeIdentity } from './fast-start';
import {
  type CompilationOptions,
  resetIncrementalRetention,
  resetTargetedDryRun,
  targetedDryRun,
} from './index';
import {
  type Fixture,
  type Step,
  candidate,
  cleanup,
  corpus,
  fixture,
  generation,
  settle,
} from './testing/targeted-corpus';

// The fast start (`./fast-start`): a development start whose recorded inputs all re-read
// identically publishes the recorded candidate without compiling. Every start here is compared
// byte for byte with the same start with the fast start off and with a cold build of the tree:
// with nothing changed, after a guide, API source or page module edit made while stopped (which
// compiles), after an engine, option or switch change (the record is rejected), and with a
// damaged, partial or missing record or cache (never trusted).

beforeEach(() => {
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  resetFastStarts();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
  resetClosureStores();
  resetFastStarts();
});

type Service = ReturnType<Fixture['create']>;

interface Started {
  result: CompilationResult;
  updates: CompilationProgressUpdate[];
  /** Whether the start published the recorded candidate. */
  restored: boolean;
  /** Why it compiled instead (the progress reason), if it did. */
  reason?: string;
}

/**
 * A server start: the startup generation (a development buildOnce, no previous snapshot), served
 * by a fresh runtime as a worker-backed session serves it (the long-lived runtime).
 */
async function start(f: Fixture, overrides: Partial<CompilationOptions> = {}): Promise<Started> {
  resetIncrementalRetention();
  resetTargetedDryRun();
  const updates: CompilationProgressUpdate[] = [];
  const context: CompilationContext = { lifetime: 'watch' };
  Object.defineProperty(context, 'progress', {
    value: (update: CompilationProgressUpdate) => updates.push(update),
    enumerable: false,
  });
  const service: Service = f.create(overrides);
  const result = await service.compile(
    { generation: 1, mode: 'development', changes: [] },
    new AbortController().signal,
    context,
  );
  candidate(result, 'start');
  const restored = updates.some((update) => update.pass === 'restored');
  const reason = updates.find((update) => update.reason)?.reason;
  return { result, updates, restored, ...(reason ? { reason } : {}) };
}

/** A cold build of the current tree: a fresh one-shot runtime and no cache. */
async function cold(f: Fixture): Promise<CompilationResult> {
  rmSync(f.path('cache'), { recursive: true, force: true });
  resetClosureStores();
  resetFastStarts();
  resetIncrementalRetention();
  const result = await f
    .create()
    .compile({ generation: 1, mode: 'development', changes: [] }, new AbortController().signal, {
      lifetime: 'generation',
    });
  candidate(result, 'cold');
  return result;
}

const record = (f: Fixture): string | undefined => {
  const name = readdirSync(f.path('cache')).find((item) => item.endsWith('.fast-start.json'));
  return name && path.join(f.path('cache'), name);
};

const byName = (name: string): Step => corpus.find((step) => step.name === name)!;

/** Every rendered content id, by the content compiler. */
function rendered(): string[] {
  const ids: string[] = [];
  const render = GeneratorContentCompiler.prototype.compile;
  vi.spyOn(GeneratorContentCompiler.prototype, 'compile').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof render>
  ) {
    ids.push(args[0].id);
    return render.apply(this, args);
  });
  return ids;
}

const artifacts = (result: CompilationResult) => JSON.stringify(result.candidate!.artifacts);

test('a start with nothing changed restores the recorded candidate without compiling, byte-identical to compiling it and to a cold build', async () => {
  const f = fixture(true);
  const first = await start(f);
  expect(first.restored).toBe(false);
  expect(first.reason).toBe('fast start: no start record');
  expect(record(f)).toBeDefined();
  await settle();
  const ids = rendered();
  const fast = await start(f);
  expect(fast.restored).toBe(true);
  expect(ids).toEqual([]);
  // Discovery ran (user modules are evaluated, loaders refresh); nothing after it.
  expect([...new Set(fast.updates.map((update) => update.phase))]).toEqual([
    'discovery',
    'restore',
  ]);
  expect(fast.updates.at(-1)).toMatchObject({ phase: 'restore', state: 'end', pass: 'restored' });
  expect(fast.result.whyRebuilt).toEqual([]);
  expect(fast.result.dependencies).toEqual(first.result.dependencies);
  expect(fast.result.diagnostics).toEqual(first.result.diagnostics);
  const off = await start(f, { fastStart: false });
  expect(off.restored).toBe(false);
  expect(off.updates.some((update) => update.phase === 'restore')).toBe(false);
  expect(JSON.stringify(fast.result.candidate)).toBe(JSON.stringify(off.result.candidate));
  expect(JSON.stringify(fast.result.candidate)).toBe(JSON.stringify(first.result.candidate));
  const reference = await cold(f);
  expect(artifacts(fast.result)).toBe(artifacts(reference));
}, 600_000);

test.each(['guide body edit', 'API JSDoc edit', 'page title edit (entry module)', 'demo .ts edit'])(
  'a %s made while stopped compiles the start, equal to the fast start off and to a cold build',
  async (name) => {
    const f = fixture(true);
    await start(f);
    byName(name).apply(f);
    await settle();
    const edited = await start(f);
    expect(edited.restored).toBe(false);
    // The changed file is named, whichever check found it (a long reason is cut): a fixture path
    // in the engine's spelling (`D:/...` on Windows).
    const named = `fast start: ${hostPath(f.root)}/`;
    expect(edited.reason).toMatch(/^fast start: \S+/);
    expect(edited.reason?.slice(0, named.length)).toBe(named);
    expect(edited.reason).not.toContain('a page module');
    await settle();
    // The edited start recorded itself: the next start restores it.
    const again = await start(f);
    expect(again.restored).toBe(true);
    expect(JSON.stringify(again.result.candidate)).toBe(JSON.stringify(edited.result.candidate));
    // The same tree with the fast start off (no record, no restored reuse) and cold.
    const off = await start(f, { fastStart: false });
    expect(JSON.stringify(edited.result.candidate)).toBe(JSON.stringify(off.result.candidate));
    const reference = await cold(f);
    expect(artifacts(edited.result), name).toBe(artifacts(reference));
  },
  600_000,
);

test('a restored start after an edit links only what the edit reached, as the fast start off links everything', async () => {
  const f = fixture(true);
  const linked: string[] = [];
  const link = GeneratorContentCompiler.prototype.link;
  vi.spyOn(GeneratorContentCompiler.prototype, 'link').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof link>
  ) {
    linked.push(args[0].ir.id);
    return link.apply(this, args);
  });
  await start(f);
  const all = linked.splice(0).length;
  byName('guide body edit').apply(f);
  await settle();
  const edited = await start(f);
  const reached = linked.splice(0).length;
  expect(reached).toBeGreaterThan(0);
  expect(reached).toBeLessThan(all);
  // The same edit without the fast start: the cache index's links are not reused.
  f.reset();
  await start(f, { fastStart: false });
  linked.length = 0;
  byName('guide body edit').apply(f);
  await settle();
  const off = await start(f, { fastStart: false });
  expect(linked.length).toBe(all);
  expect(JSON.stringify(edited.result.candidate)).toBe(JSON.stringify(off.result.candidate));
  const reference = await cold(f);
  expect(artifacts(edited.result)).toBe(artifacts(reference));
}, 600_000);

test.each([
  ['the compiler version', { compilerVersion: 'test-v2' }],
  ['the toolchain', { toolchainDigest: 'another-toolchain' }],
  ['an option', { scopedSemantic: false } as Partial<CompilationOptions>],
])(
  'a change of %s rejects the record',
  async (_name, overrides) => {
    const f = fixture(true);
    await start(f);
    await settle();
    const changed = await start(f, overrides);
    expect(changed.restored).toBe(false);
    expect(changed.reason).toBe('fast start: the engine, its options or its switches changed');
    const off = await start(f, { ...overrides, fastStart: false });
    expect(JSON.stringify(changed.result.candidate)).toBe(JSON.stringify(off.result.candidate));
  },
  600_000,
);

test('an engine switch change rejects the record; the fast start switch itself does not', async () => {
  const f = fixture(true);
  await start(f);
  await settle();
  vi.stubEnv(SHAPE_CLOSURE_FLAG, '0');
  const switched = await start(f);
  expect(switched.restored).toBe(false);
  expect(switched.reason).toBe('fast start: the engine, its options or its switches changed');
  vi.unstubAllEnvs();
  await start(f);
  await settle();
  vi.stubEnv(FAST_START_FLAG, 'verify');
  const verified = await start(f);
  expect(verified.restored).toBe(false);
  expect(verified.result.diagnostics.filter((item) => item.code === FAST_START_MISMATCH)).toEqual(
    [],
  );
  vi.stubEnv(FAST_START_FLAG, '0');
  const off = await start(f);
  expect(off.updates.some((update) => update.phase === 'restore')).toBe(false);
  expect(JSON.stringify(off.result.candidate)).toBe(JSON.stringify(verified.result.candidate));
}, 600_000);

test('verify compiles the restored start, publishes the compiled result and reports a differing candidate', async () => {
  const f = fixture(true);
  await start(f);
  await settle();
  const clean = await start(f, { fastStart: 'verify' });
  expect(clean.restored).toBe(false);
  expect(clean.result.diagnostics.filter((item) => item.code === FAST_START_MISMATCH)).toEqual([]);
  // A candidate the cache holds but compiling does not give: an output changed in an entry, with
  // a revision and a record that name it (as if the engine had produced it).
  await settle();
  const before = clean.result.candidate!;
  const entry = cacheEntries(f).find((file) => readFileSync(file, 'utf8').includes('Plain prose'))!;
  const id = (JSON.parse(readFileSync(entry, 'utf8')) as { id: string }).id;
  let revised = '';
  tamper(entry, (artifact) => {
    revised = hash({ ...artifact, revision: '' });
    return { ...artifact, revision: revised };
  });
  const file = record(f)!;
  const stored = JSON.parse(readFileSync(file, 'utf8')) as { revision: string };
  stored.revision = hash({
    configuration: before.configuration,
    artifacts: before.artifacts.map((artifact) =>
      artifact.id === id ? revised : artifact.revision,
    ),
  });
  writeFileSync(file, JSON.stringify(stored));
  resetFastStarts();
  const reported = await start(f, { fastStart: 'verify' });
  expect(reported.result.diagnostics.map((item) => item.code)).toContain(FAST_START_MISMATCH);
  const reference = await cold(f);
  expect(artifacts(reported.result)).toBe(artifacts(reference));
}, 600_000);

/** The artifact cache's entry files. */
function cacheEntries(f: Fixture): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (hostPath(path.dirname(file)) !== f.path('cache')) files.push(file);
    }
  };
  walk(f.path('cache'));
  return files.sort();
}

/**
 * Rewrites one output text of a cache entry. `revise` gives the revision to keep: the same one
 * leaves a damaged entry; a recomputed one (`hash`) would be an entry the engine might produce.
 */
function tamper(
  file: string,
  revise: (artifact: Record<string, unknown>) => Record<string, unknown>,
): void {
  const artifact = JSON.parse(readFileSync(file, 'utf8')) as {
    outputs: Array<{ content?: string; digest: string }>;
  } & Record<string, unknown>;
  const output = artifact.outputs.find((item) => typeof item.content === 'string')!;
  // A consistent output (its digest names its text), so the cache itself accepts the entry.
  output.content = `${output.content}\n// tampered\n`;
  output.digest = createHash('sha256').update(output.content).digest('hex');
  writeFileSync(file, `${JSON.stringify(revise(artifact))}\n`);
}

test.each([
  [
    'a damaged cache entry',
    (f: Fixture) => tamper(cacheEntries(f)[0]!, (artifact) => artifact),
    'fast start: an artifact cache entry is damaged',
  ],
  [
    'a missing cache entry',
    (f: Fixture) => unlinkSync(cacheEntries(f)[0]!),
    'fast start: the artifact cache does not hold the recorded pages',
  ],
  [
    'a truncated record',
    (f: Fixture) => writeFileSync(record(f)!, readFileSync(record(f)!, 'utf8').slice(0, 200)),
    'fast start: the start record is unreadable',
  ],
  [
    'a record of another shape',
    (f: Fixture) => writeFileSync(record(f)!, JSON.stringify({ version: 1, header: 'x' })),
    'fast start: the start record is invalid',
  ],
  ['a missing record', (f: Fixture) => unlinkSync(record(f)!), 'fast start: no start record'],
  [
    'a directory module resolution found missing, created',
    (f: Fixture) => mkdirSync(f.path('docs/node_modules')),
    /^fast start: directory appeared: /,
  ],
])(
  '%s is never trusted: the start compiles and equals a cold build',
  async (_name, damage, reason) => {
    const f = fixture(true);
    await start(f);
    await settle();
    damage(f);
    const damaged = await start(f);
    expect(damaged.restored).toBe(false);
    if (typeof reason === 'string') expect(damaged.reason).toBe(reason);
    else expect(damaged.reason).toMatch(reason);
    rmSync(f.path('docs/node_modules'), { recursive: true, force: true });
    const reference = await cold(f);
    expect(artifacts(damaged.result)).toBe(artifacts(reference));
  },
  600_000,
);

test('only a runtime that retains its program records a start, and only for development', async () => {
  const f = fixture(true);
  // A one-shot development generation keeps no program facts: no record.
  candidate(
    await f
      .create()
      .compile({ generation: 1, mode: 'development', changes: [] }, new AbortController().signal, {
        lifetime: 'generation',
      }),
    'one-shot',
  );
  expect(record(f)).toBeUndefined();
  // Production never records nor restores.
  candidate(
    await f
      .create()
      .compile({ generation: 1, mode: 'production', changes: [] }, new AbortController().signal, {
        lifetime: 'watch',
      }),
    'production',
  );
  expect(record(f)).toBeUndefined();
  // A cache-less project keeps none either.
  const uncached = fixture(false);
  await start(uncached);
  expect(readdirSync(uncached.root)).not.toContain('cache');
  // A watch generation records; a start with a previous snapshot or changes never restores.
  const runtime = f.create();
  const committed = candidate(await generation(runtime, 1, undefined, []), 'runtime');
  expect(record(f)).toBeDefined();
  const updates: CompilationProgressUpdate[] = [];
  const context: CompilationContext = { lifetime: 'watch' };
  Object.defineProperty(context, 'progress', {
    value: (update: CompilationProgressUpdate) => updates.push(update),
  });
  await f
    .create()
    .compile(
      { generation: 2, mode: 'development', changes: [], previous: committed },
      new AbortController().signal,
      context,
    );
  expect(updates.some((update) => update.phase === 'restore')).toBe(false);
}, 600_000);

test('the first edit after a fast start, once the warm-up primed the runtime, compiles targeted and equals a cold build', async () => {
  const f = fixture(true);
  await start(f);
  await settle();
  const fast = await start(f);
  expect(fast.restored).toBe(true);
  const snapshot = fast.result.candidate!;
  // The warm-up: the runtime that served the start compiles the committed snapshot once.
  resetIncrementalRetention();
  resetTargetedDryRun();
  const runtime = f.create();
  const primed = await runtime.compile(
    { generation: 1, mode: 'development', changes: [], previous: snapshot },
    new AbortController().signal,
    { lifetime: 'watch' },
  );
  expect(candidate(primed, 'prime').revision).toBe(snapshot.revision);
  const changes = byName('guide body edit').apply(f);
  await settle();
  const edited = await generation(runtime, 2, snapshot, changes);
  candidate(edited, 'edit');
  expect(targetedDryRun().last?.path, targetedDryRun().last?.reason).toBe('content');
  const reference = await cold(f);
  expect(artifacts(edited)).toBe(artifacts(reference));
}, 600_000);

test('verify compiles from scratch, so it reports an input the record and the cache both lack', async () => {
  const f = fixture(true);
  const first = (await start(f)).result.candidate!;
  await settle();
  // A recording bug: the nested include, which only rendering reads, is left out of the record
  // and of every cached artifact that read it (each keeps a consistent revision).
  const nested = f.path('docs/shared/nested.md');
  const strip = <T extends { path?: string }>(values: T[]) =>
    values.filter((value) => value.path !== nested);
  const revisions = new Map<string, string>();
  let stripped = 0;
  for (const file of cacheEntries(f)) {
    const artifact = JSON.parse(readFileSync(file, 'utf8')) as {
      id: string;
      revision: string;
      dependencies: Array<{ path?: string }>;
      content: Array<{ ir: { dependencies: Array<{ path?: string }> } }>;
    };
    const before = JSON.stringify(artifact);
    artifact.dependencies = strip(artifact.dependencies);
    for (const item of artifact.content) item.ir.dependencies = strip(item.ir.dependencies);
    if (JSON.stringify(artifact) === before) continue;
    stripped += 1;
    artifact.revision = hash({ ...artifact, revision: '' });
    revisions.set(artifact.id, artifact.revision);
    writeFileSync(file, `${JSON.stringify(artifact)}\n`);
  }
  expect(stripped).toBeGreaterThan(0);
  const file = record(f)!;
  const stored = JSON.parse(readFileSync(file, 'utf8')) as {
    revision: string;
    dependencies: Array<{ path?: string }>;
  };
  stored.dependencies = strip(stored.dependencies);
  stored.revision = hash({
    configuration: first.configuration,
    artifacts: first.artifacts.map((artifact) => revisions.get(artifact.id) ?? artifact.revision),
  });
  writeFileSync(file, JSON.stringify(stored));
  resetFastStarts();
  f.write('docs/shared/nested.md', 'Nested include text, edited while stopped.');
  await settle();
  // The fast start cannot see the edit: it restores the stale pages.
  const blind = await start(f);
  expect(blind.restored).toBe(true);
  expect(JSON.stringify(blind.result.candidate)).not.toContain('edited while stopped');
  // `verify` compiles from scratch, so neither the cached IRs nor their links vouch for it.
  const verified = await start(f, { fastStart: 'verify' });
  expect(verified.result.diagnostics.map((item) => item.code)).toContain(FAST_START_MISMATCH);
  expect(JSON.stringify(verified.result.candidate)).toContain('edited while stopped');
  const reference = await cold(f);
  expect(artifacts(verified.result)).toBe(artifacts(reference));
}, 600_000);

test('the record names the runtime: Node, ICU, the default locale, TypeScript and the packages it loads', async () => {
  const identity = runtimeIdentity();
  expect(identity).toMatchObject({
    node: process.versions.node,
    icu: process.versions.icu,
    locale: new Intl.Collator().resolvedOptions().locale,
    typescript: ts.version,
  });
  const packages = identity['packages'] as Record<string, string | null>;
  const version = (name: string) =>
    (
      JSON.parse(
        readFileSync(
          path.resolve(import.meta.dirname, '../../../../node_modules', name, 'package.json'),
          'utf8',
        ),
      ) as { version: string }
    ).version;
  for (const name of ['prettier', 'marked', 'ts-morph', 'typescript', '@shikijs/rehype'])
    expect(packages[name], name).toBe(version(name));
  expect(packages['shiki']).toMatch(/^\d+\.\d+\.\d+/);
  // Read once per process.
  expect(runtimeIdentity()).toBe(identity);
});

test.each([
  [
    'another ICU',
    () => {
      const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
      Object.defineProperty(process, 'versions', {
        ...versions,
        value: { ...process.versions, icu: '0.1' },
      });
      return () => Object.defineProperty(process, 'versions', versions);
    },
  ],
  [
    'another default locale',
    () => {
      const resolved = Intl.Collator.prototype.resolvedOptions;
      const spy = vi.spyOn(Intl.Collator.prototype, 'resolvedOptions').mockImplementation(function (
        this: Intl.Collator,
      ) {
        return { ...resolved.call(this), locale: 'sv-SE' };
      });
      return () => spy.mockRestore();
    },
  ],
])(
  'a start under %s rejects the record',
  async (_name, change) => {
    const f = fixture(true);
    await start(f);
    await settle();
    resetFastStarts();
    const restore = change();
    let changed: Started;
    try {
      changed = await start(f);
    } finally {
      restore();
    }
    expect(changed.restored).toBe(false);
    expect(changed.reason).toBe('fast start: the engine, its options or its switches changed');
    // That start recorded itself under the other runtime: back on this one, a start compiles once.
    resetFastStarts();
    expect((await start(f)).restored).toBe(false);
    await settle();
    expect((await start(f)).restored).toBe(true);
  },
  600_000,
);
