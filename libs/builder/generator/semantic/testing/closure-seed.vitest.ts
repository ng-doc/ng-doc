import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, expect, test, vi } from 'vitest';

import type {
  ApiDescriptor,
  Dependency,
  DiscoverySnapshot,
  SemanticClosureDependency,
} from '../../contracts';
import { ProgramIndex } from '../program-index';
import { openRecordingScopes } from '../recorder';
import { type ClosureStore, programDigestOf } from '../semantic-closure';
import { createSemanticService } from '../semantic-service';
import { join } from './engine-paths';

// A runtime that carries no closure records of its own is seeded from the persistent store: a
// seeded record is used as a carried one (checked when it is used), and is not recomputed while
// the program is the previous candidate's.

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  expect(openRecordingScopes()).toBe(0);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function workspace(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'closure-seed-'));
  directories.push(directory);
  const all: Record<string, string> = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true },
      include: ['*.ts'],
    }),
    'entry.ts': 'const Page = {}; export default Page;',
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return directory;
}

function discovery(directory: string): DiscoverySnapshot {
  return {
    configuration: {
      projectId: 'site',
      workspaceRoot: directory,
      docsRoots: [directory],
      tsConfig: join(directory, 'tsconfig.json'),
      outputRoot: join(directory, 'output'),
      cacheRoot: join(directory, 'cache'),
      routePrefix: 'docs',
      guideDirectory: 'guides',
      apiDirectory: 'api',
      assetDirectory: 'assets',
      inlineStyleLanguage: 'SCSS',
      anchorHeadings: ['h2'],
      themes: { light: 'github-light', dark: 'github-dark' },
      cacheEnabled: true,
      digest: 'config',
      executables: [],
    },
    entries: [
      {
        source: { path: join(directory, 'entry.ts') },
        title: 'Reference',
        route: 'api',
        absoluteRoute: 'docs/api',
        breadcrumbs: ['Reference'],
        runtimeImport: { source: join(directory, 'entry.ts'), exportName: 'default' },
        dependencies: [],
        id: 'api',
        kind: 'api',
        scopes: [
          { id: 'public', name: 'Public', route: 'public', include: ['api.ts'], exclude: [] },
        ],
      } as ApiDescriptor,
    ],
    globalKeywords: [],
    remoteKeywords: [],
  };
}

async function service(
  directory: string,
  retention?: { previous?: unknown },
  shapeClosure?: 'on' | 'verify',
) {
  const value = createSemanticService({
    dependencyMode: 'scope-reference',
    ...(shapeClosure ? { shapeClosure } : {}),
  });
  value.scopeClosures(true);
  const synchronized = await value.synchronize(
    {
      generation: 1,
      discovery: discovery(directory),
      changes: [],
      ...(retention ? { retention: retention as never } : {}),
    },
    new AbortController().signal,
  );
  expect(synchronized.diagnostics).toEqual([]);
  return { value, program: synchronized.dependencies };
}

/** The API page closure of the only declaration, and the store its runtime would persist. */
async function recorded(directory: string) {
  const { value, program } = await service(directory);
  const listed = value.enumerateApi('api');
  const page = value.renderFragment({
    kind: 'api-page',
    target: 'declaration',
    declarationId: listed.value![0]!.id,
  });
  const closure = page.dependencies.find(
    (item): item is SemanticClosureDependency => item.kind === 'semantic-closure',
  )!;
  const record = value.closureRecord(closure.digest)!;
  expect(record.files).toContain(join(directory, 'api.ts'));
  // The store keeps the program's file order with its records (`closureRecord` hands it out).
  expect(record.order).toContain(join(directory, 'api.ts'));
  const store: ClosureStore = Object.assign(new Map([[closure.digest, record]]), {
    order: record.order,
  });
  await value.dispose();
  return { closure, store, program };
}

const aggregate = (program: Dependency[]) =>
  programDigestOf([{ identity: { role: 'aggregate' }, dependencies: program }]);

