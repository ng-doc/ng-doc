import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import { JsonArtifactCache } from '../artifacts';
import { GeneratorContentCompiler } from '../content/content-compiler';
import type {
  ArtifactSnapshot,
  CompilationRequest,
  CompilationResult,
  ContentDescriptorProvenance,
  ContentIR,
  DeferredContentRequest,
  Dependency,
  Diagnostic,
  KeywordExport,
} from '../contracts';
import { DiscoveryServiceImpl } from '../discovery';
import { CONFLICTING_CONTENT_DIGEST } from '../graph';
import { type AggregateRequest, type PageAssemblyRequest, OutputAssemblerImpl } from '../outputs';
import { SemanticServiceImpl } from '../semantic/semantic-service';
import { fold, foldContributions, GenerationRecords, mergeReasons, traceRecords } from './fold';
import { type CompilationOptions, createCompilationService } from './index';

// Fault injection for the scope-validation exit: the candidate's semantic-scope check reports
// `scopeFault.diagnostics` while they are set.
const scopeFault = vi.hoisted(() => ({ diagnostics: undefined as Diagnostic[] | undefined }));
vi.mock('../graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../graph')>();
  return {
    ...actual,
    validateSemanticScopes: (...args: Parameters<typeof actual.validateSemanticScopes>) =>
      scopeFault.diagnostics ?? actual.validateSemanticScopes(...args),
  };
});

// The fold replays the per-unit records phase-major. These tests check it against the journal of
// the order in which the phases emitted their contributions, on every exit.

