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
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import type {
  Dependency,
  EntryDescriptor,
  GuideDescriptor,
  KeywordExport,
  PageArtifact,
} from '../contracts';
import { UnitIndex } from '../graph/unit-index';
import {
  affectedClosure,
  classifyChanges,
  classifyPath,
  dirty,
  discoveryChanges,
  keywordDiff,
} from './classify';
import { changedUnits } from './dry-run';

// The targeted rebuild's change classifier and affected closure, per class.

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const content = (file: string, digest = 'd'): Dependency => ({
  kind: 'content',
  path: file,
  digest,
});
const keyword = (key: string, title = key): KeywordExport => ({ key, title, path: `/${key}` });

function artifact(
  id: string,
  entryId: string,
  fields: Partial<PageArtifact> & { declarationId?: string } = {},
): PageArtifact {
  const { declarationId, ...rest } = fields;
  return {
    id,
    identity: {
      projectId: 'p',
      entryId,
      role: 'page-shell',
      ...(declarationId ? { declarationId } : {}),
    },
    revision: `${id}-1`,
    fingerprint: {
      schemaVersion: 4,
      compilerVersion: 'c',
      toolchainDigest: 't',
      configurationDigest: 'cfg',
      inputDigest: 'i',
      keywordDigest: 'k',
    },
    dependencies: [],
    content: [],
    exportedKeywords: [],
    usedKeywords: [],
    searchRecords: [],
    routes: [],
    apiList: [],
    outputs: [],
    diagnostics: [],
    ...rest,
  };
}

function guide(
  id: string,
  source: string,
  markdown: string[],
  dependencies: Dependency[],
): GuideDescriptor {
  return {
    id,
    kind: 'guide',
    source: { path: source },
    title: id,
    route: id,
    absoluteRoute: id,
    breadcrumbs: [id],
    runtimeImport: { source, exportName: 'default' },
    dependencies,
    markdown,
    hasImports: false,
  };
}

function site() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-classify-')));
  roots.push(root);
  const file = (name: string, text = name) => {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
    return target;
  };
  const files = {
    config: file('ng-doc.config.ts'),
    tsconfig: file('tsconfig.json'),
    pageA: file('docs/a/ng-doc.page.ts'),
    pageB: file('docs/b/ng-doc.page.ts'),
    mdA: file('docs/a/index.md'),
    mdB: file('docs/b/index.md'),
    include: file('docs/include.md'),
    api: file('docs/api.ts'),
    snippet: file('docs/a/snippet.ts'),
    shared: file('docs/shared.json'),
    both: file('docs/both.ts'),
    header: file('header.html'),
    program: file('docs/a/helper.ts'),
  };
  const entries: EntryDescriptor[] = [
    guide(
      'a',
      files.pageA,
      [files.mdA],
      [content(files.pageA), content(files.mdA, 'a1'), content(files.shared), content(files.both)],
    ),
    guide('b', files.pageB, [files.mdB], [content(files.pageB), content(files.mdB, 'b1')]),
    {
      ...guide('api', file('docs/ng-doc.api.ts'), [], []),
      kind: 'api',
      scopes: [],
    } as unknown as EntryDescriptor,
  ];
  const artifacts = [
    artifact('A', 'a', {
      dependencies: [
        content(files.mdA),
        content(files.include),
        content(files.snippet),
        content(files.pageA),
        content(files.program),
      ],
      exportedKeywords: [keyword('*A')],
      usedKeywords: ['*B'],
    }),
    artifact('B', 'b', {
      dependencies: [content(files.mdB), content(files.include)],
      exportedKeywords: [keyword('*B')],
    }),
    artifact('D', 'api', { declarationId: 'decl', dependencies: [content(files.snippet)] }),
    artifact('G', 'api', { dependencies: [] }),
    artifact('agg', 'p', {
      identity: { projectId: 'p', entryId: 'p', role: 'aggregate' },
      dependencies: [
        content(files.api),
        content(files.both),
        content(files.program),
        {
          kind: 'glob',
          root: path.join(root, 'docs'),
          include: ['api*.ts'],
          exclude: [],
          members: [files.api],
        },
      ],
    }),
  ];
  const keywords = [keyword('*A'), keyword('*B')];
  const index = UnitIndex.build({
    configurationDigest: 'cfg',
    entries,
    headerTemplate: files.header,
    discovery: [
      content(files.config),
      content(files.header),
      content(files.pageA),
      content(files.pageB),
      content(files.mdA),
      content(files.mdB),
      content(files.shared),
      content(files.both),
      {
        kind: 'glob',
        root: path.join(root, 'docs'),
        include: ['**/ng-doc.page.ts'],
        exclude: [],
        members: [files.pageA, files.pageB],
      },
    ],
    templates: [],
    keywords,
    artifacts,
  });
  return { root, file, files, entries, artifacts, keywords, index };
}

