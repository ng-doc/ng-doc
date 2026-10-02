import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { createOutputCommitter } from '../artifacts';
import { GeneratorContentCompiler } from '../content/content-compiler';
import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
  FileChange,
} from '../contracts';
import { hostPath } from '../kernel/paths';
import { createBuildSession } from '../session/build-session';
import { type RetentionPromotion, createRuntimeRetention } from '../worker/protocol';
import * as compilerModule from './index';
import { type CompilationOptions, createCompilationService, incrementalRetention } from './index';

// A development generation of a long-lived runtime keeps its TypeScript Project and the next
// generation skips `synchronize` when nothing the program observed changed. The skip must be
// invisible: every step of an edit sequence equals a cold compile of the same tree and the
// reference chain (`incrementalReuse: false`) exactly.
//
// Program builds are counted black-box (every full synchronize adds its root files to a new
// ts-morph Project exactly once), so these tests also run against sources without the skip.

const cleanup: Array<() => unknown> = [];
let builds = 0;
// Patched by hand, not with vi.spyOn: a spy records every call's `this` (a whole Project), which
// would keep every program of the file alive.
const addSourceFilesAtPaths = Project.prototype.addSourceFilesAtPaths;
const compileContent = GeneratorContentCompiler.prototype.compile;
/** Runs `before` ahead of every content compile of this test (one per content request). */
function beforeContentCompile(before: () => void): () => void {
  GeneratorContentCompiler.prototype.compile = function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof compileContent>
  ) {
    before();
    return compileContent.apply(this, args);
  };
  return () => {
    GeneratorContentCompiler.prototype.compile = compileContent;
  };
}
beforeEach(() => {
  (compilerModule as { resetIncrementalRetention?: () => void }).resetIncrementalRetention?.();
  builds = 0;
  Project.prototype.addSourceFilesAtPaths = function (
    this: Project,
    ...args: Parameters<typeof addSourceFilesAtPaths>
  ) {
    builds += 1;
    return addSourceFilesAtPaths.apply(this, args);
  };
});
afterEach(async () => {
  Project.prototype.addSourceFilesAtPaths = addSourceFilesAtPaths;
  GeneratorContentCompiler.prototype.compile = compileContent;
  delete process.env['NGDOC_INCREMENTAL_SKIP'];
  delete process.env['NGDOC_INCREMENTAL_PROGRAM'];
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  (compilerModule as { resetIncrementalRetention?: () => void }).resetIncrementalRetention?.();
});

interface Fixture {
  root: string;
  options: CompilationOptions;
  path(file: string): string;
  read(file: string): string;
  write(file: string, content: string): string;
  remove(file: string): string;
  reset(): void;
  create(overrides?: Partial<CompilationOptions>): ReturnType<typeof createCompilationService>;
}

/**
 * `demo`: a real Angular demo component (node_modules is the repository's, symlinked).
 * `undeclared`: a local node_modules, `types: ["*"]` with a custom type root, and an API file whose
 * imports and ambient types resolve only once something appears that no watcher reports (`lib/`
 * does not exist, `newpkg` is not installed, the ambient types are absent).
 */
