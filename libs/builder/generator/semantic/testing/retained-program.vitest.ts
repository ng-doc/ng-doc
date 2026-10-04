import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, test } from 'vitest';

import type {
  ApiDescriptor,
  DiscoverySnapshot,
  FileChange,
  GuideDescriptor,
} from '../../contracts';
import { CONFLICTING_CONTENT_DIGEST } from '../../graph';
import { TrackedFiles } from '../dependencies';
import {
  type RetainedSemanticState,
  type SemanticServiceImpl,
  createSemanticService,
} from '../semantic-service';
import { hostPath, join } from './engine-paths';

// A synchronization made for retention can hand its Project to the next generation's service,
// which reuses it only when nothing the program observed changed.

let directory: string;
const services: SemanticServiceImpl[] = [];
const write = (path: string, text: string) => {
  mkdirSync(join(directory, path, '..'), { recursive: true });
  writeFileSync(join(directory, path), text);
  return join(directory, path);
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function snapshot(): DiscoverySnapshot {
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
          { id: 'public', name: 'Public', route: 'public', include: ['public*.ts'], exclude: [] },
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

beforeEach(async () => {
  directory = hostPath(realpathSync(mkdtempSync(join(tmpdir(), 'semantic-retained-'))));
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true },
      include: ['*.ts'],
    }),
  );
  write('entry.ts', '/** Guide summary. */\nconst Page = {}; export default Page;');
  write('public.ts', 'export interface First { value: string }');
  // Everything written so far settles past the stat margin before the first observation.
  await pause(120);
});
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose();
  rmSync(directory, { recursive: true, force: true });
});

function service(options: { incrementalProgram?: 'off' } = {}): SemanticServiceImpl {
  const created = createSemanticService({ dependencyMode: 'scope-reference', ...options });
  services.push(created);
  return created;
}

async function retainedFrom(
  discovery: DiscoverySnapshot = snapshot(),
): Promise<RetainedSemanticState> {
  const first = service();
  const result = await first.synchronize(
    { generation: 1, discovery, changes: [], retention: {} },
    new AbortController().signal,
  );
  expect(result.diagnostics).toEqual([]);
  expect(first.synchronization()).toEqual({ path: 'full', reason: 'no retained program' });
  const retained = first.retain();
  expect(retained).toBeDefined();
  return retained!;
}

async function next(
  previous: RetainedSemanticState,
  changes: FileChange[] = [],
  discovery: DiscoverySnapshot = snapshot(),
  signal: AbortSignal = new AbortController().signal,
  options: { incrementalProgram?: 'off' } = {},
) {
  const second = service(options);
  const retention = { previous };
  const result = await second.synchronize({ generation: 2, discovery, changes, retention }, signal);
  return { second, result, path: second.synchronization(), retention };
}

test('an unchanged program is reused with identical observations and serves queries of the new discovery', async () => {
  const cold = service();
  expect(cold.programSynchronization()).toBeUndefined();
  const coldResult = await cold.synchronize(
    { generation: 1, discovery: snapshot(), changes: [] },
    new AbortController().signal,
  );
  expect(cold.synchronization()).toEqual({ path: 'full', reason: 'retention off' });
  expect(cold.programSynchronization()).toEqual({ outcome: 'full', reason: 'retention off' });
  expect(cold.retain()).toBeUndefined();
  const retained = await retainedFrom();
  const markdown = write('index.md', '# Edited guide');
  const { second, result, path } = await next(retained, [{ kind: 'update', path: markdown }]);
  expect(path).toMatchObject({ path: 'reused', rehashed: 0 });
  expect(second.programSynchronization()).toEqual({ outcome: 'reused' });
  expect(result).toEqual(coldResult);
  // A query of the new generation (another entry title) runs on the retained Project.
  const discovery = snapshot();
  (discovery.entries[0] as ApiDescriptor).title = 'Renamed reference';
  const renamed = await next(second.retain()!, [], discovery);
  expect(renamed.path?.path).toBe('reused');
  const enumerated = renamed.second.enumerateApi('api');
  expect(enumerated.value?.map((item) => item.breadcrumbs)).toEqual([
    ['Renamed reference', 'Public', 'First'],
  ]);
  expect(renamed.second.inspect()).toEqual({ projects: 1, declarations: 1 });
});

