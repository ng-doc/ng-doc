import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { Project, ts } from 'ts-morph';
import { afterEach, beforeEach, expect, test } from 'vitest';

import type {
  ApiDescriptor,
  DiscoverySnapshot,
  FileChange,
  GuideDescriptor,
  ServiceResult,
} from '../../contracts';
import { CACHED_DOCUMENTATION_FIELDS, installDocumentationFreshness } from '../documentation-cache';
import { MAX_PATCHED_FILES } from '../program-retention';
import { RetainedProgram } from '../program-state';
import {
  type IncrementalProgramMode,
  type RetainedSemanticState,
  type SemanticServiceImpl,
  createSemanticService,
  SEMANTIC_PATCH_MISMATCH,
} from '../semantic-service';
import { hostPath, join } from './engine-paths';

// The incremental program: a retained program is patched with the content edits of its files, and
// every patched synchronization equals a cold synchronization of the same tree.

let directory: string;
const services: SemanticServiceImpl[] = [];
const at = (path: string) => join(directory, path);
const write = (path: string, text: string) => {
  mkdirSync(join(directory, path, '..'), { recursive: true });
  writeFileSync(at(path), text);
  return at(path);
};
const read = (path: string) => readFileSync(at(path), 'utf8');
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const update = (path: string): FileChange => ({ kind: 'update', path: at(path) });

function snapshot(): DiscoverySnapshot {
  const common = {
    source: { path: at('entry.ts') },
    title: 'Reference',
    route: 'api',
    absoluteRoute: 'docs/api',
    breadcrumbs: ['Reference'],
    runtimeImport: { source: at('entry.ts'), exportName: 'default' },
    dependencies: [],
  };
  return {
    configuration: {
      projectId: 'site',
      workspaceRoot: directory,
      docsRoots: [directory],
      tsConfig: at('tsconfig.json'),
      outputRoot: at('output'),
      cacheRoot: at('cache'),
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
          { id: 'public', name: 'Public', route: 'public', include: ['public*.ts'], exclude: [] },
        ],
      } as ApiDescriptor,
      {
        ...common,
        id: 'guide',
        kind: 'guide',
        markdown: [at('index.md')],
        hasImports: true,
      } as GuideDescriptor,
    ],
    globalKeywords: [],
    remoteKeywords: [],
  };
}

const PUBLIC = [
  "import { Base } from './base';",
  '/** First summary. */',
  'export interface First extends Base { value: string }',
].join('\n');

beforeEach(async () => {
  directory = hostPath(realpathSync(mkdtempSync(join(tmpdir(), 'semantic-patch-'))));
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true, types: [] },
      include: ['*.ts'],
    }),
  );
  write('entry.ts', '/** Guide summary. */\nconst Page = {}; export default Page;');
  write('public.ts', PUBLIC);
  write('base.ts', '/** Base summary. */\nexport interface Base { base: string }');
  write('ambient.ts', 'declare const ambient: number;');
  write('shapes.d.ts', 'export declare const shape: number;');
  // Everything written so far settles past the stat margin before the first observation.
  await pause(120);
});
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose();
  chmodSync(directory, 0o755);
  rmSync(directory, { recursive: true, force: true });
});

function service(incrementalProgram?: IncrementalProgramMode): SemanticServiceImpl {
  const created = createSemanticService({
    dependencyMode: 'scope-reference',
    ...(incrementalProgram ? { incrementalProgram } : {}),
  });
  services.push(created);
  return created;
}

async function retained(discovery: DiscoverySnapshot = snapshot()): Promise<RetainedProgram> {
  const first = service();
  const result = await first.synchronize(
    { generation: 1, discovery, changes: [], retention: {} },
    new AbortController().signal,
  );
  expect(result.diagnostics).toEqual([]);
  return first.retain() as RetainedProgram;
}

async function next(
  previous: RetainedSemanticState,
  changes: FileChange[] = [],
  options: {
    mode?: IncrementalProgramMode;
    signal?: AbortSignal;
    discovery?: DiscoverySnapshot;
  } = {},
) {
  // Edits settle past the stat margin, so a patched file is stamped as verified.
  await pause(120);
  const second = service(options.mode);
  const retention = { previous };
  const result = await second.synchronize(
    { generation: 2, discovery: options.discovery ?? snapshot(), changes, retention },
    options.signal ?? new AbortController().signal,
  );
  return {
    service: second,
    result,
    path: second.synchronization(),
    outcome: second.programSynchronization(),
    retention,
  };
}

