import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project, ts } from 'ts-morph';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type {
  ApiDescriptor,
  DiscoverySnapshot,
  FileChange,
  GuideDescriptor,
  SemanticClosureDependency,
  ServiceResult,
} from '../../contracts';
import { ProgramIndex, programIndex } from '../program-index';
import { openRecordingScopes, SemanticRecorder } from '../recorder';
import { SemanticClosures, SHAPE_KEY_SUFFIX } from '../semantic-closure';
import { createSemanticService } from '../semantic-service';

// Shape closures: declaration shapes, their closures over the program, and the closure records
// of each switch mode.

afterEach(() => {
  expect(openRecordingScopes()).toBe(0);
  vi.restoreAllMocks();
});

/** An in-memory project; `files` maps absolute paths to text. */
function project(files: Record<string, string>, strict: boolean = true): Project {
  const value = new Project({
    useInMemoryFileSystem: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      noLib: true,
      strict,
      allowJs: true,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  });
  for (const [path, text] of Object.entries(files)) value.createSourceFile(path, text);
  value.resolveSourceFileDependencies();
  return value;
}

const index = (files: Record<string, string>, strict: boolean = true): ProgramIndex =>
  programIndex(project(files, strict), 'global');

const base: Record<string, string> = {
  '/src/util.ts':
    '/** Doubles. */\nexport function helper(values: number[]): number[] {\n  return values.map((v) => v * 2);\n}\n',
  '/src/barrel.ts': "export * from './util';\nexport * from './empty';\n",
  '/src/empty.ts': 'export {};\n',
  '/src/consumer.ts': "import { helper } from './barrel';\nexport const twice = helper([1]);\n",
  '/src/direct.ts':
    "import { helper } from './util';\nexport function direct(): number[] {\n  return helper([2]);\n}\n",
  '/src/page.ts': "import { direct } from './direct';\nexport const page = direct;\n",
};

