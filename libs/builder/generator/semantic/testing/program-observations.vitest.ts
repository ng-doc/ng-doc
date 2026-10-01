import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project } from 'ts-morph';
import { afterEach, beforeEach, expect, test } from 'vitest';

import type { ApiDescriptor, DiscoverySnapshot, GuideDescriptor } from '../../contracts';
import { TrackedFiles } from '../dependencies';
import { OwnedRoots } from '../owned-roots';
import { ProgramObservations, trackProgram } from '../program-observations';
import { type RetainedSemanticState, RetainedProgram } from '../program-state';
import { type SemanticServiceImpl, createSemanticService } from '../semantic-service';

// Per-importer program tracking, the shared program mirror, and re-tracking.

let directory: string;
const services: SemanticServiceImpl[] = [];
const write = (path: string, text: string) => {
  mkdirSync(join(directory, path, '..'), { recursive: true });
  writeFileSync(join(directory, path), text);
  return join(directory, path);
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (path: string) => join(directory, path);

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

beforeEach(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'semantic-observations-')));
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { noLib: true, target: 'ES2022', strict: true, types: [] },
      include: ['*.ts'],
    }),
  );
  write('entry.ts', '/** Guide summary. */\nconst Page = {}; export default Page;');
  write(
    'public.ts',
    [
      // A triple-slash reference is a directive only in the file header.
      '/// <reference path="./ambient.ts" />',
      "import { Base } from './base';",
      "import { missing } from './missing';",
      "import { fromPackage } from 'pkg';",
      'export interface First extends Base { value: typeof missing; other: typeof fromPackage }',
    ].join('\n'),
  );
  write('base.ts', 'export interface Base { base: string }');
  write('ambient.ts', 'declare const ambient: number;');
  write('packages/pkg/index.ts', 'export const fromPackage = 1;');
  mkdirSync(at('node_modules'), { recursive: true });
  symlinkSync(at('packages/pkg'), at('node_modules/pkg'), 'dir');
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

async function synchronize(
  retention?: { previous?: RetainedSemanticState },
  options: { incrementalProgram?: 'off' } = {},
) {
  const created = service(options);
  const result = await created.synchronize(
    {
      generation: 1,
      discovery: snapshot(),
      changes: [],
      ...(retention ? { retention: { ...retention } } : {}),
    },
    new AbortController().signal,
  );
  expect(result.diagnostics).toEqual([]);
  return { service: created, result };
}

async function retained(previous?: RetainedSemanticState): Promise<RetainedProgram> {
  const { service: created } = await synchronize({ previous });
  const program = created.retain();
  expect(program).toBeInstanceOf(RetainedProgram);
  return program as RetainedProgram;
}

const withoutDefinition = (files: TrackedFiles) =>
  files.all().filter((dependency) => dependency.kind !== 'semantic');

test('every program file is tracked as its own importer, and the log replays the published aggregate', async () => {
  const { service: created, result } = await synchronize({});
  const program = created.retain() as RetainedProgram;
  const observations = program.mirror.observations;
  // The published dependencies are the aggregate, which carries the semantic definition last.
  expect(result.dependencies).toEqual(observations.files.all());
  expect(observations.semantic).toEqual(
    result.dependencies.find((dependency) => dependency.kind === 'semantic'),
  );
  const programFiles = program.project
    .getProgram()
    .compilerObject.getSourceFiles()
    .map((source) => source.fileName);
  expect(observations.importers()).toEqual(programFiles);
  expect(observations.importers()).toEqual(
    expect.arrayContaining([
      at('public.ts'),
      at('base.ts'),
      at('ambient.ts'),
      at('packages/pkg/index.ts'),
    ]),
  );
  const replayed = observations.replay();
  expect(replayed.files.all()).toEqual(withoutDefinition(observations.files));
  expect(replayed.probes).toEqual(observations.probes);
  // The watch was derived from the same aggregate probes.
  expect(program.watch.missingDirectories).toEqual([...observations.probes.missing].sort());
  expect(program.watch.realpaths).toEqual(
    [...observations.probes.realpaths].sort(([left], [right]) => (left < right ? -1 : 1)),
  );
});