const cleanup: Array<() => unknown> = [];
const traced: GenerationRecords[] = [];
afterEach(async () => {
  traceRecords(undefined);
  scopeFault.diagnostics = undefined;
  traced.length = 0;
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

const warning = (code: string): Diagnostic => ({
  code,
  message: code,
  severity: 'warning',
  stage: 'content',
});
const error = (code: string, stage: Diagnostic['stage'] = 'content'): Diagnostic => ({
  code,
  message: code,
  severity: 'error',
  stage,
});
const content = (file: string, digest: string): Dependency => ({
  kind: 'content',
  path: file,
  digest,
});

test('the fold replays records phase-major in unit order, whatever order they were written in', () => {
  const records = new GenerationRecords();
  const first = records.unit();
  const second = records.unit();
  // Written out of phase order: the fold still emits describe, plan, render, keywords, link,
  // assembly and the global phases in the full path's order.
  records.link(second, { diagnostics: [warning('LINK_2')], dependencies: [] });
  records.global('failure', { diagnostics: [error('FAILED', 'aggregate')], dependencies: [] });
  records.assemble(first, { diagnostics: [warning('ASSEMBLE_1')], dependencies: [] });
  records.global('keywords', { diagnostics: [warning('KEYWORDS')], dependencies: [] });
  records.link(first, { diagnostics: [warning('LINK_1')], dependencies: [] });
  records.describe(second, { diagnostics: [warning('DESCRIBE_2')], dependencies: [] });
  records.global('plan', { diagnostics: [warning('PLAN')], dependencies: [] });
  records.describe(first, { diagnostics: [warning('DESCRIBE_1')], dependencies: [] });
  records.global('discovery', { diagnostics: [warning('DISCOVERY')], dependencies: [] });
  records.global('validate', { diagnostics: [warning('VALIDATE')], dependencies: [] });
  records.global('aggregate', { diagnostics: [warning('AGGREGATE')], dependencies: [] });
  records.global('setup', { diagnostics: [warning('SETUP')], dependencies: [] });
  records.global('semantic', { diagnostics: [warning('SEMANTIC')], dependencies: [] });
  const step = records.renderStep(first, 'descriptor');
  records.settle(step, 'fresh', { diagnostics: [warning('RENDER_1')], dependencies: [] });
  expect(fold(records).diagnostics.map((item) => item.code)).toEqual([
    'DISCOVERY',
    'SEMANTIC',
    'SETUP',
    'DESCRIBE_1',
    'DESCRIBE_2',
    'PLAN',
    'RENDER_1',
    'KEYWORDS',
    'LINK_1',
    'LINK_2',
    'ASSEMBLE_1',
    'AGGREGATE',
    'VALIDATE',
    'FAILED',
  ]);
  expect(records.failed()).toBe(true);
});

test('dependencies: last write wins per key, and differing content digests of one path conflict', () => {
  const records = new GenerationRecords();
  // Last write wins for a key whose value changed in another field (here the glob members).
  const glob: Dependency = {
    kind: 'glob',
    root: '/r',
    include: ['*.md'],
    exclude: [],
    members: ['/r/a.md'],
  };
  const grown: Dependency = { ...glob, members: ['/r/a.md', '/r/c.md'] };
  records.global('discovery', {
    diagnostics: [],
    dependencies: [content('/r/b.md', 'one'), glob, content('/r/a.md', 'same')],
  });
  records.global('keywords', {
    diagnostics: [],
    dependencies: [
      content('/r/b.md', 'two'),
      grown,
      content('/r/a.md', 'same'),
      content('/r/b.md', 'one'),
    ],
  });
  expect(fold(records).dependencies).toEqual([
    content('/r/a.md', 'same'),
    // A later read of the first bytes cannot clear the conflict.
    content('/r/b.md', CONFLICTING_CONTENT_DIGEST),
    grown,
  ]);
});

test('render steps: each takes its projection, and the unit list is derived only for a completed render', () => {
  const records = new GenerationRecords();
  const unit = records.unit();
  const other = records.unit();
  const describe = content('/r/page.ts', 'd');
  records.describe(unit, { diagnostics: [], dependencies: [describe] });
  records.described(unit, [describe]);
  records.described(other, []);
  const reused = records.renderStep(unit, 'reused');
  records.settle(reused, 'reuse', { diagnostics: [], dependencies: [] }, [
    content('/r/old.md', 'o'),
  ]);
  const fresh = records.renderStep(unit, 'fresh');
  records.settle(
    fresh,
    'fresh',
    { diagnostics: [warning('RENDERED')], dependencies: [content('/r/raw.md', 'x')] },
    [content('/r/raw.md', 'x')],
  );
  records.renderStep(unit, 'unrequested');
  records.rendered(unit, []);
  // An interrupted render emits its steps but not the unit's list.
  const interrupted = records.renderStep(other, 'interrupted');
  records.settle(
    interrupted,
    'fresh',
    { diagnostics: [], dependencies: [content('/r/interrupted.md', 'i')] },
    [content('/r/interrupted-unit.md', 'u')],
  );
  expect(unit.render.map((step) => step.projection)).toEqual(['reuse', 'fresh', 'none']);
  const result = fold(records);
  expect(result.diagnostics.map((item) => item.code)).toEqual(['RENDERED']);
  expect(result.dependencies.map((item) => ('path' in item ? item.path : ''))).toEqual([
    '/r/interrupted.md',
    '/r/old.md',
    '/r/page.ts',
    '/r/raw.md',
  ]);
  const withoutRender = new GenerationRecords();
  const described = withoutRender.unit();
  withoutRender.described(described, [describe]);
  const step = withoutRender.renderStep(described, 'fresh');
  withoutRender.settle(step, 'fresh', { diagnostics: [], dependencies: [] }, [
    content('/r/unit-only.md', 'u'),
  ]);
  expect(fold(withoutRender).dependencies).toEqual([describe]);
});

test('results carry the candidate in the full path key order, with merged reasons', () => {
  const records = new GenerationRecords();
  records.reason(
    { ownerId: 'b', reason: 'input', detail: 'y' },
    { ownerId: 'a', reason: 'keyword', detail: 'k' },
    { ownerId: 'b', reason: 'input', detail: 'x' },
    { ownerId: 'b', reason: 'input', detail: 'y' },
  );
  const candidate = { revision: 'r' } as ArtifactSnapshot;
  const result = fold(records, candidate);
  expect(Object.keys(result)).toEqual(['candidate', 'dependencies', 'diagnostics', 'whyRebuilt']);
  expect(result.whyRebuilt).toEqual([
    { ownerId: 'a', reason: 'keyword', detail: 'k' },
    { ownerId: 'b', reason: 'input', detail: 'x; y' },
  ]);
  expect(mergeReasons([])).toEqual([]);
  expect(Object.keys(fold(new GenerationRecords()))).toEqual([
    'dependencies',
    'diagnostics',
    'whyRebuilt',
  ]);
});

function fixture(cache: boolean = true) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-fold-')));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const write = (file: string, text: string) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
    return target;
  };
  symlinkSync(
    path.resolve(import.meta.dirname, '../../../../node_modules'),
    path.join(root, 'node_modules'),
    'dir',
  );
  const tsConfig = write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        types: [],
        skipLibCheck: true,
        experimentalDecorators: true,
      },
      include: ['docs/**/*.ts'],
    }),
  );
  const configFile = write(
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', cache: ${cache} };`,
  );
  write(
    'docs/ng-doc.api.ts',
    `const api = { title: 'API', keyword: 'ApiIndex', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default api;`,
  );
  write(
    'docs/api.ts',
    '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
  );
  write(
    'docs/guide/demo.ts',
    `import { Component } from '@angular/core'; @Component({selector:'fixture-demo', templateUrl:'./demo.html'}) export class Demo {}`,
  );
  write('docs/guide/demo.html', '<b>Demo body</b>');
  write(
    'docs/guide/ng-doc.page.ts',
    `import { Demo } from './demo'; const page = { title: 'Guide', route: 'guide', mdFile: './index.md', demos: { Demo } }; export default page;`,
  );
  const guide = write(
    'docs/guide/index.md',
    '---\nkeyword: Guide\n---\n# Guide heading\n\nUses `Actual`, `Second` and `Missing`.\n\n{{ NgDocActions.demo("Demo") }}',
  );
  write(
    'docs/second/ng-doc.page.ts',
    `const page = { title: 'Second', route: 'second', mdFile: './index.md' }; export default page;`,
  );
  const second = write(
    'docs/second/index.md',
    '---\nkeyword: Second\n---\n# Second\n\nLinks `Guide`.',
  );
  const options: CompilationOptions = {
    projectId: 'fixture',
    workspaceRoot: root,
    configFile,
    defaults: {
      docsRoot: path.join(root, 'docs'),
      tsConfig,
      outputRoot: path.join(root, 'out'),
      cacheRoot: path.join(root, 'cache'),
    },
    compilerVersion: 'test-v1',
    toolchainDigest: 'fold-test',
  };
  const create = (overrides: Partial<CompilationOptions> = {}) => {
    const service = createCompilationService({ ...options, ...overrides });
    cleanup.push(() => service.dispose());
    return service;
  };
  return { root, write, guide, second, create };
}