function fixture(options: { demo?: boolean; undeclared?: boolean } = {}): Fixture {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-retained-')));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  if (options.demo)
    symlinkSync(
      path.resolve(import.meta.dirname, '../../../../node_modules'),
      path.join(root, 'node_modules'),
      'dir',
    );
  const include = path.join(root, 'docs/shared/include.md');
  const initial: Record<string, string> = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        ...(options.undeclared
          ? { types: ['*'], typeRoots: ['./typings', './node_modules/@types'] }
          : { types: [] }),
        skipLibCheck: true,
        experimentalDecorators: true,
      },
      include: ['docs/**/*.ts'],
    }),
    'ng-doc.config.ts': `export default { docsPath: 'docs', cache: true };`,
    'docs/ng-doc.api.ts': `const api = { title: 'API', keyword: 'ApiIndex', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default api;`,
    'docs/api.ts': '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
    'docs/api-helper.ts':
      "import { Actual } from './api';\n/** Returns the given actual. */ export function helper(value: Actual): Actual { return value; }",
    'docs/guide/ng-doc.page.ts': options.demo
      ? `import { Demo } from './demo'; /** Guide introduction. */ const page = { title: 'Guide', route: 'guide', mdFile: './index.md', demos: { Demo } }; export default page;`
      : `/** Guide introduction. */ const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
    'docs/guide/index.md': `---\nkeyword: Guide\n---\n# Guide heading\n\nBody with \`Actual\` and \`helper\`.\n\n{% include ${JSON.stringify(include)} %}\n${options.demo ? '\n{{ NgDocActions.demo("Demo") }}\n' : ''}`,
    'docs/second/ng-doc.page.ts': `const page = { title: 'Second', route: 'second', mdFile: './index.md' }; export default page;`,
    'docs/second/index.md': `# Second\n\nSee \`*Guide\` for details.\n\n{% include ${JSON.stringify(include)} %}\n`,
    'docs/shared/include.md': 'Shared include text.',
    ...(options.undeclared
      ? {
          'docs/api-inputs.ts': [
            "import { make } from '../lib/factory';",
            "import { pkg } from 'newpkg';",
            '/** Via a module in a directory that does not exist yet. */ export function viaFactory() { return make(); }',
            '/** Via a package that is not installed yet. */ export function viaPackage() { return pkg(); }',
            '/** Via an automatic @types package. */ export function viaAmbient() { return ambientValue(); }',
            '/** Via a custom type root. */ export function viaTypings() { return typingsValue(); }',
            '/** Via an explicitly named types package. */ export function viaExplicit() { return newTypesValue(); }',
            "import { linked } from 'linked';",
            '/** Via a symlinked package. */ export function viaLinked() { return linked(); }',
          ].join('\n'),
          'packages/a/package.json': '{ "name": "linked", "types": "index.d.ts" }',
          'packages/a/index.d.ts': 'export declare function linked(): { targetA: 1 };',
          'packages/b/package.json': '{ "name": "linked", "types": "index.d.ts" }',
          'packages/b/index.d.ts': 'export declare function linked(): { targetB: 2 };',
          'node_modules/.keep': '',
          'node_modules/@types/existing/index.d.ts':
            'declare type ExistingThing = { existing: 1 };',
          'typings/existing2/index.d.ts': 'declare type Existing2 = { e2: 1 };',
        }
      : {}),
    ...(options.demo
      ? {
          'docs/guide/demo.ts': `import { Component } from '@angular/core'; @Component({ selector: 'fixture-demo', templateUrl: './demo.html' }) export class Demo {}`,
          'docs/guide/demo.html': '<b>External demo body</b>',
        }
      : {}),
  };
  const resolve = (file: string) => path.join(root, file);
  // Paths handed to the test (changes, expectations) in the engine's spelling, as the session's
  // changes and every recorded dependency spell them; the filesystem accepts it on every OS.
  const engine = (file: string) => hostPath(resolve(file));
  const write = (file: string, content: string) => {
    const target = engine(file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const remove = (file: string) => {
    const target = engine(file);
    unlinkSync(target);
    return target;
  };
  const reset = () => {
    for (const directory of ['docs', 'out', 'cache'])
      rmSync(resolve(directory), { recursive: true, force: true });
    for (const file of ['package.json', 'tsconfig.json']) rmSync(resolve(file), { force: true });
    if (options.undeclared)
      for (const directory of ['node_modules', 'lib', 'typings', 'packages'])
        rmSync(resolve(directory), { recursive: true, force: true });
    for (const [file, content] of Object.entries(initial)) write(file, content);
    if (options.undeclared)
      symlinkSync(resolve('packages/a'), resolve('node_modules/linked'), 'dir');
  };
  reset();
  const compilation: CompilationOptions = {
    projectId: 'fixture',
    workspaceRoot: root,
    configFile: resolve('ng-doc.config.ts'),
    defaults: {
      docsRoot: resolve('docs'),
      tsConfig: resolve('tsconfig.json'),
      outputRoot: resolve('out'),
      cacheRoot: resolve('cache'),
    },
    compilerVersion: 'test-v1',
    toolchainDigest: 'real-ts6-shiki',
  };
  const create = (overrides: Partial<CompilationOptions> = {}) => {
    const service = createCompilationService({ ...compilation, ...overrides });
    cleanup.push(() => service.dispose());
    return service;
  };
  return {
    root,
    options: compilation,
    path: engine,
    read: (file) => readFileSync(resolve(file), 'utf8'),
    write,
    remove,
    reset,
    create,
  };
}

type Service = ReturnType<typeof createCompilationService>;

const compile = (
  service: Service,
  generation: number,
  previous?: ArtifactSnapshot,
  changes: FileChange[] = [],
  extra: Partial<CompilationRequest> = {},
  context?: CompilationContext,
) =>
  service.compile(
    { generation, mode: 'development', changes, ...(previous ? { previous } : {}), ...extra },
    new AbortController().signal,
    context,
  );

function success(result: CompilationResult): ArtifactSnapshot {
  expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(result.candidate).toBeDefined();
  return result.candidate!;
}

/** Everything a reader of the published site observes, plus every artifact revision. */
function published(result: CompilationResult) {
  const candidate = success(result);
  const artifacts = [...candidate.artifacts].sort((left, right) => left.id.localeCompare(right.id));
  return {
    revision: candidate.revision,
    revisions: artifacts.map((artifact) => [artifact.id, artifact.revision]),
    outputs: Object.fromEntries(
      artifacts
        .flatMap((artifact) => artifact.outputs)
        .map((output) => [output.path, output.content] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    search: artifacts.map((artifact) => [artifact.id, artifact.searchRecords]),
    keywords: artifacts.map((artifact) => [
      artifact.id,
      artifact.exportedKeywords,
      artifact.usedKeywords,
    ]),
    routes: artifacts.map((artifact) => [artifact.id, artifact.routes, artifact.apiList]),
    descriptors: artifacts.map((artifact) => [
      artifact.id,
      (artifact.contentDescriptors ?? []).map((descriptor) => descriptor.id),
    ]),
    diagnostics: result.diagnostics,
    dependencies: result.dependencies,
  };
}

/** A cold build of the current tree: a fresh one-shot runtime, no previous snapshot, no cache. */
async function cold(f: Fixture): Promise<CompilationResult> {
  const cache = f.options.defaults.cacheRoot;
  const parked = `${cache}.parked`;
  const hadCache = existsSync(cache);
  if (hadCache) renameSync(cache, parked);
  const counted = builds;
  const service = f.create();
  try {
    return await compile(service, 1, undefined, [], {}, { lifetime: 'generation' });
  } finally {
    await service.dispose();
    // A cold compile is the comparison, not a generation under test.
    builds = counted;
    rmSync(cache, { recursive: true, force: true });
    if (hadCache) renameSync(parked, cache);
  }
}

/** Files written by a step settle past the stat margin before the next observation begins. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const update = (file: string): FileChange => ({ kind: 'update', path: file });

interface Step {
  name: string;
  /**
   * How the step's generation obtains its program: the retained one as it is, the retained one
   * patched with the step's program-file edits (rebuilt when the incremental program is off), or a
   * new one.
   */
  program: 'reuse' | 'patch' | 'build';
  apply(f: Fixture): FileChange[];
  extra?: Partial<CompilationRequest>;
}

const steps: Step[] = [
  {
    name: 'guide markdown edit',
    program: 'reuse',
    apply: (f) => [
      update(
        f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nAn edited paragraph.\n'),
      ),
    ],
  },
  {
    name: 'include edit',
    program: 'reuse',
    apply: (f) => [update(f.write('docs/shared/include.md', 'Edited include text.'))],
  },
  {
    name: 'demo template edit',
    program: 'reuse',
    apply: (f) => [update(f.write('docs/guide/demo.html', '<b>Changed demo body</b>'))],
  },
  {
    name: 'API JSDoc edit (.ts)',
    program: 'patch',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          '/** Edited declaration. */ export class Actual { /** Value. */ value = 1; }',
        ),
      ),
    ],
  },
  {
    name: 'markdown edit after a program rebuild',
    program: 'reuse',
    apply: (f) => [
      update(f.write('docs/second/index.md', f.read('docs/second/index.md') + '\nMore prose.\n')),
    ],
  },
  {
    name: 'new API file under the scope glob',
    // A root change: patched into the retained program (the structural class).
    program: 'patch',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write('docs/api-extra.ts', '/** Extra declaration. */ export class Extra {}'),
      },
    ],
  },
  {
    name: 'deleted API file',
    // A root change: patched into the retained program (the structural class).
    program: 'patch',
    apply: (f) => [{ kind: 'delete', path: f.remove('docs/api-extra.ts') }],
  },
  {
    name: 'tsconfig change',
    program: 'build',
    apply: (f) => [
      update(
        f.write(
          'tsconfig.json',
          JSON.stringify(
            {
              compilerOptions: {
                target: 'ES2022',
                types: [],
                skipLibCheck: true,
                experimentalDecorators: true,
              },
              include: ['docs/**/*.ts'],
            },
            null,
            2,
          ),
        ),
      ),
    ],
  },
  {
    name: 'package.json created',
    program: 'build',
    apply: (f) => [
      { kind: 'create', path: f.write('package.json', '{ "name": "fixture", "private": true }') },
    ],
  },
  {
    name: 'package.json edit',
    program: 'build',
    apply: (f) => [
      update(f.write('package.json', '{ "name": "fixture", "private": true, "version": "1.0.0" }')),
    ],
  },
  {
    name: 'markdown-only edit before a rescan',
    program: 'reuse',
    apply: (f) => [update(f.write('docs/shared/include.md', 'Include before rescan.'))],
  },
  {
    name: 'rescan (reconcile generation)',
    program: 'build',
    apply: () => [],
    extra: { contentRequest: { origin: 'reconcile' } },
  },
  {
    name: 'missed .ts event (stat sweep)',
    program: 'patch',
    apply: (f) => {
      f.write(
        'docs/api-helper.ts',
        f.read('docs/api-helper.ts') + '\n/** Unreported. */ export const unreported = 1;',
      );
      return [update(f.write('docs/third.md', 'Unrelated file.'))];
    },
  },
  {
    name: 'guide keyword change (front matter)',
    program: 'reuse',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/index.md',
          f.read('docs/guide/index.md').replace('keyword: Guide', 'keyword: GuideRenamed'),
        ),
      ),
      update(
        f.write(
          'docs/second/index.md',
          f.read('docs/second/index.md').replace('`*Guide`', '`*GuideRenamed`'),
        ),
      ),
    ],
  },
  {
    name: 'page keyword change (page .ts)',
    program: 'patch',
    apply: (f) => [
      update(
        f.write(
          'docs/second/ng-doc.page.ts',
          `const page = { title: 'Second', route: 'second', mdFile: './index.md', keyword: 'SecondKey' }; export default page;`,
        ),
      ),
    ],
  },
  {
    name: 'revert of the markdown and include edits',
    program: 'reuse',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/index.md',
          f
            .read('docs/guide/index.md')
            .replace('keyword: GuideRenamed', 'keyword: Guide')
            .replace('\nAn edited paragraph.\n', ''),
        ),
      ),
      update(
        f.write(
          'docs/second/index.md',
          f.read('docs/second/index.md').replace('`*GuideRenamed`', '`*Guide`'),
        ),
      ),
      update(f.write('docs/shared/include.md', 'Shared include text.')),
    ],
  },
  {
    name: 'revert of the API edit',
    program: 'patch',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
        ),
      ),
    ],
  },
  {
    name: 'no-op save',
    program: 'reuse',
    apply: (f) => [update(f.write('docs/second/index.md', f.read('docs/second/index.md')))],
  },
];

