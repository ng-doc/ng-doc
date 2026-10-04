import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
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
import { ProgramIndex } from '../semantic/program-index';
import { SHAPE_KEY_SUFFIX } from '../semantic/semantic-closure';
import {
  type CompilationOptions,
  createCompilationService,
  resetIncrementalRetention,
  resetTargetedDryRun,
} from './index';
import { SCOPED_SEMANTIC_MISMATCH, SHAPE_CLOSURE_MISMATCH } from './semantic-closure';

// Shape closures (`NGDOC_SHAPE_CLOSURE`): a body edit that keeps every declaration shape re-renders
// only the content whose recorded closure read the edited file; a changed shape (an inferred type)
// or a file the isolated declaration emit cannot state re-renders its importers too. Every result
// equals the switch turned off and a cold build (published outputs), and the chain equals its own
// reference path byte for byte.

const cleanup: Array<() => unknown> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  resetIncrementalRetention();
  resetTargetedDryRun();
});

const templates = path.resolve(import.meta.dirname, '../../templates');

function files(cache: boolean): Record<string, string> {
  return {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true, strict: true },
      include: ['docs/**/*.ts', 'src/**/*.ts'],
    }),
    'ng-doc.config.ts': `export default { docsPath: 'docs', cache: ${cache} };`,
    'docs/ng-doc.api.ts': `const api = { title: 'API', scopes: [{ name: 'Lib', route: 'lib', include: ['src/index.ts'] }] }; export default api;`,
    'src/index.ts': [
      "export * from './util';",
      "export * from './inferred';",
      "export * from './diag';",
      "export * from './consumer';",
      "export * from './alias';",
      "export * from './base';",
      "export * from './derived';",
    ].join('\n'),
    // Explicit types: a body edit keeps the declaration shape.
    'src/util.ts':
      '/** Doubles. */\nexport function helper(values: number[]): number[] {\n  return values.map((value) => value * 2);\n}\n',
    // A return type the isolated emit infers from a literal.
    'src/inferred.ts': '/** Inferred. */\nexport function inferred() {\n  return 1;\n}\n',
    // A return type the isolated emit cannot state (a diagnostic): no narrowing.
    'src/diag.ts':
      '/** Needs the checker. */\nexport function diag(value: number) {\n  return value + 1;\n}\n',
    'src/consumer.ts': [
      "import { diag } from './diag';",
      "import { inferred } from './inferred';",
      "import { helper } from './util';",
      '/** Consumes the helper. */',
      'export function consume(): number {',
      '  return helper([1]).length;',
      '}',
      '/** Consumes the inferred value. */',
      'export const fromInferred = inferred();',
      '/** Consumes diag. */',
      'export const fromDiag = diag(1);',
      '',
    ].join('\n'),
    // Its presentation prints the helper's type, so its closure reads `util.ts` itself.
    'src/alias.ts':
      "import { helper } from './util';\n/** The helper again. */\nexport const alias = helper;\n",
    'src/base.ts':
      '/** Base doc. */\nexport class Base {\n  /** Runs. */\n  run(values: number[] = [1]): number[] {\n    return values;\n  }\n}\n',
    'src/derived.ts':
      "import { Base } from './base';\n/** Derived doc. */\nexport class Derived extends Base {}\n",
    'docs/guide/ng-doc.page.ts': `const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
    'docs/guide/index.md': '# Guide\n\n{{ JSDoc.description("src/consumer.ts#consume") }}\n',
  };
}

interface Fixture {
  root: string;
  edit(file: string, from: string, to: string): FileChange;
  reset(): void;
  create(overrides?: Partial<CompilationOptions>): ReturnType<typeof createCompilationService>;
}

function fixture(cache: boolean = false): Fixture {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-shape-')));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const put = (file: string, content: string) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const reset = () => {
    for (const directory of ['docs', 'src', 'out'])
      rmSync(path.join(root, directory), { recursive: true, force: true });
    for (const [file, content] of Object.entries(files(cache))) put(file, content);
  };
  reset();
  const options: CompilationOptions = {
    projectId: 'shape',
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
    templateRoot: templates,
  };
  return {
    root,
    edit: (file, from, to) => {
      const text = readFileSync(path.join(root, file), 'utf8');
      expect(text.split(from)).toHaveLength(2);
      expect(existsSync(path.join(root, file))).toBe(true);
      return { kind: 'update', path: put(file, text.replace(from, to)) };
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
  /** The API pages this step renders again with shape closures on, and with them off. */
  renders: { on: string[]; off: string[] };
}

const CONSUMERS = ['consume', 'fromDiag', 'fromInferred'];

const steps: Step[] = [
  {
    name: 'an explicit-type body edit (only the recorders of the file)',
    apply: (f) => [f.edit('src/util.ts', 'value * 2', 'value * 3')],
    renders: { on: ['alias', 'helper'], off: ['alias', 'helper', ...CONSUMERS] },
  },
  {
    name: 'a comment edit of that file',
    apply: (f) => [f.edit('src/util.ts', 'Doubles.', 'Triples.')],
    renders: { on: ['alias', 'helper'], off: ['alias', 'helper'] },
  },
  {
    name: 'a signature edit of that file (a shape change)',
    apply: (f) => [
      f.edit(
        'src/util.ts',
        'values: number[]): number[]',
        'values: number[]): number[] | undefined',
      ),
    ],
    renders: { on: ['alias', 'helper', ...CONSUMERS], off: ['alias', 'helper', ...CONSUMERS] },
  },
  {
    name: 'an inferred return type change (the importers)',
    apply: (f) => [f.edit('src/inferred.ts', 'return 1;', "return 'one';")],
    renders: { on: ['inferred', ...CONSUMERS], off: ['inferred', ...CONSUMERS] },
  },
  {
    name: 'an inferred body edit that keeps the literal type',
    apply: (f) => [f.edit('src/inferred.ts', "return 'one';", "return 'two';")],
    renders: { on: ['inferred'], off: ['inferred', ...CONSUMERS] },
  },
  {
    name: 'a body edit of a file with emit diagnostics (no narrowing)',
    apply: (f) => [f.edit('src/diag.ts', 'value + 1', 'value + 2')],
    renders: { on: ['diag', ...CONSUMERS], off: ['diag', ...CONSUMERS] },
  },
  {
    name: 'a body edit of a base class (its subclass reads it)',
    apply: (f) => [f.edit('src/base.ts', 'return values;', 'return [...values];')],
    renders: { on: ['Base', 'Derived'], off: ['Base', 'Derived'] },
  },
  {
    name: 'a parameter default of an inherited member (not in the declaration shape)',
    apply: (f) => [f.edit('src/base.ts', 'values: number[] = [1]', 'values: number[] = [2]')],
    renders: { on: ['Base', 'Derived'], off: ['Base', 'Derived'] },
  },
  { name: 'no-op', apply: () => [], renders: { on: [], off: [] } },
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
      artifact.content.map((item) => [item.ir.id, item.html, item.searchRecords]),
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

/** Whether the guide's content is among `ids`. */
function guideRendered(snapshot: ArtifactSnapshot, ids: string[]): boolean {
  const guide = snapshot.artifacts.find((artifact) =>
    artifact.routes.some((route) => route.title === 'Guide'),
  )!;
  return ids.some((id) => id.startsWith(`${guide.id}:`));
}

interface Chain {
  results: CompilationResult[];
  rendered: string[][];
}

/** One development chain over `chain`, in the environment's shape closure mode. */
async function run(
  f: Fixture,
  mode: string | undefined,
  overrides: Partial<CompilationOptions>,
  chain: Step[],
  onStep?: (index: number, result: CompilationResult) => Promise<void>,
): Promise<Chain> {
  // The semantic service reads the switch when the compilation service creates it.
  if (mode === undefined) vi.stubEnv('NGDOC_SHAPE_CLOSURE', '');
  else vi.stubEnv('NGDOC_SHAPE_CLOSURE', mode);
  const service = f.create(overrides);
  vi.unstubAllEnvs();
  const spy = renderedContent();
  const results = [await compile(service, 1, undefined, [])];
  const rendered = [spy.take()];
  await onStep?.(0, results[0]!);
  spy.take();
  for (const [index, step] of chain.entries()) {
    const changes = step.apply(f);
    const result = await compile(service, index + 2, success(results.at(-1)!), changes);
    results.push(result);
    rendered.push(spy.take());
    await onStep?.(index + 1, result);
    spy.take();
  }
  vi.restoreAllMocks();
  return { results, rendered };
}

const closures = (snapshot: ArtifactSnapshot): Dependency[] =>
  snapshot.artifacts.flatMap((artifact) =>
    [...artifact.dependencies, ...artifact.content.flatMap((item) => item.ir.dependencies)].filter(
      (dependency) => dependency.kind === 'semantic-closure',
    ),
  );

test('differential: shape closures equal the switch off, their reference path and cold builds', async () => {
  const f = fixture();
  const colds: CompilationResult[] = [];
  const on = await run(f, undefined, {}, steps, async (index) => {
    if (index) colds.push(await cold(f));
  });
  f.reset();
  const off = await run(f, '0', {}, steps);
  f.reset();
  const reference = await run(f, undefined, { incrementalReuse: false }, steps);
  for (const [index, result] of on.results.entries()) {
    const label = index ? steps[index - 1]!.name : 'initial';
    if (index)
      expect({ label, ...published(result) }).toEqual({ label, ...published(colds[index - 1]!) });
    expect({ label, ...published(result) }).toEqual({ label, ...published(off.results[index]!) });
    // Byte for byte: every revision, dependency, diagnostic and `whyRebuilt` reason.
    expect({ label, result: JSON.stringify(result) }).toEqual({
      label,
      result: JSON.stringify(reference.results[index]),
    });
  }
  // The edits were visible.
  const html = (result: CompilationResult) => JSON.stringify(published(result).content);
  expect(html(on.results[1]!)).toContain('Doubles.');
  expect(html(on.results[3]!)).toContain('number[] | undefined');
  expect(html(on.results[8]!)).not.toBe(html(on.results[7]!));

  // Only the recorders of an edited file render again while its shape holds.
  for (const [index, step] of steps.entries()) {
    const snapshot = success(on.results[index + 1]!);
    expect({ step: step.name, on: apiTitles(snapshot, on.rendered[index + 1]!) }).toEqual({
      step: step.name,
      on: [...step.renders.on].sort(),
    });
    expect({ step: step.name, off: apiTitles(snapshot, off.rendered[index + 1]!) }).toEqual({
      step: step.name,
      off: [...step.renders.off].sort(),
    });
  }
  // The guide documents `consume` (an own file importing the helper): kept on the body edit.
  const first = success(on.results[1]!);
  expect(guideRendered(first, on.rendered[1]!)).toBe(false);
  expect(guideRendered(first, off.rendered[1]!)).toBe(true);
  expect(guideRendered(success(on.results[4]!), on.rendered[4]!)).toBe(true);

  // Shape closures carry their mode in the key; the switch off keeps today's keys.
  const keys = (chain: Chain) =>
    closures(success(chain.results.at(-1)!)).map((dependency) =>
      dependency.kind === 'semantic-closure' ? dependency.key : '',
    );
  expect(keys(on).length).toBeGreaterThan(0);
  expect(keys(on).every((key) => key.endsWith(SHAPE_KEY_SUFFIX))).toBe(true);
  expect(keys(off).some((key) => key.endsWith(SHAPE_KEY_SUFFIX))).toBe(false);
}, 300_000);

test('verify renders every IR reused only on its shapes again and finds no mismatch', async () => {
  const f = fixture();
  const verified = await run(f, 'verify', { targetedRebuild: false }, steps.slice(0, 5));
  f.reset();
  const on = await run(f, undefined, { targetedRebuild: false }, steps.slice(0, 5));
  for (const [index, result] of verified.results.entries()) {
    const codes = result.diagnostics.map((item) => item.code);
    expect(codes).not.toContain(SHAPE_CLOSURE_MISMATCH);
    expect(codes).not.toContain(SCOPED_SEMANTIC_MISMATCH);
    expect(JSON.stringify(result)).toBe(JSON.stringify(on.results[index]));
  }
  // The narrowed consumers of the body edit were rendered again; nothing else was.
  const snapshot = success(verified.results[1]!);
  expect(apiTitles(snapshot, verified.rendered[1]!)).toEqual(
    ['alias', 'helper', ...CONSUMERS].sort(),
  );
  expect(apiTitles(snapshot, verified.rendered[2]!)).toEqual(['alias', 'helper']);
}, 300_000);

test.each([
  ['the full path', { targetedRebuild: false }],
  ['a targeted generation compared in full', { targetedRebuild: 'verify' }],
] as const)(
  'verify publishes the fresh render and reports a mismatch when a shape hides a type change (%s)',
  async (_path, overrides) => {
    const f = fixture();
    vi.stubEnv('NGDOC_SHAPE_CLOSURE', 'verify');
    const service = f.create(overrides);
    vi.unstubAllEnvs();
    // Shapes that never change hide the inferred type change; verify catches it.
    vi.spyOn(ProgramIndex.prototype, 'dtsShape').mockReturnValue('constant');
    const first = success(await compile(service, 1, undefined, []));
    const edited = await compile(service, 2, first, [
      f.edit('src/inferred.ts', 'return 1;', "return 'one';"),
    ]);
    vi.restoreAllMocks();
    const mismatches = edited.diagnostics.filter((item) => item.code === SHAPE_CLOSURE_MISMATCH);
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches[0]!.message).toContain('held by its declaration shapes only');
    const { diagnostics: _warnings, ...fresh } = published(edited);
    const { diagnostics, ...expected } = published(await cold(f));
    expect(diagnostics).toEqual([]);
    expect(fresh).toEqual(expected);
  },
  300_000,
);

test('a cache written in the other mode never holds without a record', async () => {
  const f = fixture(true);
  // The switch off writes the cache; a new runtime with it on restores that index.
  const offFirst = await run(f, '0', {}, []);
  const offKeys = closures(success(offFirst.results[0]!));
  expect(offKeys.length).toBeGreaterThan(0);
  const restored = await run(f, undefined, {}, []);
  const snapshot = success(restored.results[0]!);
  // Every API page renders again: none of the restored closures is of this mode.
  expect(apiTitles(snapshot, restored.rendered[0]!)).toEqual(
    apiTitles(snapshot, offFirst.rendered[0]!),
  );
  rmSync(path.join(f.root, 'cache'), { recursive: true, force: true });
  const coldOn = await run(f, undefined, {}, []);
  expect(JSON.stringify(restored.results[0]!.candidate!.artifacts)).toBe(
    JSON.stringify(coldOn.results[0]!.candidate!.artifacts),
  );
  // And back: a cache written with the switch on does not hold with it off.
  const offAgain = await run(f, '0', {}, []);
  const again = success(offAgain.results[0]!);
  expect(apiTitles(again, offAgain.rendered[0]!)).toEqual(apiTitles(again, offFirst.rendered[0]!));
  // The same mode restores without rendering.
  const offRestored = await run(f, '0', {}, []);
  expect(apiTitles(success(offRestored.results[0]!), offRestored.rendered[0]!)).toEqual([]);
}, 300_000);
