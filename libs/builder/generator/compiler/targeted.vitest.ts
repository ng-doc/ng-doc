import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import type { CompilationRequest, Dependency, EntryDescriptor, PageArtifact } from '../contracts';
import { stampOf } from '../graph';
import { UnitIndex } from '../graph/unit-index';
import type { CompilationOptions } from './index';
import type { CommittedGeneration, GenerationRetention } from './retention';
import { type Observation, type RetainedBuild, TargetedGeneration, targetedMode } from './targeted';

// The targeted rebuild's start of a generation, before discovery: the preconditions, and the
// effective change set (the request's changes, the changes of earlier generations against the
// same base that did not commit, and what the stat sweep of the base's observations finds).

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const content = (file: string): Dependency => ({ kind: 'content', path: file, digest: 'd' });

function site() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-targeted-')));
  roots.push(root);
  const file = (name: string) => {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, name);
    return target;
  };
  const files = {
    page: file('docs/a/ng-doc.page.ts'),
    md: file('docs/a/index.md'),
    include: file('docs/include.md'),
    missing: path.join(root, 'docs/missing.md'),
    directory: path.join(root, 'docs/a'),
    unrecorded: file('docs/unrecorded.md'),
    program: file('docs/a/helper.ts'),
  };
  const entry = {
    id: 'a',
    kind: 'guide',
    source: { path: files.page },
    title: 'A',
    route: 'a',
    absoluteRoute: 'a',
    breadcrumbs: ['A'],
    runtimeImport: { source: files.page, exportName: 'default' },
    dependencies: [content(files.page), content(files.md)],
    markdown: [files.md],
    hasImports: false,
  } as unknown as EntryDescriptor;
  const artifact = {
    id: 'A',
    identity: { projectId: 'p', entryId: 'a', role: 'page-shell' },
    revision: 'r',
    fingerprint: {},
    dependencies: [
      content(files.md),
      content(files.include),
      content(files.page),
      content(files.program),
      { kind: 'existence', path: files.missing, exists: false },
    ],
    content: [],
    exportedKeywords: [],
    usedKeywords: [],
    searchRecords: [],
    routes: [],
    apiList: [],
    outputs: [],
    diagnostics: [],
  } as unknown as PageArtifact;
  const index = UnitIndex.build({
    configurationDigest: 'cfg',
    entries: [entry],
    discovery: [content(files.page)],
    templates: [],
    keywords: [],
    artifacts: [
      artifact,
      {
        ...artifact,
        id: 'aggregate',
        identity: { projectId: 'p', entryId: 'p', role: 'aggregate' },
        dependencies: [content(files.page), content(files.program)],
      } as PageArtifact,
    ],
  });
  const build = (observations: RetainedBuild['observations']): RetainedBuild => ({
    units: [],
    byEntry: new Map(),
    guideValues: new Map(),
    observations,
    globs: [],
    facts: {
      configuration: '',
      order: '',
      filtered: '',
      globalKeywords: '',
      remoteKeywords: '',
      templates: '',
    },
    remoteKeywords: [],
  });
  return { files, index, build };
}

const options = (targetedRebuild?: CompilationOptions['targetedRebuild']): CompilationOptions =>
  ({ projectId: 'p', ...(targetedRebuild !== undefined ? { targetedRebuild } : {}) }) as never;

const request = (changes: CompilationRequest['changes'] = []): CompilationRequest => ({
  generation: 2,
  mode: 'development',
  changes,
  previous: { revision: 'base' } as never,
  contentRequest: { origin: 'filesystem' },
});

const retention = (committed?: CommittedGeneration, retaining = true) =>
  ({ retaining, committed: () => committed }) as unknown as GenerationRetention;

const start = (
  committed: CommittedGeneration | undefined,
  changes: CompilationRequest['changes'] = [],
  extra: {
    options?: CompilationOptions;
    request?: Partial<CompilationRequest>;
    lifetime?: 'watch' | 'generation';
  } = {},
) =>
  TargetedGeneration.start(
    extra.options ?? options(),
    { ...request(changes), ...extra.request },
    { lifetime: extra.lifetime ?? 'watch' },
    retention(committed),
    BigInt(Date.now()) * 1_000_000n,
  );