/** A cold synchronization of the current tree, made for retention (so its Project can be read). */
async function cold(
  discovery: DiscoverySnapshot = snapshot(),
): Promise<{ result: ServiceResult<null>; program?: RetainedProgram }> {
  const created = service('off');
  const result = await created.synchronize(
    { generation: 1, discovery, changes: [], retention: {} },
    new AbortController().signal,
  );
  return { result, program: created.retain() as RetainedProgram | undefined };
}

/** The program facts a patch must reproduce: root names, files in order and their texts. */
function facts(program: RetainedProgram) {
  const compiled = program.project.getProgram().compilerObject;
  return {
    roots: compiled.getRootFileNames(),
    files: compiled.getSourceFiles().map((source) => [source.fileName, source.text]),
    observations: program.files.all(),
  };
}

async function expectCold(
  program: RetainedProgram,
  result: ServiceResult<null>,
  discovery?: DiscoverySnapshot,
): Promise<void> {
  const reference = await cold(discovery);
  expect(result).toEqual(reference.result);
  expect(facts(program)).toEqual(facts(reference.program!));
}

test('a content edit is patched into the retained program and equals a cold synchronization', async () => {
  const first = await retained();
  write('base.ts', '/** Edited base summary. */\nexport interface Base { base: number }');
  const patched = await next(first, [update('base.ts')]);
  expect(patched.path).toMatchObject({ path: 'patched', files: [at('base.ts')] });
  expect(patched.outcome).toEqual({ outcome: 'patched' });
  // Kept, not consumed.
  expect(patched.retention.previous).toBe(first);
  const program = patched.service.retain() as RetainedProgram;
  expect(program.project).toBe(first.project);
  expect(program.mirror).toBe(first.mirror);
  // The pinned roots: the same file set and order as the cold program, so TypeScript reused the
  // program's structure completely.
  const compiled = program.project.getProgram().compilerObject as unknown as {
    structureIsReused?: number;
  };
  expect(compiled.structureIsReused).toBe(2);
  await expectCold(program, patched.result);
  // The queries of the generation read the edited declaration.
  const enumerated = patched.service.enumerateApi('api');
  expect(JSON.stringify(enumerated.value)).toContain('First');
  const docs = patched.service.renderFragment({
    kind: 'js-doc',
    entryId: 'guide',
    declarationPath: 'base.ts#Base',
  });
  expect(docs.value?.value).toContain('Edited base summary');
  // A second patch of the same Project, then a no-op generation reuses it.
  write('public.ts', PUBLIC.replace('First summary', 'Second summary'));
  const again = await next(program, [update('public.ts')]);
  expect(again.path).toMatchObject({ path: 'patched', files: [at('public.ts')] });
  const second = again.service.retain() as RetainedProgram;
  expect(second.mirror.version).toBe(2);
  await expectCold(second, again.result);
  await pause(120);
  expect((await next(second)).path?.path).toBe('reused');
});

test('an entry file edit is patched without a conflicting read of the entry', async () => {
  const first = await retained();
  write('entry.ts', '/** Edited guide summary. */\nconst Page = {}; export default Page;');
  const patched = await next(first, [update('entry.ts')]);
  expect(patched.path).toMatchObject({ path: 'patched', files: [at('entry.ts')] });
  expect(JSON.stringify(patched.result.dependencies)).not.toContain('conflicting-reads');
  await expectCold(patched.service.retain() as RetainedProgram, patched.result);
});

test('an event of an unchanged program file keeps the program; several files patch in program order', async () => {
  const first = await retained();
  write('base.ts', '/** Base summary. */\nexport interface Base { base: string }');
  const touched = await next(first, [update('base.ts')]);
  expect(touched.path?.path).toBe('reused');
  const program = touched.service.retain()!;
  write('public.ts', PUBLIC.replace('value: string', 'value: boolean'));
  write('base.ts', '/** Base summary. */\nexport interface Base { base: boolean }');
  // Found by the stat sweep, without an event.
  const patched = await next(program);
  expect(patched.path).toMatchObject({
    path: 'patched',
    files: (patched.service.retain() as RetainedProgram).mirror.observations
      .importers()
      .filter((path) => path === at('public.ts') || path === at('base.ts')),
  });
  await expectCold(patched.service.retain() as RetainedProgram, patched.result);
});

