/** @vitest-environment node */

import { createHash } from 'node:crypto';
import {
  copyFile as copyFileTo,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename as renameFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type {
  ArtifactFingerprint,
  ArtifactSnapshot,
  CacheKey,
  CommitGuard,
  ContentDescriptor,
  FileOutput,
  OutputManifest,
  PageArtifact,
  SearchRecord,
} from '../../contracts';
import { hostPath } from '../../kernel/paths';
import {
  createArtifactCache,
  createOutputCommitter,
  JsonArtifactCache,
  RENAME_RETRY,
  retryingRename,
  TransactionalOutputCommitter,
} from '..';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporary(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`));
  temporaryRoots.push(root);
  return root;
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function output(file: string, content: string, role: FileOutput['role'] = 'content'): FileOutput {
  return { path: file, role, encoding: 'utf8', content, digest: digest(content) };
}

function fingerprint(seed: string = 'one'): ArtifactFingerprint {
  return {
    schemaVersion: 4,
    compilerVersion: 'compiler-1',
    toolchainDigest: `toolchain-${seed}`,
    configurationDigest: `configuration-${seed}`,
    inputDigest: `input-${seed}`,
    keywordDigest: `keywords-${seed}`,
  };
}

function artifact(
  projectId: string = 'project-one',
  id: string = 'guide:content:overview',
  outputs: FileOutput[] = [output('guides/overview/content.json', 'content-one')],
): PageArtifact {
  const search: SearchRecord = {
    breadcrumbs: ['Guide'],
    pageType: 'guide' as const,
    title: 'Guide',
    section: 'Overview',
    route: 'guide',
    fragment: 'overview',
    content: 'Search text',
  };
  return {
    id,
    identity: { projectId, entryId: 'guide', role: 'content', part: 'overview.md' },
    revision: 'artifact-revision-one',
    fingerprint: fingerprint(),
    dependencies: [
      { kind: 'content', path: '/workspace/overview.md', digest: 'source-one' },
      { kind: 'existence', path: '/workspace/include.nunj', exists: false },
    ],
    content: [
      {
        ir: {
          schemaVersion: 4,
          id: 'guide:tab:overview',
          entryId: 'guide',
          role: 'guide-tab',
          title: 'Overview',
          route: '',
          absoluteRoute: 'guide',
          html: '<h2 id="overview">Overview</h2>',
          anchors: [
            { anchorId: 'overview', anchor: 'overview', title: 'Overview', type: 'heading' },
          ],
          exportedKeywords: [{ key: 'Guide', title: 'Guide', path: 'guide' }],
          usedKeywords: ['Other'],
          dependencies: [{ kind: 'keyword', key: 'Other', digest: 'missing' }],
          diagnostics: [],
        },
        html: '<h2 id="overview">Overview</h2>',
        searchRecords: [search],
        keywordDigest: 'keywords-one',
      },
    ],
    exportedKeywords: [{ key: 'Guide', title: 'Guide', path: 'guide', type: 'link' }],
    usedKeywords: ['Other'],
    searchRecords: [search],
    routes: [{ id: 'guide', path: 'guide', title: 'Guide', modulePath: 'guides/overview/page.ts' }],
    apiList: [],
    outputs,
    diagnostics: [
      { code: 'INFO', severity: 'info', stage: 'content', message: 'cached diagnostic' },
    ],
  };
}

function selectiveArtifact(): PageArtifact {
  const value = artifact();
  const tab = value.content[0];
  const header: ContentDescriptor = {
    schemaVersion: 4,
    id: 'guide:header',
    ownerId: value.id,
    ordinal: 0,
    role: 'header',
    locator: { kind: 'header' },
    title: 'Guide',
    route: '',
    absoluteRoute: 'guide',
    searchBreadcrumbs: [],
    dependencies: [{ kind: 'existence', path: '/workspace/header.njk', exists: true }],
    inputDigest: 'header-input',
    requestDigest: 'header-request',
    closureIds: [],
  };
  const body: ContentDescriptor = {
    schemaVersion: 4,
    id: tab.ir.id,
    ownerId: value.id,
    ordinal: 1,
    role: 'guide-tab',
    locator: { kind: 'guide-tab', markdown: '/workspace/overview.md' },
    title: tab.ir.title,
    route: tab.ir.route,
    absoluteRoute: tab.ir.absoluteRoute,
    searchBreadcrumbs: [],
    dependencies: [{ kind: 'content', path: '/workspace/overview.md', digest: 'source-one' }],
    inputDigest: 'body-input',
    requestDigest: 'body-request',
    closureIds: [header.id],
  };
  value.contentDescriptors = [header, body];
  // Every descriptor is ready: the header has its linked content too.
  value.content.unshift({
    ir: {
      schemaVersion: 4,
      id: header.id,
      entryId: 'guide',
      role: 'header',
      title: header.title,
      route: header.route,
      absoluteRoute: header.absoluteRoute,
      html: '<h1>Guide</h1>',
      anchors: [],
      exportedKeywords: [],
      usedKeywords: [],
      dependencies: [],
      diagnostics: [],
    },
    html: '<h1>Guide</h1>',
    searchRecords: [],
    keywordDigest: 'keywords-header',
  });
  return value;
}

function snapshot(
  artifacts: PageArtifact[],
  revision: string = 'snapshot-one',
  projectId: string = artifacts[0]?.identity.projectId ?? 'project-one',
): ArtifactSnapshot {
  return {
    projectId,
    revision,
    artifacts,
    globalKeywords: [{ key: 'Global', title: 'Global', path: '/global' }],
    remoteKeywords: [{ loaderId: 'remote', digest: 'remote-one', keywords: [] }],
  };
}

function guard(current: () => boolean = () => true): CommitGuard {
  return { isCurrent: () => current() };
}

async function artifactFile(root: string): Promise<string> {
  const projects = await readdir(root);
  const files = await readdir(path.join(root, projects[0]));
  return path.join(root, projects[0], files[0]);
}

function semanticReference(): PageArtifact['dependencies'][number] {
  return {
    kind: 'semantic-reference',
    scopeId: 'project-program',
    digest: 'program-one',
    reason: 'Whole program',
  };
}

function semanticOwner(
  id: string = 'program-owner',
  programDigest: string = 'program-one',
): PageArtifact {
  const owner = artifact('project-one', id, []);
  owner.identity = { projectId: 'project-one', entryId: id, role: 'aggregate' };
  owner.dependencies = [
    {
      kind: 'semantic',
      scopeId: 'project-program',
      digest: programDigest,
      files: ['/workspace/source.ts'],
      reason: 'Whole program',
    },
    { kind: 'existence', path: '/workspace/missing-module.ts', exists: false },
  ];
  owner.content = [];
  return owner;
}

test('semantic references survive individual cache restore and complete candidate JSON publication', async () => {
  const cache = createArtifactCache(await temporary('reference-cache'));
  const page = artifact();
  page.dependencies.push(semanticReference());
  page.content[0].ir.dependencies.push(semanticReference());
  await cache.write(page);
  const restored = await cache.read({ identity: page.identity, fingerprint: page.fingerprint });
  expect(restored).toEqual({ status: 'hit', artifact: page });
  // Page caches validate syntax independently; only the complete candidate can prove closure.
  if (restored.status !== 'hit') throw new Error('Expected reference cache hit');
  const owner = semanticOwner();
  await cache.write(owner);
  expect(await cache.read({ identity: owner.identity, fingerprint: owner.fingerprint })).toEqual({
    status: 'hit',
    artifact: owner,
  });
  const root = await temporary('reference-publication');
  const committer = createOutputCommitter({ outputRoot: root });
  try {
    const candidate = JSON.parse(
      JSON.stringify(snapshot([restored.artifact, owner])),
    ) as ArtifactSnapshot;
    expect(
      await committer.commit({ generation: 1, candidate }, guard(), new AbortController().signal),
    ).toMatchObject({ status: 'committed' });
    expect(await readFile(path.join(root, page.outputs[0].path), 'utf8')).toBe('content-one');
  } finally {
    await committer.dispose();
  }
});

test('full semantic dependencies remain readable in legacy schema-1 page caches', async () => {
  const cache = createArtifactCache(await temporary('full-semantic-cache'));
  const page = artifact();
  page.dependencies.push(semanticOwner().dependencies[0]);
  page.content[0].ir.dependencies.push(semanticOwner().dependencies[0]);
  await cache.write(page);
  expect(await cache.read({ identity: page.identity, fingerprint: page.fingerprint })).toEqual({
    status: 'hit',
    artifact: page,
  });
});

test('non-physical dependencies survive a cache restore and a candidate commit unchanged', async () => {
  const cache = createArtifactCache(await temporary('non-physical-cache'));
  const page = artifact();
  const closure = {
    kind: 'semantic-closure' as const,
    scopeId: 'program',
    key: 'unit',
    digest: 'c',
  };
  const evaluated = { kind: 'evaluated' as const, entryId: 'entry', digest: 'e' };
  page.dependencies.push(closure, evaluated);
  page.content[0].ir.dependencies.push(closure, evaluated);
  await cache.write(page);
  const restored = await cache.read({ identity: page.identity, fingerprint: page.fingerprint });
  expect(restored).toEqual({ status: 'hit', artifact: page });
  const root = await temporary('non-physical-publication');
  const committer = createOutputCommitter({ outputRoot: root });
  try {
    const candidate = JSON.parse(JSON.stringify(snapshot([page]))) as ArtifactSnapshot;
    expect(
      await committer.commit({ generation: 1, candidate }, guard(), new AbortController().signal),
    ).toMatchObject({ status: 'committed' });
  } finally {
    await committer.dispose();
  }
});

test.each(['page', 'ir'] as const)(
  'rejects malformed non-physical dependencies in %s dependencies',
  async (location) => {
    const cacheRoot = await temporary('invalid-non-physical-cache');
    const cache = createArtifactCache(cacheRoot);
    const valid = artifact();
    await cache.write(valid);
    const cacheFile = await artifactFile(cacheRoot);
    const closure = { kind: 'semantic-closure', scopeId: 'program', key: 'unit', digest: 'c' };
    const evaluated = { kind: 'evaluated', entryId: 'entry', digest: 'e' };
    const malformed: unknown[] = [
      { ...closure, path: '/workspace/source.ts' },
      { ...evaluated, reason: 'evaluated' },
    ];
    for (const [base, fields] of [
      [closure, ['scopeId', 'key', 'digest']],
      [evaluated, ['entryId', 'digest']],
    ] as const) {
      for (const field of fields) {
        const missing: Record<string, unknown> = { ...base };
        delete missing[field];
        malformed.push(missing, { ...base, [field]: 1 });
      }
    }
    for (const dependency of malformed) {
      const value = structuredClone(valid);
      const dependencies =
        location === 'page' ? value.dependencies : value.content[0].ir.dependencies;
      (dependencies as unknown[]).push(dependency);
      await expect(cache.write(value)).rejects.toThrow('complete JSON-safe');
      await writeFile(cacheFile, JSON.stringify(value));
      expect(
        await cache.read({ identity: valid.identity, fingerprint: valid.fingerprint }),
      ).toMatchObject({ status: 'miss', reason: 'invalid' });
    }
  },
);

test.each(['page', 'ir'] as const)(
  'rejects malformed and extra semantic-reference fields in %s dependencies',
  async (location) => {
    const cacheRoot = await temporary('invalid-reference-cache');
    const cache = createArtifactCache(cacheRoot);
    const valid = artifact();
    await cache.write(valid);
    const cacheFile = await artifactFile(cacheRoot);
    const base = {
      kind: 'semantic-reference',
      scopeId: 'program',
      digest: 'one',
      reason: 'program',
    };
    const malformed: unknown[] = [
      { ...base, unexpected: true },
      { ...base, files: [] },
      JSON.parse(
        '{"kind":"semantic-reference","scopeId":"program","digest":"one","reason":"program","__proto__":{"polluted":true}}',
      ),
    ];
    for (const field of ['scopeId', 'digest', 'reason'] as const) {
      const missing: Record<string, unknown> = { ...base };
      delete missing[field];
      malformed.push(missing, { ...base, [field]: 1 }, { ...base, [field]: null });
    }
    for (const dependency of malformed) {
      const value = structuredClone(valid);
      const dependencies =
        location === 'page' ? value.dependencies : value.content[0].ir.dependencies;
      (dependencies as unknown[]).push(dependency);
      await expect(cache.write(value)).rejects.toThrow('complete JSON-safe');
      await writeFile(cacheFile, JSON.stringify(value));
      expect(
        await cache.read({ identity: valid.identity, fingerprint: valid.fingerprint }),
      ).toMatchObject({ status: 'miss', reason: 'invalid' });
    }
    expect(Object.prototype).not.toHaveProperty('polluted');
  },
);

test.each(['missing', 'stale', 'ambiguous', 'ir-missing', 'ir-stale', 'unknown-field'] as const)(
  'candidate scope validation blocks %s references before mutation and preserves last good outputs',
  async (scenario) => {
    const root = await temporary('scope-rejected-publication');
    const mutations: string[] = [];
    const committer = createOutputCommitter({
      outputRoot: root,
      beforeMutation: (operation) => {
        mutations.push(operation);
      },
    });
    try {
      const original = artifact();
      const first = await committer.commit(
        { generation: 1, candidate: snapshot([original]) },
        guard(),
        new AbortController().signal,
      );
      expect(first.status).toBe('committed');
      const manifest = await readFile(path.join(root, '.ng-doc-output-manifest.json'), 'utf8');
      const page = artifact('project-one', original.id, [output('new.txt', 'must-not-publish')]);
      const dependency = semanticReference();
      const dependencies = scenario.startsWith('ir-')
        ? page.content[0].ir.dependencies
        : page.dependencies;
      dependencies.push(dependency);
      if (scenario === 'unknown-field') Object.assign(dependency, { files: [] });
      const owners = scenario === 'missing' || scenario === 'ir-missing' ? [] : [semanticOwner()];
      if (scenario === 'stale' || scenario === 'ir-stale')
        Object.assign(dependency, { digest: 'stale-program' });
      if (scenario === 'ambiguous')
        owners.push(semanticOwner('conflicting-owner', 'another-program'));
      mutations.length = 0;
      const result = await committer.commit(
        { generation: 2, candidate: snapshot([page, ...owners], 'rejected') },
        guard(),
        new AbortController().signal,
      );
      expect(result.status).toBe('failed');
      expect(result.diagnostics.some((item) => item.severity === 'error')).toBe(true);
      if (scenario === 'unknown-field')
        expect(result.diagnostics[0].code).toBe('OUTPUT_CANDIDATE_INVALID');
      else if (scenario.endsWith('missing'))
        expect(result.diagnostics[0].code).toBe('GRAPH_SEMANTIC_SCOPE_MISSING');
      else if (scenario.endsWith('stale'))
        expect(result.diagnostics[0].code).toBe('GRAPH_SEMANTIC_SCOPE_STALE');
      else
        expect(['GRAPH_SEMANTIC_SCOPE_AMBIGUOUS', 'GRAPH_SEMANTIC_SCOPE_CONFLICT']).toContain(
          result.diagnostics[0].code,
        );
      expect(mutations).toEqual([]);
      expect(await readFile(path.join(root, original.outputs[0].path), 'utf8')).toBe('content-one');
      expect(await readFile(path.join(root, '.ng-doc-output-manifest.json'), 'utf8')).toBe(
        manifest,
      );
      expect(await readdir(root)).toEqual(
        expect.arrayContaining(['guides', '.ng-doc-output-manifest.json']),
      );
      await expect(stat(path.join(root, 'new.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await readdir(root)).some((name) => name.startsWith('.ng-doc-stage-'))).toBe(false);
    } finally {
      await committer.dispose();
    }
  },
);

test('cache cold/warm JSON roundtrip preserves the complete artifact', async () => {
  const root = await temporary('ng-doc-cache');
  const cache = createArtifactCache(root);
  const value = artifact();
  const key: CacheKey = { identity: value.identity, fingerprint: value.fingerprint };
  await expect(cache.read(key)).resolves.toEqual({
    status: 'miss',
    reason: 'absent',
    diagnostics: [],
  });
  await cache.write(value);
  const restored = await cache.read(key);
  expect(restored).toEqual({ status: 'hit', artifact: value });
  expect(
    restored.status === 'hit' ? JSON.parse(JSON.stringify(restored.artifact)) : undefined,
  ).toStrictEqual(value);
});

test.each([
  'foreign-owner',
  'forged-locator',
  'nonphysical-dependency',
  'cycle',
  'duplicate-ready',
  'metadata-mismatch',
  'deferred',
  'unready',
  'unknown-field',
  'missing-header-closure',
  'duplicate-physical',
  'empty-request-digest',
  'foreign-ir-owner',
] as const)('cache rejects malformed selective descriptor plan: %s', async (scenario) => {
  const root = await temporary(`selective-${scenario}`);
  const cache = createArtifactCache(root);
  const value = selectiveArtifact();
  const descriptors = value.contentDescriptors!;
  if (scenario === 'foreign-owner') descriptors[0].ownerId = 'foreign';
  if (scenario === 'forged-locator')
    descriptors[1].locator = {
      kind: 'api-tab',
      declarationId: 'forged',
    } as ContentDescriptor['locator'];
  if (scenario === 'nonphysical-dependency')
    descriptors[1].dependencies = [{ kind: 'keyword', key: 'bad', digest: 'bad' }];
  if (scenario === 'cycle') descriptors[0].closureIds = [descriptors[1].id];
  if (scenario === 'duplicate-ready')
    value.content.push(JSON.parse(JSON.stringify(value.content[0])));
  if (scenario === 'metadata-mismatch') descriptors[1].title = 'Forged title';
  // The deferred-content field of schema version 2 is no longer part of the shape.
  if (scenario === 'deferred') Object.assign(value, { deferredContentIds: [] });
  if (scenario === 'unready')
    value.content = value.content.filter((item) => item.ir.id !== descriptors[0].id);
  if (scenario === 'unknown-field') Object.assign(descriptors[0], { forged: true });
  if (scenario === 'missing-header-closure') descriptors[1].closureIds = [];
  if (scenario === 'duplicate-physical')
    descriptors[1].dependencies = [
      { kind: 'content', path: '/a.md', digest: 'a' },
      { kind: 'content', path: '/a.md', digest: 'a' },
    ];
  if (scenario === 'empty-request-digest') descriptors[1].requestDigest = '';
  if (scenario === 'foreign-ir-owner') value.content[1].ir.entryId = 'another-entry';
  await expect(cache.write(value)).rejects.toThrow('complete JSON-safe');
  const valid = selectiveArtifact();
  await cache.write(valid);
  const file = await artifactFile(root);
  await writeFile(file, JSON.stringify(value));
  await expect(
    cache.read({ identity: valid.identity, fingerprint: valid.fingerprint }),
  ).resolves.toMatchObject({ status: 'miss', reason: 'invalid' });
});

test.each(['/docs/page.md', 'C:/docs/page.md', '//server/share/page.md'])(
  'cache accepts canonical cross-platform descriptor path %s',
  async (physical) => {
    const root = await temporary('canonical-descriptor');
    const cache = createArtifactCache(root);
    const value = selectiveArtifact();
    value.contentDescriptors![1].locator = { kind: 'guide-tab', markdown: physical };
    value.contentDescriptors![1].dependencies = [
      { kind: 'content', path: physical, digest: 'data' },
    ];
    await cache.write(value);
    expect(
      await cache.read({ identity: value.identity, fingerprint: value.fingerprint }),
    ).toMatchObject({ status: 'hit' });
  },
);

test.each([
  'relative.md',
  '/docs/../page.md',
  '/docs//page.md',
  'C:\\docs\\page.md',
  '//server/../page.md',
  '/docs/page.md/',
])('cache rejects noncanonical descriptor path %s', async (physical) => {
  const root = await temporary('invalid-descriptor-path');
  const cache = createArtifactCache(root);
  const value = selectiveArtifact();
  value.contentDescriptors![1].locator = { kind: 'guide-tab', markdown: physical };
  await expect(cache.write(value)).rejects.toThrow('complete JSON-safe');
  value.contentDescriptors![1].locator = { kind: 'guide-tab', markdown: '/valid.md' };
  value.contentDescriptors![1].dependencies = [
    { kind: 'existence', path: physical, exists: false },
  ];
  await expect(cache.write(value)).rejects.toThrow('complete JSON-safe');
});

test('rejects a non-array descriptor plan without throwing', async () => {
  const root = await temporary('descriptor-shapes');
  const cache = createArtifactCache(root);
  const malformed = selectiveArtifact() as unknown as { contentDescriptors: unknown };
  malformed.contentDescriptors = { forged: true };
  await expect(cache.write(malformed as unknown as PageArtifact)).rejects.toThrow(
    'complete JSON-safe',
  );
});

test('commits a snapshot without a content index and rejects one that carries it', async () => {
  const root = await temporary('content-index');
  const committer = createOutputCommitter({ outputRoot: root });
  try {
    const candidate = snapshot([selectiveArtifact()]);
    await expect(
      committer.commit({ generation: 1, candidate }, guard(), new AbortController().signal),
    ).resolves.toMatchObject({ status: 'committed' });
    // The content index of schema version 2 is no longer part of the snapshot shape.
    const withIndex = Object.assign(snapshot([selectiveArtifact()], 'snapshot-two'), {
      contentIndex: {
        schemaVersion: 1,
        revision: 'index-revision',
        state: 'complete',
        readyContentIds: ['guide:header', 'guide:tab:overview'],
        totalContentIds: 2,
        diagnostics: [],
      },
    });
    await expect(
      committer.commit(
        { generation: 2, candidate: withIndex },
        guard(),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'OUTPUT_CANDIDATE_INVALID' })],
    });
  } finally {
    await committer.dispose();
  }
});

test('cache safely misses corrupt, colliding, stale, and non-JSON values', async () => {
  const root = await temporary('ng-doc-cache-invalid');
  const cache = new JsonArtifactCache({ root });
  const value = artifact();
  await cache.write(value);
  const file = await artifactFile(root);
  await writeFile(file, '{broken');
  await expect(
    cache.read({ identity: value.identity, fingerprint: value.fingerprint }),
  ).resolves.toMatchObject({
    status: 'miss',
    reason: 'invalid',
    diagnostics: [expect.objectContaining({ code: 'ARTIFACT_CACHE_INVALID' })],
  });

  await cache.write(value);
  const collision = structuredClone(value);
  collision.identity.entryId = 'another-entry';
  await writeFile(file, JSON.stringify(collision));
  await expect(
    cache.read({ identity: value.identity, fingerprint: value.fingerprint }),
  ).resolves.toMatchObject({
    status: 'miss',
    reason: 'invalid',
    diagnostics: [expect.objectContaining({ code: 'ARTIFACT_CACHE_IDENTITY' })],
  });

  await cache.write(value);
  await expect(
    cache.read({ identity: value.identity, fingerprint: fingerprint('changed') }),
  ).resolves.toMatchObject({
    status: 'miss',
    reason: 'fingerprint',
    diagnostics: [expect.objectContaining({ code: 'ARTIFACT_CACHE_FINGERPRINT' })],
  });
  const undefinedValue = structuredClone(value) as PageArtifact & { extra?: undefined };
  undefinedValue.extra = undefined;
  await expect(cache.write(undefinedValue)).rejects.toThrow('complete JSON-safe');
  const sparseValue = structuredClone(value);
  sparseValue.dependencies = new Array(1) as PageArtifact['dependencies'];
  await expect(cache.write(sparseValue)).rejects.toThrow('complete JSON-safe');
  const negativeZeroValue = structuredClone(value);
  negativeZeroValue.diagnostics[0].source = { path: '/workspace/overview.md', line: -0 };
  await expect(cache.write(negativeZeroValue)).rejects.toThrow('complete JSON-safe');
  const cyclicValue = structuredClone(value);
  const cyclicDependencies = cyclicValue.dependencies as unknown[];
  cyclicDependencies.push(cyclicDependencies);
  await expect(cache.write(cyclicValue)).rejects.toBeInstanceOf(TypeError);
  const badDigest = structuredClone(value);
  badDigest.outputs[0].digest = 'wrong';
  await expect(cache.write(badDigest)).rejects.toThrow('complete JSON-safe');
});

test('removes the abort listener when a mutation hook rejects', async () => {
  const root = await temporary('ng-doc-hook-listener');
  const controller = new AbortController();
  const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: async () => {
      throw new Error('hook rejected');
    },
  });
  await expect(
    committer.commit(
      { generation: 1, candidate: snapshot([artifact()]) },
      guard(),
      controller.signal,
    ),
  ).resolves.toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_COMMIT_FAILED' })],
  });
  expect(remove).toHaveBeenCalled();
  remove.mockRestore();
});

test('cache isolates identical entry identities from different projects', async () => {
  const root = await temporary('ng-doc-cache-projects');
  const cache = new JsonArtifactCache({ root });
  const first = artifact('first');
  const second = artifact('second');
  second.identity = { ...first.identity, projectId: 'second' };
  await cache.write(first);
  await cache.write(second);
  await expect(
    cache.read({ identity: first.identity, fingerprint: first.fingerprint }),
  ).resolves.toMatchObject({ status: 'hit', artifact: { identity: { projectId: 'first' } } });
  await expect(
    cache.read({ identity: second.identity, fingerprint: second.fingerprint }),
  ).resolves.toMatchObject({ status: 'hit', artifact: { identity: { projectId: 'second' } } });
  expect(await readdir(root)).toHaveLength(2);
});

test('commits real files, preserves no-op mtimes, and restores a missing output', async () => {
  const root = await temporary('ng-doc-output');
  const operations: string[] = [];
  const committer = createOutputCommitter({
    outputRoot: root,
    beforeMutation: (operation, target) => {
      operations.push(`${operation}:${path.basename(target)}`);
    },
  });
  const value = artifact('project-one', 'owner', [
    output('routes.ts', 'routes-one', 'routes'),
    output('content/data.json', 'content-one', 'content'),
    output('assets/icon.bin', Buffer.from([0, 1, 2]).toString('base64'), 'asset'),
  ]);
  value.outputs[2].encoding = 'base64';
  value.outputs[2].digest = digest(Buffer.from([0, 1, 2]));
  await writeFile(path.join(root, 'unrelated.txt'), 'keep');
  const first = await committer.commit(
    { generation: 1, candidate: snapshot([value]) },
    guard(),
    new AbortController().signal,
  );
  expect(first).toMatchObject({
    status: 'committed',
    written: ['assets/icon.bin', 'content/data.json', 'routes.ts'],
    removed: [],
  });
  expect(await readFile(path.join(root, 'assets/icon.bin'))).toEqual(Buffer.from([0, 1, 2]));
  expect(operations.indexOf('publish-output:data.json')).toBeLessThan(
    operations.indexOf('publish-output:routes.ts'),
  );
  const before = (await stat(path.join(root, 'content/data.json'))).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 30));
  const second = await committer.commit(
    {
      generation: 2,
      candidate: snapshot([value]),
      previous: first.status === 'committed' ? first.manifest : undefined,
    },
    guard(),
    new AbortController().signal,
  );
  expect(second).toMatchObject({ status: 'committed', written: [], removed: [] });
  expect((await stat(path.join(root, 'content/data.json'))).mtimeMs).toBe(before);
  await rm(path.join(root, 'content/data.json'));
  const third = await committer.commit(
    {
      generation: 3,
      candidate: snapshot([value]),
      previous: second.status === 'committed' ? second.manifest : undefined,
    },
    guard(),
    new AbortController().signal,
  );
  expect(third).toMatchObject({ status: 'committed', written: ['content/data.json'] });
  expect(await readFile(path.join(root, 'unrelated.txt'), 'utf8')).toBe('keep');
  await committer.dispose();
});

test('fresh committer preserves identical manifest bytes and mtime while repairing missing output', async () => {
  const root = await temporary('ng-doc-manifest-noop');
  const candidate = snapshot([artifact('project-one', 'owner', [output('page.ts', 'stable')])]);
  const first = createOutputCommitter({ outputRoot: root });
  expect(
    await first.commit({ generation: 1, candidate }, guard(), new AbortController().signal),
  ).toMatchObject({ status: 'committed' });
  await first.dispose();
  const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
  await utimes(manifestPath, 123456, 123456);
  const before = await stat(manifestPath);
  const writes: string[] = [];
  const fresh = createOutputCommitter({
    outputRoot: root,
    beforeMutation: (operation, target) => {
      writes.push(`${operation}:${path.basename(target)}`);
    },
  });
  expect(
    await fresh.commit({ generation: 1, candidate }, guard(), new AbortController().signal),
  ).toMatchObject({ status: 'committed', written: [], removed: [] });
  expect((await stat(manifestPath)).mtimeMs).toBe(before.mtimeMs);
  expect(writes).toEqual([]);
  await rm(path.join(root, 'page.ts'));
  expect(
    await fresh.commit({ generation: 1, candidate }, guard(), new AbortController().signal),
  ).toMatchObject({ status: 'committed', written: ['page.ts'] });
  expect(await readFile(path.join(root, 'page.ts'), 'utf8')).toBe('stable');
  expect((await stat(manifestPath)).mtimeMs).toBe(before.mtimeMs);
  expect(writes.every((value) => !value.endsWith('.ng-doc-output-manifest.json'))).toBe(true);
  expect(
    await fresh.commit({ generation: 2, candidate }, guard(), new AbortController().signal),
  ).toMatchObject({ status: 'committed', manifest: { generation: 2 } });
  expect(JSON.parse(await readFile(manifestPath, 'utf8')).generation).toBe(2);
  expect((await stat(manifestPath)).mtimeMs).not.toBe(before.mtimeMs);
  await fresh.dispose();
});

test('rename/delete removes only previously owned orphan outputs', async () => {
  const root = await temporary('ng-doc-rename');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const old = artifact('project-one', 'owner', [output('old/page.ts', 'old')]);
  const first = await committer.commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  await writeFile(path.join(root, 'old/unrelated.ts'), 'mine');
  const renamed = artifact('project-one', 'owner', [output('new/page.ts', 'new')]);
  const second = await committer.commit(
    {
      generation: 2,
      candidate: snapshot([renamed], 'snapshot-two'),
      previous: first.status === 'committed' ? first.manifest : undefined,
    },
    guard(),
    new AbortController().signal,
  );
  expect(second).toMatchObject({
    status: 'committed',
    written: ['new/page.ts'],
    removed: ['old/page.ts'],
  });
  await expect(readFile(path.join(root, 'old/page.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(path.join(root, 'old/unrelated.ts'), 'utf8')).toBe('mine');
});

test('rejects collisions, traversal, bad digest, project mismatch, and symlink escapes before writes', async () => {
  const root = await temporary('ng-doc-invalid-output');
  const outside = await temporary('ng-doc-outside');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const duplicateOne = artifact('project-one', 'one', [output('same.txt', 'one')]);
  const duplicateTwo = artifact('project-one', 'two', [output('same.txt', 'two')]);
  duplicateTwo.identity.part = 'second.md';
  const duplicate = snapshot([duplicateOne, duplicateTwo]);
  expect(
    await committer.commit(
      { generation: 1, candidate: duplicate },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_PATH_COLLISION' })],
  });
  const traversal = artifact('project-one', 'one', [output('../escape.txt', 'escape')]);
  expect(
    await committer.commit(
      { generation: 2, candidate: snapshot([traversal]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_INVALID' })],
  });
  const bad = artifact('project-one', 'one', [output('bad.txt', 'bad')]);
  bad.outputs[0].digest = 'wrong';
  expect(
    await committer.commit(
      { generation: 3, candidate: snapshot([bad]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_CANDIDATE_INVALID' })],
  });
  const foreign = artifact('foreign', 'one', [output('foreign.txt', 'foreign')]);
  expect(
    await committer.commit(
      { generation: 4, candidate: snapshot([foreign], 'foreign', 'project-one') },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_PROJECT_MISMATCH' })],
  });
  await mkdir(root, { recursive: true });
  await symlink(outside, path.join(root, 'linked'));
  const linked = artifact('project-one', 'one', [output('linked/escape.txt', 'escape')]);
  expect(
    await committer.commit(
      { generation: 5, candidate: snapshot([linked]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [
      expect.objectContaining({
        code: 'OUTPUT_COMMIT_FAILED',
        message: expect.stringContaining('symlink'),
      }),
    ],
  });
  await expect(readFile(path.join(outside, 'escape.txt'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

test('allows dotted in-root directories and rejects byte-identical unowned collisions', async () => {
  const root = await temporary('ng-doc-dotted-output');
  const dotted = artifact('project-one', 'dotted', [output('..docs/page.txt', 'dotted')]);
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  await expect(
    committer.commit(
      { generation: 1, candidate: snapshot([dotted]) },
      guard(),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({ status: 'committed', written: ['..docs/page.txt'] });
  expect(await readFile(path.join(root, '..docs/page.txt'), 'utf8')).toBe('dotted');

  const collisionRoot = await temporary('ng-doc-unowned-output');
  await writeFile(path.join(collisionRoot, 'existing.txt'), 'same');
  const collision = artifact('project-one', 'collision', [output('existing.txt', 'same')]);
  const guarded = new TransactionalOutputCommitter({ outputRoot: collisionRoot });
  await expect(
    guarded.commit(
      { generation: 1, candidate: snapshot([collision]) },
      guard(),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_UNOWNED_COLLISION' })],
  });
  expect(await readFile(path.join(collisionRoot, 'existing.txt'), 'utf8')).toBe('same');
  await expect(
    readFile(path.join(collisionRoot, '.ng-doc-output-manifest.json')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

/** A backup copy refused by the file system (a full volume). */
const copyRefused = async (): Promise<never> => {
  throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
};

// A backup is a copy; where the file system refuses one, the file is renamed away instead.
// Either way a backup that fails, before or after it took effect, leaves the last good outputs.
describe.each([
  { backup: 'copy', move: false },
  { backup: 'rename fallback', move: true },
])('backup faults ($backup)', ({ move }) => {
  /**
   * The file system port whose backup of `source` fails, `after` it took effect or before.
   * @param source The file whose backup fails.
   * @param after Whether the backup happened before the failure.
   */
  const faulty = (source: string, after: boolean) => {
    const fault = async (from: unknown, to: unknown, operation: () => Promise<void>) => {
      const backup =
        String(from) === source && String(to).includes(`${path.sep}backups${path.sep}`);
      if (backup && !after) throw new Error('backup failed before mutation');
      await operation();
      if (backup) throw new Error('backup failed after mutation');
    };
    return move
      ? {
          copyFile: copyRefused,
          rename: (async (from, to) =>
            fault(from, to, () => renameFile(from, to))) as typeof renameFile,
        }
      : {
          copyFile: (from: string, to: string) => fault(from, to, () => copyFileTo(from, to)),
        };
  };

  test('preserves originals when an output backup fails before or after mutation', async () => {
    const root = await temporary('ng-doc-backup-uncertainty');
    const initial = new TransactionalOutputCommitter({ outputRoot: root });
    const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
    const first = await initial.commit(
      { generation: 1, candidate: snapshot([old]) },
      guard(),
      new AbortController().signal,
    );
    const manifestBefore = await readFile(path.join(root, '.ng-doc-output-manifest.json'), 'utf8');
    const next = artifact('project-one', 'owner', [output('page.txt', 'new')]);
    for (const [generation, after] of [
      [2, true],
      [3, false],
    ] as const) {
      const fault = new TransactionalOutputCommitter({
        outputRoot: root,
        fileSystem: faulty(path.join(root, 'page.txt'), after),
      });
      const result = await fault.commit(
        {
          generation,
          candidate: snapshot([next], `next-${generation}`),
          previous: (first as { manifest: OutputManifest }).manifest,
        },
        guard(),
        new AbortController().signal,
      );
      expect(result.status).toBe('failed');
      expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('old');
      expect(await readFile(path.join(root, '.ng-doc-output-manifest.json'), 'utf8')).toBe(
        manifestBefore,
      );
    }
  });

  test('restores outputs and manifest when the manifest backup reports uncertain failure', async () => {
    const root = await temporary('ng-doc-manifest-backup-uncertainty');
    const initial = new TransactionalOutputCommitter({ outputRoot: root });
    const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
    const first = await initial.commit(
      { generation: 1, candidate: snapshot([old]) },
      guard(),
      new AbortController().signal,
    );
    const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
    const manifestBefore = await readFile(manifestPath, 'utf8');
    const fault = new TransactionalOutputCommitter({
      outputRoot: root,
      fileSystem: faulty(manifestPath, true),
    });
    const next = artifact('project-one', 'owner', [output('page.txt', 'new')]);
    const result = await fault.commit(
      {
        generation: 2,
        candidate: snapshot([next], 'next'),
        previous: (first as { manifest: OutputManifest }).manifest,
      },
      guard(),
      new AbortController().signal,
    );
    expect(result.status).toBe('failed');
    expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('old');
    expect(await readFile(manifestPath, 'utf8')).toBe(manifestBefore);
  });
});

test('replaces a changed output and the manifest in one step: neither is ever missing', async () => {
  const root = await temporary('ng-doc-publish-in-place');
  const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
  const first = await new TransactionalOutputCommitter({ outputRoot: root }).commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
  const manifestBefore = await readFile(manifestPath, 'utf8');
  // What a reader (or a watcher's stat) finds right before each publish rename.
  const seen: Array<[string, string]> = [];
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: async (operation, target) => {
      if (operation === 'publish-output' || operation === 'publish-manifest')
        seen.push([operation, await readFile(target, 'utf8')]);
    },
  });
  const next = artifact('project-one', 'owner', [output('page.txt', 'new')]);
  const result = await committer.commit(
    {
      generation: 2,
      candidate: snapshot([next], 'next'),
      previous: (first as { manifest: OutputManifest }).manifest,
    },
    guard(),
    new AbortController().signal,
  );
  expect(result.status).toBe('committed');
  expect(seen).toEqual([
    ['publish-output', 'old'],
    ['publish-manifest', manifestBefore],
  ]);
  expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('new');
});

test('publishes a new directory whole: whoever reads it finds every output in it', async () => {
  const root = await temporary('ng-doc-new-directory');
  const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
  const first = await new TransactionalOutputCommitter({ outputRoot: root }).commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  // What a watcher that reads each new directory once would find there.
  const listed = new Map<string, string[]>();
  const renamed: string[] = [];
  const publishing: string[] = [];
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: (operation, target) => {
      if (operation === 'publish-output') publishing.push(path.relative(root, target));
    },
    fileSystem: {
      rename: async (from, to) => {
        await renameFile(from, to);
        const target = path.relative(root, String(to));
        if (!target.startsWith('.ng-doc-stage-')) renamed.push(target);
        if (target === 'guides') {
          const walk = async (directory: string): Promise<string[]> =>
            (
              await Promise.all(
                (await readdir(directory, { withFileTypes: true })).map((entry) =>
                  entry.isDirectory()
                    ? walk(path.join(directory, entry.name))
                    : [path.relative(root, path.join(directory, entry.name))],
                ),
              )
            ).flat();
          listed.set(target, (await walk(String(to))).sort());
        }
      },
    },
  });
  const next = artifact('project-one', 'owner', [
    output('page.txt', 'new'),
    output('guides/one/page.ts', 'one'),
    output('guides/one/index/page.ts', 'index'),
    output('guides/two/page.ts', 'two'),
    output('routes.ts', 'routes', 'routes'),
  ]);
  const result = await committer.commit(
    {
      generation: 2,
      candidate: snapshot([next], 'next'),
      previous: (first as { manifest: OutputManifest }).manifest,
    },
    guard(),
    new AbortController().signal,
  );
  expect(result.status).toBe('committed');
  const published = ['guides/one/index/page.ts', 'guides/one/page.ts', 'guides/two/page.ts'];
  expect(listed.get('guides')).toEqual(published.map((file) => path.join(...file.split('/'))));
  // One rename for the new directory, one per file elsewhere, the late routes after it.
  expect(renamed).toEqual(['guides', 'page.txt', 'routes.ts', '.ng-doc-output-manifest.json']);
  expect(publishing).toEqual(
    [...published, 'page.txt', 'routes.ts'].map((file) => path.join(...file.split('/'))),
  );
  expect(await readFile(path.join(root, 'guides/one/index/page.ts'), 'utf8')).toBe('index');

  // A new directory that holds a late output (routes, context, search) would publish it before
  // the others: its outputs are published one by one, as in an existing directory.
  renamed.length = 0;
  const late = artifact('project-one', 'owner', [
    ...next.outputs,
    output('assets/search.json', '[]', 'search'),
    output('assets/icon.svg', '<svg/>', 'asset'),
  ]);
  const third = await committer.commit(
    {
      generation: 3,
      candidate: snapshot([late], 'late'),
      previous: (result as { manifest: OutputManifest }).manifest,
    },
    guard(),
    new AbortController().signal,
  );
  expect(third.status).toBe('committed');
  expect(renamed).toEqual([
    path.join('assets', 'icon.svg'),
    path.join('assets', 'search.json'),
    '.ng-doc-output-manifest.json',
  ]);
});

test('rolls a new directory back whole when the commit fails after publishing it', async () => {
  const root = await temporary('ng-doc-new-directory-rollback');
  const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
  const first = await new TransactionalOutputCommitter({ outputRoot: root }).commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
  const manifestBefore = await readFile(manifestPath, 'utf8');
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: (operation) => {
      if (operation === 'publish-manifest') throw new Error('manifest publish failed');
    },
  });
  const next = artifact('project-one', 'owner', [
    output('page.txt', 'new'),
    output('guides/one/page.ts', 'one'),
  ]);
  const result = await committer.commit(
    {
      generation: 2,
      candidate: snapshot([next], 'next'),
      previous: (first as { manifest: OutputManifest }).manifest,
    },
    guard(),
    new AbortController().signal,
  );
  expect(result.status).toBe('failed');
  expect(
    (await readdir(root)).filter((entry) => !entry.startsWith('.ng-doc-stage-')).sort(),
  ).toEqual(['.ng-doc-output-manifest.json', 'page.txt']);
  expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('old');
  expect(await readFile(manifestPath, 'utf8')).toBe(manifestBefore);
});

test('moves a file away to back it up where the file system cannot copy it', async () => {
  const root = await temporary('ng-doc-backup-fallback');
  const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
  const first = await new TransactionalOutputCommitter({ outputRoot: root }).commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  const moved: string[] = [];
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    fileSystem: {
      copyFile: copyRefused,
      rename: async (from, to) => {
        await renameFile(from, to);
        if (String(to).includes(`${path.sep}backups${path.sep}`))
          moved.push(path.relative(root, String(from)));
      },
    },
  });
  const next = artifact('project-one', 'owner', [output('page.txt', 'new')]);
  const result = await committer.commit(
    {
      generation: 2,
      candidate: snapshot([next], 'next'),
      previous: (first as { manifest: OutputManifest }).manifest,
    },
    guard(),
    new AbortController().signal,
  );
  expect(result.status).toBe('committed');
  expect(moved).toEqual(['page.txt', '.ng-doc-output-manifest.json']);
  expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('new');
});

/** The committed `page.txt` (`old`) of a fresh root, and the next candidate's request. */
async function backedUpRoot(name: string) {
  const root = await temporary(name);
  const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
  const first = await new TransactionalOutputCommitter({ outputRoot: root }).commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  const next = artifact('project-one', 'owner', [output('page.txt', 'new')]);
  const request = {
    generation: 2,
    candidate: snapshot([next], 'next'),
    previous: (first as { manifest: OutputManifest }).manifest,
  };
  const stages = async () =>
    (await readdir(root)).filter((entry) => entry.startsWith('.ng-doc-stage-'));
  return { root, request, stages, page: path.join(root, 'page.txt') };
}

// File systems do not agree on a code (a full volume, a file another process holds on Windows,
// network and FUSE mounts), so every file system error of the copy takes the move instead.
test.each(['ENOSPC', 'EPERM', 'EXDEV', 'EISDIR', 'EBUSY', 'EACCES', 'EIO', 'ENOSYS'])(
  'moves a file away to back it up when its copy fails with %s',
  async (code) => {
    const { root, request, stages, page } = await backedUpRoot(`ng-doc-backup-${code}`);
    const moved: string[] = [];
    const committer = new TransactionalOutputCommitter({
      outputRoot: root,
      fileSystem: {
        copyFile: async () => {
          throw Object.assign(new Error(`copy failed (${code})`), { code });
        },
        rename: async (from, to) => {
          await renameFile(from, to);
          if (String(to).includes(`${path.sep}backups${path.sep}`))
            moved.push(path.relative(root, String(from)));
        },
      },
    });
    const result = await committer.commit(request, guard(), new AbortController().signal);
    expect(result.status).toBe('committed');
    expect(moved).toEqual(['page.txt', '.ng-doc-output-manifest.json']);
    expect(await readFile(page, 'utf8')).toBe('new');
    expect(await stages()).toEqual([]);
  },
);

test('commits when a copy takes effect but reports an error', async () => {
  const { root, request, stages, page } = await backedUpRoot('ng-doc-backup-uncertain-copy');
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    fileSystem: {
      copyFile: async (from, to) => {
        await copyFileTo(from, to);
        throw Object.assign(new Error('copy reported failure'), { code: 'EIO' });
      },
    },
  });
  const result = await committer.commit(request, guard(), new AbortController().signal);
  expect(result.status).toBe('committed');
  expect(await readFile(page, 'utf8')).toBe('new');
  expect(await stages()).toEqual([]);
});

// A file the failed commit had not replaced yet is left in place: the very file, with its inode,
// bytes and modification time. One it had replaced gets the backup's bytes back. No stage is left.
test.each([
  { failure: 'output publish', target: 'page.txt', replaced: [] as string[] },
  { failure: 'manifest publish', target: '.ng-doc-output-manifest.json', replaced: ['page.txt'] },
])('restores the original files when the $failure fails', async ({ target, replaced }) => {
  const { root, request, stages, page } = await backedUpRoot('ng-doc-backup-copied-rollback');
  const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
  const files = [page, manifestPath];
  const before = await Promise.all(files.map((file) => stat(file, { bigint: true })));
  const manifestBefore = await readFile(manifestPath, 'utf8');
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    fileSystem: {
      rename: async (from, to) => {
        if (String(to) === path.join(root, target)) throw new Error('publish rename failed');
        await renameFile(from, to);
      },
    },
  });
  const result = await committer.commit(request, guard(), new AbortController().signal);
  expect(result.status).toBe('failed');
  expect(await readFile(page, 'utf8')).toBe('old');
  expect(await readFile(manifestPath, 'utf8')).toBe(manifestBefore);
  const after = await Promise.all(files.map((file) => stat(file, { bigint: true })));
  for (const [index, info] of after.entries()) {
    expect(info.nlink).toBe(1n);
    if (replaced.includes(path.relative(root, files[index]))) continue;
    expect(info.ino).toBe(before[index].ino);
    expect(info.mtimeNs).toBe(before[index].mtimeNs);
  }
  expect(await stages()).toEqual([]);
});

// inotify reports a link count change (`IN_ATTRIB`) of a watched file: chokidar's `fs.watch`
// backend (Linux) then reports the old bytes as a change and drops the publish's own change within
// its 50 ms throttle. So backing a file up must not touch it: no link, no metadata change.
test('backs a replaced file up without touching it', async () => {
  const { root, request } = await backedUpRoot('ng-doc-backup-untouched');
  const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
  const before = new Map(
    await Promise.all(
      [path.join(root, 'page.txt'), manifestPath].map(
        async (file) => [file, await stat(file, { bigint: true })] as const,
      ),
    ),
  );
  const seen: string[] = [];
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: async (operation, target) => {
      if (operation !== 'publish-output' && operation !== 'publish-manifest') return;
      const now = await stat(target, { bigint: true });
      const then = before.get(target)!;
      expect([now.ino, now.nlink, now.ctimeNs, now.mtimeNs]).toEqual([
        then.ino,
        1n,
        then.ctimeNs,
        then.mtimeNs,
      ]);
      seen.push(path.relative(root, target));
    },
  });
  const result = await committer.commit(request, guard(), new AbortController().signal);
  expect(result.status).toBe('committed');
  expect(seen).toEqual(['page.txt', '.ng-doc-output-manifest.json']);
});

test('preserves staged recovery data when rollback cannot restore a backup', async () => {
  const root = await temporary('ng-doc-rollback-recovery');
  const initial = new TransactionalOutputCommitter({ outputRoot: root });
  const old = artifact('project-one', 'owner', [output('nested/page.txt', 'old')]);
  const first = await initial.commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  const fault = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: async (operation, target) => {
      if (operation === 'publish-output') {
        await rm(path.dirname(target), { recursive: true, force: true });
        await writeFile(path.dirname(target), 'rollback obstruction');
        throw new Error('publication interrupted');
      }
    },
  });
  const next = artifact('project-one', 'owner', [output('nested/page.txt', 'new')]);
  const result = await fault.commit(
    {
      generation: 2,
      candidate: snapshot([next], 'next'),
      previous: (first as { manifest: OutputManifest }).manifest,
    },
    guard(),
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    status: 'failed',
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'OUTPUT_ROLLBACK_FAILED' }),
      expect.objectContaining({ code: 'OUTPUT_STAGE_PRESERVED' }),
    ]),
  });
  const stages = (await readdir(root)).filter((entry) => entry.startsWith('.ng-doc-stage-'));
  expect(stages).toHaveLength(1);
  const stageRoot = path.join(root, stages[0]);
  // The diagnostic names the stage in the engine's spelling (forward slashes on Windows).
  expect(result.diagnostics.some((item) => item.message.includes(hostPath(stageRoot)))).toBe(true);
  expect(await readFile(path.join(stageRoot, 'backups/changed/nested/page.txt'), 'utf8')).toBe(
    'old',
  );
});

test('rolls back last-good files and manifest after injected rename faults', async () => {
  const root = await temporary('ng-doc-rollback');
  const baselineCommitter = new TransactionalOutputCommitter({ outputRoot: root });
  const baseline = artifact('project-one', 'owner', [
    output('a.txt', 'a-old'),
    output('b.txt', 'b-old'),
  ]);
  const first = await baselineCommitter.commit(
    { generation: 1, candidate: snapshot([baseline]) },
    guard(),
    new AbortController().signal,
  );
  expect(first.status).toBe('committed');
  const manifestBefore = await readFile(path.join(root, '.ng-doc-output-manifest.json'), 'utf8');

  let outputPublishes = 0;
  const fault = new TransactionalOutputCommitter({
    outputRoot: root,
    fileSystem: {
      rename: async (from, to) => {
        await renameFile(from, to);
        if (String(from).includes(`${path.sep}outputs${path.sep}`) && ++outputPublishes === 2) {
          throw new Error('injected rename uncertainty');
        }
      },
    },
  });
  const changed = artifact('project-one', 'owner', [
    output('a.txt', 'a-new'),
    output('b.txt', 'b-new'),
  ]);
  const failed = await fault.commit(
    {
      generation: 2,
      candidate: snapshot([changed], 'snapshot-two'),
      previous: first.status === 'committed' ? first.manifest : undefined,
    },
    guard(),
    new AbortController().signal,
  );
  expect(failed).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_COMMIT_FAILED' })],
  });
  expect(await readFile(path.join(root, 'a.txt'), 'utf8')).toBe('a-old');
  expect(await readFile(path.join(root, 'b.txt'), 'utf8')).toBe('b-old');
  expect(await readFile(path.join(root, '.ng-doc-output-manifest.json'), 'utf8')).toBe(
    manifestBefore,
  );
});

test('rolls back when guard becomes stale immediately before manifest publication', async () => {
  const root = await temporary('ng-doc-stale');
  const initial = new TransactionalOutputCommitter({ outputRoot: root });
  const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
  const first = await initial.commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  const manifestBefore = await readFile(path.join(root, '.ng-doc-output-manifest.json'), 'utf8');
  let current = true;
  const staleCommitter = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: (operation) => {
      if (operation === 'publish-manifest') current = false;
    },
  });
  const next = artifact('project-one', 'owner', [output('page.txt', 'new')]);
  const result = await staleCommitter.commit(
    {
      generation: 2,
      candidate: snapshot([next], 'next'),
      previous: first.status === 'committed' ? first.manifest : undefined,
    },
    guard(() => current),
    new AbortController().signal,
  );
  expect(result).toEqual({ status: 'stale', diagnostics: [] });
  expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('old');
  expect(await readFile(path.join(root, '.ng-doc-output-manifest.json'), 'utf8')).toBe(
    manifestBefore,
  );
});

test('restores last-good outputs when manifest rename reports failure after mutation', async () => {
  const root = await temporary('ng-doc-manifest-rollback');
  const initial = new TransactionalOutputCommitter({ outputRoot: root });
  const old = artifact('project-one', 'owner', [output('page.txt', 'old')]);
  const first = await initial.commit(
    { generation: 1, candidate: snapshot([old]) },
    guard(),
    new AbortController().signal,
  );
  const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
  const manifestBefore = await readFile(manifestPath, 'utf8');
  const fault = new TransactionalOutputCommitter({
    outputRoot: root,
    fileSystem: {
      rename: async (from, to) => {
        await renameFile(from, to);
        if (String(to) === manifestPath && String(from).endsWith('manifest.json')) {
          throw new Error('manifest rename failed after mutation');
        }
      },
    },
  });
  const next = artifact('project-one', 'owner', [output('page.txt', 'new')]);
  const result = await fault.commit(
    {
      generation: 2,
      candidate: snapshot([next], 'next'),
      previous: first.status === 'committed' ? first.manifest : undefined,
    },
    guard(),
    new AbortController().signal,
  );
  expect(result.status).toBe('failed');
  expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('old');
  expect(await readFile(manifestPath, 'utf8')).toBe(manifestBefore);
});

test('dispose aborts and settles an active commit without publishing late state', async () => {
  const root = await temporary('ng-doc-dispose');
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: async (operation) => {
      if (operation === 'publish-output') {
        entered();
        await gate;
      }
    },
  });
  const pending = committer.commit(
    { generation: 1, candidate: snapshot([artifact()]) },
    guard(),
    new AbortController().signal,
  );
  await blocked;
  const disposal = committer.dispose();
  const result = await pending;
  await disposal;
  release();
  expect(result.status).toBe('stale');
  await expect(readFile(path.join(root, 'guides/overview/content.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await expect(readFile(path.join(root, '.ng-doc-output-manifest.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(
    await committer.commit(
      { generation: 2, candidate: snapshot([artifact()]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_COMMITTER_DISPOSED' })],
  });
});

test('an existing corrupt or cross-project manifest blocks publication', async () => {
  const root = await temporary('ng-doc-manifest-invalid');
  await writeFile(path.join(root, '.ng-doc-output-manifest.json'), '{bad');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  expect(
    await committer.commit(
      { generation: 1, candidate: snapshot([artifact()]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_COMMIT_FAILED' })],
  });
  const foreign: OutputManifest = {
    schemaVersion: 1,
    projectId: 'foreign',
    generation: 1,
    revision: 'foreign',
    files: [],
  };
  await writeFile(path.join(root, '.ng-doc-output-manifest.json'), JSON.stringify(foreign));
  expect(
    await committer.commit(
      { generation: 2, candidate: snapshot([artifact()]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_MANIFEST_INVALID' })],
  });
});

test('returns stale before staging and rejects concurrent commits', async () => {
  const root = await temporary('ng-doc-current');
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    beforeMutation: async (operation) => {
      if (operation === 'stage-write') await new Promise((resolve) => setTimeout(resolve, 25));
    },
  });
  expect(
    await committer.commit(
      { generation: 1, candidate: snapshot([artifact()]) },
      guard(() => false),
      new AbortController().signal,
    ),
  ).toEqual({ status: 'stale', diagnostics: [] });
  const controller = new AbortController();
  const first = committer.commit(
    { generation: 2, candidate: snapshot([artifact()]) },
    guard(),
    controller.signal,
  );
  const concurrent = await committer.commit(
    { generation: 3, candidate: snapshot([artifact()]) },
    guard(),
    new AbortController().signal,
  );
  expect(concurrent).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_COMMIT_IN_PROGRESS' })],
  });
  controller.abort();
  expect((await first).status).toBe('stale');
});

test('injected stage write failure leaves outputs and manifest unpublished', async () => {
  const root = await temporary('ng-doc-write-failure');
  let writes = 0;
  const committer = new TransactionalOutputCommitter({
    outputRoot: root,
    fileSystem: {
      writeFile: async (...args) => {
        await writeFile(...args);
        if (++writes === 1) throw new Error('injected write uncertainty');
      },
    },
  });
  const result = await committer.commit(
    { generation: 1, candidate: snapshot([artifact()]) },
    guard(),
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_COMMIT_FAILED' })],
  });
  await expect(readFile(path.join(root, 'guides/overview/content.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await expect(readFile(path.join(root, '.ng-doc-output-manifest.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

test('rejects stale supplied manifests, duplicate identities, reserved paths, invalid base64, and directory targets', async () => {
  const root = await temporary('ng-doc-more-invalid');
  const committer = new TransactionalOutputCommitter({ outputRoot: root });
  const first = await committer.commit(
    { generation: 1, candidate: snapshot([artifact()]) },
    guard(),
    new AbortController().signal,
  );
  const stalePrevious = structuredClone((first as { manifest: OutputManifest }).manifest);
  stalePrevious.revision = 'stale';
  expect(
    await committer.commit(
      { generation: 2, candidate: snapshot([artifact()]), previous: stalePrevious },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_MANIFEST_STALE' })],
  });

  const one = artifact('project-one', 'same', [output('one.txt', 'one')]);
  const two = artifact('project-one', 'same', [output('two.txt', 'two')]);
  expect(
    await committer.commit(
      { generation: 3, candidate: snapshot([one, two]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_ARTIFACT_COLLISION' })],
  });

  const reserved = artifact('project-one', 'reserved', [
    output('.ng-doc-output-manifest.json', 'bad'),
  ]);
  expect(
    await committer.commit(
      { generation: 4, candidate: snapshot([reserved]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ code: 'OUTPUT_RESERVED_PATH' })],
  });
  const base64 = artifact('project-one', 'base64', [output('bad.bin', '%%%')]);
  base64.outputs[0].encoding = 'base64';
  base64.outputs[0].digest = digest(Buffer.alloc(0));
  expect(
    await committer.commit(
      { generation: 5, candidate: snapshot([base64]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({ status: 'failed' });
  const traversing = artifact('project-one', 'normalized', [output('safe/../bad.txt', 'bad')]);
  expect(
    await committer.commit(
      { generation: 6, candidate: snapshot([traversing]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({ status: 'failed' });
  await mkdir(path.join(root, 'directory-target'));
  const directory = artifact('project-one', 'directory', [output('directory-target', 'bad')]);
  expect(
    await committer.commit(
      { generation: 7, candidate: snapshot([directory]) },
      guard(),
      new AbortController().signal,
    ),
  ).toMatchObject({
    status: 'failed',
    diagnostics: [expect.objectContaining({ message: expect.stringContaining('regular file') })],
  });
});

test('navigation metadata survives full artifact restore and rejects malformed tags', async () => {
  const cache = createArtifactCache(await temporary('navigation-metadata-'));
  const page = artifact();
  page.routes = [
    {
      id: 'guide',
      path: 'guide',
      title: 'Guide',
      metadata: {
        description: '<p>Guide</p>',
        tags: { deprecated: ['Use replacement'], since: ['1.0'] },
      },
    },
  ];
  await cache.write(page);
  expect(await cache.read({ identity: page.identity, fingerprint: page.fingerprint })).toEqual({
    status: 'hit',
    artifact: page,
  });
  const malformed = structuredClone(page);
  (malformed.routes[0].metadata!.tags as Record<string, unknown>).deprecated = 'wrong shape';
  await expect(cache.write(malformed)).rejects.toThrow(TypeError);
});

test('search breadcrumbs survive strict cache roundtrip and malformed navigation is rejected', async () => {
  const cache = createArtifactCache(await temporary('search-navigation-'));
  const page = artifact();
  page.content[0].ir.searchBreadcrumbs = ['Guide', 'Guide'];
  await cache.write(page);
  expect(await cache.read({ identity: page.identity, fingerprint: page.fingerprint })).toEqual({
    status: 'hit',
    artifact: page,
  });
  for (const malformed of ['Guide', ['Guide', 1], { title: 'Guide' }]) {
    const invalid = structuredClone(page);
    (invalid.content[0].ir as unknown as Record<string, unknown>).searchBreadcrumbs = malformed;
    await expect(cache.write(invalid)).rejects.toThrow(TypeError);
  }
});

test('API summaries survive the strict cache roundtrip and malformed ones are rejected', async () => {
  const cache = createArtifactCache(await temporary('api-summary-'));
  const page = artifact();
  const summary = { kind: 'Class', signature: 'export class Guide', description: 'A guide.' };
  page.searchRecords = page.searchRecords.map((record) => ({ ...record, ...summary }));
  page.content[0].searchRecords = page.searchRecords;
  page.routes = [{ ...page.routes[0], apiListSegment: '' }];
  page.apiList = [
    {
      apiEntryId: 'api',
      scopeId: 'public',
      scopeTitle: 'Public',
      name: 'Guide',
      type: 'Class',
      route: 'api/Guide',
      description: 'A guide.',
      signature: 'export class Guide',
    },
  ];
  await cache.write(page);
  expect(await cache.read({ identity: page.identity, fingerprint: page.fingerprint })).toEqual({
    status: 'hit',
    artifact: page,
  });
  const malformed: Array<(value: PageArtifact) => void> = [
    (value) => ((value.searchRecords[0] as unknown as Record<string, unknown>).signature = 1),
    (value) => ((value.routes[0] as unknown as Record<string, unknown>).apiListSegment = null),
    (value) => ((value.apiList[0] as unknown as Record<string, unknown>).description = ['A']),
    (value) => ((value.apiList[0] as unknown as Record<string, unknown>).signature = 1),
  ];
  for (const mutate of malformed) {
    const invalid = structuredClone(page);
    mutate(invalid);
    await expect(cache.write(invalid)).rejects.toThrow(TypeError);
  }
});

test('published configuration is strictly validated and cannot redirect an existing committer', async () => {
  const root = await temporary('published-configuration-');
  const committer = createOutputCommitter({ outputRoot: root });
  const candidate = snapshot([artifact()]);
  // A published configuration spells its roots as the engine does (forward slashes on Windows).
  candidate.configuration = {
    outputRoot: hostPath(root),
    cacheRoot: hostPath(path.join(root, 'cache')),
    assetDirectory: 'assets',
    themes: { light: 'github-light', dark: 'github-dark' },
    digest: candidate.artifacts[0].fingerprint.configurationDigest,
  };
  const committed = await committer.commit(
    { generation: 1, candidate },
    guard(),
    new AbortController().signal,
  );
  expect(committed.status).toBe('committed');
  for (const fields of [
    { outputRoot: 'relative' },
    { outputRoot: hostPath(path.join(root, 'other')) },
    { cacheRoot: 'relative' },
    { cacheRoot: root + '/..' },
    { assetDirectory: '../outside' },
    { assetDirectory: '/outside' },
    { assetDirectory: 'C:/outside' },
    { assetDirectory: 'C:outside' },
    { themes: { light: 'light', dark: 1 } },
    { themes: { light: 'light', dark: 'dark', extra: true } },
    { digest: 5 },
    { digest: 'different-configuration' },
    { unknown: true },
    { outputRoot: root + '\0' },
  ]) {
    const invalid = {
      ...candidate,
      configuration: { ...candidate.configuration, ...fields },
    } as unknown as ArtifactSnapshot;
    const result = await committer.commit(
      { generation: 2, candidate: invalid },
      guard(),
      new AbortController().signal,
    );
    expect(result.status).toBe('failed');
    expect(await readFile(path.join(root, 'guides/overview/content.json'), 'utf8')).toBe(
      'content-one',
    );
  }
  await committer.dispose();
});

test('canonical metadata accepts an ancestor alias but cannot authorize a symlink output root', async () => {
  const root = await realpath(await temporary('configuration-alias-'));
  const physical = path.join(root, 'physical');
  await mkdir(physical);
  const alias = path.join(root, 'alias');
  await symlink(physical, alias, 'dir');
  const candidate = snapshot([artifact()]);
  candidate.configuration = {
    outputRoot: hostPath(path.join(physical, 'output')),
    cacheRoot: hostPath(path.join(physical, 'cache')),
    assetDirectory: 'assets',
    themes: { light: 'light', dark: 'dark' },
    digest: candidate.artifacts[0].fingerprint.configurationDigest,
  };
  const throughAncestor = createOutputCommitter({ outputRoot: path.join(alias, 'output') });
  expect(
    (
      await throughAncestor.commit(
        { generation: 1, candidate },
        guard(),
        new AbortController().signal,
      )
    ).status,
  ).toBe('committed');
  await throughAncestor.dispose();
  const rootAlias = path.join(root, 'root-alias');
  await symlink(path.join(physical, 'output'), rootAlias, 'dir');
  const throughRoot = createOutputCommitter({ outputRoot: rootAlias });
  expect(
    (await throughRoot.commit({ generation: 1, candidate }, guard(), new AbortController().signal))
      .status,
  ).toBe('failed');
  await throughRoot.dispose();
});

function codeError(code: string | undefined): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`simulated ${code ?? 'failure'}`);
  if (code) error.code = code;
  return error;
}

describe('Windows rename retries', () => {
  test('leaves rename unchanged outside Windows', () => {
    const rename = vi.fn() as unknown as typeof renameFile;
    expect(retryingRename(rename, { platform: 'linux' })).toBe(rename);
    expect(retryingRename(rename, { platform: 'darwin' })).toBe(rename);
    expect(retryingRename(renameFile, { platform: 'win32' })).not.toBe(renameFile);
  });

  test.each(['EPERM', 'EBUSY', 'EACCES'])(
    'retries %s on win32 with a bounded exponential backoff',
    async (code) => {
      const waits: number[] = [];
      let calls = 0;
      const rename = (async () => {
        calls += 1;
        if (calls < 4) throw codeError(code);
      }) as unknown as typeof renameFile;
      const retrying = retryingRename(rename, {
        platform: 'win32',
        sleep: async (milliseconds) => {
          waits.push(milliseconds);
        },
      });
      await expect(retrying('from', 'to')).resolves.toBeUndefined();
      expect(calls).toBe(4);
      expect(waits).toEqual([50, 100, 200]);
    },
  );

  test('gives up after the last attempt and throws its error', async () => {
    const waits: number[] = [];
    let calls = 0;
    const rename = (async () => {
      calls += 1;
      throw codeError('EBUSY');
    }) as unknown as typeof renameFile;
    const retrying = retryingRename(rename, {
      platform: 'win32',
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });
    await expect(retrying('from', 'to')).rejects.toMatchObject({ code: 'EBUSY' });
    expect(calls).toBe(RENAME_RETRY.attempts);
    expect(waits).toEqual([50, 100, 200, 400, 800, 1000, 1000]);
  });

  test.each([['EXDEV'], ['ENOENT'], [undefined]])(
    'throws %s at once: only a held handle is transient',
    async (code) => {
      let calls = 0;
      const rename = (async () => {
        calls += 1;
        throw codeError(code);
      }) as unknown as typeof renameFile;
      const retrying = retryingRename(rename, {
        platform: 'win32',
        sleep: async () => {
          throw new Error('must not wait');
        },
      });
      await expect(retrying('from', 'to')).rejects.toThrow(`simulated ${code ?? 'failure'}`);
      expect(calls).toBe(1);
    },
  );

  test('waits with real timers when no sleep is injected', async () => {
    let calls = 0;
    const rename = (async () => {
      calls += 1;
      if (calls === 1) throw codeError('EPERM');
    }) as unknown as typeof renameFile;
    const retrying = retryingRename(rename, {
      platform: 'win32',
      retry: { attempts: 2, delayMs: 1, maxDelayMs: 1 },
    });
    await expect(retrying('from', 'to')).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  test('commits through transient failures on win32 and still publishes the manifest last', async () => {
    const root = await temporary('ng-doc-win32-rename-retry');
    const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
    const initial = new TransactionalOutputCommitter({ outputRoot: root });
    const first = await initial.commit(
      {
        generation: 1,
        candidate: snapshot([
          artifact('project-one', 'owner', [output('page.txt', 'old'), output('gone.txt', 'gone')]),
        ]),
      },
      guard(),
      new AbortController().signal,
    );
    expect(first.status).toBe('committed');
    const attempts = new Map<string, number>();
    const renames: string[] = [];
    const waits: number[] = [];
    const committer = new TransactionalOutputCommitter({
      outputRoot: root,
      fileSystem: {
        platform: 'win32',
        sleep: async (milliseconds) => {
          waits.push(milliseconds);
        },
        // Every rename fails twice first, as it does while a scanner holds the file.
        rename: async (from, to) => {
          const key = `${String(from)}\0${String(to)}`;
          const seen = (attempts.get(key) ?? 0) + 1;
          attempts.set(key, seen);
          if (seen <= 2) throw codeError(seen === 1 ? 'EBUSY' : 'EPERM');
          await renameFile(from, to);
          renames.push(String(to));
        },
      },
    });
    const next = artifact('project-one', 'owner', [output('page.txt', 'new')]);
    const result = await committer.commit(
      {
        generation: 2,
        candidate: snapshot([next], 'next'),
        previous: (first as { manifest: OutputManifest }).manifest,
      },
      guard(),
      new AbortController().signal,
    );
    expect(result.status).toBe('committed');
    expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('new');
    await expect(readFile(path.join(root, 'gone.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(renames.at(-1)).toBe(manifestPath);
    expect(renames.filter((target) => target === manifestPath)).toHaveLength(1);
    expect(waits.length).toBe(renames.length * 2);
    expect(
      JSON.parse(await readFile(manifestPath, 'utf8')).files.map(
        (file: { path: string }) => file.path,
      ),
    ).toEqual(['page.txt']);
    expect((await readdir(root)).filter((name) => name.startsWith('.ng-doc-stage-'))).toEqual([]);
  });

  test('rolls back and keeps the previous manifest when a win32 publication stays held', async () => {
    const root = await temporary('ng-doc-win32-rename-exhausted');
    const manifestPath = path.join(root, '.ng-doc-output-manifest.json');
    const initial = new TransactionalOutputCommitter({ outputRoot: root });
    const first = await initial.commit(
      {
        generation: 1,
        candidate: snapshot([artifact('project-one', 'owner', [output('page.txt', 'old')])]),
      },
      guard(),
      new AbortController().signal,
    );
    const manifestBefore = await readFile(manifestPath, 'utf8');
    let manifestAttempts = 0;
    const committer = new TransactionalOutputCommitter({
      outputRoot: root,
      fileSystem: {
        platform: 'win32',
        sleep: async () => undefined,
        rename: async (from, to) => {
          if (String(to) === manifestPath) {
            manifestAttempts += 1;
            throw codeError('EACCES');
          }
          await renameFile(from, to);
        },
      },
    });
    const result = await committer.commit(
      {
        generation: 2,
        candidate: snapshot(
          [artifact('project-one', 'owner', [output('page.txt', 'new')])],
          'next',
        ),
        previous: (first as { manifest: OutputManifest }).manifest,
      },
      guard(),
      new AbortController().signal,
    );
    expect(result.status).toBe('failed');
    expect(manifestAttempts).toBe(RENAME_RETRY.attempts);
    expect(await readFile(path.join(root, 'page.txt'), 'utf8')).toBe('old');
    expect(await readFile(manifestPath, 'utf8')).toBe(manifestBefore);
    expect((await readdir(root)).filter((name) => name.startsWith('.ng-doc-stage-'))).toEqual([]);
  });
});