test('the mode: on by default, off for false, and verify', () => {
  expect(targetedMode(options())).toBe('on');
  expect(targetedMode(options(true))).toBe('on');
  expect(targetedMode(options(false))).toBeUndefined();
  expect(targetedMode(options('verify'))).toBe('verify');
  // Off, or a generation that retains nothing: no targeted state at all.
  expect(
    TargetedGeneration.start(options(false), request(), { lifetime: 'watch' }, retention(), 0n),
  ).toBeUndefined();
  expect(
    TargetedGeneration.start(
      options(),
      request(),
      { lifetime: 'watch' },
      retention(undefined, false),
      0n,
    ),
  ).toBeUndefined();
});

test('preconditions send the generation FULL, with the first failed one as the reason', () => {
  const { index, build, files } = site();
  const committed = { index, build: build(new Map()), pending: [] };
  const change = [{ kind: 'update' as const, path: files.md }];
  expect(start(committed, change, { lifetime: 'generation' })?.facts.reason).toBe(
    'not a watch generation',
  );
  expect(
    start(committed, change, { request: { contentRequest: { origin: 'reconcile' } } })?.facts
      .reason,
  ).toBe('origin reconcile');
  expect(start(undefined, change)?.facts.reason).toBe('no committed index for this base');
  expect(start({ index, pending: [] }, change)?.facts.reason).toBe(
    'no retained build for this base',
  );
  // No change at all (nothing reported, pending or swept) is FULL as well.
  const idle = start(committed, []);
  expect(idle?.facts.reason).toBe('no changes');
  expect(idle?.eligible).toBe(false);
  const edit = start(committed, change)!;
  expect(edit.eligible).toBe(true);
  expect([...edit.candidates]).toEqual(['A']);
});

test('the changes of generations against the same base that did not commit join the change set', () => {
  const { index, build, files } = site();
  // Every observation still holds, so the sweep finds nothing: only the pending change reaches
  // the include's owner.
  const observations = new Map<string, Observation>([
    [files.md, stampOf(files.md)!],
    [files.include, stampOf(files.include)!],
    [files.missing, 'missing'],
  ]);
  const committed = {
    index,
    build: build(observations),
    pending: [{ kind: 'update' as const, path: files.include }],
  };
  const targeted = start(committed, [{ kind: 'update', path: files.md }])!;
  expect(targeted.facts.pending).toBe(1);
  expect(targeted.facts.swept).toEqual([]);
  expect(targeted.facts.pass?.classes.map((item) => item.path)).toEqual([files.md, files.include]);
  expect(targeted.eligible).toBe(true);
});

test('the stat sweep reports what changed since the base observed it, and only recorded paths', () => {
  const { index, build, files } = site();
  const stale = { ...stampOf(files.include)!, size: 1n };
  const committed = {
    index,
    build: build(
      new Map<string, Observation>([
        [files.md, 'unverifiable'],
        [files.include, stale],
        [files.missing, 'missing'],
        [files.directory, 'present'],
        [files.unrecorded, 'unverifiable'],
      ]),
    ),
    pending: [],
  };
  // The missing file appears: its existence changed.
  writeFileSync(files.missing, 'now it exists');
  const targeted = start(committed, [])!;
  expect(targeted.facts.swept).toEqual([files.md, files.include, files.missing].sort());
  expect(targeted.eligible).toBe(true);
});

test('page module and program edits: eligible while the generation records semantic closures', () => {
  const { index, build, files } = site();
  const committed = { index, build: build(new Map()), pending: [] };
  const scoped = options();
  const unscoped = { ...options(), scopedSemantic: false } as CompilationOptions;
  // A page module (also a program input) and a program file a unit read: their units are
  // candidates, and the keyword loaders keep their last results.
  for (const file of [files.page, files.program]) {
    const edit = start(committed, [{ kind: 'update', path: file }], { options: scoped })!;
    expect(edit.eligible).toBe(true);
    expect([...edit.candidates]).toEqual(['A']);
    expect(edit.facts.pass?.pin).toBe(true);
  }
  expect(
    start(committed, [{ kind: 'update', path: files.page }], { options: unscoped })?.facts.reason,
  ).toBe(`entry: evaluated description module (${files.page})`);
  expect(
    start(committed, [{ kind: 'update', path: files.program }], { options: unscoped })?.facts
      .reason,
  ).toBe(`semantic: program input (${files.program})`);
  // A production request records no closures either.
  expect(
    start(committed, [{ kind: 'update', path: files.program }], { request: { mode: 'production' } })
      ?.facts.reason,
  ).toBe(`semantic: program input (${files.program})`);
});