test('a byte order mark is compiled without the mark and digested with it, as cold', async () => {
  write('base.ts', '﻿/** Base summary. */\nexport interface Base { base: string }');
  await pause(120);
  const first = await retained();
  write('base.ts', '﻿/** Marked edit. */\nexport interface Base { base: string }');
  const patched = await next(first, [update('base.ts')]);
  expect(patched.path?.path).toBe('patched');
  const program = patched.service.retain() as RetainedProgram;
  expect(program.project.getSourceFileOrThrow(at('base.ts')).getFullText().charCodeAt(0)).not.toBe(
    0xfeff,
  );
  await expectCold(program, patched.result);
});

test('a syntax error keeps the patch applied and hands the taken program back until it is fixed', async () => {
  const first = await retained();
  write('base.ts', 'export interface Base { base: }');
  const failed = await next(first, [update('base.ts')]);
  expect(failed.path).toMatchObject({ path: 'patched', failed: true, files: [at('base.ts')] });
  expect(failed.outcome).toEqual({ outcome: 'patched-failed', handedBack: first });
  expect(failed.retention.previous).toBe(first);
  expect(failed.service.retain()).toBeUndefined();
  expect(first.mirror.appliedSinceBase.has(at('base.ts'))).toBe(true);
  // The cold diagnostic and the observations a cold synchronization reports when it fails there.
  const reference = await cold();
  expect(reference.result.diagnostics.map((item) => item.code)).toEqual(['SEMANTIC_SYNTAX']);
  expect(failed.result).toEqual(reference.result);
  // Nothing changed since: the handed-back program is checked again, never reused as it is.
  await pause(120);
  const still = await next(first);
  expect(still.path).toMatchObject({ path: 'patched', failed: true });
  expect(still.result).toEqual(reference.result);
  // The revert to the committed text is a patch (the Project differs from the tree), then clean.
  write('base.ts', '/** Base summary. */\nexport interface Base { base: string }');
  const fixed = await next(first, [update('base.ts')]);
  expect(fixed.path).toMatchObject({ path: 'patched', files: [at('base.ts')] });
  expect(first.mirror.appliedSinceBase.size).toBe(0);
  await expectCold(fixed.service.retain() as RetainedProgram, fixed.result);
});

test('edits the patch cannot apply synchronize the program anew', async () => {
  const cases: Array<[string, () => FileChange[]]> = [
    [
      'a global or ambient module declaration after the edit',
      () => [
        update(
          write(
            'base.ts',
            'export interface Base { base: string }\ndeclare global { const extra: number }',
          ),
        ),
      ],
    ],
    [
      'a global or ambient module declaration after the edit',
      () => [
        update(
          write(
            'base.ts',
            "export interface Base { base: string }\ndeclare module 'other' { const x: 1 }",
          ),
        ),
      ],
    ],
    [
      'a UMD global after the edit',
      () => [
        update(
          write('base.ts', 'export interface Base { base: string }\nexport as namespace Lib;'),
        ),
      ],
    ],
    [
      'a script after the edit',
      () => [update(write('base.ts', 'interface Base { base: string }'))],
    ],
    [
      'a script before the edit',
      () => [update(write('ambient.ts', 'declare const ambient: string;'))],
    ],
    [
      'is a declaration or library file',
      () => [update(write('shapes.d.ts', 'export declare const shape: string;'))],
    ],
  ];
  for (const [reason, edit] of cases) {
    const first = await retained();
    const changes = edit();
    const { path, outcome, retention, result } = await next(first, changes);
    expect({ reason, path }).toEqual({
      reason,
      path: { path: 'full', reason: expect.stringContaining(reason) },
    });
    expect(path?.path === 'full' && path.reason).toMatch(/^patch refused: /);
    expect(outcome?.outcome).toBe('full');
    // Consumed: never kept for any base.
    expect(retention.previous).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
    // Restore the tree for the next case.
    write('base.ts', '/** Base summary. */\nexport interface Base { base: string }');
    write('ambient.ts', 'declare const ambient: number;');
    write('shapes.d.ts', 'export declare const shape: number;');
    await pause(120);
  }
});