type Service = ReturnType<typeof createCompilationService>;

/** Compiles once and checks that the result is the fold of the traced records, and the fold equals the journal replay. */
async function traced1(
  service: Service,
  request: CompilationRequest,
  signal: AbortSignal = new AbortController().signal,
): Promise<CompilationResult> {
  traceRecords((records) => traced.push(records));
  const result = await service.compile(request, signal, { lifetime: 'watch' });
  traceRecords(undefined);
  const records = traced.at(-1)!;
  const journal = foldContributions(records.journal!);
  expect(JSON.stringify(journal.diagnostics)).toBe(JSON.stringify(result.diagnostics));
  expect(JSON.stringify(journal.dependencies)).toBe(JSON.stringify(result.dependencies));
  expect(JSON.stringify(fold(records, result.candidate))).toBe(JSON.stringify(result));
  return result;
}
const errors = (result: CompilationResult) =>
  result.diagnostics.filter((item) => item.severity === 'error').map((item) => item.code);

test('fold equals the emission journal: cold, reuse and fresh projections, retained program, cache', async () => {
  const f = fixture(true);
  const service = f.create();
  const cold = await traced1(service, { generation: 1, mode: 'development', changes: [] });
  expect(errors(cold)).toEqual([]);
  const coldRecords = traced.at(-1)!;
  expect(
    coldRecords.units.flatMap((unit) => unit.render.map((step) => step.projection)),
  ).not.toContain('reuse');
  f.write('docs/second/index.md', '---\nkeyword: Second\n---\n# Second\n\nLinks `Guide` again.');
  const edited = await traced1(service, {
    generation: 2,
    mode: 'development',
    changes: [{ kind: 'update', path: f.second }],
    previous: cold.candidate!,
  });
  expect(errors(edited)).toEqual([]);
  const projections = traced
    .at(-1)!
    .units.flatMap((unit) => unit.render.map((step) => step.projection));
  expect(projections).toContain('reuse');
  expect(projections).toContain('fresh');
  f.write('docs/guide/demo.html', '<b>Changed demo body</b>');
  const demo = await traced1(service, {
    generation: 3,
    mode: 'development',
    changes: [{ kind: 'update', path: path.join(f.root, 'docs/guide/demo.html') }],
    previous: edited.candidate!,
  });
  expect(errors(demo)).toEqual([]);
  // A cache-restored previous and a production generation. The fast start would publish the
  // recorded result without compiling, so nothing would be folded.
  const restored = await traced1(f.create({ fastStart: false }), {
    generation: 1,
    mode: 'development',
    changes: [],
  });
  expect(restored.whyRebuilt.every((reason) => reason.reason !== 'initial')).toBe(true);
  expect(
    errors(await traced1(f.create(), { generation: 1, mode: 'production', changes: [] })),
  ).toEqual([]);
}, 120_000);

