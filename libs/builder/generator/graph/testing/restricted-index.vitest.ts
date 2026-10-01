import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Dependency, FileChange, PageArtifact } from '../../contracts';
import { createDependencyIndex, createDependencyRefresher } from '..';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('owner-restricted dependency index', () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-restricted-index-')));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('answers exactly the unrestricted answers filtered to the selected owners', () => {
    const shared = write('shared.md', 'shared');
    const own = write('guide/own.md', 'own');
    const later = absolute('guide/later.md');
    const gone = write('guide/gone.md', 'gone');
    const program = write('src/program.ts', 'program');
    const programOnly = write('src/definition-only.ts', 'definition');
    const missingModule = absolute('src/missing-module.ts');
    const linked = absolute('linked');
    fs.symlinkSync(path.dirname(shared), linked);
    const viaLink = `${linked}/shared.md`;
    const globRoot = absolute('api');
    write('api/member.ts', 'member');
    const glob: Dependency = {
      kind: 'glob',
      root: globRoot,
      include: ['**/*.ts'],
      exclude: [],
      members: [`${globRoot}/member.ts`],
    };
    const artifacts = [
      aggregate('aggregate', [
        {
          kind: 'semantic',
          scopeId: 'program',
          digest: 'p1',
          files: [program, programOnly],
          reason: 'Program',
        },
        { kind: 'content', path: program, digest: sha('program') },
        { kind: 'existence', path: missingModule, exists: false },
        { ...glob, root: absolute('src'), members: [program, programOnly] },
      ]),
      page(
        'guide',
        [
          { kind: 'content', path: shared, digest: sha('shared') },
          { kind: 'content', path: own, digest: sha('own') },
          { kind: 'existence', path: later, exists: false },
          { kind: 'existence', path: gone, exists: true },
          reference('Guide program'),
          { kind: 'keyword', key: 'Api', digest: 'binding' },
        ],
        ['Guide'],
        ['Api'],
      ),
      page('api', [glob, reference('API program')], ['Api'], ['Guide']),
      page(
        'linked-reader',
        [{ kind: 'content', path: viaLink, digest: sha('shared') }],
        [],
        ['Other'],
      ),
      page('plain', [{ kind: 'content', path: own, digest: sha('own') }]),
    ];
    // Round-trip through JSON like a session snapshot.
    const restored = JSON.parse(JSON.stringify(artifacts)) as PageArtifact[];
    const full = createDependencyIndex(restored);
    const ownerSets = [
      [],
      ['guide'],
      ['api'],
      ['linked-reader', 'plain'],
      ['guide', 'api', 'linked-reader', 'plain', 'aggregate'],
      ['unknown-owner'],
    ];
    const changeSets: FileChange[][] = [
      [{ kind: 'update', path: shared }],
      [{ kind: 'update', path: viaLink }],
      [
        { kind: 'update', path: own },
        { kind: 'create', path: later },
      ],
      [
        { kind: 'delete', path: gone },
        { kind: 'update', path: program },
      ],
      [{ kind: 'update', path: programOnly }],
      [{ kind: 'create', path: `${globRoot}/added.ts` }],
      [{ kind: 'create', path: missingModule }],
    ];
    const check = () => {
      for (const owners of ownerSets) {
        const restricted = createDependencyIndex(restored, { owners });
        const selected = new Set(owners);
        for (const changes of changeSets) {
          expect(restricted.affected(changes)).toEqual(
            full.affected(changes).filter((reason) => selected.has(reason.ownerId)),
          );
        }
        for (const keys of [['Api'], ['Guide'], ['Other', 'Api'], ['Missing']]) {
          expect(restricted.affectedKeywords(keys)).toEqual(
            full.affectedKeywords(keys).filter((reason) => selected.has(reason.ownerId)),
          );
        }
      }
    };

    // Unchanged files: no reasons, except a definition-only program file (always semantic).
    check();
    expect(
      full.affected(changeSets.flat().filter((change) => change.path !== programOnly)),
    ).toEqual([]);
    expect(full.affected([{ kind: 'update', path: programOnly }])).toHaveLength(2);
    // Now change every observation and compare again.
    fs.writeFileSync(shared, 'shared changed');
    fs.writeFileSync(own, 'own changed');
    fs.writeFileSync(later, 'created');
    fs.unlinkSync(gone);
    fs.writeFileSync(program, 'program changed');
    fs.writeFileSync(`${globRoot}/added.ts`, 'added');
    fs.writeFileSync(missingModule, 'created');
    check();
    const everything = full.affected(changeSets.flat());
    expect(new Set(everything.map((reason) => reason.reason))).toEqual(
      new Set(['input', 'existence', 'semantic', 'membership']),
    );
    // The symlinked path alias reaches the reader through either spelling.
    expect(full.affected([{ kind: 'update', path: shared }])).toContainEqual({
      ownerId: 'linked-reader',
      reason: 'input',
      detail: viaLink,
    });
    // Keyword closure crosses owners that are not reported.
    expect(createDependencyIndex(restored, { owners: ['api'] }).affectedKeywords(['Api'])).toEqual([
      { ownerId: 'api', reason: 'keyword', detail: 'Guide' },
    ]);
  });

  it('still rejects an invalid semantic closure when restricted', () => {
    const artifacts = [page('guide', [reference('Guide program')])];
    expect(() => createDependencyIndex(artifacts, { owners: [] })).toThrow(
      /GRAPH_SEMANTIC_SCOPE_MISSING/,
    );
  });

  it('collapses dependencies into the same canonical order as a comparator sort', async () => {
    const files = ['b.md', 'a.md', 'c/a.md', 'a.md'].map((file) => write(file, file));
    const dependencies: Dependency[] = [
      { kind: 'existence', path: absolute('z/missing'), exists: false },
      ...files.map((file) => ({ kind: 'content' as const, path: file, digest: 'stale' })),
      { kind: 'keyword', key: 'b', digest: '' },
      { kind: 'keyword', key: 'a', digest: '' },
      { kind: 'existence', path: absolute('a/missing'), exists: false },
    ];
    const refreshed = await createDependencyRefresher().refresh(dependencies, []);
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
          .join(',')}}`;
      }
      return JSON.stringify(value);
    };
    const expected = [...refreshed.dependencies].sort((left, right) =>
      canonical(left).localeCompare(canonical(right)),
    );
    expect(refreshed.dependencies).toEqual(expected);
    expect(refreshed.dependencies).toHaveLength(7);
    expect(refreshed.digest).toBe(sha(canonical(expected)));
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

function reference(reason: string): Dependency {
  return { kind: 'semantic-reference', scopeId: 'program', digest: 'p1', reason };
}

function aggregate(id: string, dependencies: Dependency[]): PageArtifact {
  const value = page(id, dependencies);
  value.identity = { projectId: 'project', entryId: id, role: 'aggregate' };
  return value;
}

function page(
  id: string,
  dependencies: Dependency[],
  exports: string[] = [],
  uses: string[] = [],
): PageArtifact {
  return {
    id,
    identity: { projectId: 'project', entryId: id, role: 'content' },
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