test('too many edited files, an unreadable file, a failing patch and an unknown applied path synchronize anew', async () => {
  // More than the patch limit.
  for (let index = 0; index <= MAX_PATCHED_FILES; index++)
    write(`public-${index}.ts`, `export const value${index} = ${index};`);
  await pause(120);
  let first = await retained();
  for (let index = 0; index <= MAX_PATCHED_FILES; index++)
    write(`public-${index}.ts`, `export const value${index} = ${index + 1};`);
  expect((await next(first)).path).toEqual({
    path: 'full',
    reason: `${MAX_PATCHED_FILES + 1} program files changed (at most ${MAX_PATCHED_FILES} are patched)`,
  });
  // A file that cannot be read. Windows has no permission bits that make a file unreadable to its
  // owner (`chmod` only sets the read-only attribute), so the case is POSIX-only.
  if (process.platform !== 'win32') {
    first = await retained();
    write('base.ts', '/** Unreadable. */\nexport interface Base { base: string }');
    chmodSync(at('base.ts'), 0o000);
    const unreadable = await next(first, [update('base.ts')]);
    chmodSync(at('base.ts'), 0o644);
    expect(unreadable.path).toMatchObject({
      path: 'full',
      reason: expect.stringMatching(/^patch refused: .*base\.ts cannot be read/),
    });
  }
  // A throwing manipulation is refused, never half kept.
  first = await retained();
  const source = first.project.getSourceFileOrThrow(at('base.ts'));
  Object.defineProperty(source, 'forgetDescendants', {
    value: () => {
      throw new Error('manipulation failed');
    },
    configurable: true,
  });
  write('base.ts', '/** Throwing. */\nexport interface Base { base: string }');
  expect((await next(first, [update('base.ts')])).path).toEqual({
    path: 'full',
    reason: 'patch refused: the patch failed: manipulation failed',
  });
  // A ts-morph program that cannot pin its roots.
  first = await retained();
  Object.defineProperty(first.project.getProgram(), '_reset', {
    value: undefined,
    configurable: true,
  });
  write('base.ts', '/** Unpinned. */\nexport interface Base { base: string }');
  expect((await next(first, [update('base.ts')])).path).toEqual({
    path: 'full',
    reason: 'patch refused: this ts-morph program cannot pin its root names',
  });
  // An applied path that is not a program file.
  first = await retained();
  first.mirror.appliedSinceBase.set(at('nowhere.ts'), 'digest');
  expect((await next(first)).path).toEqual({
    path: 'full',
    reason: `patched path is not a program file: ${at('nowhere.ts')}`,
  });
});

test('a changed configuration or discovery input, and other changed observations, still synchronize anew', async () => {
  let first = await retained();
  write('base.ts', '/** Edited. */\nexport interface Base { base: string }');
  expect((await next(first, [update('tsconfig.json')])).path).toMatchObject({
    path: 'full',
    reason: expect.stringContaining('program configuration update'),
  });
  // Another program configuration is never a root change.
  first = await retained();
  const configured = snapshot();
  configured.configuration.tsConfig = write('tsconfig.other.json', read('tsconfig.json'));
  expect((await next(first, [], { discovery: configured })).path).toEqual({
    path: 'full',
    reason: expect.stringContaining('discovery inputs of the program changed'),
  });
  // A deleted program file that a kept file imports.
  first = await retained();
  rmSync(at('base.ts'));
  expect((await next(first, [{ kind: 'delete', path: at('base.ts') }])).path).toMatchObject({
    path: 'full',
    reason: expect.stringContaining('base.ts'),
  });
});

test('an aborted or superseded synchronization changes nothing before the patch', async () => {
  const first = await retained();
  write('base.ts', '/** Aborted. */\nexport interface Base { base: string }');
  const controller = new AbortController();
  controller.abort();
  const aborted = await next(first, [update('base.ts')], { signal: controller.signal });
  expect(aborted.result.diagnostics.map((item) => item.code)).toEqual(['SEMANTIC_CANCELLED']);
  expect(first.mirror.version).toBe(0);
  expect(first.mirror.appliedSinceBase.size).toBe(0);
  const patched = await next(first, [update('base.ts')]);
  expect(patched.path?.path).toBe('patched');
});