test('each class, by the current state of the file', () => {
  const s = site();
  const { index, files } = s;
  const cls = (file: string, kind: 'create' | 'update' | 'delete' = 'update') =>
    classifyPath(index, { kind, path: file });
  expect(cls(files.tsconfig)).toMatchObject({
    class: 'config-toolchain',
    detail: 'program configuration',
  });
  expect(cls(files.config)).toMatchObject({ class: 'config-toolchain', detail: 'configuration' });
  // A page module is evaluated again by discovery; the fresh-discovery check decides what changed.
  expect(cls(files.pageA)).toMatchObject({
    class: 'entry',
    detail: 'evaluated description module',
  });
  expect(cls(files.pageA).program).toBeUndefined();
  // An input of an entry's evaluated closure (a file its module imports) is an entry path too.
  expect(cls(files.shared)).toMatchObject({ class: 'entry', detail: 'evaluated entry input' });
  // A path that is both an evaluated entry input and a program input keeps both roles.
  expect(cls(files.both)).toMatchObject({
    class: 'entry',
    detail: 'evaluated entry input',
    program: true,
  });
  expect(cls(files.header)).toMatchObject({ class: 'config-toolchain', detail: 'header-template' });
  // Structural paths the structural class scopes: the entry set and the directories it lives in.
  expect(cls(s.file('docs/c/ng-doc.page.ts'), 'create')).toMatchObject({
    class: 'structural',
    scoped: true,
  });
  expect(cls(path.join(s.root, 'docs/a'), 'delete')).toMatchObject({
    class: 'structural',
    detail: expect.stringContaining('removes members of glob'),
    scoped: true,
  });
  expect(cls(path.join(s.root, 'docs/a'))).toMatchObject({
    class: 'structural',
    detail: 'ancestor directory of a recorded path',
    scoped: true,
  });
  expect(cls(files.api)).toMatchObject({
    class: 'semantic',
    detail: 'program input',
    program: true,
  });
  expect(cls(s.file('docs/api-new.ts'), 'create')).toMatchObject({
    class: 'semantic',
    detail: expect.stringContaining('changes membership'),
    scoped: true,
  });
  expect(cls(files.api).scoped).toBeUndefined();
  expect(cls(files.include)).toMatchObject({ class: 'content', detail: 'unit (present)' });
  expect(cls(files.mdA, 'delete')).toMatchObject({
    class: 'content',
    kind: 'delete',
    detail: 'observed+unit (present)',
  });
  expect(cls(s.file('notes.txt'), 'create')).toMatchObject({ class: 'unknown', scoped: true });
  expect(cls(files.include).scoped).toBeUndefined();
  // A deleted include stays content (its consumers re-render, as FULL does); a deleted guide
  // markdown file or description module is structural.
  unlinkSync(files.include);
  expect(cls(files.include, 'delete')).toMatchObject({ class: 'content', detail: 'unit (absent)' });
  unlinkSync(files.mdB);
  expect(cls(files.mdB, 'delete')).toMatchObject({
    class: 'structural',
    detail: 'observed markdown no longer exists',
    scoped: true,
  });
  unlinkSync(files.pageB);
  expect(cls(files.pageB, 'delete')).toMatchObject({
    class: 'structural',
    detail: 'description module no longer exists',
    scoped: true,
  });
  unlinkSync(files.shared);
  expect(cls(files.shared, 'delete')).toMatchObject({
    class: 'structural',
    detail: 'evaluated entry input no longer exists',
    scoped: true,
  });
  unlinkSync(files.program);
  expect(cls(files.program, 'delete')).toMatchObject({
    class: 'semantic',
    detail: 'program input no longer exists',
    scoped: true,
  });
});

