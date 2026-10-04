import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Dependency, KeywordExport, PageArtifact } from '../../contracts';
import {
  createDependencyIndex,
  createDependencyRefresher,
  refreshDependencies,
  UNREFRESHED_DIGEST,
} from '..';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('generator dependency graph', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-graph-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fans shared content changes out to every owner and suppresses byte-identical updates', () => {
    const shared = write('shared/include.md', 'same bytes');
    const dependency = { kind: 'content' as const, path: shared, digest: sha('same bytes') };
    const index = createDependencyIndex([
      artifact('project-a:guide', 'project-a', [dependency, dependency]),
      artifact('project-b:category', 'project-b', [dependency]),
    ]);

    expect(index.affected([{ kind: 'update', path: shared }])).toEqual([]);
    fs.writeFileSync(shared, 'changed bytes');
    expect(index.affected([{ kind: 'update', path: shared }])).toEqual([
      { ownerId: 'project-a:guide', reason: 'input', detail: shared },
      { ownerId: 'project-b:category', reason: 'input', detail: shared },
    ]);
  });

  it('tracks missing-file creation, existing-file deletion and content deletion distinctly', () => {
    const missing = absolute('later.md');
    const existing = write('existing.md', 'exists');
    const content = write('content.md', 'content');
    const index = createDependencyIndex([
      artifact('owner', 'project', [
        { kind: 'existence', path: missing, exists: false },
        { kind: 'existence', path: existing, exists: true },
        { kind: 'content', path: content, digest: sha('content') },
      ]),
    ]);

    expect(index.affected([{ kind: 'create', path: missing }])).toEqual([]);
    fs.writeFileSync(missing, 'created');
    expect(index.affected([{ kind: 'create', path: missing }])).toEqual([
      { ownerId: 'owner', reason: 'existence', detail: missing },
    ]);
    fs.unlinkSync(existing);
    expect(index.affected([{ kind: 'delete', path: existing }])).toEqual([
      { ownerId: 'owner', reason: 'existence', detail: existing },
    ]);
    fs.unlinkSync(content);
    expect(index.affected([{ kind: 'delete', path: content }])).toEqual([
      { ownerId: 'owner', reason: 'input', detail: content },
    ]);
  });

  it('indexes descriptor physical inputs that no linked content records', () => {
    const deferred = write('deferred.md', 'before');
    const owner = artifact('deferred-owner', 'project');
    owner.contentDescriptors = [
      {
        schemaVersion: 4,
        id: 'deferred-tab',
        ownerId: owner.id,
        ordinal: 0,
        role: 'guide-tab',
        locator: { kind: 'guide-tab', markdown: deferred },
        title: 'Deferred',
        route: '',
        absoluteRoute: 'deferred',
        searchBreadcrumbs: [],
        dependencies: [{ kind: 'content', path: deferred, digest: sha('before') }],
        inputDigest: 'input',
        requestDigest: 'request',
        closureIds: [],
      },
    ];
    const index = createDependencyIndex([owner]);
    fs.writeFileSync(deferred, 'after');
    expect(index.affected([{ kind: 'update', path: deferred }])).toEqual([
      { ownerId: owner.id, reason: 'input', detail: deferred },
    ]);
  });

  it('detects real glob membership create/delete/rename and excludes updates and ignored paths', () => {
    const first = write('docs/first.ts', 'one');
    const ignored = write('docs/ignored/skip.ts', 'skip');
    const dependency: Dependency = {
      kind: 'glob',
      root: absolute('docs'),
      include: ['**/*.ts'],
      exclude: ['ignored/**'],
      members: [first],
    };
    const index = createDependencyIndex([artifact('glob-owner', 'project', [dependency])]);

    expect(index.affected([{ kind: 'update', path: first }])).toEqual([]);
    expect(index.affected([{ kind: 'update', path: ignored }])).toEqual([]);
    const hidden = write('docs/.hidden/new.ts', 'new');
    expect(index.affected([{ kind: 'create', path: hidden }])).toEqual([
      { ownerId: 'glob-owner', reason: 'membership', detail: hidden },
    ]);

    const renamed = absolute('docs/renamed.ts');
    fs.renameSync(first, renamed);
    expect(
      index.affected([
        { kind: 'create', path: renamed },
        { kind: 'delete', path: first },
        { kind: 'delete', path: first },
      ]),
    ).toEqual([
      {
        ownerId: 'glob-owner',
        reason: 'membership',
        detail: [first, renamed].sort().join(', '),
      },
    ]);
  });

  it('matches absolute glob patterns and tracks symlink member creation and deletion', async () => {
    const globRoot = absolute('absolute-docs');
    const first = write('absolute-docs/first.ts', 'first');
    const excluded = write('absolute-docs/excluded/skip.ts', 'skip');
    const dependency: Dependency = {
      kind: 'glob',
      root: globRoot,
      include: [`${globRoot}/**/*.ts`],
      exclude: [`${globRoot}/excluded/**`],
      members: [first],
    };
    const index = createDependencyIndex([artifact('absolute-glob', 'project', [dependency])]);

    const created = write('absolute-docs/nested/created.ts', 'created');
    expect(index.affected([{ kind: 'create', path: created }])).toEqual([
      { ownerId: 'absolute-glob', reason: 'membership', detail: created },
    ]);
    expect(index.affected([{ kind: 'update', path: excluded }])).toEqual([]);

    const refreshed = await refreshDependencies([dependency], []);
    expect(refreshed.dependencies).toEqual([{ ...dependency, members: [first, created].sort() }]);

    const target = write('outside/target.ts', 'target');
    const alias = absolute('absolute-docs/alias.ts');
    fs.symlinkSync(target, alias);
    expect(index.affected([{ kind: 'create', path: alias }])).toEqual([
      { ownerId: 'absolute-glob', reason: 'membership', detail: alias },
    ]);

    const withAlias = createDependencyIndex([
      artifact('absolute-glob', 'project', [{ ...dependency, members: [first, created, alias] }]),
    ]);
    fs.unlinkSync(alias);
    expect(withAlias.affected([{ kind: 'delete', path: alias }])).toEqual([
      { ownerId: 'absolute-glob', reason: 'membership', detail: alias },
    ]);
  });

  it('indexes conservative semantic files with their cause and follows filesystem aliases', () => {
    const target = write('config/tsconfig.base.json', '{"compilerOptions":{}}');
    const alias = absolute('tsconfig.json');
    fs.symlinkSync(target, alias);
    const index = createDependencyIndex([
      artifact('api', 'project', [
        { kind: 'content', path: alias, digest: sha('{"compilerOptions":{}}') },
        {
          kind: 'semantic',
          scopeId: 'api-public',
          digest: 'semantic-v1',
          files: [alias],
          reason: 'Whole TS program and path aliases invalidate the API scope',
        },
      ]),
    ]);

    fs.writeFileSync(target, '{"compilerOptions":{"strict":true}}');
    expect(index.affected([{ kind: 'update', path: target }])).toEqual([
      { ownerId: 'api', reason: 'input', detail: alias },
      {
        ownerId: 'api',
        reason: 'semantic',
        detail: `Whole TS program and path aliases invalidate the API scope: ${target}`,
      },
    ]);
  });

  it('refreshes all dependency kinds into a stable order-independent fingerprint', async () => {
    const content = write('inputs/content.txt', 'full physical bytes');
    const present = write('inputs/present.txt', 'present');
    const missing = absolute('inputs/missing.txt');
    const memberA = write('docs/a.ts', 'a');
    const memberHidden = write('docs/.hidden/b.ts', 'b');
    write('docs/ignored/c.ts', 'ignored');
    const dependencies: Dependency[] = [
      { kind: 'keyword', key: 'Missing', digest: 'old' },
      { kind: 'existence', path: missing, exists: true },
      {
        kind: 'semantic',
        scopeId: 'scope',
        digest: 'semantic',
        files: [present, content, present],
        reason: 'conservative',
      },
      {
        kind: 'glob',
        root: absolute('docs'),
        include: ['**/*.ts', '**/*.ts'],
        exclude: ['ignored/**'],
        members: [],
      },
      { kind: 'content', path: content, digest: 'stale' },
      { kind: 'existence', path: present, exists: false },
      { kind: 'keyword', key: 'Known', digest: 'stale' },
      { kind: 'content', path: content, digest: 'duplicate-stale' },
    ];
    const keywords: KeywordExport[] = [
      {
        description: 'Docs',
        languages: ['ts', 'ts'],
        path: 'docs/known',
        title: 'Known',
        key: 'Known',
      },
    ];

    const first = await refreshDependencies(dependencies, keywords);
    const reordered = await refreshDependencies(
      [...dependencies].reverse(),
      [...keywords].reverse(),
    );
    const repeated = await refreshDependencies(first.dependencies, keywords);
    expect(first).toEqual(reordered);
    expect(repeated).toEqual(first);
    expect(first.diagnostics).toEqual([]);
    expect(first.dependencies).toEqual(
      expect.arrayContaining([
        { kind: 'content', path: content, digest: sha('full physical bytes') },
        { kind: 'existence', path: present, exists: true },
        { kind: 'existence', path: missing, exists: false },
        expect.objectContaining({
          kind: 'glob',
          members: [memberHidden, memberA].sort(),
        }),
        {
          kind: 'semantic',
          scopeId: 'scope',
          digest: expect.any(String),
          files: [content, present].sort(),
          reason: 'conservative',
        },
      ]),
    );
    const known = first.dependencies.find(
      (dependency) => dependency.kind === 'keyword' && dependency.key === 'Known',
    );
    const missingKeyword = first.dependencies.find(
      (dependency) => dependency.kind === 'keyword' && dependency.key === 'Missing',
    );
    expect(known).toMatchObject({ digest: expect.not.stringMatching(/stale/) });
    expect(missingKeyword).toMatchObject({ digest: expect.not.stringMatching(/old/) });

    const addedMember = write('docs/new.ts', 'new member');
    const withNewMember = await refreshDependencies(first.dependencies, keywords);
    expect(withNewMember.digest).not.toBe(first.digest);
    expect(
      withNewMember.dependencies.find((dependency) => dependency.kind === 'glob'),
    ).toMatchObject({ members: [memberHidden, memberA, addedMember].sort() });

    const withNewExport = await refreshDependencies(
      first.dependencies.filter((dependency) => dependency.kind === 'keyword'),
      [
        { key: 'Missing', title: 'Now present', path: 'docs/missing' },
        { key: 'Known', title: 'Renamed', path: 'docs/known' },
      ],
    );
    expect(
      withNewExport.dependencies.find(
        (dependency) => dependency.kind === 'keyword' && dependency.key === 'Missing',
      ),
    ).not.toEqual(missingKeyword);
    expect(
      withNewExport.dependencies.find(
        (dependency) => dependency.kind === 'keyword' && dependency.key === 'Known',
      ),
    ).not.toEqual(known);

    fs.writeFileSync(content, 'changed');
    const changed = await refreshDependencies(first.dependencies, keywords);
    expect(changed.digest).not.toBe(first.digest);
    expect(changed.dependencies.find((dependency) => dependency.kind === 'semantic')).toEqual(
      first.dependencies.find((dependency) => dependency.kind === 'semantic'),
    );
  });

  it('returns a failed existence edge and diagnostic when refreshed content disappears', async () => {
    const content = write('temporary.ts', 'temporary');
    fs.unlinkSync(content);
    const result = await refreshDependencies(
      [{ kind: 'content', path: content, digest: sha('temporary') }],
      [],
    );
    expect(result.dependencies).toEqual([{ kind: 'existence', path: content, exists: false }]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'GRAPH_CONTENT_READ',
        severity: 'error',
        stage: 'aggregate',
        source: { path: content },
      }),
    ]);
  });

  it('shares first physical observations within a generation and refreshes call-local values', async () => {
    const content = write('generation/content.txt', 'first');
    const missing = absolute('generation/missing.txt');
    const firstMember = write('generation/glob/first.ts', 'first');
    const semantic = {
      kind: 'semantic' as const,
      scopeId: 'public-api',
      digest: 'semantic-one',
      files: [content],
      reason: 'program scope',
    };
    const dependencies: Dependency[] = [
      { kind: 'content', path: content, digest: 'stale' },
      { kind: 'existence', path: missing, exists: false },
      {
        kind: 'glob',
        root: absolute('generation/glob'),
        include: ['**/*.ts'],
        exclude: [],
        members: [],
      },
      semantic,
      { kind: 'keyword', key: 'Guide', digest: 'stale' },
    ];
    const observed: string[] = [];
    const refresher = createDependencyRefresher({
      onObserve: (kind, identity) => observed.push(`${kind}:${identity}`),
    });
    const first = await refresher.refresh(dependencies, [
      { key: 'Guide', title: 'First title', path: 'guide' },
    ]);

    fs.writeFileSync(content, 'second');
    fs.writeFileSync(missing, 'created');
    const secondMember = write('generation/glob/second.ts', 'second');
    const second = await refresher.refresh(
      dependencies.map((dependency) =>
        dependency.kind === 'semantic' ? { ...dependency, digest: 'semantic-two' } : dependency,
      ),
      [{ key: 'Guide', title: 'Second title', path: 'guide' }],
    );

    expect(observed).toHaveLength(3);
    expect(second.dependencies.find((dependency) => dependency.kind === 'content')).toEqual(
      first.dependencies.find((dependency) => dependency.kind === 'content'),
    );
    expect(second.dependencies.find((dependency) => dependency.kind === 'existence')).toEqual(
      first.dependencies.find((dependency) => dependency.kind === 'existence'),
    );
    expect(second.dependencies.find((dependency) => dependency.kind === 'glob')).toEqual(
      expect.objectContaining({ members: [firstMember] }),
    );
    expect(second.dependencies.find((dependency) => dependency.kind === 'semantic')).toEqual({
      ...semantic,
      digest: 'semantic-two',
    });
    expect(second.dependencies.find((dependency) => dependency.kind === 'keyword')).not.toEqual(
      first.dependencies.find((dependency) => dependency.kind === 'keyword'),
    );

    const nextGeneration = await createDependencyRefresher().refresh(dependencies, [
      { key: 'Guide', title: 'Second title', path: 'guide' },
    ]);
    expect(nextGeneration.dependencies).toEqual(
      expect.arrayContaining([
        { kind: 'content', path: content, digest: sha('second') },
        { kind: 'existence', path: missing, exists: true },
        expect.objectContaining({ kind: 'glob', members: [firstMember, secondMember].sort() }),
      ]),
    );
  });

  it('reports the non-physical kinds as changed without observing a path', async () => {
    const closure: Dependency = { kind: 'semantic-closure', scopeId: 's', key: 'b', digest: 'x' };
    const dependencies: Dependency[] = [
      closure,
      { ...closure, key: 'a' },
      { ...closure, digest: 'y' },
      { kind: 'evaluated', entryId: 'entry', digest: 'x' },
      { kind: 'evaluated', entryId: 'entry', digest: 'y' },
    ];
    const observed: string[] = [];
    const refreshed = await createDependencyRefresher({
      onObserve: (kind, identity) => observed.push(`${kind}:${identity}`),
    }).refresh(dependencies, []);
    expect(observed).toEqual([]);
    expect(refreshed.diagnostics).toEqual([]);
    // One per identity: a closure per scope and key, an evaluated digest per entry.
    expect(refreshed.dependencies).toEqual([
      { kind: 'evaluated', entryId: 'entry', digest: UNREFRESHED_DIGEST },
      { kind: 'semantic-closure', scopeId: 's', key: 'a', digest: UNREFRESHED_DIGEST },
      { kind: 'semantic-closure', scopeId: 's', key: 'b', digest: UNREFRESHED_DIGEST },
    ]);
    expect(refreshed.dependencies).not.toContainEqual(closure);

    // Never a path edge: a change to a file named like a key or an entry dirties nobody.
    const index = createDependencyIndex([artifact('project:api', 'project', dependencies)]);
    expect(
      index.affected([
        { kind: 'update', path: absolute('b') },
        { kind: 'update', path: absolute('entry') },
      ]),
    ).toEqual([]);
  });

  it('replays diagnostics for shared failed observations and recovers in a new generation', async () => {
    const missing = absolute('generation/later.ts');
    const dependency: Dependency = { kind: 'content', path: missing, digest: 'stale' };
    const refresher = createDependencyRefresher();

    const first = await refresher.refresh([dependency], []);
    const repeated = await refresher.refresh([dependency], []);
    expect(first.diagnostics).toEqual([
      expect.objectContaining({ code: 'GRAPH_CONTENT_READ', source: { path: missing } }),
    ]);
    expect(repeated).toEqual(first);

    fs.mkdirSync(path.dirname(missing), { recursive: true });
    fs.writeFileSync(missing, 'available');
    expect(await refresher.refresh([dependency], [])).toEqual(first);
    const recovered = await createDependencyRefresher().refresh([dependency], []);
    expect(recovered.diagnostics).toEqual([]);
    expect(recovered.dependencies).toEqual([
      { kind: 'content', path: missing, digest: sha('available') },
    ]);
  });

  it('propagates keyword changes directly and transitively through cycles to convergence', () => {
    const index = createDependencyIndex([
      artifact('a', 'project', [], ['A'], ['B']),
      artifact('b', 'project', [{ kind: 'keyword', key: 'A', digest: 'binding-a' }], ['B'], []),
      artifact('c', 'project', [], ['C'], ['A']),
      artifact('missing-consumer', 'project', [], [], ['Missing']),
      artifact('unrelated', 'project', [], ['Other'], ['Unrelated']),
    ]);

    expect(index.affectedKeywords(['B', 'B'])).toEqual([
      { ownerId: 'a', reason: 'keyword', detail: 'B' },
      { ownerId: 'b', reason: 'keyword', detail: 'A' },
      { ownerId: 'c', reason: 'keyword', detail: 'A' },
    ]);
    expect(index.affectedKeywords(['Missing'])).toEqual([
      { ownerId: 'missing-consumer', reason: 'keyword', detail: 'Missing' },
    ]);
    expect(index.affectedKeywords(['NeverUsed'])).toEqual([]);
  });

  function absolute(relative: string): string {
    return path.resolve(root, relative).replace(/\\/g, '/');
  }

  function write(relative: string, content: string): string {
    const file = absolute(relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  }
});

function artifact(
  id: string,
  projectId: string,
  dependencies: Dependency[] = [],
  exports: string[] = [],
  uses: string[] = [],
): PageArtifact {
  return {
    id,
    identity: { projectId, entryId: id, role: 'content' },
    revision: 'revision',
    fingerprint: {
      schemaVersion: 4,
      compilerVersion: 'compiler',
      toolchainDigest: 'toolchain',
      configurationDigest: 'configuration',
      inputDigest: 'input',
      keywordDigest: 'keywords',
    },
    dependencies,
    content: [],
    exportedKeywords: exports.map((key) => ({ key, title: key, path: `docs/${key}` })),
    usedKeywords: uses,
    searchRecords: [],
    routes: [],
    apiList: [],
    outputs: [],
    diagnostics: [],
  };
}