test('verify keeps a patch equal to a cold synchronization, and replaces one that differs', async () => {
  let first = await retained();
  write('base.ts', '/** Verified. */\nexport interface Base { base: string }');
  const verified = await next(first, [update('base.ts')], { mode: 'verify' });
  expect(verified.path?.path).toBe('patched');
  expect(verified.result.diagnostics).toEqual([]);
  await expectCold(verified.service.retain() as RetainedProgram, verified.result);
  // A failed patch is compared with the cold failure.
  write('base.ts', 'export interface Base { base: }');
  const failed = await next(verified.service.retain()!, [update('base.ts')], { mode: 'verify' });
  expect(failed.path).toMatchObject({ path: 'patched', failed: true });
  // A patched program whose observations differ from the cold ones (an injected observation).
  write('base.ts', '/** Base summary. */\nexport interface Base { base: string }');
  await pause(120);
  first = await retained();
  first.mirror.observations.files.add({
    kind: 'existence',
    path: at('injected.ts'),
    exists: false,
  });
  write('base.ts', '/** Mismatch. */\nexport interface Base { base: string }');
  const mismatch = await next(first, [update('base.ts')], { mode: 'verify' });
  expect(mismatch.path).toEqual({
    path: 'full',
    reason: 'patch refused: verification: the published observations differ',
  });
  expect(mismatch.result.diagnostics).toEqual([
    expect.objectContaining({ code: SEMANTIC_PATCH_MISMATCH, severity: 'warning' }),
  ]);
  expect(mismatch.retention.previous).toBeUndefined();
  // Without the warning, the replacement is the cold synchronization.
  const reference = await cold();
  expect({ ...mismatch.result, diagnostics: [] }).toEqual(reference.result);
});

test('the incremental program switch is read from the environment by default', async () => {
  const saved = process.env['NGDOC_INCREMENTAL_PROGRAM'];
  try {
    process.env['NGDOC_INCREMENTAL_PROGRAM'] = '0';
    const first = await retained();
    write('base.ts', '/** Off. */\nexport interface Base { base: string }');
    const off = await next(first, [update('base.ts')]);
    expect(off.path).toMatchObject({ path: 'full', reason: expect.stringContaining('base.ts') });
  } finally {
    if (saved === undefined) delete process.env['NGDOC_INCREMENTAL_PROGRAM'];
    else process.env['NGDOC_INCREMENTAL_PROGRAM'] = saved;
  }
});

test('inherited documentation of an unchanged file follows a patched base, as in a cold program', async () => {
  write(
    'base.ts',
    'export class Base {\n  /** Base value. */\n  value = 1;\n  /** Base method. */\n  run(): void {}\n}',
  );
  write(
    'public.ts',
    "import { Base } from './base';\n/** First class. */\nexport class First extends Base {\n  override value = 2;\n  override run(): void {}\n}",
  );
  await pause(120);
  const first = await retained();
  const page = (created: SemanticServiceImpl) => {
    const declarations = created.enumerateApi('api').value!;
    const declaration = declarations.find((item) => item.name === 'First')!;
    return created.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: declaration.id,
    }).value;
  };
  // Computed (and cached by TypeScript on the reused member symbols) before the patch.
  const initial = service();
  await initial.synchronize(
    { generation: 2, discovery: snapshot(), changes: [], retention: { previous: first } },
    new AbortController().signal,
  );
  expect(JSON.stringify(page(initial))).toContain('Base value.');
  const kept = initial.retain()!;
  expect(memberDocs(kept as RetainedProgram)).toBe('Base value.');
  write(
    'base.ts',
    'export class Base {\n  /** Edited value. */\n  value = 1;\n  /** Edited method. */\n  run(): void {}\n}',
  );
  const patched = await next(kept, [update('base.ts')]);
  expect(patched.path?.path).toBe('patched');
  const coldService = service('off');
  await coldService.synchronize(
    { generation: 1, discovery: snapshot(), changes: [] },
    new AbortController().signal,
  );
  expect(JSON.stringify(page(coldService))).toContain('Edited value.');
  expect(page(patched.service)).toEqual(page(coldService));
  // TypeScript's own documentation readers: the member symbol of the unchanged file is reused by the
  // patched program, and cached the inherited documentation for the old program's checker.
  expect(memberDocs(patched.service.retain() as RetainedProgram)).toBe('Edited value.');
});

