import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Dependency, PageArtifact } from '../../contracts';
import { createDependencyIndex, createDependencyRefresher, validateSemanticScopes } from '..';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('compact semantic dependency scopes', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-semantic-scope-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('validates JSON-restored definitions independent of ordering and isolates projects', () => {
    const sourceA = write('a/source.ts', 'a');
    const sourceASecondary = write('a/secondary.ts', 'secondary');
    const sourceB = write('b/source.ts', 'b');
    const candidates = [
      aggregate('a:aggregate', 'a', scope('program', 'digest-a', [sourceA]), [
        content(sourceA, 'a'),
      ]),
      page('a:guide', 'a', [reference('program', 'digest-a', 'Project A program')]),
      aggregate(
        'a:secondary-aggregate',
        'a',
        scope('secondary', 'digest-secondary', [sourceASecondary]),
        [content(sourceASecondary, 'secondary')],
      ),
      page('a:secondary-page', 'a', [
        reference('secondary', 'digest-secondary', 'Project A secondary program'),
      ]),
      aggregate('b:aggregate', 'b', scope('program', 'digest-b', [sourceB]), [
        content(sourceB, 'b'),
      ]),
      page('b:guide', 'b', [reference('program', 'digest-b', 'Project B program')]),
    ];
    const restored = JSON.parse(JSON.stringify(candidates.reverse())) as PageArtifact[];

    expect(validateSemanticScopes(restored)).toEqual([]);
    const index = createDependencyIndex(restored);
    expect(index.affected([{ kind: 'update', path: sourceA }])).toEqual([]);
    fs.writeFileSync(sourceA, 'changed-a');
    expect(index.affected([{ kind: 'update', path: sourceA }])).toEqual([
      {
        ownerId: 'a:guide',
        reason: 'semantic',
        detail: `Project A program: ${sourceA}`,
      },
    ]);
  });

  it('rejects missing, stale, ambiguous, conflicting and multi-scope closures', () => {
    const valid = scope('program', 'one', []);
    const cases: Array<{ artifacts: PageArtifact[]; codes: string[] }> = [
      {
        artifacts: [page('missing', 'project', [reference('program', 'one', 'program')])],
        codes: ['GRAPH_SEMANTIC_SCOPE_MISSING'],
      },
      {
        artifacts: [
          aggregate('aggregate', 'project', valid),
          page('stale', 'project', [reference('program', 'old', 'program')]),
        ],
        codes: ['GRAPH_SEMANTIC_SCOPE_STALE'],
      },
      {
        artifacts: [
          aggregate('aggregate-a', 'project', valid),
          aggregate('aggregate-b', 'project', valid),
          page('ambiguous', 'project', [reference('program', 'one', 'program')]),
        ],
        codes: ['GRAPH_SEMANTIC_SCOPE_AMBIGUOUS'],
      },
      {
        artifacts: [
          aggregate('aggregate-a', 'project', valid),
          aggregate('aggregate-b', 'project', scope('program', 'two', [])),
          page('conflict', 'project', [reference('program', 'one', 'program')]),
        ],
        codes: ['GRAPH_SEMANTIC_SCOPE_CONFLICT'],
      },
      {
        artifacts: [
          aggregate('aggregate', 'project', [scope('one', 'one', []), scope('two', 'two', [])]),
          page('one', 'project', [reference('one', 'one', 'first')]),
          page('two', 'project', [reference('two', 'two', 'second')]),
        ],
        codes: ['GRAPH_SEMANTIC_SCOPE_MULTIPLE_SCOPES'],
      },
    ];

    for (const fixture of cases) {
      expect(validateSemanticScopes(fixture.artifacts).map(({ code }) => code)).toEqual(
        fixture.codes,
      );
      expect(() => createDependencyIndex(fixture.artifacts)).toThrow(fixture.codes[0]);
    }
  });

  it('retains legacy page-owned full semantic dependencies when no references exist', () => {
    const descriptor = write('legacy/tsconfig.json', '{}');
    const index = createDependencyIndex([
      page('legacy', 'project', [
        scope('legacy-program', 'legacy', [descriptor], 'Legacy program'),
      ]),
    ]);

    expect(validateSemanticScopes([])).toEqual([]);
    expect(
      validateSemanticScopes([page('legacy', 'project', [scope('legacy', 'one', [])])]),
    ).toEqual([]);
    expect(index.affected([{ kind: 'update', path: descriptor }])).toEqual([
      {
        ownerId: 'legacy',
        reason: 'semantic',
        detail: `Legacy program: ${descriptor}`,
      },
    ]);
  });

  it('fans aggregate provenance out through IR-only references without retained file-page edges', () => {
    const packageFile = write('workspace/package.json', '{"name":"fixture"}');
    const descriptor = write('workspace/tsconfig.json', '{}');
    const firstMember = write('workspace/src/first.ts', 'first');
    const missingResolution = absolute('workspace/node_modules/pkg/package.json');
    const definition = scope('program', 'program-v1', [descriptor, packageFile]);
    const provenance: Dependency[] = [
      content(packageFile, '{"name":"fixture"}'),
      { kind: 'existence', path: missingResolution, exists: false },
      {
        kind: 'glob',
        root: absolute('workspace/src'),
        include: ['**/*.ts'],
        exclude: [],
        members: [firstMember],
      },
    ];
    const consumers = Array.from({ length: 200 }, (_, index) =>
      page(
        `page-${String(index).padStart(3, '0')}`,
        'project',
        [],
        [reference('program', 'program-v1', 'Whole project')],
      ),
    );
    const artifacts = [aggregate('aggregate', 'project', definition, provenance), ...consumers];
    const index = createDependencyIndex(artifacts);

    expect(JSON.stringify(artifacts).match(/"kind":"semantic"/g)).toHaveLength(1);
    expect(index.affected([{ kind: 'update', path: packageFile }])).toEqual([]);

    fs.writeFileSync(packageFile, '{"name":"changed"}');
    expectFanout(index.affected([{ kind: 'update', path: packageFile }]), 200, [packageFile]);

    fs.mkdirSync(path.dirname(missingResolution), { recursive: true });
    fs.writeFileSync(missingResolution, '{}');
    expectFanout(index.affected([{ kind: 'create', path: missingResolution }]), 200, [
      missingResolution,
    ]);

    const added = write('workspace/src/added.ts', 'added');
    expectFanout(index.affected([{ kind: 'create', path: added }]), 200, [added]);

    fs.unlinkSync(firstMember);
    expectFanout(index.affected([{ kind: 'delete', path: firstMember }]), 200, [firstMember]);

    const renamed = absolute('workspace/tsconfig.base.json');
    fs.renameSync(descriptor, renamed);
    expectFanout(
      index.affected([
        { kind: 'delete', path: descriptor },
        { kind: 'create', path: renamed },
      ]),
      200,
      [descriptor],
    );
  });

  it('refreshes semantic references per call while sharing physical observations', async () => {
    const source = write('refresh/source.ts', 'source');
    const observed: string[] = [];
    const refresher = createDependencyRefresher({
      onObserve: (kind, identity) => observed.push(`${kind}:${identity}`),
    });
    const first = await refresher.refresh(
      [content(source, 'stale'), reference('program', 'one', 'First program')],
      [],
    );
    fs.writeFileSync(source, 'changed');
    const second = await refresher.refresh(
      [reference('program', 'two', 'Second program'), content(source, 'new-stale')],
      [],
    );

    expect(observed).toHaveLength(1);
    expect(second.dependencies.find(({ kind }) => kind === 'content')).toEqual(
      first.dependencies.find(({ kind }) => kind === 'content'),
    );
    expect(second.dependencies.find(({ kind }) => kind === 'semantic-reference')).toEqual(
      reference('program', 'two', 'Second program'),
    );
    expect(second.digest).not.toBe(first.digest);
  });

  function absolute(relative: string): string {
    return path.resolve(root, relative).replace(/\\/g, '/');
  }

  function write(relative: string, value: string): string {
    const file = absolute(relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
    return file;
  }
});