describe('declaration shapes', () => {
  test('a body edit keeps the shape; comments never count; a signature edit changes it', () => {
    const before = index(base);
    const body = index({ ...base, '/src/util.ts': base['/src/util.ts']!.replace('* 2', '* 3') });
    const comment = index({
      ...base,
      '/src/util.ts': base['/src/util.ts']!.replace('Doubles.', 'Triples.'),
    });
    const signature = index({
      ...base,
      '/src/util.ts': base['/src/util.ts']!.replace('): number[] {', '): readonly number[] {'),
    });
    const file = '/src/util.ts';
    expect(body.token(file)).not.toBe(before.token(file));
    expect(body.dtsShape(file)).toBe(before.dtsShape(file));
    expect(comment.dtsShape(file)).toBe(before.dtsShape(file));
    expect(signature.dtsShape(file)).not.toBe(before.dtsShape(file));
    // The importers' shape closures follow the shape, their type closures the token.
    for (const importer of ['/src/consumer.ts', '/src/direct.ts', '/src/page.ts']) {
      expect(body.shapeClosure(importer)).toBe(before.shapeClosure(importer));
      expect(body.typeClosure(importer)).not.toBe(before.typeClosure(importer));
      expect(signature.shapeClosure(importer)).not.toBe(before.shapeClosure(importer));
    }
    expect(before.dtsShape('/src/missing.ts')).toBe('absent');
  });

  test('an inferred type the isolated emit states follows the body; one it cannot falls back to the token', () => {
    const inferred = { ...base, '/src/util.ts': 'export function helper() {\n  return 1;\n}\n' };
    const before = index(inferred);
    const same = index({
      ...inferred,
      '/src/util.ts': 'export function helper() {\n  return 2;\n}\n',
    });
    const other = index({
      ...inferred,
      '/src/util.ts': "export function helper() {\n  return 'one';\n}\n",
    });
    expect(same.dtsShape('/src/util.ts')).toBe(before.dtsShape('/src/util.ts'));
    expect(other.dtsShape('/src/util.ts')).not.toBe(before.dtsShape('/src/util.ts'));
    expect(other.shapeClosure('/src/direct.ts')).not.toBe(before.shapeClosure('/src/direct.ts'));
    // An emit diagnostic (an inferred type that needs the checker): no narrowing.
    const checked = {
      ...base,
      '/src/util.ts': 'export function helper(value: number) {\n  return value + 1;\n}\n',
    };
    const plain = index(checked);
    const edited = index({
      ...checked,
      '/src/util.ts': 'export function helper(value: number) {\n  return value + 2;\n}\n',
    });
    expect(edited.dtsShape('/src/util.ts')).not.toBe(plain.dtsShape('/src/util.ts'));
    expect(edited.shapeClosure('/src/direct.ts')).not.toBe(plain.shapeClosure('/src/direct.ts'));
    // A comment is still not a change.
    const commented = index({
      ...checked,
      '/src/util.ts': '// Note.\nexport function helper(value: number) {\n  return value + 1;\n}\n',
    });
    expect(commented.dtsShape('/src/util.ts')).toBe(plain.dtsShape('/src/util.ts'));
  });

  test('an enum initializer the isolated emit drops is part of the shape', () => {
    const files = {
      '/src/k.ts': 'export const K = 1;\n',
      '/src/e.ts': "import { K } from './k';\nexport enum E {\n  A = K,\n}\n",
    };
    const before = index(files);
    const after = index({
      ...files,
      '/src/e.ts': "import { K } from './k';\nexport enum E {\n  A = K + 1,\n}\n",
    });
    expect(after.dtsShape('/src/e.ts')).not.toBe(before.dtsShape('/src/e.ts'));
  });

  test('other files take their token, memoized by name and text', () => {
    const other = {
      '/src/j.js': 'export const j = 1;\n',
      '/src/d.d.ts': 'export declare const d: number;\n',
      '/src/x.tsx': 'export const x = 1;\n',
    };
    const first = index({ ...base, ...other });
    const second = index({ ...base, ...other });
    for (const file of Object.keys(other)) {
      expect(first.dtsShape(file)).toMatch(/^[0-9a-f]{64}$/);
      expect(second.dtsShape(file)).toBe(first.dtsShape(file));
    }
  });

  test('a new export of a star module changes the shape surface; cycles share one shape closure', () => {
    const before = index(base);
    const star = index({ ...base, '/src/empty.ts': 'export const e = 1;\n' });
    expect(star.shapeSurface('/src/barrel.ts')).not.toBe(before.shapeSurface('/src/barrel.ts'));
    expect(star.shapeClosure('/src/consumer.ts')).not.toBe(before.shapeClosure('/src/consumer.ts'));
    const cycle = index({
      '/src/left.ts':
        "import { right } from './right';\nexport const left = (): number => right();\n",
      '/src/right.ts':
        "import { left } from './left';\nexport const right = (): number => left();\n",
    });
    expect(cycle.shapeClosure('/src/left.ts')).toBe(cycle.shapeClosure('/src/right.ts'));
    const leaf = index({
      '/src/uses.ts': "import { lib } from 'lib';\nexport const uses = lib;\n",
      '/node_modules/lib/index.d.ts': 'export declare const lib: number;\n',
      '/node_modules/lib/package.json': '{"name":"lib","types":"index.d.ts"}',
    });
    expect(leaf.shapeClosure('/node_modules/lib/index.d.ts')).toMatch(/^[0-9a-f]{64}$/);
  });

  test("shapes follow the program's strictness, not TypeScript's default", () => {
    const nullable = { '/src/v.ts': 'export let v = null;\n' };
    const undefinedValue = { '/src/v.ts': 'export let v = undefined;\n' };
    const strict = index(nullable);
    const loose = index(nullable, false);
    // The same text is a different declaration: `v: null` when strict, `v: any` when not.
    expect(loose.dtsShape('/src/v.ts')).not.toBe(strict.dtsShape('/src/v.ts'));
    // Without strict null checks both initializers widen to `any`: one shape; with them, two.
    expect(index(undefinedValue, false).dtsShape('/src/v.ts')).toBe(loose.dtsShape('/src/v.ts'));
    expect(index(undefinedValue).dtsShape('/src/v.ts')).not.toBe(strict.dtsShape('/src/v.ts'));
    // Memoized per options: the strict program's shape is unchanged by the loose one.
    expect(index(nullable).dtsShape('/src/v.ts')).toBe(strict.dtsShape('/src/v.ts'));
  });
});

describe('shape closure digests', () => {
  test('a body edit changes only closures that read the file', () => {
    const before = index(base);
    const after = index({ ...base, '/src/util.ts': base['/src/util.ts']!.replace('* 2', '* 3') });
    // `page.ts` reads `direct.ts`, which imports the helper: kept by shapes.
    const read = ['/src/direct.ts', '/src/page.ts'];
    expect(after.closure(read, [], true)).toBe(before.closure(read, [], true));
    // Without shapes (the switch off), the importers' type closures change.
    expect(after.closure(read, [])).not.toBe(before.closure(read, []));
    // A file of `R` is covered by its content: an edit of the importer itself changes it.
    const own = index({
      ...base,
      '/src/direct.ts': base['/src/direct.ts']!.replace('helper([2])', 'helper([3])'),
    });
    expect(own.closure(['/src/direct.ts'], [], true)).not.toBe(
      before.closure(['/src/direct.ts'], [], true),
    );
    // A closure that read the edited file itself changes.
    expect(after.closure(['/src/util.ts'], [], true)).not.toBe(
      before.closure(['/src/util.ts'], [], true),
    );
    // The formulas differ: a shape closure never equals the type closure of the same record.
    expect(before.closure(read, [], true)).not.toBe(before.closure(read, []));
  });

  test('closures are computed with recording suspended', () => {
    const value = project(base);
    const recorder = new SemanticRecorder('on');
    const scope = recorder.open('capture', 'shape', value)!;
    try {
      programIndex(value, 'global').closure(['/src/page.ts'], [], true);
      expect(scope.close().files).toEqual([]);
    } finally {
      scope.dispose();
    }
  });
});