/** Inputs that no watcher reports: each forces a rebuild, the next edit reuses. */
const markdown = (label: string): Step => ({
  name: `markdown edit after ${label}`,
  program: 'reuse',
  apply: (f) => [
    update(f.write('docs/second/index.md', f.read('docs/second/index.md') + `\n${label}.\n`)),
  ],
});
const undeclaredSteps: Step[] = [
  {
    name: 'file in a new directory outside every glob, only its file event',
    program: 'build',
    apply: (f) => [
      {
        kind: 'create',
        path: f.write(
          'lib/factory.ts',
          'export function make() { return { made: true as const }; }',
        ),
      },
    ],
  },
  markdown('a new directory'),
  {
    name: 'package installed into node_modules, no event',
    program: 'build',
    apply: (f) => {
      f.write('node_modules/newpkg/package.json', '{ "name": "newpkg", "types": "index.d.ts" }');
      f.write(
        'node_modules/newpkg/index.d.ts',
        'export declare function pkg(): { fromPkg: number };',
      );
      return [
        update(f.write('docs/second/index.md', f.read('docs/second/index.md') + '\nS2 edit.\n')),
      ];
    },
  },
  markdown('a package install'),
  {
    name: 'new automatic @types package, no event',
    program: 'build',
    apply: (f) => {
      f.write(
        'node_modules/@types/ambient/index.d.ts',
        'declare function ambientValue(): { ambientFn: 6 };',
      );
      return [
        update(f.write('docs/second/index.md', f.read('docs/second/index.md') + '\nS3 edit.\n')),
      ];
    },
  },
  markdown('a new @types package'),
  {
    name: 'new folder under a custom type root, no event',
    program: 'build',
    apply: (f) => {
      f.write('typings/extra/index.d.ts', 'declare function typingsValue(): { typingsFn: 7 };');
      return [
        update(f.write('docs/second/index.md', f.read('docs/second/index.md') + '\nS7 edit.\n')),
      ];
    },
  },
  markdown('a new type-root folder'),
  {
    name: 'API file created under the scope glob, no event',
    // A root change: patched into the retained program (the structural class).
    program: 'patch',
    apply: (f) => {
      f.write('docs/api-late.ts', '/** Late declaration. */ export class Late {}');
      return [
        update(f.write('docs/second/index.md', f.read('docs/second/index.md') + '\nL1 edit.\n')),
      ];
    },
  },
  {
    name: 'atomic save (temporary file + rename) of a markdown file in a member directory',
    program: 'reuse',
    apply: (f) => {
      const target = f.path('docs/notes.md');
      const temporary = f.write('docs/notes.md___jb_tmp___', '# Notes');
      renameSync(temporary, target);
      return [
        { kind: 'create', path: temporary },
        { kind: 'create', path: target },
        { kind: 'delete', path: temporary },
      ];
    },
  },
  {
    name: 'symlinked package retargeted between byte-identical package.json files, no event',
    program: 'build',
    apply: (f) => {
      unlinkSync(f.path('node_modules/linked'));
      symlinkSync(f.path('packages/b'), f.path('node_modules/linked'), 'dir');
      return [
        update(f.write('docs/second/index.md', f.read('docs/second/index.md') + '\nL4 edit.\n')),
      ];
    },
  },
  markdown('a retargeted symlink'),
  {
    name: 'tsconfig names its types explicitly (types: ["newtypes"], not installed)',
    program: 'build',
    apply: (f) => [
      update(
        f.write(
          'tsconfig.json',
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              types: ['newtypes'],
              typeRoots: ['./typings', './node_modules/@types'],
              skipLibCheck: true,
              experimentalDecorators: true,
            },
            include: ['docs/**/*.ts'],
          }),
        ),
      ),
    ],
  },
  markdown('explicit types'),
  {
    name: 'the explicitly named types package is installed, no event',
    program: 'build',
    apply: (f) => {
      f.write(
        'node_modules/@types/newtypes/index.d.ts',
        'declare function newTypesValue(): { explicitFn: 7 };',
      );
      return [
        update(f.write('docs/second/index.md', f.read('docs/second/index.md') + '\nN5c edit.\n')),
      ];
    },
  },
  markdown('the explicit types install'),
];