/** TypeScript's documentation of `First.value` (inherited from `Base.value`) in this program. */
function memberDocs(program: RetainedProgram): string {
  const checker = program.project.getProgram().compilerObject.getTypeChecker();
  const member = program.project
    .getSourceFileOrThrow(at('public.ts'))
    .getClassOrThrow('First')
    .getPropertyOrThrow('value')
    .getSymbolOrThrow().compilerSymbol;
  return ts.displayPartsToString(member.getDocumentationComment(checker));
}

test('documentation cached for another checker is computed again', () => {
  installDocumentationFreshness();
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  project.createSourceFile(
    '/base.ts',
    'export class Base {\n  /** One. @tag one */\n  get value(): number { return 1; }\n}',
  );
  project.createSourceFile(
    '/user.ts',
    "import { Base } from './base';\nexport class User extends Base {\n  override get value(): number { return 2; }\n}",
  );
  const read = () => {
    const checker = project.getProgram().compilerObject.getTypeChecker();
    const symbol = project
      .getSourceFileOrThrow('/user.ts')
      .getClassOrThrow('User')
      .getGetAccessorOrThrow('value')
      .getSymbolOrThrow().compilerSymbol;
    const accessor = symbol.declarations![0]!;
    // The contextual readers are internal to TypeScript's services.
    const contextual = symbol as unknown as {
      getContextualDocumentationComment(
        context: ts.Node,
        checker: ts.TypeChecker,
      ): ts.SymbolDisplayPart[];
      getContextualJsDocTags(context: ts.Node, checker: ts.TypeChecker): ts.JSDocTagInfo[];
    };
    return [
      ts.displayPartsToString(symbol.getDocumentationComment(checker)),
      ts.displayPartsToString(contextual.getContextualDocumentationComment(accessor, checker)),
      symbol.getJsDocTags(checker).map((tag) => ts.displayPartsToString(tag.text)),
      contextual
        .getContextualJsDocTags(accessor, checker)
        .map((tag) => ts.displayPartsToString(tag.text)),
    ];
  };
  expect(read()).toEqual(['One.', 'One.', ['one'], ['one']]);
  project
    .getSourceFileOrThrow('/base.ts')
    .replaceWithText(
      'export class Base {\n  /** Two. @tag two */\n  get value(): number { return 1; }\n}',
    );
  expect(read()).toEqual(['Two.', 'Two.', ['two'], ['two']]);
  expect(CACHED_DOCUMENTATION_FIELDS).toContain('documentationComment');
});

test('CRLF line endings, with and without a byte order mark, are patched as a cold program reads them', async () => {
  for (const mark of ['', '\uFEFF']) {
    write('base.ts', `${mark}/** Base summary. */\r\nexport interface Base { base: string }\r\n`);
    await pause(120);
    const first = await retained();
    write('base.ts', `${mark}/** CRLF edit. */\r\nexport interface Base { base: string }\r\n`);
    const patched = await next(first, [update('base.ts')]);
    expect(patched.path?.path).toBe('patched');
    const program = patched.service.retain() as RetainedProgram;
    expect(program.project.getSourceFileOrThrow(at('base.ts')).getFullText()).toBe(
      '/** CRLF edit. */\r\nexport interface Base { base: string }\r\n',
    );
    await expectCold(program, patched.result);
  }
});

test('with the incremental program off, a program a failed patch left applied is rebuilt, never reused', async () => {
  const first = await retained();
  write('base.ts', 'export interface Base { base: }');
  const failed = await next(first, [update('base.ts')]);
  expect(failed.outcome?.outcome).toBe('patched-failed');
  // Nothing changed since, and no event: only the applied paths say the Project is not the base's.
  const off = await next(first, [], { mode: 'off' });
  expect(off.path).toEqual({
    path: 'full',
    reason: 'the program has patches applied since its base',
  });
  expect(off.retention.previous).toBeUndefined();
  expect(off.result).toEqual((await cold()).result);
});