describe('shape closure records', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  function workspace(files: Record<string, string>): string {
    const directory = mkdtempSync(join(tmpdir(), 'shape-closures-'));
    directories.push(directory);
    const all: Record<string, string> = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { noLib: true, target: 'ES2022', strict: true },
        include: ['*.ts'],
      }),
      'entry.ts':
        "import { helper } from './util';\n/** Guide summary. */\nconst Page = { helper }; export default Page;",
      'index.md': '# Guide',
      'util.ts':
        'export function helper(values: number[]): number[] {\n  return values.map((v) => v * 2);\n}\n',
      'api.ts':
        "import { helper } from './util';\n/** Twice. */\nexport function twice(): number[] {\n  return helper([1]);\n}\n",
      'other.ts': '/** Other. */\nexport const other = 1;\n',
      ...files,
    };
    for (const [path, text] of Object.entries(all)) {
      mkdirSync(join(directory, path, '..'), { recursive: true });
      writeFileSync(join(directory, path), text);
    }
    return directory;
  }

  function discovery(directory: string): DiscoverySnapshot {
    const common = {
      source: { path: join(directory, 'entry.ts') },
      title: 'Reference',
      route: 'api',
      absoluteRoute: 'docs/api',
      breadcrumbs: ['Reference'],
      runtimeImport: { source: join(directory, 'entry.ts'), exportName: 'default' },
      dependencies: [],
    };
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
          ...common,
          id: 'api',
          kind: 'api',
          scopes: [
            { id: 'public', name: 'Public', route: 'public', include: ['api.ts'], exclude: [] },
          ],
        } as ApiDescriptor,
        {
          ...common,
          id: 'guide',
          kind: 'guide',
          markdown: [join(directory, 'index.md')],
          hasImports: true,
        } as GuideDescriptor,
      ],
      globalKeywords: [],
      remoteKeywords: [],
    };
  }

  const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

  async function service(
    directory: string,
    shapeClosure: 'on' | 'off' | 'verify',
    retention?: { previous?: unknown },
    changes: FileChange[] = [],
  ) {
    // Written files settle past the retained program's stat margin before it observes them.
    await pause(120);
    const value = createSemanticService({ dependencyMode: 'scope-reference', shapeClosure });
    value.scopeClosures(true);
    const synchronized = await value.synchronize(
      {
        generation: 1,
        discovery: discovery(directory),
        changes,
        ...(retention ? { retention: retention as never } : {}),
      },
      new AbortController().signal,
    );
    expect(synchronized.diagnostics).toEqual([]);
    return value;
  }

  const closureOf = <T>(result: ServiceResult<T>) =>
    result.dependencies.find(
      (item): item is SemanticClosureDependency => item.kind === 'semantic-closure',
    )!;

  /** Every query kind: the entry value, the guide, the declaration page and a declaration path. */
  function queries(value: ReturnType<typeof createSemanticService>) {
    const listed = value.enumerateApi('api');
    const declarationId = listed.value![0]!.id;
    return {
      listed: closureOf(listed),
      entry: closureOf(value.renderFragment({ kind: 'entry-doc', entryId: 'guide' })),
      guide: closureOf(value.describeGuide('guide')),
      page: closureOf(
        value.renderFragment({ kind: 'api-page', target: 'declaration', declarationId }),
      ),
      path: closureOf(
        value.renderFragment({ kind: 'js-doc', entryId: 'guide', declarationPath: 'api.ts#twice' }),
      ),
      other: closureOf(
        value.renderFragment({
          kind: 'js-doc',
          entryId: 'guide',
          declarationPath: 'other.ts#other',
        }),
      ),
    };
  }

  test('keys carry the mode; a closure of the other mode never refreshes', async () => {
    const directory = workspace({});
    const on = await service(directory, 'on', {});
    const off = await service(directory, 'off', {});
    const shaped = queries(on);
    const typed = queries(off);
    for (const closure of Object.values(shaped))
      expect(closure.key.endsWith(SHAPE_KEY_SUFFIX)).toBe(true);
    for (const closure of Object.values(typed))
      expect(closure.key.endsWith(SHAPE_KEY_SUFFIX)).toBe(false);
    // The next generation of each runtime refreshes the records it carries (same file order).
    const nextOn = await service(directory, 'on', { previous: on.retain() });
    const nextOff = await service(directory, 'off', { previous: off.retain() });
    expect(nextOn.refreshClosure(shaped.page)).toBe(shaped.page.digest);
    expect(nextOff.refreshClosure(typed.page)).toBe(typed.page.digest);
    expect(nextOn.refreshClosure(typed.page)).toBeUndefined();
    expect(nextOff.refreshClosure(shaped.page)).toBeUndefined();
    expect(shaped.page.digest).not.toBe(typed.page.digest);
    expect(nextOn.closureNarrowed(shaped.page)).toBe(false);
    for (const value of [on, off, nextOn, nextOff]) await value.dispose();
  });

  const bodyEdit = (directory: string): FileChange[] => {
    const path = join(directory, 'util.ts');
    writeFileSync(
      path,
      'export function helper(values: number[]): number[] {\n  return values.map((v) => v * 3);\n}\n',
    );
    return [{ kind: 'update', path }];
  };

  test('a body edit: the retained records hold on their shapes on a patched program, as cold', async () => {
    const directory = workspace({});
    const first = await service(directory, 'on', {});
    const before = queries(first);
    const retained = first.retain();
    const second = await service(directory, 'on', { previous: retained }, bodyEdit(directory));
    expect(second.programSynchronization()).toEqual({ outcome: 'patched' });
    // The page and the guide document files that import the helper: they hold on its shape.
    for (const name of ['page', 'path', 'guide', 'entry', 'listed', 'other'] as const)
      expect({ name, digest: second.refreshClosure(before[name]) }).toEqual({
        name,
        digest: before[name].digest,
      });
    // A cold service over the edited tree records the same digests.
    const cold = await service(directory, 'on');
    const fresh = queries(cold);
    for (const name of ['page', 'path', 'guide', 'entry', 'listed', 'other'] as const)
      expect({ name, digest: fresh[name].digest }).toEqual({ name, digest: before[name].digest });
    for (const value of [first, second, cold]) await value.dispose();
  });

  test('verify reports a closure that held only by its shapes as narrowed', async () => {
    const directory = workspace({});
    const first = await service(directory, 'verify', {});
    const before = queries(first);
    const retained = first.retain();
    const second = await service(directory, 'verify', { previous: retained }, bodyEdit(directory));
    expect(second.programSynchronization()).toEqual({ outcome: 'patched' });
    for (const name of ['page', 'path', 'guide', 'entry', 'listed'] as const) {
      expect(second.refreshClosure(before[name])).toBe(before[name].digest);
      expect({ name, narrowed: second.closureNarrowed(before[name]) }).toEqual({
        name,
        narrowed: true,
      });
    }
    // A closure whose type closures did not change: no narrowing to report.
    expect(second.refreshClosure(before.other)).toBe(before.other.digest);
    expect(second.closureNarrowed(before.other)).toBe(false);
    // Recorded again by its query in this generation, the record's type digest is current.
    const again = queries(second);
    expect(again.page.digest).toBe(before.page.digest);
    const third = await service(directory, 'verify', { previous: second.retain() });
    expect(third.refreshClosure(again.page)).toBe(again.page.digest);
    expect(third.closureNarrowed(again.page)).toBe(false);
    // Records carried from a generation without type digests (switch `on`): narrowing cannot be
    // ruled out, so every closure that holds is reported.
    const plain = await service(directory, 'on', {});
    const carried = queries(plain);
    const fourth = await service(directory, 'verify', { previous: plain.retain() });
    expect(fourth.refreshClosure(carried.other)).toBe(carried.other.digest);
    expect(fourth.closureNarrowed(carried.other)).toBe(true);
    for (const value of [plain, fourth]) await value.dispose();
    // Closures off: nothing is narrowed.
    third.scopeClosures(false);
    await third.synchronize(
      { generation: 3, discovery: discovery(directory), changes: [] },
      new AbortController().signal,
    );
    expect(third.closureNarrowed(again.page)).toBe(false);
    for (const value of [first, second, third]) await value.dispose();
  });

  test('the store keeps each query’s type digest per record', () => {
    const closures = new SemanticClosures('verify');
    closures.start(true, new Map([['d', { files: [], derived: [], wide: { k: 'w' } }]]));
    expect(closures.retained().get('d')?.wide).toEqual({ k: 'w' });
    expect(
      new SemanticClosures().narrowed({
        kind: 'semantic-closure',
        scopeId: 's',
        key: 'k',
        digest: 'd',
      }),
    ).toBe(false);
  });
});