test('program configuration, observed inputs, glob membership, discovery inputs and the stat sweep force a rebuild (incremental program off)', async () => {
  // With the incremental program on, the program-file cases patch instead (program-patch.vitest.ts).
  const rebuild = (
    previous: RetainedSemanticState,
    changes: FileChange[] = [],
    discovery = snapshot(),
  ) => next(previous, changes, discovery, undefined, { incrementalProgram: 'off' });
  const cases: Array<[string, (previous: RetainedSemanticState) => ReturnType<typeof next>]> = [
    [
      'program configuration update: ',
      (previous) => rebuild(previous, [{ kind: 'update', path: join(directory, 'tsconfig.json') }]),
    ],
    [
      'program configuration create: ',
      (previous) =>
        rebuild(previous, [{ kind: 'create', path: join(directory, 'lib/package.json') }]),
    ],
    [
      'update of observed input',
      (previous) => rebuild(previous, [{ kind: 'update', path: join(directory, 'public.ts') }]),
    ],
    [
      'changes membership of glob',
      (previous) =>
        rebuild(previous, [
          { kind: 'create', path: write('public-extra.ts', 'export const extra = 1;') },
        ]),
    ],
    [
      'discovery inputs of the program changed',
      (previous) => {
        const discovery = snapshot();
        (discovery.entries[0] as ApiDescriptor).scopes[0].exclude = ['public-hidden.ts'];
        return rebuild(previous, [], discovery);
      },
    ],
    [
      'content observation changed: ',
      (previous) => {
        write('public.ts', 'export interface First { value: number }');
        return rebuild(previous, []);
      },
    ],
  ];
  for (const [reason, run] of cases) {
    const retained = await retainedFrom();
    const { second, result, path, retention } = await run(retained);
    // The stale program is released before its replacement is built.
    expect(retention.previous).toBeUndefined();
    expect(second.programSynchronization()).toEqual({
      outcome: 'full',
      reason: path?.path === 'full' ? path.reason : undefined,
    });
    expect({ reason, path: path?.path, diagnostics: result.diagnostics }).toEqual({
      reason,
      path: 'full',
      diagnostics: [],
    });
    expect(path?.path === 'full' && path.reason).toContain(reason);
    // Restore the tree for the next case.
    write('public.ts', 'export interface First { value: string }');
    rmSync(join(directory, 'public-extra.ts'), { force: true });
    await pause(120);
  }
});

test('inputs no event reports: a package installed into a missing directory, a new automatic @types package (FULL), a missed API file (a root change)', async () => {
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true, types: ['*'] },
      include: ['*.ts'],
    }),
  );
  write(
    'public.ts',
    "import { pkg } from 'newpkg';\nexport interface First { value: string }\nexport const made = pkg;",
  );
  write('node_modules/.keep', '');
  write('node_modules/@types/existing/index.d.ts', 'declare type Existing = 1;');
  await pause(120);
  const cases: Array<[string, () => void]> = [
    [
      'directory appeared: ' + join(directory, 'node_modules/newpkg'),
      () => write('node_modules/newpkg/index.d.ts', 'export declare const pkg: 1;'),
    ],
    [
      'directory listing changed: ' + join(directory, 'node_modules/@types'),
      () => write('node_modules/@types/ambient/index.d.ts', 'declare type Ambient = 2;'),
    ],
    // A missed API file (it also joins the tsconfig include): no listing verifies any more, but
    // the root membership is observed again, so the program takes it as a root change (below).
    ['restructured', () => write('public-late.ts', 'export const late = 1;')],
  ];
  for (const [reason, mutate] of cases) {
    const cold = service();
    const coldResult = await cold.synchronize(
      { generation: 1, discovery: snapshot(), changes: [] },
      new AbortController().signal,
    );
    const retained = await retainedFrom();
    // The private observations are not published: a reuse returns exactly the cold dependencies.
    const unchanged = await next(retained);
    expect(unchanged.path?.path).toBe('reused');
    expect(unchanged.result).toEqual(coldResult);
    mutate();
    const { path, result } = await next(unchanged.second.retain()!);
    if (reason === 'restructured') {
      expect(path).toMatchObject({ path: 'patched', files: [] });
      const reference = await service().synchronize(
        { generation: 1, discovery: snapshot(), changes: [] },
        new AbortController().signal,
      );
      expect(result).toEqual(reference);
    } else expect(path).toEqual({ path: 'full', reason });
    rmSync(join(directory, 'node_modules/newpkg'), { recursive: true, force: true });
    rmSync(join(directory, 'node_modules/@types/ambient'), { recursive: true, force: true });
    rmSync(join(directory, 'public-late.ts'), { force: true });
    await pause(120);
  }
});