test('an importer owns its content, its resolution probes and what each reference resolved to', async () => {
  const program = await retained();
  const observations = program.mirror.observations;
  const importer = observations.importer(at('public.ts'))!;
  expect(importer.path).toBe(at('public.ts'));
  expect(importer.dependencies.slice(0, 2)).toEqual([
    { kind: 'existence', path: at('public.ts'), exists: true },
    expect.objectContaining({ kind: 'content', path: at('public.ts') }),
  ]);
  // The failed candidates of the unresolved import belong to the importer that probed them.
  expect(importer.dependencies).toContainEqual({
    kind: 'existence',
    path: at('missing.ts'),
    exists: false,
  });
  expect(importer.imports).toEqual([
    { kind: 'module', specifier: './base', resolved: at('base.ts') },
    { kind: 'module', specifier: './missing' },
    { kind: 'module', specifier: 'pkg', resolved: at('packages/pkg/index.ts') },
    { kind: 'reference', specifier: './ambient.ts', resolved: at('ambient.ts') },
  ]);
  // The package symlink and the missing node_modules directories are this importer's probes.
  expect(importer.realpaths).toContainEqual([
    at('node_modules/pkg/index.ts'),
    at('packages/pkg/index.ts'),
  ]);
  expect(importer.missing.length).toBeGreaterThan(0);
  const base = observations.importer(at('base.ts'))!;
  expect(base.imports).toEqual([]);
  expect(base.missing).toEqual([]);
  expect(base.realpaths).toEqual([]);
  expect(base.dependencies.map((dependency) => dependency.kind)).toEqual(['existence', 'content']);
  // The reverse edges: who imports a file.
  expect(observations.importersOf(at('base.ts'))).toEqual([at('public.ts')]);
  expect(observations.importersOf(at('packages/pkg/index.ts'))).toEqual([at('public.ts')]);
  expect(observations.importersOf(at('ambient.ts'))).toEqual([at('public.ts')]);
  expect(observations.importersOf(at('missing.ts'))).toEqual([]);
  expect(observations.importer(at('missing.ts'))).toBeUndefined();
  // Global observations are nobody's: the tsconfig and entry reads, globs, formatter probes.
  for (const path of observations.importers())
    expect(
      observations
        .importer(path)!
        .dependencies.filter(
          (dependency) =>
            dependency.kind === 'glob' ||
            ('path' in dependency && dependency.path === at('tsconfig.json')),
        ),
    ).toEqual([]);
});

test('attributed tracking observes exactly what flat tracking of the same program does', async () => {
  const program = await retained();
  const flat = new TrackedFiles();
  trackProgram(program.project, flat, program.owned);
  const attributed = new TrackedFiles();
  for (const path of program.mirror.observations.importers())
    program.mirror.observations
      .importer(path)!
      .dependencies.forEach((dependency) => attributed.add(dependency));
  expect(attributed.all()).toEqual(flat.all());
});

test('a reused or patched program keeps its mirror; a full synchronization makes a new one', async () => {
  const first = await retained();
  expect(first.mirror.appliedSinceBase.size).toBe(0);
  expect(first.mirror.version).toBe(0);
  expect(first.files).toBe(first.mirror.observations.files);
  expect(first.watch).toBe(first.mirror.watch);
  const { service: second } = await synchronize({ previous: first });
  expect(second.synchronization()?.path).toBe('reused');
  const reused = second.retain() as RetainedProgram;
  expect(reused).not.toBe(first);
  // One mutable object shared by the committed and the working entry.
  expect(reused.mirror).toBe(first.mirror);
  expect(reused.files).toBe(first.files);
  expect(reused.project).toBe(first.project);
  write('base.ts', 'export interface Base { base: number }');
  await pause(120);
  const { service: third } = await synchronize({ previous: reused });
  expect(third.synchronization()?.path).toBe('patched');
  const patched = third.retain() as RetainedProgram;
  // The patch changed the shared Project and its mirror in place.
  expect(patched.mirror).toBe(first.mirror);
  expect(patched.mirror.version).toBe(1);
  expect(patched.mirror.appliedSinceBase.size).toBe(0);
  write('base.ts', 'export interface Base { base: boolean }');
  await pause(120);
  const { service: fourth } = await synchronize(
    { previous: patched },
    { incrementalProgram: 'off' },
  );
  expect(fourth.synchronization()?.path).toBe('full');
  const rebuilt = fourth.retain() as RetainedProgram;
  expect(rebuilt.mirror).not.toBe(first.mirror);
  expect(rebuilt.mirror.observations).not.toBe(first.mirror.observations);
});

test('re-tracking an entry file equals a cold synchronization: its global read takes the new digest', async () => {
  const program = await retained();
  const observations = program.mirror.observations;
  const entry = at('entry.ts');
  // The entry is read as a global observation before the program is tracked, and tracked as a
  // program file.
  expect(observations.global()).toContainEqual(
    expect.objectContaining({ kind: 'content', path: entry }),
  );
  expect(observations.importers()).toContain(entry);
  const edited = '/** Edited guide summary. */\nconst Page = {}; export default Page;';
  write('entry.ts', edited);
  program.project.getSourceFileOrThrow(entry).replaceWithText(edited);
  observations.retrack(program.project, [entry], program.owned);
  const { result: cold } = await synchronize();
  // No conflicting digest: exactly the cold observations and definition.
  expect(observations.files.all()).toEqual(cold.dependencies);
  expect(
    observations.files.all().find((item) => item.kind === 'content' && item.path === entry),
  ).toEqual(cold.dependencies.find((item) => item.kind === 'content' && item.path === entry));
  // The digest a caller applied is used as given.
  observations.retrack(program.project, [entry], program.owned, new Map([[entry, 'applied']]));
  expect(observations.global()).toContainEqual({ kind: 'content', path: entry, digest: 'applied' });
});