function content(file: string, value: string): Dependency {
  return { kind: 'content', path: file, digest: sha(value) };
}

function scope(
  scopeId: string,
  digest: string,
  files: string[],
  reason: string = 'Whole project',
): Extract<Dependency, { kind: 'semantic' }> {
  return { kind: 'semantic', scopeId, digest, files, reason };
}

function reference(
  scopeId: string,
  digest: string,
  reason: string,
): Extract<Dependency, { kind: 'semantic-reference' }> {
  return { kind: 'semantic-reference', scopeId, digest, reason };
}

function aggregate(
  id: string,
  projectId: string,
  definition: Dependency | Dependency[],
  provenance: Dependency[] = [],
): PageArtifact {
  return artifact(id, projectId, 'aggregate', [
    ...(Array.isArray(definition) ? definition : [definition]),
    ...provenance,
  ]);
}

function page(
  id: string,
  projectId: string,
  dependencies: Dependency[],
  irDependencies: Dependency[] = [],
): PageArtifact {
  return artifact(id, projectId, 'content', dependencies, irDependencies);
}

function artifact(
  id: string,
  projectId: string,
  role: PageArtifact['identity']['role'],
  dependencies: Dependency[],
  irDependencies: Dependency[] = [],
): PageArtifact {
  return {
    id,
    identity: { projectId, entryId: id, role },
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
    content: irDependencies.length
      ? [
          {
            ir: {
              schemaVersion: 4,
              id: `${id}:ir`,
              entryId: id,
              role: 'header',
              title: id,
              route: '',
              absoluteRoute: '',
              html: '',
              anchors: [],
              exportedKeywords: [],
              usedKeywords: [],
              dependencies: irDependencies,
              diagnostics: [],
            },
            html: '',
            searchRecords: [],
            keywordDigest: '',
          },
        ]
      : [],
    exportedKeywords: [],
    usedKeywords: [],
    searchRecords: [],
    routes: [],
    apiList: [],
    outputs: [],
    diagnostics: [],
  };
}

function expectFanout(
  reasons: ReturnType<ReturnType<typeof createDependencyIndex>['affected']>,
  count: number,
  changedPaths: string[],
): void {
  expect(reasons).toHaveLength(count);
  expect(new Set(reasons.map(({ ownerId }) => ownerId))).toHaveLength(count);
  expect(reasons.every(({ reason }) => reason === 'semantic')).toBe(true);
  for (const changedPath of changedPaths) {
    expect(reasons.every(({ detail }) => detail.includes(changedPath))).toBe(true);
  }
}