test('a TSX file: a body edit is patched as cold, a JSX pragma edit (an implicit import) is refused', async () => {
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true, types: [], jsx: 'react-jsx' },
      include: ['*.ts', '*.tsx'],
    }),
  );
  const runtime = (name: string) =>
    write(
      `node_modules/${name}/jsx-runtime.d.ts`,
      `export declare function jsx(type: unknown, props: unknown): { from: '${name}' };\nexport declare namespace JSX { interface IntrinsicElements { [name: string]: unknown } }`,
    );
  runtime('react');
  runtime('preact');
  write('node_modules/react/package.json', '{ "name": "react", "types": "jsx-runtime.d.ts" }');
  write('node_modules/preact/package.json', '{ "name": "preact", "types": "jsx-runtime.d.ts" }');
  write('view.tsx', '/** A view. */\nexport const view = <b>one</b>;');
  await pause(120);
  const first = await retained();
  write('view.tsx', '/** An edited view. */\nexport const view = <b>two</b>;');
  const patched = await next(first, [update('view.tsx')]);
  expect(patched.path).toMatchObject({ path: 'patched', files: [at('view.tsx')] });
  await expectCold(patched.service.retain() as RetainedProgram, patched.result);
  write('view.tsx', '/** @jsxImportSource preact */\nexport const view = <b>two</b>;');
  // An implicit import changes the file set: the program is restructured, as cold.
  const pragma = await next(patched.service.retain()!, [update('view.tsx')]);
  expect(pragma.path).toMatchObject({ path: 'patched', files: [at('view.tsx')] });
  await expectCold(pragma.service.retain() as RetainedProgram, pragma.result);
  const compiled = (pragma.service.retain() as RetainedProgram).project.getProgram().compilerObject;
  expect(compiled.getSourceFiles().map((source) => source.fileName)).toContain(
    at('node_modules/preact/jsx-runtime.d.ts'),
  );
});

// Root changes: entries added, removed or moved, and API scope or tsconfig globs that gain or lose
// a file, are applied to the retained Project; the result equals a cold synchronization of the new
// root membership.

/** The snapshot with extra guide entries, one per module path. */
function withGuides(...paths: string[]): DiscoverySnapshot {
  const discovery = snapshot();
  const guide = discovery.entries[1] as GuideDescriptor;
  for (const path of paths)
    discovery.entries.push({
      ...guide,
      id: `guide:${path}`,
      source: { path: at(path) },
      runtimeImport: { source: at(path), exportName: 'default' },
    });
  return discovery;
}

const PAGE =
  "import { Base } from '../base';\n/** A page. */\nconst Page: Partial<Base> = {}; export default Page;";

test('an entry added, moved and removed is applied to the retained program, as cold', async () => {
  let program = await retained();
  // Added: a new entry module (outside the tsconfig include) that imports a kept file.
  write('pages/second.ts', PAGE);
  let discovery = withGuides('pages/second.ts');
  const added = await next(program, [{ kind: 'create', path: at('pages/second.ts') }], {
    discovery,
  });
  expect(added.path).toMatchObject({ path: 'patched', files: [] });
  expect(added.outcome).toEqual({ outcome: 'patched' });
  program = added.service.retain() as RetainedProgram;
  expect(program.project).toBe((added.retention.previous as RetainedProgram).project);
  expect(program.mirror.roots).toContain(at('pages/second.ts'));
  await expectCold(program, added.result, discovery);
  // Moved: the module leaves its folder, together with an edit of a kept file.
  mkdirSync(at('pages/moved'));
  renameSync(at('pages/second.ts'), at('pages/moved/second.ts'));
  write('pages/moved/second.ts', PAGE.replace("'../base'", "'../../base'"));
  write('base.ts', '/** Moved base summary. */\nexport interface Base { base: string }');
  discovery = withGuides('pages/moved/second.ts');
  const moved = await next(
    program,
    [
      { kind: 'delete', path: at('pages/second.ts') },
      { kind: 'create', path: at('pages/moved') },
      update('base.ts'),
    ],
    { discovery },
  );
  expect(moved.path).toMatchObject({ path: 'patched', files: [at('base.ts')] });
  program = moved.service.retain() as RetainedProgram;
  expect(program.mirror.roots).not.toContain(at('pages/second.ts'));
  await expectCold(program, moved.result, discovery);
  // Removed: the module is deleted with its folder; nothing else imports it.
  rmSync(at('pages/moved'), { recursive: true });
  const removed = await next(program, [{ kind: 'delete', path: at('pages/moved') }]);
  expect(removed.path).toMatchObject({ path: 'patched', files: [] });
  program = removed.service.retain() as RetainedProgram;
  await expectCold(program, removed.result);
  // Nothing changed since: reused as it is.
  await pause(120);
  expect((await next(program)).path?.path).toBe('reused');
});