test('fold equals the emission journal on discovery, semantic, render, link and aggregate failures', async () => {
  const f = fixture(false);
  const cold = await traced1(f.create(), { generation: 1, mode: 'development', changes: [] });
  const request = (generation: number): CompilationRequest => ({
    generation,
    mode: 'development',
    changes: [],
    previous: cold.candidate!,
  });
  f.write('ng-doc.config.ts', `throw new Error('broken configuration'); export default {};`);
  expect((await traced1(f.create(), request(2))).candidate).toBeUndefined();
  f.write('ng-doc.config.ts', `export default { docsPath: 'docs', cache: false };`);
  f.write('docs/api.ts', 'export class { broken !!!');
  expect(errors(await traced1(f.create(), request(3)))).toContain('SEMANTIC_SYNTAX');
  f.write(
    'docs/api.ts',
    '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
  );
  f.write('docs/second/index.md', '# Second\n\n{% include "missing-include.nunj" %}');
  const render = await traced1(f.create(), request(4));
  expect(render.candidate).toBeUndefined();
  expect(render.dependencies.length).toBeGreaterThan(0);
  f.write('docs/second/index.md', '---\nkeyword: Second\n---\n# Second\n\nLinks `Guide`.');
  const link = GeneratorContentCompiler.prototype.link;
  vi.spyOn(GeneratorContentCompiler.prototype, 'link').mockImplementation(async function (
    this: GeneratorContentCompiler,
    ...args: [
      request: {
        ir: ContentIR;
        keywords: KeywordExport[];
        breadcrumbs: string[];
        pageType: 'guide' | 'api';
      },
      signal: AbortSignal,
      consulted?: Set<string> | undefined,
    ]
  ) {
    const linked = await link.apply(this, args);
    return args[0].ir.role === 'guide-tab'
      ? { ...linked, diagnostics: [...linked.diagnostics, error('TEST_LINK')] }
      : linked;
  });
  // Without a previous snapshot nothing is link-reused, so every IR is linked.
  expect(
    errors(await traced1(f.create(), { generation: 5, mode: 'development', changes: [] })),
  ).toContain('TEST_LINK');
  vi.restoreAllMocks();
  const aggregate = OutputAssemblerImpl.prototype.aggregate;
  vi.spyOn(OutputAssemblerImpl.prototype, 'aggregate').mockImplementation(function (
    this: OutputAssemblerImpl,
    ...args: [request: AggregateRequest]
  ) {
    const result = aggregate.apply(this, args);
    return {
      ...result,
      diagnostics: [...result.diagnostics, error('TEST_AGGREGATE', 'aggregate')],
    };
  });
  expect(errors(await traced1(f.create(), request(6)))).toContain('TEST_AGGREGATE');
  vi.restoreAllMocks();
  const assemble = OutputAssemblerImpl.prototype.assemblePage;
  vi.spyOn(OutputAssemblerImpl.prototype, 'assemblePage').mockImplementation(function (
    this: OutputAssemblerImpl,
    ...args: [request: PageAssemblyRequest]
  ) {
    const result = assemble.apply(this, args);
    return { ...result, diagnostics: [...result.diagnostics, warning('TEST_ASSEMBLY_WARNING')] };
  });
  const assembled = await traced1(f.create(), request(7));
  expect(assembled.candidate).toBeDefined();
  expect(assembled.diagnostics.map((item) => item.code)).toContain('TEST_ASSEMBLY_WARNING');
}, 120_000);