test("a program input that is also a unit's content is semantic under every spelling of the path", () => {
  // The workspace is reached through a symlink, as with a linked checkout or macOS's `/var` and
  // `/private/var`: the program may record one spelling, a unit another, and the watcher may
  // report either. Checking content before the program, or matching the program role under one
  // spelling only, would take a program edit for a content-only edit.
  const real = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-classify-real-')));
  const outer = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-classify-link-')));
  roots.push(real, outer);
  const link = path.join(outer, 'workspace');
  symlinkSync(real, link, 'dir');
  mkdirSync(path.join(real, 'docs'), { recursive: true });
  const spellings = (name: string) => {
    writeFileSync(path.join(real, name), name);
    return { real: path.join(real, name), link: path.join(link, name) };
  };
  const byLink = spellings('docs/by-link.ts');
  const byReal = spellings('docs/by-real.ts');
  const aggregate = artifact('agg', 'p', {
    identity: { projectId: 'p', entryId: 'p', role: 'aggregate' },
    dependencies: [content(byLink.link), content(byReal.real)],
  });
  const unit = artifact('A', 'a', {
    // The unit records each file under the other spelling.
    dependencies: [content(byLink.real), content(byReal.link)],
  });
  const index = UnitIndex.build({
    configurationDigest: 'cfg',
    entries: [],
    discovery: [],
    templates: [],
    keywords: [],
    artifacts: [unit, aggregate],
  });
  for (const file of [byLink.link, byLink.real, byReal.link, byReal.real]) {
    expect(index.hits(file), file).toHaveLength(1);
    expect(classifyPath(index, { kind: 'update', path: file }), file).toMatchObject({
      class: 'semantic',
      detail: 'program input',
    });
  }
});

test('the path pass: candidates, API declarations, the threshold, preconditions and the pin decision', () => {
  const s = site();
  const { index, files } = s;
  const content = classifyChanges(index, [{ kind: 'update', path: files.include }]);
  expect(content).toMatchObject({ pin: true });
  expect(content.full).toBeUndefined();
  expect([...content.units].sort()).toEqual(['A', 'B']);
  // Two of four owners exceed 20 %, but a site this small stays under the unit floor.
  expect(content.threshold).toBeUndefined();
  // The unit share applies above the floor; the descriptor limit always.
  expect(dirty(2, 4, 2)).toBe(false);
  expect(dirty(9, 10, 9)).toBe(true);
  expect(dirty(9, 100, 9)).toBe(false);
  expect(dirty(21, 100, 21)).toBe(true);
  expect(dirty(1, 1000, 201)).toBe(true);
  // An API declaration is a candidate on its own (the targeted path describes it alone).
  const api = classifyChanges(index, [{ kind: 'update', path: files.snippet }]);
  expect(api.full).toBeUndefined();
  expect([...api.units]).toContain('D');
  expect(api.pin).toBe(true);
  const precondition = classifyChanges(
    index,
    [{ kind: 'update', path: files.mdA }],
    'origin reconcile',
  );
  expect(precondition).toMatchObject({ full: 'origin reconcile', pin: false });
  const mixed = classifyChanges(index, [
    { kind: 'update', path: files.mdA },
    { kind: 'update', path: files.config },
  ]);
  expect(mixed.full).toMatch(/^config-toolchain: configuration/);
  expect(mixed.pin).toBe(false);
});