async function runChain(
  f: Fixture,
  service: Service,
  onStep?: (step: string, result: CompilationResult, builds: number) => Promise<void> | void,
  chain: Step[] = steps,
): Promise<CompilationResult[]> {
  let before = builds;
  const results = [await compile(service, 1)];
  await onStep?.('initial', results[0], builds - before);
  for (const [index, step] of chain.entries()) {
    const changes = step.apply(f);
    await settle();
    before = builds;
    const result = await compile(service, index + 2, success(results.at(-1)!), changes, step.extra);
    const built = builds - before;
    results.push(result);
    await onStep?.(step.name, result, built);
  }
  return results;
}

async function differential(
  f: Fixture,
  chain: Step[],
  overrides: Partial<CompilationOptions> = {},
): Promise<void> {
  await settle();
  const colds: CompilationResult[] = [];
  const reference = await runChain(
    f,
    f.create({ incrementalReuse: false }),
    async () => {
      colds.push(await cold(f));
    },
    chain,
  );
  f.reset();
  await settle();
  const built: Array<[string, number]> = [];
  const incremental = await runChain(
    f,
    f.create(overrides),
    (step, _result, count) => {
      built.push([step, count]);
    },
    chain,
  );
  expect(incremental).toHaveLength(chain.length + 1);
  for (const [index, result] of incremental.entries()) {
    const label = index ? chain[index - 1].name : 'initial';
    // Byte for byte with the reference chain: candidate (every revision), diagnostics, whyRebuilt,
    // dependencies.
    // (Soft: every divergent step is reported, not only the first.)
    expect.soft({ label, result: JSON.stringify(result) }).toEqual({
      label,
      result: JSON.stringify(reference[index]),
    });
    // Outputs, artifact revisions, content index and diagnostics equal a cold compile of the tree.
    expect.soft({ label, ...published(result) }).toEqual({ label, ...published(colds[index]) });
  }
  // The skip happened exactly where nothing the program observed changed, and the patch exactly
  // where only the content of program files did.
  const patching = overrides.incrementalProgram !== false;
  expect(built).toEqual([
    ['initial', 1],
    ...chain.map((step): [string, number] => [
      step.name,
      step.program === 'build' || (step.program === 'patch' && !patching) ? 1 : 0,
    ]),
  ]);
}

test('differential: every step of a development edit sequence with the retained program equals a cold compile and the reference chain', async () => {
  await differential(fixture({ demo: true }), steps);
}, 600_000);

test('differential with the incremental program off: program-file edits rebuild the program and equal the patched chain, a cold compile and the reference chain', async () => {
  await differential(fixture({ demo: true }), steps, { incrementalProgram: false });
}, 600_000);

test('differential: inputs no watcher reports (new directory, package install, @types and type-root folders, missed API file) rebuild and equal cold', async () => {
  const f = fixture({ undeclared: true });
  await differential(f, undeclaredSteps);
  // The published pages show the types that appeared (not `any`).
  const api = (await cold(f))
    .candidate!.artifacts.flatMap((artifact) => artifact.outputs)
    .map((output) => String(output.content))
    .join('\n');
  // (ambientFn/typingsFn came from the automatic types, which the explicit list turned off.)
  for (const text of ['fromPkg', 'made', 'Late', 'targetB', 'explicitFn'])
    expect(api).toContain(text);
}, 600_000);