test('a file that resolution probed as a directory does not count as a missing directory that appeared', async () => {
  // A JavaScript-only package: its `main` file is tried as a TypeScript file, then as a directory
  // (directoryExists on lib/index.js, which is a file). apps/ng-doc has such packages (@babel/core).
  write('node_modules/jsonly/package.json', '{ "name": "jsonly", "main": "lib/index.js" }');
  write('node_modules/jsonly/lib/index.js', 'exports.value = 1;');
  write(
    'public.ts',
    "import { value } from 'jsonly';\nexport interface First { value: string }\nexport const v = value;",
  );
  await pause(120);
  const retained = await retainedFrom();
  expect((await next(retained)).path?.path).toBe('reused');
});

test('an explicitly named types package installed later and a retargeted package symlink rebuild', async () => {
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true, types: ['later'] },
      include: ['*.ts'],
    }),
  );
  write('node_modules/@types/.keep', '');
  write('packages/a/package.json', '{ "name": "linked", "types": "index.d.ts" }');
  write('packages/a/index.d.ts', 'export declare const linked: 1;');
  write('packages/b/package.json', '{ "name": "linked", "types": "index.d.ts" }');
  write('packages/b/index.d.ts', 'export declare const linked: 2;');
  symlinkSync(join(directory, 'packages/a'), join(directory, 'node_modules/linked'), 'dir');
  write(
    'public.ts',
    "import { linked } from 'linked';\nexport interface First { value: string }\nexport const l = linked;",
  );
  await pause(120);
  const first = await retainedFrom();
  const unchanged = await next(first);
  expect(unchanged.path?.path).toBe('reused');
  write('node_modules/@types/later/index.d.ts', 'declare const later: 1;');
  expect((await next(unchanged.second.retain()!)).path).toEqual({
    path: 'full',
    reason: 'directory appeared: ' + join(directory, 'node_modules/@types/later'),
  });
  rmSync(join(directory, 'node_modules/@types/later'), { recursive: true });
  await pause(120);
  const second = await retainedFrom();
  unlinkSync(join(directory, 'node_modules/linked'));
  symlinkSync(join(directory, 'packages/b'), join(directory, 'node_modules/linked'), 'dir');
  expect((await next(second)).path).toEqual({
    path: 'full',
    reason: expect.stringContaining(
      'symlink retargeted: ' + join(directory, 'node_modules/linked'),
    ),
  });
});

test('a type root is not listed when the program names its types', async () => {
  write('node_modules/@types/existing/index.d.ts', 'declare type Existing = 1;');
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true, types: [] },
      include: ['*.ts'],
    }),
  );
  await pause(120);
  const retained = await retainedFrom();
  write('node_modules/@types/ambient/index.d.ts', 'declare type Ambient = 2;');
  expect((await next(retained)).path?.path).toBe('reused');
});

test('an existence observation that changed without an event is found by the sweep', async () => {
  const retained = await retainedFrom();
  // The prettier/editorconfig probes of the workspace are existence observations.
  write('.editorconfig', 'root = true');
  const { path } = await next(retained, []);
  expect(path).toMatchObject({
    path: 'full',
    reason: expect.stringContaining('existence observation changed'),
  });
});

