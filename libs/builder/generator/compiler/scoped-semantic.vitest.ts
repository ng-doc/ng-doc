import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import { GeneratorContentCompiler } from '../content/content-compiler';
import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationResult,
  Dependency,
  FileChange,
} from '../contracts';
import { createDependencyRefresher } from '../graph';
import { createSemanticService } from '../semantic/semantic-service';
import {
  type CompilationOptions,
  createCompilationService,
  resetIncrementalRetention,
  resetTargetedDryRun,
  targetedDryRun,
} from './index';
import {
  closureRebuildReason,
  SCOPED_SEMANTIC_MISMATCH,
  scopedSemanticSwitch,
} from './semantic-closure';
import { settle } from './testing/targeted-corpus';

// Scoped semantic invalidation: on a FULL-synchronized program, an API edit re-renders only the IRs
// whose recorded semantic closure changed. Every result must equal the switch turned off and a cold
// build of the same tree (published outputs), and the scoped chain must equal its own reference
// path byte for byte.

const cleanup: Array<() => unknown> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
});

const templates = path.resolve(import.meta.dirname, '../../templates');

const MIXIN_PAGE = `{%- if declaration.getKindName() == 'ClassDeclaration' and declaration.getBaseTypes().length -%}
{%- for part in declaration.getBaseTypes()[0].getIntersectionTypes() -%}
{%- set symbol = part.getSymbol() -%}
{%- if symbol -%}{%- for node in symbol.getDeclarations() -%}<pre>{{ node.getText() }}</pre>{%- endfor -%}{%- endif -%}
{%- endfor -%}
{%- endif -%}`;