test('the observations through the program files are what a synchronization failing there reports', async () => {
  const program = await retained();
  const observations = program.mirror.observations;
  const through = observations.throughImporters();
  // No formatter probe (observed after the files) and no definition.
  expect(through.some((item) => item.kind === 'semantic')).toBe(false);
  expect(through.some((item) => 'path' in item && item.path.endsWith('/.editorconfig'))).toBe(
    false,
  );
  expect(through).toContainEqual(expect.objectContaining({ kind: 'content', path: at('base.ts') }));
  expect(new ProgramObservations().throughImporters()).toEqual([]);
  // A re-read that fails is a re-tracking failure.
  rmSync(at('entry.ts'));
  expect(() => observations.retrack(program.project, [at('entry.ts')], program.owned)).toThrow(
    expect.objectContaining({ code: 'SEMANTIC_RETRACK' }),
  );
});

test('re-tracking a patched file equals a cold synchronization of the edited tree', async () => {
  const program = await retained();
  const observations = program.mirror.observations;
  const before = observations.files.all();
  const definition = observations.semantic;
  // Unchanged: re-tracking reproduces the aggregate and the definition exactly.
  const again = observations.retrack(program.project, [at('base.ts')], program.owned);
  expect(again).toEqual(observations.importer(at('base.ts'))!.dependencies);
  expect(observations.files.all()).toEqual(before);
  expect(observations.semantic).toEqual(definition);
  // A content edit patched into the Project, then re-tracked: the result of a cold sync.
  const edited = 'export interface Base { base: number }';
  write('base.ts', edited);
  program.project.getSourceFileOrThrow(at('base.ts')).replaceWithText(edited);
  const retracked = observations.retrack(program.project, [at('base.ts')], program.owned);
  expect(retracked).toContainEqual(
    expect.objectContaining({ kind: 'content', path: at('base.ts') }),
  );
  const { result: cold } = await synchronize();
  expect(observations.files.all()).toEqual(cold.dependencies);
  expect(observations.semantic).not.toEqual(definition);
  expect(observations.semantic).toEqual(
    cold.dependencies.find((dependency) => dependency.kind === 'semantic'),
  );
  // The retained state reads the re-derived aggregate through the mirror.
  expect(program.files.all()).toEqual(cold.dependencies);
  expect(observations.replay().files.all()).toEqual(withoutDefinition(observations.files));
});

test('re-tracking follows a changed import into the reverse edges and the probes', async () => {
  const program = await retained();
  const observations = program.mirror.observations;
  expect(observations.importersOf(at('ambient.ts'))).toEqual([at('public.ts')]);
  const edited = "import './ambient';\nexport interface Base { base: string }";
  write('base.ts', edited);
  program.project.getSourceFileOrThrow(at('base.ts')).replaceWithText(edited);
  observations.retrack(program.project, [at('base.ts')], program.owned);
  expect(observations.importer(at('base.ts'))!.imports).toEqual([
    { kind: 'module', specifier: './ambient', resolved: at('ambient.ts') },
  ]);
  // In program order, like every importer list.
  expect(observations.importersOf(at('ambient.ts'))).toEqual(
    observations.importers().filter((path) => path === at('public.ts') || path === at('base.ts')),
  );
  expect(observations.importersOf(at('ambient.ts'))).toHaveLength(2);
  expect(observations.replay().probes).toEqual(observations.probes);
});

test('re-tracking refuses a file that is not a tracked program file', async () => {
  const program = await retained();
  expect(() =>
    program.mirror.observations.retrack(program.project, [at('missing.ts')], program.owned),
  ).toThrow(expect.objectContaining({ code: 'SEMANTIC_RETRACK' }));
  write('later.ts', 'export const later = 1;');
  program.project.addSourceFileAtPath(at('later.ts'));
  expect(() =>
    program.mirror.observations.retrack(program.project, [at('later.ts')], program.owned),
  ).toThrow(expect.objectContaining({ code: 'SEMANTIC_RETRACK' }));
});

test('observations without a definition re-track without deriving one', () => {
  const project = new Project({
    compilerOptions: { noLib: true, types: [] },
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFileAtPath(at('base.ts'));
  const owned = new OwnedRoots([at('output')]);
  const observations = new ProgramObservations();
  observations.track(project, owned);
  expect(observations.importers()).toEqual([at('base.ts')]);
  const before = observations.files.all();
  observations.retrack(project, [at('base.ts')], owned);
  expect(observations.semantic).toBeUndefined();
  expect(observations.files.all()).toEqual(before);
  // Owned program files are never tracked.
  const ownedFile = write('output/generated.ts', 'export const generated = 1;');
  project.addSourceFileAtPath(ownedFile);
  const fresh = new ProgramObservations();
  fresh.track(project, new OwnedRoots([at('output')]));
  expect(fresh.importers()).toEqual([at('base.ts')]);
  const flat = new TrackedFiles();
  trackProgram(project, flat, new OwnedRoots([at('output')]));
  expect(flat.all()).toEqual(fresh.files.all());
});