test('a reused synchronization honours abort and supersession; a failed one returns the retained observations', async () => {
  const retained = await retainedFrom();
  const controller = new AbortController();
  controller.abort();
  const aborted = await next(retained, [], snapshot(), controller.signal);
  expect(aborted.result.diagnostics.map((item) => item.code)).toEqual(['SEMANTIC_CANCELLED']);
  expect(aborted.result.dependencies.length).toBeGreaterThan(0);
  expect(aborted.second.retain()).toBeUndefined();
  // Superseded by a newer synchronize of the same service while yielding.
  const racing = service();
  const first = racing.synchronize(
    {
      generation: 2,
      discovery: snapshot(),
      changes: [],
      retention: { previous: retained },
    },
    new AbortController().signal,
  );
  const second = racing.synchronize(
    {
      generation: 3,
      discovery: snapshot(),
      changes: [],
      retention: { previous: retained },
    },
    new AbortController().signal,
  );
  expect((await first).diagnostics.map((item) => item.code)).toEqual(['SEMANTIC_SUPERSEDED']);
  expect((await second).diagnostics).toEqual([]);
  expect(racing.synchronization()?.path).toBe('reused');
});

test('a Project changed by a query, a disposed service and a failed synchronization are never retained', async () => {
  write('outside/extra.ts', '/** Outside. */ export class Outside {}');
  await pause(120);
  const retained = await retainedFrom();
  const { second } = await next(retained, []);
  expect(second.retain()).toBeDefined();
  const fragment = second.renderFragment({
    kind: 'js-doc',
    entryId: 'guide',
    declarationPath: 'outside/extra.ts#Outside',
  });
  expect(fragment.diagnostics).toEqual([]);
  expect(second.retain()).toBeUndefined();
  const disposed = service();
  await disposed.synchronize(
    { generation: 1, discovery: snapshot(), changes: [], retention: {} },
    new AbortController().signal,
  );
  await disposed.dispose();
  expect(disposed.retain()).toBeUndefined();
  write('tsconfig.json', '{ "compilerOptions": ');
  const failed = service();
  const result = await failed.synchronize(
    { generation: 1, discovery: snapshot(), changes: [], retention: {} },
    new AbortController().signal,
  );
  expect(result.diagnostics.map((item) => item.code)).toEqual(['SEMANTIC_CONFIG']);
  expect(failed.retain()).toBeUndefined();
});

test('a retained state this service did not make is never reused (checked, not cast)', async () => {
  const foreign = { retained: true } as RetainedSemanticState;
  const { result, path, retention } = await next(foreign, []);
  expect(result.diagnostics).toEqual([]);
  expect(path).toEqual({
    path: 'full',
    reason: 'the retained state is not a program of this service',
  });
  expect(retention.previous).toBeUndefined();
  // A retained program is an instance of the service's own class, reused as before.
  const { path: reused } = await next(await retainedFrom(), []);
  expect(reused?.path).toBe('reused');
});

test('a file written while the program was observed is unverifiable: the next generation re-reads it', async () => {
  for (const options of [{ incrementalProgram: 'off' as const }, {}]) {
    const first = service();
    // Write the file right before (within the stat margin of) the observation.
    write('public.ts', 'export interface First { value: boolean }');
    await first.synchronize(
      { generation: 1, discovery: snapshot(), changes: [], retention: {} },
      new AbortController().signal,
    );
    const { path } = await next(first.retain()!, [], snapshot(), undefined, options);
    // Rebuilt without the incremental program; re-read and re-checked as a patch with it.
    expect(path).toMatchObject(
      options.incrementalProgram
        ? { path: 'full', reason: expect.stringContaining('public.ts') }
        : { path: 'patched', files: [join(directory, 'public.ts')] },
    );
  }
});

test('TrackedFiles records two reads of one path with different bytes as conflicting', () => {
  const file = write('twice.md', 'A');
  const files = new TrackedFiles();
  files.read(file);
  write('twice.md', 'B');
  files.read(file);
  write('twice.md', 'A');
  files.read(file);
  expect(files.all().find((item) => item.kind === 'content')).toEqual({
    kind: 'content',
    path: file,
    digest: CONFLICTING_CONTENT_DIGEST,
  });
  const same = new TrackedFiles();
  same.read(file);
  same.read(file);
  expect(same.all().find((item) => item.kind === 'content')).not.toMatchObject({
    digest: CONFLICTING_CONTENT_DIGEST,
  });
});
