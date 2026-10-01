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
import { afterEach, describe, expect, it } from 'vitest';

import type {
  Dependency,
  EntryDescriptor,
  GuideDescriptor,
  KeywordExport,
  PageArtifact,
} from '../../contracts';
import {
  type UnitIndexInput,
  createCanonicalAliases,
  indexEntry,
  keywordBindingDigests,
  rootKeyword,
  UnitIndex,
} from '../unit-index';

// The reverse index of a committed build, for the targeted rebuild's classifier.

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(): { root: string; file(name: string, text?: string): string } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-unit-index-')));
  roots.push(root);
  return {
    root,
    file(name: string, text: string | undefined = name) {
      const target = path.join(root, name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
      return target;
    },
  };
}

const content = (file: string, digest = 'd'): Dependency => ({
  kind: 'content',
  path: file,
  digest,
});

function artifact(
  id: string,
  entryId: string,
  fields: Partial<PageArtifact> & {
    declarationId?: string;
    role?: PageArtifact['identity']['role'];
  } = {},
): PageArtifact {
  const { declarationId, role, ...rest } = fields;
  return {
    id,
    identity: {
      projectId: 'p',
      entryId,
      role: role ?? 'page-shell',
      ...(declarationId ? { declarationId } : {}),
    },
    revision: `${id}-r`,
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
  dependencies: Dependency[] = [],
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

const keyword = (key: string, title = key): KeywordExport => ({ key, title, path: `/${key}` });

describe('UnitIndex', () => {
  it('indexes descriptor, unit and observed levels, input roles, globs, keywords and entries', () => {
    const w = workspace();
    const config = w.file('ng-doc.config.ts');
    const header = w.file('header.html');
    const template = w.file('templates/page.ts.njk');
    const pageModule = w.file('docs/a/ng-doc.page.ts');
    const shared = w.file('docs/a/shared.ts');
    const md = w.file('docs/a/index.md');
    const include = w.file('docs/include.md');
    const demo = w.file('docs/a/demo.html');
    const program = w.file('docs/api.ts');
    const scoped = w.file('docs/scoped.ts');
    const entries: EntryDescriptor[] = [
      guide(
        'a',
        pageModule,
        [md],
        [content(pageModule), content(shared), content(md, 'md-digest')],
      ),
      {
        ...guide('api', w.file('docs/ng-doc.api.ts'), []),
        kind: 'api',
        scopes: [],
      } as unknown as EntryDescriptor,
    ];
    const input: UnitIndexInput = {
      configurationDigest: 'cfg',
      headerTemplate: header,
      entries,
      discovery: [
        content(config),
        content(header),
        content(pageModule),
        content(shared),
        content(md),
        { kind: 'existence', path: path.join(w.root, 'ng-doc.config.js'), exists: false },
        {
          kind: 'glob',
          root: path.join(w.root, 'docs'),
          include: ['**/ng-doc.page.ts'],
          exclude: [],
          members: [pageModule],
        },
      ],
      templates: [
        content(template),
        { kind: 'existence', path: path.join(w.root, 'templates/missing.njk'), exists: false },
      ],
      keywords: [keyword('*A'), keyword('X')],
      artifacts: [
        artifact('unit-a', 'a', {
          dependencies: [
            content(pageModule),
            content(md),
            content(demo),
            content(include),
            { kind: 'keyword', key: 'Kdep', digest: 'x' },
            {
              kind: 'glob',
              root: path.join(w.root, 'docs/snippets'),
              include: ['*.ts'],
              exclude: [],
              members: [],
            },
            { kind: 'semantic-reference', scopeId: 's', digest: 'x', reason: 'r' },
          ],
          contentDescriptors: [
            {
              schemaVersion: 4,
              id: 'unit-a:tab',
              ownerId: 'unit-a',
              ordinal: 0,
              role: 'guide-tab',
              locator: { kind: 'guide-tab', markdown: md },
              title: 'a',
              route: 'a',
              absoluteRoute: 'a',
              searchBreadcrumbs: [],
              dependencies: [content(md)],
              inputDigest: 'i',
              requestDigest: 'q',
              closureIds: [],
            },
          ],
          content: [
            {
              ir: {
                schemaVersion: 4,
                id: 'unit-a:tab',
                entryId: 'a',
                role: 'guide-tab',
                title: 'a',
                route: 'a',
                absoluteRoute: 'a',
                html: '',
                anchors: [],
                exportedKeywords: [],
                usedKeywords: [],
                dependencies: [
                  content(include),
                  { kind: 'existence', path: path.join(w.root, 'docs/gone.md'), exists: false },
                  { kind: 'glob', root: w.root, include: ['x/*.md'], exclude: [], members: [] },
                ],
                diagnostics: [],
              },
              html: '',
              searchRecords: [],
              keywordDigest: 'k',
            },
            {
              ir: {
                schemaVersion: 4,
                id: 'unit-a:demos',
                entryId: 'a',
                role: 'demo-assets',
                title: 'a',
                route: 'a',
                absoluteRoute: 'a',
                html: '',
                anchors: [],
                exportedKeywords: [],
                usedKeywords: [],
                dependencies: [],
                diagnostics: [],
              },
              html: '',
              searchRecords: [],
              keywordDigest: 'k',
            },
          ],
          exportedKeywords: [keyword('*A'), keyword('*A#anchor'), keyword('*A')],
          usedKeywords: ['Api.member', '*B#x'],
        }),
        artifact('unit-api', 'api', { declarationId: 'decl' }),
        artifact('category', 'missing-entry', { role: 'category' }),
        artifact('aggregate', 'p', {
          role: 'aggregate',
          dependencies: [
            content(program),
            content(pageModule),
            { kind: 'semantic', scopeId: 's', digest: 'x', files: [program, scoped], reason: 'r' },
            {
              kind: 'glob',
              root: path.join(w.root, 'docs'),
              include: ['api*.ts'],
              exclude: [],
              members: [program],
            },
          ],
        }),
      ],
    };
    const index = UnitIndex.build(input);
    expect(index.size()).toMatchObject({ owners: 3 });
    expect(
      [...index.owners.values()].map((owner) => [
        owner.id,
        owner.entryKind,
        owner.declarationId ?? null,
      ]),
    ).toEqual([
      ['unit-a', 'guide', null],
      ['unit-api', 'api', 'decl'],
      ['category', 'unknown', null],
    ]);
    expect(index.owners.get('unit-a')).toMatchObject({
      descriptors: ['unit-a:tab', 'unit-a:demos'],
      exports: ['*A', '*A#anchor'],
    });
    // Levels: the tab's own inputs, the unit's describe inputs, the observed markdown.
    expect(index.hits(include)).toEqual([
      { owner: 'unit-a', level: 'descriptor', ids: ['unit-a:tab'] },
    ]);
    expect(index.hits(demo)).toEqual([{ owner: 'unit-a', level: 'unit', ids: [] }]);
    expect(
      index
        .hits(md)
        .map((hit) => hit.level)
        .sort(),
    ).toEqual(['descriptor', 'observed']);
    expect(index.hits(path.join(w.root, 'docs/gone.md'))).toHaveLength(1);
    expect(index.hits(path.join(w.root, 'elsewhere.md'))).toEqual([]);
    expect(index.markdown(md)).toEqual(['unit-a']);
    expect(index.markdown(include)).toBeUndefined();
    // Roles: evaluated discovery inputs outrank the program; markdown is content.
    expect(index.role(config)).toBe('configuration');
    expect(index.role(path.join(w.root, 'ng-doc.config.js'))).toBe('configuration');
    expect(index.role(header)).toBe('header-template');
    expect(index.role(pageModule)).toBe('entry-module');
    expect(index.role(shared)).toBe('entry-input');
    expect(index.role(template)).toBe('output-template');
    expect(index.role(path.join(w.root, 'templates/missing.njk'))).toBe('output-template');
    expect(index.role(program)).toBe('program');
    expect(index.role(scoped)).toBe('program');
    expect(index.role(md)).toBeUndefined();
    // Role sets: a page module the program reads as well keeps both roles.
    expect([...index.roles(pageModule)].sort()).toEqual(['entry-module', 'program']);
    expect([...index.roles(shared)]).toEqual(['entry-input']);
    expect([...index.roles(program)]).toEqual(['program']);
    expect(index.roles(md).size).toBe(0);
    // Ancestors of recorded paths.
    expect(index.isAncestor(path.join(w.root, 'docs/a'))).toBe(true);
    expect(index.isAncestor(md)).toBe(false);
    // Keyword consumers: used keys, root keys of anchored uses, keyword dependencies.
    // Each edge source on its own: they overlap in a real build, which would hide a missing one.
    for (const key of ['Api.member', 'Api', '*B#x', '*B', 'Kdep'])
      expect([...index.consumersOf([key])], key).toEqual(['unit-a']);
    expect([...index.consumersOf(['nobody'])]).toEqual([]);
    expect(index.bindings.size).toBe(2);
    // Globs: a description module appearing changes the discovery glob; a program glob member.
    const added = w.file('docs/b/ng-doc.page.ts');
    expect(index.structuralGlobChange({ kind: 'create', path: added })).toContain(
      'changes membership',
    );
    expect(index.structuralGlobChange({ kind: 'update', path: md })).toBeUndefined();
    const api2 = w.file('docs/api2.ts');
    expect(index.programGlobChange({ kind: 'create', path: api2 })).toContain('changes membership');
    expect(index.entries.get('a')?.markdown.get(md)).toBe('md-digest');
  });

  it('matches a recorded path under its symlinked spelling, and a missing path through its nearest directory', () => {
    const w = workspace();
    const real = w.file('real/docs/page.md');
    symlinkSync(path.join(w.root, 'real'), path.join(w.root, 'link'), 'dir');
    const linked = path.join(w.root, 'link/docs/page.md');
    const aliases = createCanonicalAliases();
    expect(aliases(linked)).toEqual([linked, real]);
    expect(aliases(real)).toEqual([real]);
    // A path below a directory that does not exist resolves through the nearest existing one.
    expect(aliases(path.join(w.root, 'link/new/dir/file.md'))).toEqual([
      path.join(w.root, 'link/new/dir/file.md'),
      path.join(w.root, 'real/new/dir/file.md'),
    ]);
    expect(aliases('/')).toEqual(['/']);
    // A Windows path under a missing folder climbs to the drive root, never to `C:`, which
    // Windows resolves to the drive's current directory.
    if (process.platform === 'win32') {
      const drive = path.parse(process.cwd()).root.replace(/\\/g, '/');
      const missing = `${drive}ngdoc-missing-${process.pid}/dir/file.md`;
      expect(aliases(missing)).toEqual([missing]);
    }
    const index = UnitIndex.build({
      configurationDigest: 'c',
      entries: [],
      discovery: [],
      templates: [],
      keywords: [],
      artifacts: [artifact('u', 'e', { dependencies: [content(linked)] })],
    });
    expect(index.hits(real)).toEqual([{ owner: 'u', level: 'unit', ids: [] }]);
    expect(index.hits(linked)).toHaveLength(1);
    // A path whose directory cannot be resolved keeps its spelling.
    unlinkSync(path.join(w.root, 'link'));
    expect(createCanonicalAliases()(linked)).toEqual([linked]);
  });

  it('digests keyword bindings, masks markdown digests, and finds root keys', () => {
    expect(rootKeyword('*Guide#anchor')).toBe('*Guide');
    expect(rootKeyword('Api.member')).toBe('Api');
    expect(rootKeyword('Plain')).toBe('Plain');
    expect(rootKeyword('.odd')).toBe('.odd');
    const before = keywordBindingDigests([keyword('A'), keyword('B')]);
    const after = keywordBindingDigests([keyword('A', 'Renamed'), keyword('B'), keyword('B')]);
    expect(before.get('A')).not.toBe(after.get('A'));
    expect(before.get('B')).not.toBe(after.get('B'));
    const md = '/w/docs/index.md';
    const entry = guide(
      'g',
      '/w/docs/ng-doc.page.ts',
      [md],
      [content(md, 'one'), content('/w/docs/ng-doc.page.ts', 'p')],
    );
    const first = indexEntry(entry);
    const second = indexEntry({
      ...entry,
      dependencies: [content(md, 'two'), content('/w/docs/ng-doc.page.ts', 'p')],
    });
    expect(first.masked).toBe(second.masked);
    expect(first.markdown.get(md)).toBe('one');
    expect(indexEntry({ ...entry, title: 'Other' }).masked).not.toBe(first.masked);
    const category = { ...entry, kind: 'category' } as unknown as EntryDescriptor;
    expect(indexEntry(category).markdown.size).toBe(0);
  });

  it('an overlay equals a full build of the same input, and leaves its base unchanged', () => {
    const w = workspace();
    const pages = ['a', 'b', 'c'].map((id) => ({
      id,
      module: w.file(`docs/${id}/ng-doc.page.ts`),
      md: w.file(`docs/${id}/index.md`),
    }));
    const include = w.file('docs/include.md');
    const other = w.file('docs/other.md');
    const snippet = w.file('docs/snippets/x.ts');
    const entries = (digest: string): EntryDescriptor[] =>
      pages.map((page) =>
        guide(
          page.id,
          page.module,
          [page.md],
          [content(page.module), content(page.md, page.id === 'a' ? digest : 'md')],
        ),
      );
    const tab = (owner: string, md: string, dependencies: Dependency[]) => ({
      schemaVersion: 4 as const,
      id: `${owner}:tab`,
      ownerId: owner,
      ordinal: 0,
      role: 'guide-tab' as const,
      locator: { kind: 'guide-tab' as const, markdown: md },
      title: owner,
      route: owner,
      absoluteRoute: owner,
      searchBreadcrumbs: [],
      dependencies,
      inputDigest: 'i',
      requestDigest: 'q',
      closureIds: [],
    });
    const unit = (
      page: (typeof pages)[number],
      fields: { used: string[]; exported: string[]; reads: string[]; revision?: string },
    ) =>
      artifact(`unit-${page.id}`, page.id, {
        revision: fields.revision ?? `unit-${page.id}-r`,
        dependencies: [
          content(page.module),
          content(page.md),
          ...fields.reads.map((file) => content(file)),
        ],
        contentDescriptors: [tab(`unit-${page.id}`, page.md, [content(page.md)])] as never,
        usedKeywords: fields.used,
        exportedKeywords: fields.exported.map((key) => keyword(key)),
      });
    const input = (
      digest: string,
      a: Parameters<typeof unit>[1],
      keywords: KeywordExport[],
    ): UnitIndexInput => ({
      configurationDigest: 'cfg',
      entries: entries(digest),
      discovery: pages.flatMap((page) => [content(page.module), content(page.md)]),
      templates: [],
      keywords,
      artifacts: [
        unit(pages[0], a),
        unit(pages[1], { used: ['*A', 'Api.member'], exported: ['*B'], reads: [include] }),
        unit(pages[2], { used: ['*B'], exported: ['*C'], reads: [include, other] }),
        artifact('aggregate', 'p', {
          role: 'aggregate',
          dependencies: [content(w.file('docs/api.ts'))],
        }),
      ],
    });
    const before = input('one', { used: ['*C'], exported: ['*A'], reads: [include] }, [
      keyword('*A'),
      keyword('*B'),
      keyword('*C'),
    ]);
    const after = input(
      'two',
      { used: ['*B'], exported: ['*A', '*D'], reads: [snippet], revision: 'unit-a-r2' },
      [keyword('*A', 'Renamed'), keyword('*B'), keyword('*C'), keyword('*D')],
    );
    const base = UnitIndex.build(before);
    const snapshot = (index: UnitIndex) => ({
      owners: [...index.owners.values()].sort((l, r) => l.id.localeCompare(r.id)),
      entries: [...index.entries].map(([id, entry]) => [id, entry.masked, [...entry.markdown]]),
      bindings: [...index.bindings].sort(),
      hits: [include, other, snippet, ...pages.flatMap((page) => [page.md, page.module])].map(
        (file) => [
          file,
          index
            .hits(file)
            .map((hit) => `${hit.owner}/${hit.level}/${hit.ids.join(',')}`)
            .sort(),
          index.role(file) ?? null,
          index.markdown(file) ?? null,
        ],
      ),
      consumers: ['*A', '*B', '*C', '*D', 'Api'].map((key) => [
        key,
        [...index.consumersOf([key])].sort(),
      ]),
      globs: index.structuralGlobs.length,
    });
    const frozen = JSON.stringify(snapshot(base));
    const overlay = UnitIndex.overlay(base, after, {
      replaced: new Set(['unit-a']),
      entries: new Set(['a']),
      keys: ['*A', '*D'],
    });
    expect(snapshot(overlay)).toEqual(snapshot(UnitIndex.build(after)));
    expect(JSON.stringify(snapshot(base))).toBe(frozen);
    // Without named keys, every binding is digested again.
    const everyKey = UnitIndex.overlay(base, after, {
      replaced: new Set(['unit-a']),
      entries: new Set(['a', 'gone']),
    });
    expect(snapshot(everyKey).bindings).toEqual(snapshot(UnitIndex.build(after)).bindings);
    expect(everyKey.entries.has('gone')).toBe(false);
    // The discovery inputs and the program differ (an entry's closure imports a new file, a new
    // program input, a new markdown file of a changed entry): with `inputs` the roles, markdown
    // owners and globs are built again and equal a full build; the base stays unchanged.
    const imported = w.file('docs/a/imported.ts');
    const joined = w.file('docs/joined.ts');
    const tab2 = w.file('docs/a/second.md');
    const moved: UnitIndexInput = {
      ...after,
      entries: after.entries.map((entry) =>
        entry.id === 'a' && entry.kind === 'guide'
          ? {
              ...entry,
              markdown: [...entry.markdown, tab2],
              dependencies: [...entry.dependencies, content(imported), content(tab2)],
            }
          : entry,
      ),
      discovery: [...after.discovery, content(imported), content(tab2)],
      artifacts: after.artifacts.map((item) =>
        item.identity.role === 'aggregate'
          ? { ...item, dependencies: [...item.dependencies, content(joined), content(imported)] }
          : item,
      ),
    };
    const withInputs = (inputs: boolean) =>
      UnitIndex.overlay(base, moved, {
        replaced: new Set(['unit-a']),
        entries: new Set(['a']),
        keys: ['*A', '*D'],
        ...(inputs ? { inputs } : {}),
      });
    const roles = (index: UnitIndex) =>
      [imported, joined, tab2, include].map((file) => [
        [...index.roles(file)].sort(),
        index.markdown(file) ?? null,
      ]);
    expect(roles(withInputs(true))).toEqual(roles(UnitIndex.build(moved)));
    expect(roles(withInputs(true))).toEqual([
      [['entry-input', 'program'], null],
      [['program'], null],
      [[], ['unit-a']],
      [[], null],
    ]);
    expect(snapshot(withInputs(true))).toEqual(snapshot(UnitIndex.build(moved)));
    // Without it the base's roles are shared, which only holds while the inputs are the base's.
    expect(roles(withInputs(false))[0]).toEqual([[], null]);
    expect(JSON.stringify(snapshot(base))).toBe(frozen);
    expect(base.roles(imported).size).toBe(0);
    // A key the overlay names that no export binds any more is dropped.
    const dropped = UnitIndex.overlay(base, before, {
      replaced: new Set(),
      entries: new Set(),
      keys: ['*Z'],
    });
    expect(dropped.bindings.has('*Z')).toBe(false);
    // The structural class: an entry removed and another added (units that go and come): the
    // overlay drops the removed owners' edges, adds the new ones, and equals a full build.
    const added = {
      id: 'd',
      module: w.file('docs/d/ng-doc.page.ts'),
      md: w.file('docs/d/index.md'),
    };
    const restructured: UnitIndexInput = {
      ...after,
      entries: [
        ...after.entries.filter((entry) => entry.id !== 'b'),
        guide('d', added.module, [added.md], [content(added.module), content(added.md)]),
      ],
      discovery: [
        ...after.discovery.filter((item) => !('path' in item) || !item.path.includes('/docs/b/')),
        content(added.module),
        content(added.md),
      ],
      keywords: [keyword('*A', 'Renamed'), keyword('*C'), keyword('*D'), keyword('*E')],
      artifacts: [
        ...after.artifacts.filter((item) => item.id !== 'unit-b'),
        unit(added as (typeof pages)[number], { used: ['*C'], exported: ['*E'], reads: [] }),
      ],
    };
    const structural = UnitIndex.overlay(base, restructured, {
      replaced: new Set(['unit-a', 'unit-b', 'unit-d']),
      entries: new Set(['a', 'b', 'd']),
      keys: ['*A', '*B', '*D', '*E'],
      inputs: true,
    });
    expect(snapshot(structural)).toEqual(snapshot(UnitIndex.build(restructured)));
    expect(structural.owners.has('unit-b')).toBe(false);
    expect(structural.hits(added.md).map((hit) => hit.owner)).toContain('unit-d');
    expect(structural.hits(pages[1].md)).toEqual([]);
    expect(JSON.stringify(snapshot(base))).toBe(frozen);
  });
});
