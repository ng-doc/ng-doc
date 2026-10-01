import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project, ts } from 'ts-morph';
import { afterEach, describe, expect, test } from 'vitest';

import type {
  ApiDescriptor,
  Dependency,
  DiscoverySnapshot,
  GuideDescriptor,
  SemanticClosureDependency,
} from '../../contracts';
import { FootprintScope } from '../../kernel/footprint';
import { classIdentity, derivedClassList } from '../derived-classes';
import { ProgramIndex, programIndex } from '../program-index';
import type { Snapshot } from '../program-state';
import { openRecordingScopes, recordDerivedQuery, SemanticRecorder } from '../recorder';
import {
  programDigestOf,
  programOrder,
  sameRelativeOrder,
  SemanticClosures,
} from '../semantic-closure';
import { createSemanticService } from '../semantic-service';

afterEach(() => expect(openRecordingScopes()).toBe(0));

/** An in-memory project; `files` maps absolute paths to text. */
function project(files: Record<string, string>): Project {
  const value = new Project({
    useInMemoryFileSystem: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      noLib: true,
      strict: true,
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

/** The index of a fresh program over `files` (a new program is a new index). */
const index = (files: Record<string, string>, observations = 'global'): ProgramIndex =>
  programIndex(project(files), observations);

const base: Record<string, string> = {
  '/src/a.ts': "import { b } from './barrel';\nexport const a = b;\n",
  '/src/barrel.ts': "export * from './b';\nexport * from './c';\nexport * from './empty';\n",
  '/src/b.ts': '// Comment.\nexport const b = 1;\n',
  '/src/c.ts': 'export const c = 1;\n',
  '/src/empty.ts': 'export {};\n',
};

describe('ProgramIndex', () => {
  test('content and token digests: comments change the content, not the token', () => {
    const before = index(base);
    const comment = index({ ...base, '/src/b.ts': '// Another comment.\nexport const b = 1;\n' });
    const code = index({ ...base, '/src/b.ts': '// Comment.\nexport const b = 2;\n' });
    expect(comment.content('/src/b.ts')).not.toBe(before.content('/src/b.ts'));
    expect(comment.token('/src/b.ts')).toBe(before.token('/src/b.ts'));
    expect(code.token('/src/b.ts')).not.toBe(before.token('/src/b.ts'));
    expect(before.content('/src/missing.ts')).toBe('absent');
    expect(before.token('/src/missing.ts')).toBe('absent');
    expect(before.typeClosure('/src/missing.ts')).toMatch(/^[0-9a-f]{64}$/);
    // JavaScript, JSX, JSON and declaration files are digested by content: comments carry types.
    const other = {
      '/src/j.js': '/** @type {number} */\nexport const j = 1;\n',
      '/src/d.d.ts': 'export declare const d: number;\n',
      '/src/x.tsx': 'export const x = 1;\n',
    };
    const typed = index({ ...base, ...other });
    for (const file of Object.keys(other)) expect(typed.token(file)).toBe(typed.content(file));
  });

  test('a named import depends on the provider and the barrel surfaces, not on its siblings', () => {
    const before = index(base);
    const sibling = index({ ...base, '/src/c.ts': 'export const c: string = "";\n' });
    const provider = index({ ...base, '/src/b.ts': '// Comment.\nexport const b = "b";\n' });
    const comment = index({ ...base, '/src/b.ts': '// Other.\nexport const b = 1;\n' });
    expect(sibling.typeClosure('/src/a.ts')).toBe(before.typeClosure('/src/a.ts'));
    expect(comment.typeClosure('/src/a.ts')).toBe(before.typeClosure('/src/a.ts'));
    expect(provider.typeClosure('/src/a.ts')).not.toBe(before.typeClosure('/src/a.ts'));
    // The first export of an empty star module changes the barrel's surface.
    const star = index({ ...base, '/src/empty.ts': 'export const e = 1;\n' });
    expect(star.exportSurface('/src/barrel.ts')).not.toBe(before.exportSurface('/src/barrel.ts'));
    expect(star.typeClosure('/src/a.ts')).not.toBe(before.typeClosure('/src/a.ts'));
    // A re-targeted name: the barrel now takes `b` from another file.
    const retargeted = index({
      ...base,
      '/src/barrel.ts': "export { c as b } from './c';\nexport * from './empty';\n",
    });
    expect(retargeted.typeClosure('/src/a.ts')).not.toBe(before.typeClosure('/src/a.ts'));
  });

  test('named re-export chains and default imports resolve to their declaring files', () => {
    const files = {
      '/src/main.ts':
        "import value, { named } from './facade';\nexport const all = [value, named];\n",
      '/src/facade.ts': "export { named } from './inner';\nexport { default } from './inner';\n",
      '/src/inner.ts': 'export const named = 1;\nexport default 2;\n',
    };
    const before = index(files);
    const after = index({
      ...files,
      '/src/inner.ts': 'export const named = "";\nexport default 2;\n',
    });
    expect(after.typeClosure('/src/main.ts')).not.toBe(before.typeClosure('/src/main.ts'));
    // Re-exports of the facade itself are not its own type dependencies.
    expect(after.typeClosure('/src/facade.ts')).toBe(before.typeClosure('/src/facade.ts'));
  });

  test('module references without named bindings take every export of the module', () => {
    const files = {
      '/src/ns.ts':
        "import * as all from './barrel';\nimport './side';\nimport type { T } from './missing';\nexport type X = typeof all;\nexport type Y = import('./c').C;\n",
      '/src/barrel.ts': "export * from './b';\nexport { c } from './c';\n",
      '/src/b.ts': 'export const b = 1;\n',
      '/src/c.ts': 'export const c = 1;\nexport type C = number;\n',
      '/src/side.ts': 'export {};\n',
    };
    const before = index(files);
    const named = index({
      ...files,
      '/src/c.ts': 'export const c = "";\nexport type C = number;\n',
    });
    const star = index({ ...files, '/src/b.ts': 'export const b = "";\n' });
    expect(named.typeClosure('/src/ns.ts')).not.toBe(before.typeClosure('/src/ns.ts'));
    expect(star.typeClosure('/src/ns.ts')).not.toBe(before.typeClosure('/src/ns.ts'));
    // The unresolved module is a stable contribution; resolving it changes the closure.
    const resolved = index({ ...files, '/src/missing.ts': 'export type T = 1;\n' });
    expect(resolved.typeClosure('/src/ns.ts')).not.toBe(before.typeClosure('/src/ns.ts'));
  });

  test.each([
    ['export * as', "export * as ns from './a';\n"],
    ['import * as, then export', "import * as ns from './a';\nexport { ns };\n"],
  ])(
    'a namespace reached through a named binding (%s) takes every export of its module',
    (_, barrel) => {
      for (const a of ["export * from './c';\n", "export { v } from './c';\n"]) {
        const files = {
          '/src/consumer.ts': "import { ns } from './barrel';\nexport const w = ns.v;\n",
          '/src/barrel.ts': barrel,
          '/src/a.ts': a,
          '/src/c.ts': 'export const v = 1;\n',
        };
        const before = index(files);
        const after = index({ ...files, '/src/c.ts': "export const v = 'x';\n" });
        expect(after.typeClosure('/src/consumer.ts')).not.toBe(
          before.typeClosure('/src/consumer.ts'),
        );
      }
    },
  );

  test('cycles share one closure, and a change anywhere in the cycle changes both', () => {
    const files = {
      '/src/left.ts': "import { right } from './right';\nexport const left = () => right;\n",
      '/src/right.ts': "import { left } from './left';\nexport const right = () => left;\n",
      '/src/user.ts': "import { left } from './left';\nexport const user = left;\n",
    };
    const before = index(files);
    expect(before.typeClosure('/src/left.ts')).toBe(before.typeClosure('/src/right.ts'));
    const user = before.typeClosure('/src/user.ts');
    const after = index({
      ...files,
      '/src/right.ts': "import { left } from './left';\nexport const right = () => 1;\n",
    });
    expect(after.typeClosure('/src/left.ts')).not.toBe(before.typeClosure('/src/left.ts'));
    expect(after.typeClosure('/src/user.ts')).not.toBe(user);
    // Memoized per program: the same answer again.
    expect(before.typeClosure('/src/user.ts')).toBe(user);
  });

  test('declaration files under node_modules are leaves; their content is in env', () => {
    const files = {
      '/src/uses.ts': "import { lib } from 'lib';\nexport const uses = lib;\n",
      '/node_modules/lib/index.d.ts':
        "import { Dep } from './dep';\nexport declare const lib: Dep;\n",
      '/node_modules/lib/dep.d.ts': 'export type Dep = number;\n',
      '/node_modules/lib/package.json': '{"name":"lib","types":"index.d.ts"}',
    };
    const before = index(files);
    const after = index({ ...files, '/node_modules/lib/dep.d.ts': 'export type Dep = string;\n' });
    const leaf = '/node_modules/lib/index.d.ts';
    expect(after.typeClosure(leaf)).toBe(before.typeClosure(leaf));
    expect(after.env()).not.toBe(before.env());
  });

  test('env: global-effect files and the global observations', () => {
    const files = {
      '/src/module.ts': 'export const m = 1;\n',
      '/src/script.ts': 'const script = 1;\n',
      '/src/augment.ts': 'export {};\ndeclare global { interface Window { x: number } }\n',
      '/src/ambient.ts': "export {};\ndeclare module 'ambient' { export const a: number; }\n",
      '/src/data.json': '{"a":1}',
    };
    const before = index(files);
    expect(before.env()).toBe(before.env());
    expect(index({ ...files, '/src/module.ts': 'export const m = 2;\n' }).env()).toBe(before.env());
    expect(index({ ...files, '/src/data.json': '{"a":2}' }).env()).toBe(before.env());
    for (const [file, text] of [
      ['/src/script.ts', 'const script = 2;\n'],
      ['/src/augment.ts', 'export {};\ndeclare global { interface Window { y: number } }\n'],
      ['/src/ambient.ts', "export {};\ndeclare module 'ambient' { export const b: number; }\n"],
    ] as const)
      expect(index({ ...files, [file]: text }).env()).not.toBe(before.env());
    expect(index(files, 'other observations').env()).not.toBe(before.env());
  });

  test('triple-slash path references are module edges', () => {
    const files = {
      '/src/refs.ts':
        '/// <reference path="./target.ts" />\n/// <reference path="./gone.ts" />\nexport const r = 1;\n',
      '/src/target.ts': 'export const t = 1;\n',
    };
    const before = index(files);
    const after = index({ ...files, '/src/target.ts': 'export const t = "";\n' });
    expect(after.typeClosure('/src/refs.ts')).not.toBe(before.typeClosure('/src/refs.ts'));
  });

  test('the derived-class list of a class, and absent classes', () => {
    const files = {
      '/src/base.ts': 'export class Base {}\n',
      '/src/sub.ts': "import { Base } from './base';\nexport class Sub extends Base {}\n",
    };
    const value = project(files);
    const declaration = value.getSourceFileOrThrow('/src/base.ts').getClassOrThrow('Base');
    const identity = classIdentity(declaration.compilerNode);
    expect(JSON.parse(derivedClassList(value, identity))).toEqual([
      [
        classIdentity(
          value.getSourceFileOrThrow('/src/sub.ts').getClassOrThrow('Sub').compilerNode,
        ),
        'Sub',
      ],
    ]);
    expect(derivedClassList(value, '/src/base.ts#999')).toBe('absent');
    expect(derivedClassList(value, '/src/none.ts#0')).toBe('absent');
    const before = programIndex(value, 'global').closure(['/src/base.ts'], [identity]);
    const without = project({ ...files, '/src/sub.ts': 'export class Sub {}\n' });
    const after = programIndex(without, 'global').closure(['/src/base.ts'], [identity]);
    expect(after).not.toBe(before);
    expect(programIndex(value, 'global').closure(['/src/base.ts'], [identity])).toBe(before);
  });

  test('closures are recorded with suspended recording', () => {
    const value = project(base);
    const recorder = new SemanticRecorder('on');
    const scope = recorder.open('capture', 'index', value)!;
    try {
      programIndex(value, 'global').closure(['/src/a.ts'], []);
      expect(scope.close().files).toEqual([]);
    } finally {
      scope.dispose();
    }
  });
});

describe('footprint scopes', () => {
  test('a reference search outside a derived-class query leaves the footprint incomplete', () => {
    const value = project({
      '/src/base.ts': 'export class Base {}\n',
      '/src/sub.ts': "import { Base } from './base';\nexport class Sub extends Base {}\n",
    });
    const name = value.getSourceFileOrThrow('/src/base.ts').getClassOrThrow('Base').getNameNode()!;
    const recorder = new SemanticRecorder('on');
    const plain = recorder.open('capture', 'plain', value)!;
    try {
      name.findReferencesAsNodes();
      expect(plain.close().complete).toBe(false);
    } finally {
      plain.dispose();
    }
    const derived = recorder.open('capture', 'derived', value)!;
    try {
      recordDerivedQuery('/src/base.ts#0', () => name.findReferencesAsNodes());
      const footprint = derived.close();
      expect(footprint.complete).toBe(true);
      expect(footprint.derived).toEqual(['/src/base.ts#0']);
    } finally {
      derived.dispose();
    }
  });

  test('derived identities merge, and a recording failure makes the footprint incomplete', () => {
    const outer = new FootprintScope('capture', 'outer');
    const inner = new FootprintScope('capture', 'inner');
    inner.recordDerived('/a.ts#1');
    outer.merge(inner.seal());
    expect(outer.seal()).toMatchObject({ complete: true, derived: ['/a.ts#1'] });
    outer.gaps.push('recorder failure: boom');
    expect(outer.seal().complete).toBe(false);
    expect(new FootprintScope('capture', 'none').seal()).not.toHaveProperty('derived');
  });
});

describe('semantic closures', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  function workspace(files: Record<string, string>): string {
    const directory = mkdtempSync(join(tmpdir(), 'closures-'));
    directories.push(directory);
    const all: Record<string, string> = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { noLib: true, target: 'ES2022', strict: true },
        include: ['*.ts'],
      }),
      'entry.ts': '/** Guide summary. */\nconst Page = {}; export default Page;',
      'index.md': '# Guide',
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

  async function service(directory: string, retention?: { previous?: unknown }) {
    const value = createSemanticService({ dependencyMode: 'scope-reference' });
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

  const closureOf = (dependencies: Dependency[]) =>
    dependencies.find(
      (item): item is SemanticClosureDependency => item.kind === 'semantic-closure',
    );

  test('queries record closures; the retained program carries their records to the next service', async () => {
    const directory = workspace({ 'api.ts': '/** Thing. */\nexport class Thing {}\n' });
    const first = await service(directory, {});
    const listed = first.value.enumerateApi('api');
    const page = first.value.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: listed.value![0]!.id,
    });
    const closure = closureOf(page.dependencies)!;
    expect(closure).toMatchObject({
      kind: 'semantic-closure',
      scopeId: 'site',
      key: expect.stringContaining('renderFragment:api-page:'),
    });
    expect(page.dependencies.some((item) => item.kind === 'semantic-reference')).toBe(false);
    // No previous records' file order to compare with (a fresh runtime): nothing recorded before
    // this program can be confirmed by a record, since a query of this generation may record the
    // same digest on another file order.
    expect(first.value.refreshClosure(closure)).toBeUndefined();
    expect(first.value.refreshClosure({ ...closure, scopeId: 'other' })).toBeUndefined();
    expect(first.value.refreshClosure({ ...closure, digest: 'unknown' })).toBeUndefined();
    expect(first.value.refreshReference({ scopeId: 'site' })).toMatch(/^[0-9a-f]{64}$/);
    expect(first.value.refreshReference({ scopeId: 'other' })).toBeUndefined();
    // With the previous candidate's program digest, a closure without a record holds.
    const programDigest = programDigestOf([
      { identity: { role: 'aggregate' }, dependencies: first.program },
    ]);
    first.value.closureBase(programDigest);
    expect(first.value.closuresHold()).toBe(true);
    expect(first.value.refreshClosure({ ...closure, digest: 'unknown' })).toBe('unknown');
    const retained = first.value.retain() as { closures?: ReadonlyMap<string, unknown> };
    expect(retained.closures?.has(closure.digest)).toBe(true);

    // The next service refreshes from the carried record over its own program.
    writeFileSync(join(directory, 'api.ts'), '/** Thing, edited. */\nexport class Thing {}\n');
    const second = await service(directory, { previous: retained });
    expect(second.value.closuresHold()).toBe(false);
    const refreshed = second.value.refreshClosure(closure);
    expect(refreshed).toMatch(/^[0-9a-f]{64}$/);
    expect(refreshed).not.toBe(closure.digest);
    // The carried record over an unchanged program holds.
    writeFileSync(join(directory, 'api.ts'), '/** Thing. */\nexport class Thing {}\n');
    const third = await service(directory, { previous: first.value.retain() });
    expect(third.value.refreshClosure(closure)).toBe(closure.digest);
    await third.value.dispose();
    await first.value.dispose();
    expect(first.value.refreshClosure(closure)).toBeUndefined();
    await second.value.dispose();
  });

  test('a query whose footprint is incomplete, or that fails, records the global reference', async () => {
    const directory = workspace({ 'api.ts': '/** Thing. */\nexport class Thing {}\n' });
    const { value } = await service(directory);
    const failed = value.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: 'missing',
    });
    expect(failed.diagnostics.length).toBeGreaterThan(0);
    expect(failed.dependencies.map((item) => item.kind)).toContain('semantic-reference');
    // Closures off: the reference, as without scoping.
    value.scopeClosures(false);
    await value.synchronize(
      { generation: 2, discovery: discovery(directory), changes: [] },
      new AbortController().signal,
    );
    const listed = value.enumerateApi('api');
    expect(listed.dependencies.map((item) => item.kind)).toContain('semantic-reference');
    expect(closureOf(listed.dependencies)).toBeUndefined();
    expect(value.refreshReference({ scopeId: 'site' })).toBeUndefined();
    expect(value.closuresHold()).toBe(true);
    await value.dispose();
  });

  test('file order: insertions and removals keep the relative order, a swap does not', () => {
    const base = ['/lib.d.ts', '/a.ts', '/b.ts', '/c.ts'];
    expect(sameRelativeOrder(base, base)).toBe(true);
    // A pure insertion (anywhere) and a pure removal.
    expect(sameRelativeOrder(base, ['/lib.d.ts', '/new.ts', '/a.ts', '/b.ts', '/c.ts'])).toBe(true);
    expect(
      sameRelativeOrder(base, ['/x.ts', '/lib.d.ts', '/a.ts', '/b.ts', '/c.ts', '/y.ts']),
    ).toBe(true);
    expect(sameRelativeOrder(base, ['/lib.d.ts', '/a.ts', '/c.ts'])).toBe(true);
    expect(sameRelativeOrder(base, ['/b.ts', '/new.ts'])).toBe(true);
    // Two surviving files swapped (with an insertion and a removal around them).
    expect(sameRelativeOrder(base, ['/lib.d.ts', '/b.ts', '/a.ts', '/c.ts'])).toBe(false);
    expect(sameRelativeOrder(base, ['/new.ts', '/c.ts', '/lib.d.ts'])).toBe(false);
    // A library file moved before a workspace file.
    expect(sameRelativeOrder(base, ['/a.ts', '/lib.d.ts', '/b.ts', '/c.ts'])).toBe(false);
  });

  test('a swap since the stored order refreshes every closure as changed', () => {
    const files = { '/src/a.ts': 'export const a = 1;\n', '/src/b.ts': 'export const b = 1;\n' };
    const state = (value: Project, digest = 'program') =>
      ({
        project: value,
        observations: { semantic: { scopeId: 's', digest } },
      }) as unknown as Snapshot;
    const before = project(files);
    const order = programOrder(state(before));
    expect(programOrder(state(before))).toBe(order);
    expect(order.filter((file) => file.startsWith('/src/'))).toEqual(['/src/a.ts', '/src/b.ts']);
    const store = new SemanticClosures().retained(state(before));
    expect(store.order).toBe(order);
    const dependency = {
      kind: 'semantic-closure',
      scopeId: 's',
      key: 'k@shape',
      digest: 'd',
    } as const;
    const swapped = state(
      project({ '/src/b.ts': files['/src/b.ts'], '/src/a.ts': files['/src/a.ts'] }),
    );
    const closures = new SemanticClosures();
    closures.start(true, Object.assign(new Map([['d', { files: [], derived: [] }]]), { order }));
    expect(closures.refresh(swapped, dependency)).toBeUndefined();
    // The same program as the previous candidate's still holds without the records' order.
    closures.start(true, new Map());
    closures.setBase('program');
    expect(closures.refresh(state(before), dependency)).toBe('d');
    expect(closures.refresh(state(before, 'other'), dependency)).toBeUndefined();
  });

  test('the store keeps its live records and carries earlier ones while it stays small', () => {
    const closures = new SemanticClosures();
    const records = new Map(
      Array.from(
        { length: 6_000 },
        (_, index) => [`d${index}`, { files: [], derived: [] }] as const,
      ),
    );
    closures.start(true, records);
    expect(closures.retained().size).toBe(0);
    closures.start(true, new Map([...records].slice(0, 10)));
    expect(closures.retained().size).toBe(10);
    expect(closures.holds(undefined)).toBe(false);
    expect(programDigestOf([])).toBeUndefined();
  });
});