test('an API scope file added and deleted is applied to the retained program, as cold', async () => {
  let program = await retained();
  write(
    'public-extra.ts',
    "import { Base } from './base';\n/** Extra summary. */\nexport class Extra implements Base { base = ''; }",
  );
  const created = await next(program, [{ kind: 'create', path: at('public-extra.ts') }]);
  expect(created.path).toMatchObject({ path: 'patched', files: [] });
  program = created.service.retain() as RetainedProgram;
  await expectCold(program, created.result);
  expect(program.scopes.get('api:public')).toContain(at('public-extra.ts'));
  expect(JSON.stringify(created.service.enumerateApi('api').value)).toContain('Extra');
  // The scope's exclude changes (a discovery input of the program): the file leaves the scope.
  const excluded = snapshot();
  (excluded.entries[0] as ApiDescriptor).scopes[0].exclude = ['public-extra.ts'];
  const narrowed = await next(program, [], { discovery: excluded });
  expect(narrowed.path).toMatchObject({ path: 'patched' });
  program = narrowed.service.retain() as RetainedProgram;
  await expectCold(program, narrowed.result, excluded);
  // Back in scope, then deleted.
  const widened = await next(program);
  program = widened.service.retain() as RetainedProgram;
  await expectCold(program, widened.result);
  rmSync(at('public-extra.ts'));
  const deleted = await next(program, [{ kind: 'delete', path: at('public-extra.ts') }]);
  expect(deleted.path).toMatchObject({ path: 'patched', files: [] });
  program = deleted.service.retain() as RetainedProgram;
  await expectCold(program, deleted.result);
  expect(JSON.stringify(deleted.service.enumerateApi('api').value)).not.toContain('Extra');
});

test('an edit whose imports changed restructures the program, as cold', async () => {
  const first = await retained();
  write('helper.ts', 'export const helper = 1;');
  write('base.ts', "import './helper';\nexport interface Base { base: string }");
  const patched = await next(first, [update('base.ts'), { kind: 'create', path: at('helper.ts') }]);
  expect(patched.path).toMatchObject({ path: 'patched', files: [at('base.ts')] });
  await expectCold(patched.service.retain() as RetainedProgram, patched.result);
});

test('a root change the program cannot take synchronizes anew; verify compares it with cold', async () => {
  // A new entry module with a syntax error: the cold diagnostic, and the Project is not kept.
  let first = await retained();
  write('pages/broken.ts', 'const Page = {; export default Page;');
  let discovery = withGuides('pages/broken.ts');
  const broken = await next(first, [], { discovery });
  expect(broken.path).toEqual({
    path: 'full',
    reason: expect.stringContaining('patch refused: syntax errors'),
  });
  expect(broken.retention.previous).toBeUndefined();
  expect(broken.result).toEqual((await cold(discovery)).result);
  rmSync(at('pages/broken.ts'));
  // A new entry that is a script (global declarations reach every file).
  first = await retained();
  write('pages/script.ts', 'declare const global: number;');
  discovery = withGuides('pages/script.ts');
  expect((await next(first, [], { discovery })).path).toEqual({
    path: 'full',
    reason: expect.stringContaining('a script after the edit'),
  });
  rmSync(at('pages/script.ts'));
  // A new file a kept file's resolution probed (its resolution may change).
  first = await retained();
  write('pages/second.ts', "import { late } from './late';\nexport default late;");
  await pause(120);
  first = (
    await next(first, [], { discovery: withGuides('pages/second.ts') })
  ).service.retain() as RetainedProgram;
  write('pages/late.ts', 'export const late = 1;');
  expect(
    (
      await next(first, [{ kind: 'create', path: at('pages/late.ts') }], {
        discovery: withGuides('pages/second.ts'),
      })
    ).path,
  ).toMatchObject({ path: 'full', reason: expect.stringContaining('late.ts') });
  // verify: a restructured program equal to cold is kept.
  first = await retained();
  write('public-verified.ts', 'export const verified = 1;');
  const verified = await next(first, [{ kind: 'create', path: at('public-verified.ts') }], {
    mode: 'verify',
  });
  expect(verified.path).toMatchObject({ path: 'patched' });
  expect(verified.result.diagnostics).toEqual([]);
  await expectCold(verified.service.retain() as RetainedProgram, verified.result);
});