test('the path pass: page modules and evaluated entry inputs, and program inputs while closures are recorded', () => {
  const s = site();
  const { index, files } = s;
  const program = { program: true };
  const pass = (
    file: string,
    options?: { program: boolean },
    kind: 'update' | 'create' = 'update',
  ) => classifyChanges(index, [{ kind, path: file }], undefined, options);
  // A page module: its units are candidates, and the loaders keep their last results.
  const page = pass(files.pageA);
  expect(page.full).toBeUndefined();
  expect(page.pin).toBe(true);
  expect([...page.units]).toEqual(['A']);
  // An evaluated entry input no unit records: no candidate before discovery says what changed.
  const shared = pass(files.shared);
  expect(shared.full).toBeUndefined();
  expect([...shared.units]).toEqual([]);
  // A program input goes FULL unless the generation records semantic closures.
  expect(pass(files.both).full).toBe(`entry: evaluated entry input (${files.both})`);
  expect(pass(files.both, program).full).toBeUndefined();
  expect(pass(files.api).full).toBe(`semantic: program input (${files.api})`);
  expect(pass(files.api, program)).toMatchObject({ pin: true });
  expect(pass(files.api, program).full).toBeUndefined();
  // A program file a unit read (a scoped unit keeps it as its own dependency) reaches that unit.
  expect([...pass(files.program, program).units]).toEqual(['A']);
  // A program glob whose membership changes (an API scope) and a program input that no longer
  // exists are the structural class: targeted while closures are recorded (the program's root
  // change and the API enumeration diff observe them again), FULL otherwise.
  const created = pass(s.file('docs/api-new.ts'), program, 'create');
  expect(created.full).toBeUndefined();
  expect(created.pin).toBe(true);
  expect(pass(s.file('docs/api-new.ts'), undefined, 'create').full).toMatch(
    /^semantic: create of .* changes membership of glob/,
  );
  unlinkSync(files.program);
  expect(pass(files.program, program).full).toBeUndefined();
  expect(pass(files.program).full).toBe(
    `semantic: program input no longer exists (${files.program})`,
  );
  // A program edit reaches API declarations as candidates.
  expect(pass(files.snippet, program).full).toBeUndefined();
  // An unknown path alone runs FULL (nothing observed again can read it); with a structural
  // change it is targeted and must be read by the generation.
  const notes = s.file('notes.txt');
  expect(
    classifyChanges(index, [{ kind: 'create', path: notes }], undefined, program).full,
  ).toMatch(/^unknown: /);
  const withPage = classifyChanges(
    index,
    [
      { kind: 'create', path: notes },
      { kind: 'create', path: s.file('docs/c/ng-doc.page.ts') },
    ],
    undefined,
    program,
  );
  expect(withPage).toMatchObject({ unknown: [notes], pin: true });
  expect(withPage.full).toBeUndefined();
});

test('a file created at an absent resolution candidate of an entry is FULL when it joins a glob', () => {
  // Discovery records a module's absent resolution candidates (`existence: false`) as inputs of
  // the entry's closure. A file created at one is an entry path, and must not stay targeted when it
  // also joins an API scope glob: enumeration reads that membership only in a full generation.
  const s = site();
  const { root, files } = s;
  const probe = path.join(root, 'docs/api-probe.ts');
  const other = path.join(root, 'docs/a/probe.ts');
  const absent = (file: string): Dependency => ({ kind: 'existence', path: file, exists: false });
  const entries = s.entries.map((entry) =>
    entry.id === 'a'
      ? { ...entry, dependencies: [...entry.dependencies, absent(probe), absent(other)] }
      : entry,
  );
  const index = UnitIndex.build({
    configurationDigest: 'cfg',
    entries,
    discovery: [content(files.pageA), content(files.mdA), absent(probe), absent(other)],
    templates: [],
    keywords: s.keywords,
    artifacts: s.artifacts,
  });
  expect([...index.roles(probe)]).toEqual(['entry-input']);
  s.file('docs/api-probe.ts');
  s.file('docs/a/probe.ts');
  const created = (file: string) => classifyPath(index, { kind: 'create', path: file });
  expect(created(probe)).toMatchObject({
    class: 'semantic',
    detail: expect.stringContaining('changes membership of glob'),
  });
  expect(
    classifyChanges(index, [{ kind: 'create', path: probe }], undefined, { program: false }).full,
  ).toMatch(/^semantic: create of .* changes membership of glob/);
  // With closures, the structural class takes it: the program's root change and the API
  // enumeration diff observe the new scope member.
  expect(
    classifyChanges(index, [{ kind: 'create', path: probe }], undefined, { program: true }).full,
  ).toBeUndefined();
  // A candidate outside every glob is an ordinary entry input: discovery evaluates it again.
  expect(created(other)).toMatchObject({ class: 'entry', detail: 'evaluated entry input' });
});