test('a markdown edit reuses the program; a .ts edit and a missed event patch it; with the switch off they rebuild it', async () => {
  const f = fixture();
  await settle();
  const service = f.create();
  const first = success(await compile(service, 1));
  expect(builds).toBe(1);
  const guide = f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nEdit.\n');
  await settle();
  const second = success(await compile(service, 2, first, [update(guide)]));
  expect(builds).toBe(1);
  // A touched but byte-identical program file keeps the program (re-hash on a stat change).
  f.write('docs/api.ts', f.read('docs/api.ts'));
  await settle();
  const third = success(await compile(service, 3, second, [update(f.path('docs/guide/index.md'))]));
  expect(builds).toBe(1);
  expect(incrementalRetention().last?.synchronization?.path).toBe('reused');
  // A .ts edit patches it.
  const api = f.write('docs/api.ts', '/** Edited. */ export class Actual { value = 2; }');
  await settle();
  const fourth = await compile(service, 4, third, [update(api)]);
  expect(builds).toBe(1);
  expect(incrementalRetention().last?.synchronization).toMatchObject({
    path: 'patched',
    files: [api],
  });
  expect(published(fourth)).toEqual(published(await cold(f)));
  // A .ts edit without any watcher event is found by the stat sweep, and patched.
  f.write('docs/api-helper.ts', f.read('docs/api-helper.ts') + '\nexport const missed = 1;');
  await settle();
  const fifth = await compile(service, 5, success(fourth), []);
  expect(builds).toBe(1);
  expect(published(fifth)).toEqual(published(await cold(f)));
  // With the incremental program off (NGDOC_INCREMENTAL_PROGRAM=0), the same edits rebuild it.
  process.env['NGDOC_INCREMENTAL_PROGRAM'] = '0';
  const off = f.create();
  // Nothing changed: it reuses the patched program the in-process slot holds.
  const initial = success(await compile(off, 6, success(fifth)));
  expect(builds).toBe(1);
  f.write('docs/api.ts', '/** Edited again. */ export class Actual { value = 3; }');
  await settle();
  const rebuilt = await compile(off, 7, initial, [update(api)]);
  expect(builds).toBe(2);
  f.write('docs/api-helper.ts', f.read('docs/api-helper.ts') + '\nexport const missedAgain = 1;');
  await settle();
  const swept = await compile(off, 8, success(rebuilt), []);
  expect(builds).toBe(3);
  expect(published(swept)).toEqual(published(await cold(f)));
}, 240_000);

test('the retained program is promoted only for the returned candidate and discarded for any other base', async () => {
  const f = fixture();
  await settle();
  // The counts are of programs built: the fast start publishes a recorded start without any.
  const service = f.create({ fastStart: false });
  const first = success(await compile(service, 1));
  const guide = f.path('docs/guide/index.md');
  f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nOne.\n');
  await settle();
  success(await compile(service, 2, first, [update(guide)]));
  expect(builds).toBe(1);
  // The session did not commit that candidate (for example a failed commit): the next request's base is
  // `first`, so the program retained for generation 2 is discarded and the program is rebuilt.
  f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nTwo.\n');
  await settle();
  const third = await compile(service, 3, first, [update(guide)]);
  expect(builds).toBe(2);
  expect(published(third)).toEqual(published(await cold(f)));
  // No previous snapshot at all: never reused.
  await compile(service, 4);
  expect(builds).toBe(3);
  // Another service with other compiler options in the same runtime does not reuse it.
  const other = f.create({ compilerVersion: 'test-v2', fastStart: false });
  const otherFirst = success(await compile(other, 5));
  expect(builds).toBe(4);
  f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nThree.\n');
  await settle();
  // ... and it now holds the slot, so the first service's next generation rebuilds.
  await compile(service, 6, success(third), [update(guide)]);
  expect(builds).toBe(5);
  success(await compile(other, 7, otherFirst, [update(guide)]));
  expect(builds).toBe(6);
}, 240_000);

test('a generation without a candidate keeps the reused program for its unchanged base; a failed one before synchronize drops it', async () => {
  const f = fixture();
  await settle();
  const service = f.create();
  const first = success(await compile(service, 1));
  const guide = f.path('docs/guide/index.md');
  // A superseded generation that reused the program: the base is unchanged, so the program stays.
  const controller = new AbortController();
  const restore = beforeContentCompile(() => controller.abort());
  f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nAborted.\n');
  await settle();
  const aborted = await service.compile(
    { generation: 2, mode: 'development', changes: [update(guide)], previous: first },
    controller.signal,
  );
  expect(aborted.candidate).toBeUndefined();
  restore();
  expect(builds).toBe(1);
  const resumed = await compile(service, 3, first, [update(guide)]);
  expect(builds).toBe(1);
  expect(published(resumed)).toEqual(published(await cold(f)));
  // A discovery failure ends the generation before synchronize: its changes were never checked,
  // so the program is dropped and the repaired tree is rebuilt.
  // (The configuration is not a program input, so only the dropped slot forces the rebuild that
  // finds the unreported new API file.)
  const config = f.path('ng-doc.config.ts');
  const original = f.read('ng-doc.config.ts');
  f.write('ng-doc.config.ts', 'export default { docsPath: ; };');
  await settle();
  const broken = await compile(service, 4, success(resumed), [update(config)]);
  expect(broken.candidate).toBeUndefined();
  f.write('ng-doc.config.ts', original);
  f.write('docs/api-extra.ts', 'export class Unreported {}');
  await settle();
  const repaired = await compile(service, 5, success(resumed), [update(config)]);
  expect(builds).toBe(2);
  expect(published(repaired)).toEqual(published(await cold(f)));
}, 240_000);