test('fold equals the emission journal when the generation is aborted in each phase', async () => {
  const f = fixture(true);
  const cold = await traced1(f.create(), { generation: 1, mode: 'development', changes: [] });
  const phases: Array<[string, () => void]> = [];
  const abortIn = <T extends object>(owner: T, method: keyof T & string) => {
    phases.push([
      method,
      () => {
        const original = owner[method] as (...args: unknown[]) => unknown;
        vi.spyOn(
          owner as Record<string, (...args: unknown[]) => unknown>,
          method,
        ).mockImplementation(function (this: unknown, ...args: unknown[]) {
          controller.abort(new Error(`aborted in ${method}`));
          return original.apply(this, args);
        });
      },
    ]);
  };
  let controller = new AbortController();
  abortIn(DiscoveryServiceImpl.prototype, 'discover');
  abortIn(SemanticServiceImpl.prototype, 'synchronize');
  abortIn(SemanticServiceImpl.prototype, 'enumerateApi');
  abortIn(GeneratorContentCompiler.prototype, 'describe');
  abortIn(GeneratorContentCompiler.prototype, 'compile');
  abortIn(GeneratorContentCompiler.prototype, 'link');
  abortIn(OutputAssemblerImpl.prototype, 'assemblePage');
  abortIn(OutputAssemblerImpl.prototype, 'aggregate');
  abortIn(JsonArtifactCache.prototype, 'writeStamped');
  f.write('docs/second/index.md', '---\nkeyword: Second\n---\n# Second\n\nLinks `Guide`, edited.');
  for (const [method, install] of phases) {
    controller = new AbortController();
    install();
    const result = await traced1(
      f.create(),
      {
        generation: 2,
        mode: 'development',
        changes: [{ kind: 'update', path: f.second }],
        previous: cold.candidate!,
      },
      controller.signal,
    );
    vi.restoreAllMocks();
    expect(controller.signal.aborted, method).toBe(true);
    expect(result.candidate, method).toBeUndefined();
  }
}, 120_000);

test('an unavailable service folds its single diagnostic', async () => {
  const f = fixture(false);
  const service = f.create();
  const controller = new AbortController();
  controller.abort();
  const result = await traced1(
    service,
    { generation: 1, mode: 'development', changes: [] },
    controller.signal,
  );
  expect(errors(result)).toEqual(['COMPILATION_UNAVAILABLE']);
});