test('the closure: fresh-discovery changes, the keyword diff K and its one-hop consumers', () => {
  const s = site();
  const { index, files, entries, keywords } = s;
  const pass = classifyChanges(index, [{ kind: 'update', path: files.mdB }]);
  const fresh = { configurationDigest: 'cfg', entries, keywords };
  // B's keyword binding changed: A uses *B, so A is its one-hop consumer.
  const renamed = [keyword('*A'), keyword('*B', 'Renamed')];
  const closure = affectedClosure(index, pass, { ...fresh, keywords: renamed });
  expect(closure).toMatchObject({ keys: ['*B'] });
  expect(closure.full).toBeUndefined();
  expect([...closure.entries]).toEqual([]);
  expect([...closure.consumers]).toEqual(['A']);
  expect([...closure.units].sort()).toEqual(['A', 'B']);
  expect(keywordDiff(index, [keyword('*A')])).toEqual(['*B']);
  const changed = (edited: EntryDescriptor[]) => [
    ...discoveryChanges(index, { ...fresh, entries: edited }).entries,
  ];
  expect(discoveryChanges(index, fresh)).toEqual({
    entries: new Set(),
    added: new Set(),
    removed: new Set(),
  });
  // Every entry whose descriptor changed in any field is reported: markdown digests, closure
  // inputs, the title, the evaluated value.
  const withDependencies = (id: string, dependencies: Dependency[]) =>
    entries.map((entry) => (entry.id === id ? { ...entry, dependencies } : entry));
  expect(changed(withDependencies('b', [content(files.pageB), content(files.mdB, 'b2')]))).toEqual([
    'b',
  ]);
  expect(
    changed(
      withDependencies('a', [
        content(files.pageA, 'page-2'),
        content(files.mdA, 'a1'),
        content(files.shared),
        content(files.both),
      ]),
    ),
  ).toEqual(['a']);
  expect(changed([{ ...entries[0], title: 'T' }, ...entries.slice(1)])).toEqual(['a']);
  expect(
    changed(
      withDependencies('b', [
        content(files.pageB),
        content(files.mdB, 'b1'),
        { kind: 'evaluated', entryId: 'b', digest: 'e2' },
      ]),
    ),
  ).toEqual(['b']);
  // The closure includes every unit of a changed entry.
  const retitled = affectedClosure(index, pass, {
    ...fresh,
    entries: [{ ...entries[0], title: 'T' }, ...entries.slice(1)],
  });
  expect([...retitled.entries]).toEqual(['a']);
  expect([...retitled.units].sort()).toEqual(['A', 'B']);
  // Structure is FULL: the configuration, the entry set, an entry's kind.
  expect(discoveryChanges(index, { ...fresh, configurationDigest: 'other' }).full).toBe(
    'configuration digest changed',
  );
  expect(discoveryChanges(index, { ...fresh, entries: entries.slice(1) }).full).toBe(
    'entry set changed',
  );
  expect(
    discoveryChanges(index, {
      ...fresh,
      entries: [...entries.slice(1), { ...entries[0], id: 'z' }],
    }).full,
  ).toBe('entry added: z');
  expect(
    discoveryChanges(index, {
      ...fresh,
      entries: [{ ...entries[0], kind: 'category' } as EntryDescriptor, ...entries.slice(1)],
    }).full,
  ).toBe('entry kind changed: a');
  expect(affectedClosure(index, pass, { ...fresh, configurationDigest: 'other' }).full).toBe(
    'discovery: configuration digest changed',
  );
  // The structural class: entries added and removed, and a kind change (its units change
  // identity), are reported instead; the configuration still goes FULL.
  const structural = (edited: EntryDescriptor[]) =>
    discoveryChanges(index, { ...fresh, entries: edited }, true);
  expect(structural([...entries.slice(1), { ...entries[0], id: 'z' }])).toEqual({
    entries: new Set(),
    added: new Set(['z']),
    removed: new Set(['a']),
  });
  expect(
    structural([{ ...entries[0], kind: 'category' } as EntryDescriptor, ...entries.slice(1)]),
  ).toEqual({ entries: new Set(['a']), added: new Set(), removed: new Set() });
  expect(discoveryChanges(index, { ...fresh, configurationDigest: 'other' }, true).full).toBe(
    'configuration digest changed',
  );
});

test('the actual changed units: revisions changed, added and removed, the aggregate excluded', () => {
  const aggregate = artifact('agg', 'p', {
    identity: { projectId: 'p', entryId: 'p', role: 'aggregate' },
  });
  const snapshot = (artifacts: PageArtifact[]) => ({
    projectId: 'p',
    revision: 'r',
    artifacts,
    globalKeywords: [],
    remoteKeywords: [],
  });
  const before = snapshot([artifact('A', 'a'), artifact('B', 'b'), artifact('C', 'c'), aggregate]);
  const after = snapshot([
    artifact('A', 'a'),
    { ...artifact('B', 'b'), revision: 'B-2' },
    artifact('N', 'n'),
    { ...aggregate, revision: 'agg-2' },
  ]);
  expect(changedUnits(before, after)).toEqual(['B', 'C', 'N']);
  expect(changedUnits(undefined, after)).toEqual(['A', 'B', 'N']);
});