test('a patched program: a syntax error and its fix, an edit while broken, a signature edit and a superseded patch equal the reference chain and cold compiles', async () => {
  const f = fixture();
  await settle();
  const patched = f.create();
  const reference = f.create({ incrementalReuse: false });
  const api = f.path('docs/api.ts');
  const guide = f.path('docs/guide/index.md');
  // Program builds of the patched chain only (the reference chain builds every generation).
  let own = 0;
  const both = async (generation: number, base: ArtifactSnapshot, changes: FileChange[]) => {
    await settle();
    const start = builds;
    const left = await compile(patched, generation, base, changes);
    own += builds - start;
    const right = await compile(reference, generation, base, changes);
    // Byte for byte with the reference chain, failures included.
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    const coldResult = await cold(f);
    if (left.candidate) expect(published(left)).toEqual(published(coldResult));
    else expect(left.diagnostics).toEqual(coldResult.diagnostics);
    return left;
  };
  const first = success(await compile(patched, 1));
  success(await compile(reference, 1));
  const last = () => incrementalRetention().last;
  // A syntax error: the patch stays applied and the taken program is handed back.
  f.write('docs/api.ts', '/** Broken. */ export class Actual { value = ; }');
  const broken = await both(2, first, [update(api)]);
  expect(broken.diagnostics.map((item) => item.code)).toContain('SEMANTIC_SYNTAX');
  expect(last()?.synchronization).toMatchObject({ path: 'patched', failed: true });
  // A markdown edit while the file is broken: the handed-back program is checked again, never
  // reused as it is (it would miss the syntax error).
  f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nWhile broken.\n');
  const still = await both(3, first, [update(guide)]);
  expect(still.candidate).toBeUndefined();
  expect(last()?.synchronization).toMatchObject({ path: 'patched', failed: true });
  // The fix patches the same Project.
  f.write('docs/api.ts', '/** Fixed. */ export class Actual { /** Value. */ value = 2; }');
  const fixed = success(await both(4, first, [update(api)]));
  expect(last()?.synchronization).toMatchObject({ path: 'patched', files: [api] });
  // A signature edit of another program file.
  f.write(
    'docs/api-helper.ts',
    "import { Actual } from './api';\n/** Returns the given actual. */ export function helper(value: Actual, count: number): Actual { return value; }",
  );
  const signature = success(await both(5, fixed, [update(f.path('docs/api-helper.ts'))]));
  expect(last()?.synchronization).toMatchObject({ path: 'patched' });
  // Never rebuilt since the first generation.
  expect(own).toBe(0);
  // A patched generation superseded before it returns a candidate: the program described its
  // tree, not the base, so nothing keeps it and the next generation for the base rebuilds.
  const controller = new AbortController();
  const restore = beforeContentCompile(() => controller.abort());
  f.write('docs/api.ts', '/** Superseded. */ export class Actual { /** Value. */ value = 3; }');
  await settle();
  const aborted = await patched.compile(
    { generation: 6, mode: 'development', changes: [update(api)], previous: signature },
    controller.signal,
  );
  restore();
  expect(aborted.candidate).toBeUndefined();
  expect(last()?.synchronization).toMatchObject({ path: 'patched' });
  f.write('docs/api.ts', '/** After the supersede. */ export class Actual { value = 4; }');
  success(await both(7, signature, [update(api)]));
  expect(own).toBe(1);
  expect(last()?.discarded).toBe('invalidated: patched');
}, 240_000);

test('production, one-shot builds and both kill switches neither retain nor skip', async () => {
  const f = fixture();
  await settle();
  const guide = f.path('docs/guide/index.md');
  const chain = async (
    service: Service,
    context?: CompilationContext,
    mode: 'development' | 'production' = 'development',
  ) => {
    const request = (
      generation: number,
      previous?: ArtifactSnapshot,
      changes: FileChange[] = [],
    ) => ({
      generation,
      mode,
      changes,
      ...(previous ? { previous } : {}),
    });
    const first = success(await service.compile(request(1), new AbortController().signal, context));
    f.write(
      'docs/guide/index.md',
      f.read('docs/guide/index.md') + `\n${mode} ${context?.lifetime ?? 'none'}.\n`,
    );
    await settle();
    success(
      await service.compile(
        request(2, first, [update(guide)]),
        new AbortController().signal,
        context,
      ),
    );
  };
  await chain(f.create(), undefined, 'production');
  expect(builds).toBe(2);
  await chain(f.create(), { lifetime: 'generation' });
  expect(builds).toBe(4);
  await chain(f.create({ incrementalReuse: false }), { lifetime: 'watch' });
  expect(builds).toBe(6);
  process.env['NGDOC_INCREMENTAL_SKIP'] = 'off';
  await chain(f.create(), { lifetime: 'watch' });
  expect(builds).toBe(8);
  delete process.env['NGDOC_INCREMENTAL_SKIP'];
  // The same chain as a watch development generation skips.
  await chain(f.create(), { lifetime: 'watch' });
  expect(builds).toBe(9);
  // A production generation between two watch generations neither uses nor takes the slot. (The
  // counts are of programs built: the fast start publishes a recorded start without any.)
  const service = f.create({ fastStart: false });
  const first = success(await compile(service, 1, undefined, [], {}, { lifetime: 'watch' }));
  expect(builds).toBe(10);
  success(
    await f
      .create()
      .compile({ generation: 2, mode: 'production', changes: [] }, new AbortController().signal),
  );
  expect(builds).toBe(11);
  f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nAfter production.\n');
  await settle();
  success(await compile(service, 3, first, [update(guide)], {}, { lifetime: 'watch' }));
  expect(builds).toBe(11);

  // Through the real session: production and development buildOnce always rebuild.
  const session = createBuildSession({
    compiler: f.create({ fastStart: false }),
    committer: createOutputCommitter({ outputRoot: f.options.defaults.outputRoot }),
  });
  cleanup.push(() => session.dispose());
  for (const mode of ['production', 'development', 'production', 'development'] as const) {
    const before = builds;
    expect((await session.buildOnce({ mode })).status).toBe('success');
    expect(builds - before).toBe(1);
  }
}, 240_000);