test('fold equals the emission journal on the plan exit, the descriptor-request error, the link exit and the scope-validation exit', async () => {
  const f = fixture(false);
  const describe = GeneratorContentCompiler.prototype.describe;
  // Plan exit (index.ts: the error after `planContent`): a guide tab described with the id of
  // its page header, so the current descriptor plan holds that id twice.
  const headers = new Map<string, string>();
  const describeSpy = vi
    .spyOn(GeneratorContentCompiler.prototype, 'describe')
    .mockImplementation(async function (
      this: GeneratorContentCompiler,
      ...args: [
        request: DeferredContentRequest,
        provenance: ContentDescriptorProvenance,
        signal: AbortSignal,
      ]
    ) {
      const described = await describe.apply(this, args);
      const [, context] = args;
      if (described.value?.role === 'header') headers.set(context.ownerId, described.value.id);
      const header = headers.get(context.ownerId);
      return described.value?.role === 'guide-tab' && header
        ? { ...described, value: { ...described.value, id: header } }
        : described;
    });
  const duplicate = await traced1(f.create(), { generation: 1, mode: 'development', changes: [] });
  expect(errors(duplicate)).toContain('COMPILATION_CONTENT_DESCRIPTOR_DUPLICATE');
  expect(duplicate.candidate).toBeUndefined();
  // No unit rendered: the plan exit comes before the render phase.
  expect(traced.at(-1)!.units.every((unit) => unit.render.length === 0)).toBe(true);
  describeSpy.mockRestore();

  // Render: a descriptor whose ordinal names no current request settles `none` with an error.
  vi.spyOn(GeneratorContentCompiler.prototype, 'describe').mockImplementation(async function (
    this: GeneratorContentCompiler,
    ...args: [
      request: DeferredContentRequest,
      provenance: ContentDescriptorProvenance,
      signal: AbortSignal,
    ]
  ) {
    const described = await describe.apply(this, args);
    return described.value?.role === 'guide-tab' && described.value.title === 'Second'
      ? { ...described, value: { ...described.value, ordinal: 99 } }
      : described;
  });
  const request = await traced1(f.create(), { generation: 1, mode: 'development', changes: [] });
  expect(errors(request)).toEqual(['COMPILATION_CONTENT_DESCRIPTOR_REQUEST']);
  const unrequested = traced
    .at(-1)!
    .units.flatMap((unit) => unit.render)
    .find((step) => step.emitted.diagnostics.length);
  // A `none` projection that carries an error.
  expect(unrequested?.projection).toBe('none');
  expect(unrequested?.emitted.diagnostics.map((item) => item.code)).toEqual([
    'COMPILATION_CONTENT_DESCRIPTOR_REQUEST',
  ]);
  vi.restoreAllMocks();

  // Link exit (index.ts: the error after `linkUnits`): a link that yields no document fails the
  // generation before any unit is assembled.
  const cold = await traced1(f.create(), { generation: 1, mode: 'development', changes: [] });
  const second = cold
    .candidate!.artifacts.flatMap((artifact) => artifact.contentDescriptors ?? [])
    .find((descriptor) => descriptor.role === 'guide-tab' && descriptor.title === 'Second')!;
  const link = GeneratorContentCompiler.prototype.link;
  vi.spyOn(GeneratorContentCompiler.prototype, 'link').mockImplementation(async function (
    this: GeneratorContentCompiler,
    ...args: [
      request: {
        ir: ContentIR;
        keywords: KeywordExport[];
        breadcrumbs: string[];
        pageType: 'guide' | 'api';
      },
      signal: AbortSignal,
      consulted?: Set<string> | undefined,
    ]
  ) {
    const linked = await link.apply(this, args);
    return args[0].ir.id === second.id
      ? { dependencies: linked.dependencies, diagnostics: [error('TEST_LINK')] }
      : linked;
  });
  // Without a previous snapshot nothing is link-reused, so every IR is linked.
  const unlinked = await traced1(f.create(), { generation: 2, mode: 'development', changes: [] });
  expect(unlinked.candidate).toBeUndefined();
  expect(errors(unlinked)).toEqual(['TEST_LINK']);
  expect(traced.at(-1)!.units.every((unit) => unit.assembly === undefined)).toBe(true);
  vi.restoreAllMocks();

  // Scope-validation exit (index.ts: the error after `candidateSnapshot`).
  scopeFault.diagnostics = [error('TEST_SCOPE', 'aggregate')];
  const scope = await traced1(f.create(), { generation: 1, mode: 'development', changes: [] });
  expect(errors(scope)).toEqual(['TEST_SCOPE']);
  expect(scope.candidate).toBeUndefined();
}, 120_000);

test('assembly records say whether the assembly memo supplied the page', async () => {
  const f = fixture(true);
  const service = f.create();
  const cold = await traced1(service, { generation: 1, mode: 'development', changes: [] });
  expect(new Set(traced.at(-1)!.units.map((unit) => unit.assembly))).toEqual(new Set(['fresh']));
  f.write('docs/second/index.md', '---\nkeyword: Second\n---\n# Second\n\nLinks `Guide`, edited.');
  await traced1(service, {
    generation: 2,
    mode: 'development',
    changes: [{ kind: 'update', path: f.second }],
    previous: cold.candidate!,
  });
  const assemblies = traced.at(-1)!.units.map((unit) => unit.assembly);
  expect(assemblies).toContain('memo');
  expect(assemblies).toContain('fresh');
  // A memoised unit emits no assembly diagnostics (replaying it as recorded is exact).
  for (const unit of traced.at(-1)!.units.filter((item) => item.assembly === 'memo'))
    expect(unit.assemble.flatMap((item) => item.diagnostics)).toEqual([]);
}, 120_000);