test('a seeded record holds without recomputation on the previous program and is carried', async () => {
  const directory = workspace({
    'api.ts': '/** Thing. */\nexport class Thing {}\n',
    'unrelated.ts': 'export const unrelated = 1;\n',
  });
  const { closure, store, program } = await recorded(directory);
  // A fresh runtime: no record, and the program is the previous candidate's.
  const { value } = await service(directory, {});
  value.closureBase(aggregate(program));
  const load = vi.fn(() => store);
  value.seedClosures(load);
  expect(load).toHaveBeenCalledTimes(1);
  const computed = vi.spyOn(ProgramIndex.prototype, 'closure');
  expect(value.refreshClosure(closure)).toBe(closure.digest);
  expect(computed).not.toHaveBeenCalled();
  expect(value.closureRecord(closure.digest)).toEqual(store.get(closure.digest));
  const retained = value.retain() as { closures?: ClosureStore };
  expect(retained.closures?.get(closure.digest)).toEqual(store.get(closure.digest));
  computed.mockRestore();

  // The next generation carries it, so its first program edit refreshes the closure: an edit of a
  // file the page does not read keeps it, one of the page's own file changes it.
  writeFileSync(join(directory, 'unrelated.ts'), 'export const unrelated = 2;\n');
  const next = await service(directory, { previous: retained });
  expect(next.value.closuresHold()).toBe(false);
  // A generation that carries records of its runtime is not seeded.
  const unused = vi.fn(() => new Map());
  next.value.seedClosures(unused);
  expect(unused).not.toHaveBeenCalled();
  expect(next.value.refreshClosure(closure)).toBe(closure.digest);
  writeFileSync(join(directory, 'api.ts'), '/** Thing, edited. */\nexport class Thing {}\n');
  const edited = await service(directory, { previous: next.value.retain() });
  const refreshed = edited.value.refreshClosure(closure);
  expect(refreshed).toMatch(/^[0-9a-f]{64}$/);
  expect(refreshed).not.toBe(closure.digest);
  await Promise.all([value, next.value, edited.value].map((item) => item.dispose()));
});

test('a seeded record is checked on another program; a wrong or empty store only disables reuse', async () => {
  const directory = workspace({
    'api.ts': '/** Thing. */\nexport class Thing {}\n',
    'other.ts': 'export const other = 1;\n',
  });
  const { closure, store, program } = await recorded(directory);
  writeFileSync(join(directory, 'other.ts'), 'export const other = 2;\n');
  // The program changed (a file the page does not read): the seeded record is recomputed over it
  // and still holds.
  const seeded = await service(directory);
  seeded.value.closureBase(aggregate(program));
  expect(seeded.value.closuresHold()).toBe(false);
  seeded.value.seedClosures(() => store);
  expect(seeded.value.refreshClosure(closure)).toBe(closure.digest);

  // A record that is not the digest's (another footprint) never confirms it.
  const wrong = await service(directory);
  wrong.value.closureBase(aggregate(program));
  wrong.value.seedClosures(() =>
    Object.assign(
      new Map([[closure.digest, { files: [join(directory, 'other.ts')], derived: [] }]]),
      { order: store.order },
    ),
  );
  const recomputed = wrong.value.refreshClosure(closure);
  expect(recomputed).toMatch(/^[0-9a-f]{64}$/);
  expect(recomputed).not.toBe(closure.digest);

  // A store without the program's file order confirms nothing on another program.
  const unordered = await service(directory);
  unordered.value.closureBase(aggregate(program));
  unordered.value.seedClosures(() => new Map(store));
  expect(unordered.value.refreshClosure(closure)).toBeUndefined();
  await unordered.value.dispose();

  // An empty store seeds nothing: without a record the closure refreshes as changed.
  const empty = await service(directory);
  empty.value.closureBase(aggregate(program));
  empty.value.seedClosures(() => new Map());
  expect(empty.value.refreshClosure(closure)).toBeUndefined();

  // Closures off: nothing is seeded or known.
  const off = await service(directory);
  off.value.scopeClosures(false);
  await off.value.synchronize(
    { generation: 2, discovery: discovery(directory), changes: [] },
    new AbortController().signal,
  );
  const never = vi.fn(() => store);
  off.value.seedClosures(never);
  expect(never).not.toHaveBeenCalled();
  expect(off.value.closureRecord(closure.digest)).toBeUndefined();
  await Promise.all([seeded, wrong, empty, off].map((item) => item.value.dispose()));
});

test('shape closures in verify mode check a seeded record on the previous program as a carried one', async () => {
  const directory = workspace({ 'api.ts': '/** Thing. */\nexport class Thing {}\n' });
  const { closure, store, program } = await recorded(directory);
  // The stored record has no type-closure digest (it was recorded without `verify`).
  expect(store.get(closure.digest)?.wide).toBeUndefined();
  const { value } = await service(directory, {}, 'verify');
  value.closureBase(aggregate(program));
  expect(value.closuresHold()).toBe(true);
  value.seedClosures(() => store);
  const computed = vi.spyOn(ProgramIndex.prototype, 'closure');
  expect(value.refreshClosure(closure)).toBe(closure.digest);
  expect(computed).toHaveBeenCalled();
  // Not known to hold by its type closure: the reused content is rendered again and compared.
  expect(value.closureNarrowed(closure)).toBe(true);
  await value.dispose();
});