test('a query that adds source files to the program is never retained', async () => {
  const f = fixture();
  await settle();
  f.write('outside/extra.ts', '/** Outside the tsconfig. */ export class Outside {}');
  f.write(
    'docs/guide/index.md',
    '---\nkeyword: Guide\n---\n# Guide\n\n{{ NgDocApi.details("outside/extra.ts#Outside") }}\n',
  );
  await settle();
  const service = f.create();
  const first = success(await compile(service, 1));
  expect(builds).toBe(1);
  const include = f.write('docs/shared/include.md', 'Changed.');
  await settle();
  const second = await compile(service, 2, first, [update(include)]);
  expect(builds).toBe(2);
  expect(published(second)).toEqual(published(await cold(f)));
}, 240_000);

test('a path read twice in one generation with different bytes is recorded as conflicting, never with a clean digest', async () => {
  const f = fixture();
  await settle();
  const service = f.create();
  const guide = f.path('docs/guide/index.md');
  // Describe reads the markdown (version A); before the content compile reads it, it becomes B.
  let rewritten = false;
  beforeContentCompile(() => {
    if (rewritten) return;
    rewritten = true;
    writeFileSync(guide, readFileSync(guide, 'utf8').replace('# Guide heading', '# Other heading'));
  });
  const result = await compile(service, 1);
  const recorded = result.dependencies.filter(
    (item) => item.kind === 'content' && item.path === guide,
  );
  expect(recorded).toHaveLength(1);
  const { createHash } = await import('node:crypto');
  const digests = [
    createHash('sha256').update(readFileSync(guide)).digest('hex'),
    createHash('sha256')
      .update(readFileSync(guide, 'utf8').replace('# Other heading', '# Guide heading'))
      .digest('hex'),
  ];
  expect(recorded[0]).toMatchObject({ kind: 'content', path: guide });
  expect(digests).not.toContain((recorded[0] as { digest: string }).digest);
}, 120_000);

// The retention slot of a long-lived runtime (worker/protocol.ts), driven here in process exactly
// as worker/entry.ts drives it: the slot is the compile context's `retention`, and every compile
// message first settles the working entry (`promote` = the acknowledged revision, or nothing after
// a discarded commit).

/** A runtime slot and the context a delta compile of that runtime passes. */
function runtimeSlot() {
  const slot = createRuntimeRetention();
  const context = (promotion: RetentionPromotion = 'acknowledged'): CompilationContext => {
    const value: CompilationContext = { lifetime: 'watch' };
    Object.defineProperty(value, 'retention', { value: slot.serve(promotion), enumerable: false });
    return value;
  };
  return { slot, context };
}

interface AcknowledgedStep {
  name: string;
  apply(f: Fixture): FileChange[];
  /** The session's commit outcome: committed candidates become the next base. */
  commit: boolean;
}

const acknowledgedSteps: AcknowledgedStep[] = [
  {
    name: 'include edit whose commit is discarded (program only read)',
    apply: (f) => [update(f.write('docs/shared/include.md', 'Include of a discarded commit.'))],
    commit: false,
  },
  {
    name: 'guide edit against the unchanged base',
    apply: (f) => [
      update(f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nAfter discard.\n')),
    ],
    commit: true,
  },
  {
    name: 'API edit whose commit is discarded (program patched for the discarded candidate)',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          '/** Discarded edit. */ export class Actual { /** Value. */ value = 1; }',
        ),
      ),
    ],
    commit: false,
  },
  {
    name: 'guide edit after the patched program',
    apply: (f) => [
      update(f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nAfter consume.\n')),
    ],
    commit: true,
  },
];

/**
 * One chain as a watch session with the delta transport runs it: a discarded commit leaves the base
 * where it was. With `slot`, the compiles use a runtime slot and are acknowledged as the runtime
 * would be; without it, the in-process slot (promote at compile end) serves them.
 */
async function acknowledgedChain(f: Fixture, slot: boolean) {
  const runtime = runtimeSlot();
  const service = f.create();
  const context = slot ? runtime.context : () => ({ lifetime: 'watch' as const });
  let before = builds;
  const initial = await compile(service, 1, undefined, [], {}, context());
  let base = success(initial);
  let acknowledged: string | undefined = base.revision;
  const results = [{ name: 'initial', result: initial, built: builds - before }];
  const states = [runtime.slot.inspect()];
  for (const [index, step] of acknowledgedSteps.entries()) {
    const changes = step.apply(f);
    await settle();
    before = builds;
    // The compile message: promotes the acknowledged candidate's entry, drops any other.
    runtime.slot.promote(acknowledged);
    const result = await compile(service, index + 2, base, changes, {}, context());
    results.push({ name: step.name, result, built: builds - before });
    states.push(runtime.slot.inspect());
    const candidate = success(result);
    acknowledged = step.commit ? candidate.revision : undefined;
    if (step.commit) base = candidate;
  }
  return { results, states, report: incrementalRetention() };
}