function files(): Record<string, string> {
  return {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true, strict: true },
      include: ['docs/**/*.ts', 'src/**/*.ts', 'globals.d.ts'],
    }),
    'ng-doc.config.ts': `export default { docsPath: 'docs', cache: false };`,
    'globals.d.ts': 'declare const LIMIT: 5;',
    'docs/ng-doc.api.ts': `const api = { title: 'API', scopes: [{ name: 'Lib', route: 'lib', include: ['src/index.ts'] }] }; export default api;`,
    'src/index.ts': [
      "export * from './base';",
      "export * from './derived';",
      "export * from './helper';",
      "export * from './other';",
      "export * from './via';",
      "export * from './ns-user';",
    ].join('\n'),
    'src/ns-user.ts':
      "import { ns } from './ns-barrel';\n/** Namespace user. */\nexport function nsValue() {\n  return ns.v;\n}\n",
    'src/ns-barrel.ts': "export * as ns from './ns-a';\n",
    'src/ns-a.ts': "export * from './ns-c';\n",
    'src/ns-c.ts': 'export const v = 1;\n',
    'src/base.ts':
      '/** Base doc. */\nexport class Base {\n  /** Base value doc. */\n  value = 1;\n  /** Runs. */\n  run(): string {\n    return "";\n  }\n}\n',
    'src/derived.ts':
      "import { Base } from './base';\n/** Derived doc. */\nexport class Derived extends Base {\n  /** Own doc. */\n  own = 2;\n}\n",
    'src/types.ts': '// Values.\nexport const limit = 5;\n',
    'src/helper.ts':
      "import { limit } from './types';\n/** Maximum. */\nexport function max() {\n  return limit;\n}\n/** Global. */\nexport function global() {\n  return LIMIT;\n}\n",
    'src/other.ts': '/** Unrelated. */\nexport function other(): number {\n  return 1;\n}\n',
    'src/mixin.ts':
      'export type Ctor<T = {}> = new (...args: any[]) => T;\nexport interface Mixed {\n  mixed: boolean;\n}\nexport function Mixin<T>(Base: Ctor<T>): Ctor<T & Mixed> {\n  return Base as any;\n}\n',
    'src/mixed-base.ts': 'export class MixedBase {\n  /** Mixed base value. */\n  value = 1;\n}\n',
    'src/via.ts':
      "import { MixedBase } from './mixed-base';\nimport { Mixin } from './mixin';\n/** Via. */\nexport class ViaMixin extends Mixin(MixedBase) {}\n",
    'docs/guide/ng-doc.page.ts': `const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
    'docs/guide/index.md':
      '# Guide\n\n{{ JSDoc.description("src/base.ts#Base") }}\n\n```typescript file="../../src/other.ts"\n```\n',
    'extra/outside.ts': '/** Outside doc. */\nexport class Outside {}\n',
  };
}

/** A guide whose query adds a file outside the program to it (the program is then mutated). */
const OUTSIDE = {
  'docs/outside/ng-doc.page.ts': `const page = { title: 'Outside', route: 'outside', mdFile: './index.md' }; export default page;`,
  'docs/outside/index.md': '# Outside\n\n{{ JSDoc.description("extra/outside.ts#Outside") }}\n',
};

interface Fixture {
  root: string;
  options: CompilationOptions;
  write(file: string, content: string): FileChange;
  edit(file: string, from: string, to: string): FileChange;
  remove(file: string): FileChange;
  reset(): void;
  create(overrides?: Partial<CompilationOptions>): ReturnType<typeof createCompilationService>;
}

function fixture(mixinTemplate: boolean = false, extra: Record<string, string> = {}): Fixture {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-scoped-')));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const put = (file: string, content: string) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const reset = () => {
    for (const directory of ['docs', 'src', 'extra', 'out', 'cache', '.prettierrc'])
      rmSync(path.join(root, directory), { recursive: true, force: true });
    for (const [file, content] of Object.entries({ ...files(), ...extra })) put(file, content);
  };
  reset();
  let templateRoot = templates;
  if (mixinTemplate) {
    templateRoot = path.join(root, 'templates');
    cpSync(templates, templateRoot, { recursive: true });
    // The fixture documents a class, which the symbol view renders.
    writeFileSync(path.join(templateRoot, 'symbol', 'page.html.nunj'), MIXIN_PAGE);
  }
  const options: CompilationOptions = {
    projectId: 'scoped',
    workspaceRoot: root,
    configFile: path.join(root, 'ng-doc.config.ts'),
    defaults: {
      docsRoot: path.join(root, 'docs'),
      tsConfig: path.join(root, 'tsconfig.json'),
      outputRoot: path.join(root, 'out'),
      cacheRoot: path.join(root, 'cache'),
    },
    compilerVersion: 'test-v1',
    toolchainDigest: 'real-ts6-shiki',
    templateRoot,
  };
  return {
    root,
    options,
    write: (file, content) => ({
      kind: existsSync(path.join(root, file)) ? 'update' : 'create',
      path: put(file, content),
    }),
    edit: (file, from, to) => {
      const text = readFileSync(path.join(root, file), 'utf8');
      expect(text.split(from)).toHaveLength(2);
      return { kind: 'update', path: put(file, text.replace(from, to)) };
    },
    remove: (file) => {
      const target = path.join(root, file);
      unlinkSync(target);
      return { kind: 'delete', path: target };
    },
    reset,
    create: (overrides = {}) => {
      const service = createCompilationService({ ...options, ...overrides });
      cleanup.push(() => service.dispose());
      return service;
    },
  };
}

interface Step {
  name: string;
  apply(f: Fixture): FileChange[];
  /** Titles of the API pages whose content this step must render again (scoped, with records). */
  renders?: string[];
}

const steps: Step[] = [
  {
    name: 'JSDoc edit of a base class member (inherited docs)',
    apply: (f) => [f.edit('src/base.ts', 'Base value doc.', 'Base value doc, edited.')],
    renders: ['Base', 'Derived'],
  },
  {
    name: 'JSDoc edit of an unrelated function',
    apply: (f) => [f.edit('src/other.ts', 'Unrelated.', 'Unrelated, edited.')],
    renders: ['other'],
  },
  {
    name: 'a type another file infers (type closure)',
    apply: (f) => [f.edit('src/types.ts', 'limit = 5', 'limit = 6')],
    renders: ['max', 'global'],
  },
  {
    name: 'a comment-only edit of that file',
    apply: (f) => [f.edit('src/types.ts', '// Values.', '// The values.')],
    renders: [],
  },
  {
    name: 'signature edit of an inherited method',
    apply: (f) => [f.edit('src/base.ts', 'run(): string', 'run(input: number): string')],
    renders: ['Base', 'Derived'],
  },
  {
    name: 'a global declaration file (env)',
    apply: (f) => [f.write('globals.d.ts', 'declare const LIMIT: 7;')],
  },
  {
    name: 'a subclass in a new file outside the barrel (derived list)',
    apply: (f) => [
      f.write(
        'src/hidden.ts',
        "import { Derived } from './derived';\nexport class Hidden extends Derived {}\n",
      ),
    ],
    renders: ['Base', 'Derived'],
  },
  {
    name: 'the subclass re-parented (heritage change)',
    apply: (f) => [
      f.write(
        'src/hidden.ts',
        "import { Base } from './base';\nexport class Hidden extends Base {}\n",
      ),
    ],
    renders: ['Base', 'Derived'],
  },
  {
    name: 'the subclass file removed',
    apply: (f) => [f.remove('src/hidden.ts')],
    renders: ['Base'],
  },
  {
    name: 'a mixin base edited (node factory only)',
    apply: (f) => [f.edit('src/mixed-base.ts', 'Mixed base value.', 'Mixed base value, edited.')],
  },
  {
    name: 'a new API file exported from the barrel',
    apply: (f) => [
      f.write(
        'src/added.ts',
        '/** Added. */\nexport function added(): string {\n  return "";\n}\n',
      ),
      f.write(
        'src/index.ts',
        readFileSync(path.join(f.root, 'src/index.ts'), 'utf8') + "\nexport * from './added';",
      ),
    ],
  },
  {
    name: 'a program file a guide snippet reads',
    apply: (f) => [f.edit('src/other.ts', 'return 1;', 'return 2;')],
  },
  {
    name: 'a member type of a namespace behind a named binding',
    apply: (f) => [f.edit('src/ns-c.ts', 'v = 1', "v = 'x'")],
    renders: ['nsValue'],
  },
  {
    name: 'a formatter configuration (global observations)',
    apply: (f) => [f.write('.prettierrc', JSON.stringify({ semi: false }))],
  },
  { name: 'no-op', apply: () => [] },
];

const compile = (
  service: ReturnType<typeof createCompilationService>,
  generation: number,
  previous: ArtifactSnapshot | undefined,
  changes: FileChange[],
  context: CompilationContext = { lifetime: 'watch' },
) =>
  service.compile(
    { generation, mode: 'development', changes, ...(previous ? { previous } : {}) },
    new AbortController().signal,
    context,
  );

function success(result: CompilationResult): ArtifactSnapshot {
  expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(result.candidate).toBeDefined();
  return result.candidate!;
}

/** Everything a reader of the published site observes. */
function published(result: CompilationResult) {
  const candidate = success(result);
  const artifacts = [...candidate.artifacts].sort((left, right) => left.id.localeCompare(right.id));
  return {
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
    content: artifacts.map((artifact) => [
      artifact.id,
      artifact.content.map((item) => [
        item.ir.id,
        item.html,
        item.searchRecords,
        item.keywordDigest,
      ]),
    ]),
    descriptors: artifacts.map((artifact) => [
      artifact.id,
      (artifact.contentDescriptors ?? []).map((descriptor) => descriptor.id),
    ]),
    diagnostics: result.diagnostics,
  };
}

/** A cold build of the current tree: a fresh one-shot service, no previous snapshot. */
function cold(f: Fixture, overrides: Partial<CompilationOptions> = {}) {
  return compile(f.create(overrides), 1, undefined, [], { lifetime: 'generation' });
}

/** Records the ids of the content each compile renders. */
function renderedContent(): { take(): string[] } {
  const compileContent = GeneratorContentCompiler.prototype.compile;
  let compiled: string[] = [];
  vi.spyOn(GeneratorContentCompiler.prototype, 'compile').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof compileContent>
  ) {
    compiled.push(args[0].id);
    return compileContent.apply(this, args);
  });
  return {
    take: () => {
      const value = compiled;
      compiled = [];
      return value;
    },
  };
}

/** The API page titles (declaration names) whose content ids are in `ids`. */
function apiTitles(snapshot: ArtifactSnapshot, ids: string[]): string[] {
  const owners = new Set(ids.map((id) => id.split(':')[0]));
  return snapshot.artifacts
    .filter((artifact) => owners.has(artifact.id) && artifact.identity.declarationId)
    .map((artifact) => artifact.routes[0]?.title ?? artifact.id)
    .sort();
}

interface Chain {
  results: CompilationResult[];
  rendered: string[][];
}

async function run(
  f: Fixture,
  overrides: Partial<CompilationOptions>,
  chain: Step[],
  context: () => CompilationContext = () => ({ lifetime: 'watch' }),
  onStep?: (index: number, result: CompilationResult) => Promise<void>,
): Promise<Chain> {
  const spy = renderedContent();
  const service = f.create(overrides);
  const results = [await compile(service, 1, undefined, [], context())];
  const rendered = [spy.take()];
  await onStep?.(0, results[0]!);
  // What the step callback compiled (a cold build) is not the chain's.
  spy.take();
  for (const [index, step] of chain.entries()) {
    const changes = step.apply(f);
    const result = await compile(service, index + 2, success(results.at(-1)!), changes, context());
    results.push(result);
    rendered.push(spy.take());
    await onStep?.(index + 1, result);
    spy.take();
  }
  vi.restoreAllMocks();
  return { results, rendered };
}

const semanticKinds = (dependencies: Dependency[]) =>
  [...new Set(dependencies.map((dependency) => dependency.kind))].filter((kind) =>
    kind.startsWith('semantic'),
  );

test('differential: scoped semantic invalidation equals the switch off, its reference path and cold builds', async () => {
  const f = fixture();
  const colds: CompilationResult[] = [];
  const scoped = await run(f, {}, steps, undefined, async () => {
    colds.push(await cold(f));
  });
  f.reset();
  const off = await run(f, { scopedSemantic: false }, steps);
  f.reset();
  const reference = await run(f, { incrementalReuse: false }, steps);
  for (const [index, result] of scoped.results.entries()) {
    const label = index ? steps[index - 1]!.name : 'initial';
    expect({ label, ...published(result) }).toEqual({ label, ...published(colds[index]!) });
    expect({ label, ...published(result) }).toEqual({
      label,
      ...published(off.results[index]!),
    });
    // Byte for byte: every revision, dependency, diagnostic and `whyRebuilt` reason.
    expect({ label, result: JSON.stringify(result) }).toEqual({
      label,
      result: JSON.stringify(reference.results[index]),
    });
  }
  // The edits were visible.
  const html = (result: CompilationResult) => JSON.stringify(published(result).content);
  expect(html(scoped.results[1]!)).toContain('Base value doc, edited.');
  expect(html(scoped.results[3]!)).toContain('6');
  expect(html(scoped.results[5]!)).toContain('input: number');
  expect(html(scoped.results[10]!)).toContain('Mixed base value, edited.');

  // Scoped: only the API pages whose closure read the edit render again; the switch off renders
  // every API page on any program edit.
  const api = (chain: Chain, index: number) =>
    apiTitles(success(chain.results[index]!), chain.rendered[index]!);
  for (const [index, step] of steps.entries())
    if (step.renders)
      expect({ step: step.name, api: api(scoped, index + 1) }).toEqual({
        step: step.name,
        api: step.renders.sort(),
      });
  // The formatter configuration reaches every API presentation.
  const formatted = success(scoped.results[14]!);
  expect(api(scoped, 14)).toEqual(
    apiTitles(
      formatted,
      formatted.artifacts.map((artifact) => `${artifact.id}:api`),
    ),
  );
  const everyApiPage = api(off, 0);
  expect(api(off, 2)).toEqual(everyApiPage);
  expect(scoped.rendered.at(-1)).toEqual([]);

  // Units and IRs record closures, never the global reference.
  const final = success(scoped.results.at(-1)!);
  for (const artifact of final.artifacts.filter((item) => item.identity.role !== 'aggregate')) {
    const all = [
      ...artifact.dependencies,
      ...artifact.content.flatMap((item) => item.ir.dependencies),
    ];
    expect(semanticKinds(all)).not.toContain('semantic-reference');
  }
  // The switch off keeps today's format.
  const offFinal = success(off.results.at(-1)!);
  expect(
    offFinal.artifacts.flatMap((artifact) =>
      artifact.content.flatMap((item) => semanticKinds(item.ir.dependencies)),
    ),
  ).not.toContain('semantic-closure');
  // A rebuilt owner none of whose paths changed names its changed closure.
  expect(
    scoped.results[1]!.whyRebuilt.some(
      (reason) =>
        reason.reason === 'semantic' && reason.detail.startsWith('semantic closure changed: '),
    ),
  ).toBe(true);
}, 240_000);

test('a query that adds a file to the program records the global reference, refreshed by the program', async () => {
  const f = fixture(false, OUTSIDE);
  const chain: Step[] = [
    {
      name: 'the added file',
      apply: (f) => [f.edit('extra/outside.ts', 'Outside doc.', 'Outside doc, edited.')],
    },
    steps[1]!,
    { name: 'no-op', apply: () => [] },
  ];
  const scoped = await run(f, {}, chain, undefined, async (index, result) => {
    if (index) expect(published(result)).toEqual(published(await cold(f)));
  });
  expect(JSON.stringify(published(scoped.results[1]!).content)).toContain('Outside doc, edited.');
  const outside = success(scoped.results[1]!).artifacts.find((artifact) =>
    artifact.routes.some((route) => route.title === 'Outside'),
  )!;
  const kinds = semanticKinds(outside.content.flatMap((item) => item.ir.dependencies));
  expect(kinds).toContain('semantic-reference');
  // The reference follows the whole program: any program edit renders the guide again.
  expect(scoped.rendered[2]!.some((id) => id.startsWith(outside.id))).toBe(true);
  expect(scoped.rendered[3]!.some((id) => id.startsWith(outside.id))).toBe(false);
}, 240_000);

test('a runtime without closure records reuses a closure only while the program is unchanged', async () => {
  const f = fixture();
  // Every generation is one-shot: nothing is retained, so no record is refreshed.
  const oneShot = await run(
    f,
    {},
    steps.slice(0, 4),
    () => ({ lifetime: 'generation' }),
    async (index, result) => {
      if (index) expect(published(result)).toEqual(published(await cold(f)));
    },
  );
  // A program edit renders a closure again until the generation records it: the unrelated page's
  // closure has no record, although it did not change; nothing changed renders nothing.
  expect(apiTitles(success(oneShot.results[2]!), oneShot.rendered[2]!)).toEqual(
    expect.arrayContaining(['Base', 'Derived', 'other']),
  );
  const noop = await compile(f.create(), 9, success(oneShot.results.at(-1)!), [], {
    lifetime: 'generation',
  });
  expect(noop.candidate).toEqual(oneShot.results.at(-1)!.candidate);
}, 240_000);

test('verify renders every closure-reused IR again and finds no mismatch', async () => {
  const f = fixture();
  const verified = await run(f, { scopedSemantic: 'verify' }, steps.slice(0, 5));
  f.reset();
  const scoped = await run(f, {}, steps.slice(0, 5));
  for (const [index, result] of verified.results.entries()) {
    expect(result.diagnostics.map((item) => item.code)).not.toContain(SCOPED_SEMANTIC_MISMATCH);
    expect(JSON.stringify(result)).toBe(JSON.stringify(scoped.results[index]));
  }
  // Every reused API IR was rendered again.
  expect(verified.rendered[2]!.length).toBeGreaterThan(scoped.rendered[2]!.length);
}, 240_000);

test('verify publishes the fresh render and reports a mismatch when a closure hides an edit', async () => {
  const f = fixture();
  const service = f.create({ scopedSemantic: 'verify' });
  const first = success(await compile(service, 1, undefined, []));
  // A refresher that confirms every closure hides the edit; verify catches it.
  const refresh = vi
    .spyOn(
      (await import('../semantic/semantic-service')).SemanticServiceImpl.prototype,
      'refreshClosure',
    )
    .mockImplementation((dependency) => dependency.digest);
  const edited = await compile(service, 2, first, [
    f.edit('src/base.ts', 'Base value doc.', 'Base value doc, hidden.'),
  ]);
  refresh.mockRestore();
  expect(
    edited.diagnostics.filter((item) => item.code === SCOPED_SEMANTIC_MISMATCH).length,
  ).toBeGreaterThan(0);
  expect(JSON.stringify(published(edited).content)).toContain('Base value doc, hidden.');
  const { diagnostics: _warnings, ...fresh } = published(edited);
  const { diagnostics, ...expected } = published(await cold(f));
  expect(diagnostics).toEqual([]);
  expect(fresh).toEqual(expected);
}, 240_000);

test('the scoped semantic switch: the option, the environment and production', async () => {
  vi.stubEnv('NGDOC_SCOPED_SEMANTIC', '0');
  expect(scopedSemanticSwitch({} as CompilationOptions)).toBe('off');
  expect(scopedSemanticSwitch({ scopedSemantic: 'verify' } as CompilationOptions)).toBe('off');
  vi.stubEnv('NGDOC_SCOPED_SEMANTIC', 'verify');
  expect(scopedSemanticSwitch({} as CompilationOptions)).toBe('verify');
  expect(scopedSemanticSwitch({ scopedSemantic: false } as CompilationOptions)).toBe('off');
  vi.stubEnv('NGDOC_SCOPED_SEMANTIC', '');
  expect(scopedSemanticSwitch({} as CompilationOptions)).toBe('on');
  expect(scopedSemanticSwitch({ scopedSemantic: 'verify' } as CompilationOptions)).toBe('verify');

  // Production keeps the global reference: its artifacts are those of the switch turned off.
  const f = fixture();
  const production = (overrides: Partial<CompilationOptions>) =>
    f
      .create(overrides)
      .compile({ generation: 1, mode: 'production', changes: [] }, new AbortController().signal);
  const on = await production({});
  const off = await production({ scopedSemantic: false });
  expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  expect(JSON.stringify(on)).not.toContain('semantic-closure');
}, 240_000);

test('the node factory alone records a mixin base read through a template', async () => {
  const f = fixture(true);
  const chain: Step[] = [steps[9]!];
  const scoped = await run(f, {}, chain);
  expect(JSON.stringify(published(scoped.results[1]!).content)).toContain(
    'Mixed base value, edited.',
  );
  expect(published(scoped.results[1]!)).toEqual(published(await cold(f)));
  expect(apiTitles(success(scoped.results[1]!), scoped.rendered[1]!)).toEqual(['ViaMixin']);
}, 240_000);

test('closure refresh sources: records, the program base, other scopes and closed services', async () => {
  const f = fixture();
  const service = f.create();
  const first = success(await compile(service, 1, undefined, []));
  const closure = first.artifacts
    .flatMap((artifact) => artifact.content.flatMap((item) => item.ir.dependencies))
    .find((dependency) => dependency.kind === 'semantic-closure')!;
  expect(closure).toMatchObject({ kind: 'semantic-closure', scopeId: 'scoped' });
  // The refresher reports an unrefreshable closure as changed.
  const unrefreshed = await createDependencyRefresher({ semanticClosure: () => undefined }).refresh(
    [closure],
    [],
  );
  expect(unrefreshed.dependencies[0]).toMatchObject({ digest: 'unrefreshed' });
  const refreshed = await createDependencyRefresher({
    semanticClosure: (item) => item.digest,
  }).refresh([closure], []);
  expect(refreshed.dependencies[0]).toEqual(closure);

  // A service without a synchronized program, or with closures off, refreshes nothing.
  const idle = createSemanticService({ dependencyMode: 'scope-reference' });
  expect(
    idle.refreshClosure(closure as Extract<Dependency, { kind: 'semantic-closure' }>),
  ).toBeUndefined();
  expect(idle.closuresHold()).toBe(true);
  idle.scopeClosures(true);
  expect(idle.closuresHold()).toBe(true);
  await idle.dispose();

  // The whyRebuilt reason names the changed key.
  const artifact = first.artifacts.find((item) =>
    item.content.some((content) => content.ir.dependencies.includes(closure)),
  )!;
  expect(closureRebuildReason(artifact, artifact)).toBeUndefined();
  const changed = {
    ...artifact,
    content: artifact.content.map((item) => ({
      ...item,
      ir: {
        ...item.ir,
        dependencies: item.ir.dependencies.map((dependency) =>
          dependency === closure ? { ...closure, digest: 'other' } : dependency,
        ),
      },
    })),
  };
  expect(closureRebuildReason(artifact, changed)).toEqual({
    ownerId: artifact.id,
    reason: 'semantic',
    detail: `semantic closure changed: ${closure.key}`,
  });
}, 240_000);

test('with recording off, every query records the global reference, refreshed against the program', async () => {
  vi.stubEnv('NGDOC_SEMANTIC_RECORDER', '0');
  const f = fixture();
  const chain = steps.slice(0, 2);
  const scoped = await run(f, {}, chain, undefined, async (index, result) => {
    if (index) expect(published(result)).toEqual(published(await cold(f)));
  });
  const final = success(scoped.results.at(-1)!);
  const kinds = new Set(
    final.artifacts.flatMap((artifact) =>
      artifact.content.flatMap((item) => semanticKinds(item.ir.dependencies)),
    ),
  );
  expect([...kinds]).toEqual(['semantic-reference']);
  // Every IR that queried the program renders again after a program edit.
  expect(apiTitles(final, scoped.rendered[2]!)).toEqual(apiTitles(final, scoped.rendered[0]!));
}, 240_000);

test('a targeted generation whose recorded closures the program does not confirm refreshes every replayed unit', async () => {
  const f = fixture();
  const service = f.create();
  const module = await import('../semantic/semantic-service');
  // Files written just before a generation settle past the retained program's stat margin.
  await settle();
  let base = success(await compile(service, 1, undefined, []));
  const edit = async (generation: number) => {
    await settle();
    const change = f.write(
      'docs/guide/index.md',
      readFileSync(path.join(f.root, 'docs/guide/index.md'), 'utf8') + `\nMore ${generation}.\n`,
    );
    // A watcher's content edit: the generation a targeted rebuild may take.
    const edited = await service.compile(
      {
        generation,
        mode: 'development',
        changes: [change],
        previous: base,
        contentRequest: { origin: 'filesystem' },
      },
      new AbortController().signal,
      { lifetime: 'watch' },
    );
    expect(published(edited)).toEqual(published(await cold(f)));
    base = success(edited);
  };
  const hold = vi
    .spyOn(module.SemanticServiceImpl.prototype, 'closuresHold')
    .mockReturnValue(false);
  // Every replayed unit's closures are refreshed from their records: they hold, so only the
  // edited guide is compiled.
  const refresh = vi.spyOn(module.SemanticServiceImpl.prototype, 'refreshClosure');
  await edit(2);
  expect(refresh).toHaveBeenCalled();
  expect(targetedDryRun().last).toMatchObject({
    path: 'content',
    published: 'targeted',
    candidates: { units: 1 },
  });
  // A closure that cannot be refreshed is a change: its unit is a candidate (every unit here, so
  // the generation crosses the dirty threshold and runs FULL).
  refresh.mockReturnValue(undefined);
  await edit(3);
  expect(targetedDryRun().last?.path).toBe('full');
  expect(targetedDryRun().last?.reason).toMatch(/^dirty threshold: /);
  hold.mockRestore();
  refresh.mockRestore();
}, 240_000);