test('runtime slot: a candidate program waits for the acknowledgement; a discarded commit keeps the committed program unless consumed, and every result is byte-identical', async () => {
  const f = fixture();
  await settle();
  const reference = await acknowledgedChain(f, false);
  // Rebuilt after every discarded commit: the in-process slot promoted the discarded candidate.
  // The API edit patches the program (no build).
  expect(reference.results.map((item) => item.built)).toEqual([1, 0, 1, 0, 1]);
  f.reset();
  await settle();
  const acknowledged = await acknowledgedChain(f, true);
  expect(acknowledged.results.map((item) => item.built)).toEqual([1, 0, 0, 0, 1]);
  for (const [index, item] of acknowledged.results.entries()) {
    expect(JSON.stringify(item.result), item.name).toBe(
      JSON.stringify(reference.results[index].result),
    );
  }
  expect(published(acknowledged.results.at(-1)!.result)).toEqual(published(await cold(f)));
  const revision = (index: number) => acknowledged.results[index].result.candidate!.revision;
  expect(acknowledged.states).toEqual([
    // A cold generation offers its program as the working entry only.
    {
      committed: null,
      working: revision(0),
      invalidated: null,
      counters: { offered: 1, promoted: 0, dropped: 0 },
    },
    // Reused: the committed entry is restored beside the new working one.
    {
      committed: revision(0),
      working: revision(1),
      invalidated: null,
      counters: { offered: 2, promoted: 1, dropped: 0 },
    },
    // The discarded working entry was dropped; the committed program served the next generation.
    {
      committed: revision(0),
      working: revision(2),
      invalidated: null,
      counters: { offered: 3, promoted: 1, dropped: 1 },
    },
    // Patched in place for its candidate: offered as the working entry only, never restored for
    // the committed base; the slot keeps why, also after the discarded commit dropped the working
    // entry.
    {
      committed: null,
      working: revision(3),
      invalidated: 'patched',
      counters: { offered: 4, promoted: 2, dropped: 1 },
    },
    {
      committed: null,
      working: revision(4),
      invalidated: 'patched',
      counters: { offered: 5, promoted: 2, dropped: 2 },
    },
  ]);
  // The report describes the runtime slot the last generation used.
  expect(acknowledged.report).toMatchObject({
    working: { base: revision(4) },
    last: {
      synchronization: { path: 'full', reason: 'no retained program' },
      discarded: 'invalidated: patched',
    },
  });
  expect(acknowledged.report.retained).toBeUndefined();
  expect(reference.report.last).toMatchObject({
    synchronization: { path: 'full' },
    discarded: 'previous snapshot is not the retained base revision',
  });
}, 240_000);

test('runtime slot: a generation that adds a source file to the shared program invalidates the committed and working entries, whether its commit is acknowledged or discarded', async () => {
  const f = fixture();
  f.write('outside/extra.ts', '/** Outside the tsconfig. */ export class Outside {}');
  const guide = f.path('docs/guide/index.md');
  const plain = f.read('docs/guide/index.md');
  const mutating = plain + '\n{{ NgDocApi.details("outside/extra.ts#Outside") }}\n';
  await settle();
  const { slot, context } = runtimeSlot();
  const service = f.create();
  const first = success(await compile(service, 1, undefined, [], {}, context()));
  expect(builds).toBe(1);
  for (const commit of [true, false]) {
    slot.promote(first.revision);
    // The query adds outside/extra.ts to the reused (committed) program.
    f.write('docs/guide/index.md', mutating);
    await settle();
    const mutated = success(await compile(service, 2, first, [update(guide)], {}, context()));
    const built = builds;
    expect(incrementalRetention().last?.synchronization?.path).toBe('reused');
    expect(slot.inspect()).toMatchObject({
      committed: null,
      working: null,
      invalidated: 'mutated',
    });
    // Committed or discarded, nothing is left to reuse: the next generation rebuilds.
    slot.promote(commit ? mutated.revision : undefined);
    f.write('docs/guide/index.md', plain);
    await settle();
    const next = await compile(
      service,
      3,
      commit ? mutated : first,
      [update(guide)],
      {},
      context(),
    );
    expect(builds, String(commit)).toBe(built + 1);
    // It says why it found nothing to reuse, unlike a cold start.
    expect(incrementalRetention().last).toMatchObject({
      synchronization: { path: 'full', reason: 'no retained program' },
      discarded: 'invalidated: mutated',
    });
    expect(published(next)).toEqual(published(await cold(f)));
    // Retained again (the tree no longer mutates the program), for the second round.
    expect(next.candidate!.revision).toBe(first.revision);
    expect(slot.inspect().working).toBe(first.revision);
  }
}, 240_000);

test('runtime slot: compile-end promotion (warm-ups, full transport), resync promotion, and an entry this compiler did not make', async () => {
  const f = fixture();
  await settle();
  const { slot, context } = runtimeSlot();
  const service = f.create();
  // A warm-up commits its offer at once (compile-end promotion).
  const primed = success(await compile(service, 1, undefined, [], {}, context('compile-end')));
  expect(slot.inspect()).toMatchObject({ committed: primed.revision, working: null });
  expect(incrementalRetention().retained).toEqual({ base: primed.revision });
  const guide = f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nResync.\n');
  await settle();
  slot.promote(undefined);
  const edited = success(await compile(service, 2, primed, [update(guide)], {}, context()));
  expect(builds).toBe(1);
  // The identity rule resyncs a same-revision snapshot object: the working entry of exactly that
  // revision is promoted; a resync to any other base drops it.
  slot.resync(edited.revision);
  expect(slot.inspect()).toMatchObject({ committed: edited.revision, working: null });
  f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nAgain.\n');
  await settle();
  const again = success(await compile(service, 3, edited, [update(guide)], {}, context()));
  expect(builds).toBe(1);
  slot.resync('another base');
  expect(slot.inspect()).toMatchObject({ committed: edited.revision, working: null });
  // An entry without a program of this compiler is ignored, never reused.
  slot.serve('compile-end').take();
  slot.serve('compile-end').offer({ key: 'foreign', base: again.revision });
  f.write('docs/guide/index.md', f.read('docs/guide/index.md') + '\nForeign.\n');
  await settle();
  success(await compile(service, 4, again, [update(guide)], {}, context()));
  expect(builds).toBe(2);
  expect(incrementalRetention().last).toMatchObject({
    synchronization: { path: 'full', reason: 'no retained program' },
    discarded: 'invalidated: not made by this compiler',
  });
  // Resetting the counters reports the in-process slot again.
  compilerModule.resetIncrementalRetention();
  expect(incrementalRetention()).toEqual({
    counters: { reused: 0, rebuilt: 0, promoted: 0, restored: 0, discarded: 0 },
  });
}, 240_000);
