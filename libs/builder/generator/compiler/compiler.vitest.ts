import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import { createOutputCommitter } from '../artifacts';
import { GeneratorContentCompiler } from '../content/content-compiler';
import type {
  ArtifactSnapshot,
  CompilationResult,
  ContentIR,
  KeywordExport,
  SearchRecord,
} from '../contracts';
import { refreshDependencies } from '../graph';
import { type CompilationOptions, createCompilationService } from './index';
const cleanup: Array<() => unknown> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
function fixture(cache: boolean = true) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-compiler-')));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const write = (file: string, content: string) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const tsConfig = write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
  );
  const configFile = write(
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', cache: ${cache} };`,
  );
  write(
    'docs/ng-doc.api.ts',
    `const api = { title: 'API', keyword: 'ApiIndex', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default api;`,
  );
  write(
    'docs/api.ts',
    '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
  );
  write(
    'docs/guide/ng-doc.page.ts',
    `/** Searchable guide introduction. */ const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
  );
  write(
    'docs/guide/index.md',
    '---\nkeyword: Guide\n---\n# Guide heading\n\nActual body with `Actual` and `Missing`.',
  );
  const options: CompilationOptions = {
    projectId: 'fixture',
    workspaceRoot: root,
    configFile,
    defaults: {
      docsRoot: path.join(root, 'docs'),
      tsConfig,
      outputRoot: path.join(root, 'out'),
      cacheRoot: path.join(root, 'cache'),
    },
    compilerVersion: 'test-v1',
    toolchainDigest: 'real-ts6-shiki',
  };
  const create = () => {
    const service = createCompilationService(options);
    cleanup.push(() => service.dispose());
    return service;
  };
  return { root, write, options, create };
}
function success(result: CompilationResult): ArtifactSnapshot {
  expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(result.candidate).toBeDefined();
  return result.candidate!;
}
const compile = (
  service: ReturnType<typeof createCompilationService>,
  generation = 1,
  previous?: ArtifactSnapshot,
  changes: Array<{ kind: 'create' | 'update' | 'delete'; path: string }> = [],
) =>
  service.compile(
    { generation, mode: 'production', changes, ...(previous ? { previous } : {}) },
    new AbortController().signal,
  );

test('cold and fresh-runtime warm caches restore full artifacts/search/keywords/routes with identical outputs', async () => {
  const f = fixture();
  const first = f.create();
  const cold = success(await compile(first));
  expect(cold.configuration).toEqual({
    outputRoot: f.options.defaults.outputRoot,
    cacheRoot: f.options.defaults.cacheRoot,
    assetDirectory: 'assets',
    themes: { light: expect.any(String), dark: expect.any(String) },
    digest: expect.any(String),
  });
  expect(JSON.parse(JSON.stringify(cold))).toEqual(cold);
  for (const artifact of cold.artifacts) {
    const exports = artifact.exportedKeywords.map((item) => JSON.stringify(item));
    expect(new Set(exports).size).toBe(exports.length);
  }
  expect(cold.artifacts.flatMap((item) => item.exportedKeywords)).toContainEqual({
    key: '*ApiIndex',
    title: 'API',
    path: 'api',
    type: 'link',
  });
  expect(cold.artifacts.flatMap((item) => item.searchRecords).length).toBeGreaterThan(1);
  const searchText = JSON.stringify(cold.artifacts.flatMap((item) => item.searchRecords));
  expect(searchText).toContain('Searchable guide introduction.');
  expect(searchText).toContain('Actual declaration.');
  // The page's records are its content's records; an API page's summary records also carry the
  // declaration's kind, signature and description.
  const withoutSummary = ({ kind, signature, description, ...record }: SearchRecord) => record;
  expect(cold.artifacts.flatMap((item) => item.searchRecords).map(withoutSummary)).toEqual(
    cold.artifacts.flatMap((item) =>
      item.content
        .filter((content) => ['guide-tab', 'api-tab', 'header'].includes(content.ir.role))
        .flatMap((content) => content.searchRecords),
    ),
  );
  expect(
    cold.artifacts.flatMap((item) => item.exportedKeywords).some((item) => item.key === 'Actual'),
  ).toBe(true);
  await first.dispose();
  const restored = await compile(f.create());
  const warm = success(restored);
  expect(warm).toEqual(cold);
  expect(restored.whyRebuilt).toEqual([]);
  const committer = createOutputCommitter({ outputRoot: f.options.defaults.outputRoot });
  cleanup.push(() => committer.dispose());
  const committed = await committer.commit(
    { generation: 1, candidate: cold },
    { isCurrent: () => true },
    new AbortController().signal,
  );
  expect(committed.status).toBe('committed');
  if (committed.status !== 'committed') return;
  const unchanged = await committer.commit(
    { generation: 2, candidate: warm, previous: committed.manifest },
    { isCurrent: () => true },
    new AbortController().signal,
  );
  expect(unchanged.status).toBe('committed');
  if (unchanged.status === 'committed') expect(unchanged.written).toEqual([]);
  const noOp = await compile(f.create(), 3, warm, [
    { kind: 'update', path: path.join(f.root, 'docs/api.ts') },
  ]);
  success(noOp);
  expect(noOp.whyRebuilt).toEqual([]);
  const missing = committed.manifest.files[0];
  unlinkSync(path.join(f.options.defaults.outputRoot, missing.path));
  const repaired = await compile(f.create(), 3, warm);
  success(repaired);
  expect(repaired.whyRebuilt).toContainEqual(
    expect.objectContaining({ ownerId: missing.ownerId, reason: 'output-missing' }),
  );
}, 60000);

test('production includes unopened pages; API glob create, rename, deletion and missing-key creation converge', async () => {
  const f = fixture(false);
  const service = f.create();
  let previous = success(await compile(service));
  const newPath = f.write('docs/api-new.ts', '/** Newly exported. */ export class Missing {}');
  const created = await service.compile(
    {
      generation: 2,
      mode: 'production',
      previous,
      changes: [{ kind: 'create', path: newPath }],
    },
    new AbortController().signal,
  );
  previous = success(created);
  expect(
    previous.artifacts.flatMap((item) => item.apiList).some((item) => item.name === 'Missing'),
  ).toBe(true);
  expect(
    previous.artifacts.flatMap((item) => item.content).find((item) => item.ir.role === 'guide-tab')!
      .html,
  ).toContain('/Missing');
  f.write('docs/api-new.ts', '/** Renamed. */ export class Renamed {}');
  previous = success(await compile(service, 3, previous, [{ kind: 'update', path: newPath }]));
  expect(previous.artifacts.flatMap((item) => item.apiList).map((item) => item.name)).toContain(
    'Renamed',
  );
  expect(previous.artifacts.flatMap((item) => item.apiList).map((item) => item.name)).not.toContain(
    'Missing',
  );
  const removedOwner = previous.artifacts.find((item) =>
    item.apiList.some((record) => record.name === 'Renamed'),
  )!.id;
  unlinkSync(newPath);
  const removed = await compile(service, 4, previous, [{ kind: 'delete', path: newPath }]);
  expect(removed.whyRebuilt.some((item) => item.ownerId === removedOwner)).toBe(true);
  previous = success(removed);
  expect(previous.artifacts.flatMap((item) => item.apiList).map((item) => item.name)).not.toContain(
    'Renamed',
  );
}, 60000);

test('API summaries reach the summary search records and the API list, and follow edits', async () => {
  const f = fixture(false);
  const service = f.create();
  const first = success(await compile(service));
  const summary = (snapshot: ArtifactSnapshot) => ({
    search: snapshot.artifacts
      .flatMap((artifact) => artifact.searchRecords)
      .filter((record) => record.title === 'Actual')
      .map(({ section, kind, signature, description }) => ({
        section,
        kind,
        signature,
        description,
      })),
    list: snapshot.artifacts
      .flatMap((artifact) => artifact.apiList)
      .map(({ name, description, signature }) => ({ name, description, signature })),
  });
  expect(summary(first)).toEqual({
    search: expect.arrayContaining([
      {
        section: '',
        kind: 'Class',
        signature: 'export class Actual',
        description: 'Actual declaration.',
      },
    ]),
    list: [
      { name: 'Actual', description: 'Actual declaration.', signature: 'export class Actual' },
    ],
  });
  // Guide records keep the page index shape.
  const guides = first.artifacts
    .flatMap((artifact) => artifact.searchRecords)
    .filter((record) => record.pageType === 'guide');
  expect(guides.length).toBeGreaterThan(0);
  for (const record of guides) expect(Object.keys(record)).not.toContain('kind');
  const source = f.write(
    'docs/api.ts',
    '/** Edited summary. */ export class Actual<T> { /** Value. */ value = 1; }',
  );
  const edited = success(await compile(service, 2, first, [{ kind: 'update', path: source }]));
  expect(summary(edited).list).toEqual([
    { name: 'Actual', description: 'Edited summary.', signature: 'export class Actual<T>' },
  ]);
  expect(summary(edited).search).toContainEqual({
    section: '',
    kind: 'Class',
    signature: 'export class Actual<T>',
    description: 'Edited summary.',
  });
  // The incremental result equals a cold compile of the edited tree.
  expect(summary(success(await compile(f.create())))).toEqual(summary(edited));
}, 60000);

test('malformed content fails without replacing last good and missing file repair recovers', async () => {
  const f = fixture(false);
  const service = f.create();
  const previous = success(await compile(service));
  const markdown = path.join(f.root, 'docs/guide/index.md');
  unlinkSync(markdown);
  const failed = await compile(service, 2, previous, [{ kind: 'delete', path: markdown }]);
  expect(failed.candidate).toBeUndefined();
  expect(new Set(failed.whyRebuilt.map((item) => `${item.ownerId}:${item.reason}`)).size).toBe(
    failed.whyRebuilt.length,
  );
  expect(failed.diagnostics.some((item) => item.severity === 'error')).toBe(true);
  expect(
    failed.dependencies.some((item) => item.kind === 'existence' && item.path === markdown),
  ).toBe(true);
  f.write('docs/guide/index.md', '# Recovered\n\nRecovered content.');
  const recovered = success(
    await compile(service, 3, previous, [{ kind: 'create', path: markdown }]),
  );
  expect(
    recovered.artifacts
      .flatMap((item) => item.searchRecords)
      .some((item) => item.content.includes('Recovered content')),
  ).toBe(true);
}, 60000);

test('failed attempts retain missing external include/import and empty external glob observations', async () => {
  const f = fixture(false);
  const external = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-external-observation-')));
  cleanup.push(() => rmSync(external, { recursive: true, force: true }));
  const missingInclude = path.join(external, 'future', 'header.nunj');
  const emptyPattern = path.join(external, 'future-api', '**/*.ts').replaceAll(path.sep, '/');
  f.write(
    'docs/ng-doc.api.ts',
    `const api = { title: 'API', scopes: [
    { name: 'Public', route: 'public', include: ['docs/api*.ts'] },
    { name: 'Future', route: 'future', include: [${JSON.stringify(emptyPattern)}] }
  ] }; export default api;`,
  );
  f.write(
    'docs/guide/index.md',
    `# External include\n\n{% include ${JSON.stringify(missingInclude)} %}`,
  );
  const service = f.create();
  const failedInclude = await compile(service);
  expect(failedInclude.candidate).toBeUndefined();
  expect(failedInclude.diagnostics.some((item) => item.severity === 'error')).toBe(true);
  expect(failedInclude.dependencies, JSON.stringify(failedInclude.diagnostics)).toContainEqual({
    kind: 'existence',
    path: missingInclude,
    exists: false,
  });
  expect(failedInclude.dependencies).toContainEqual(
    expect.objectContaining({
      kind: 'glob',
      include: [emptyPattern],
      members: [],
    }),
  );
  mkdirSync(path.dirname(missingInclude), { recursive: true });
  writeFileSync(missingInclude, 'Recovered external include.');
  const recovered = await compile(service, 2);
  const previous = success(recovered);
  expect(JSON.stringify(previous.artifacts.flatMap((item) => item.searchRecords))).toContain(
    'Recovered external include.',
  );
  const scopes = recovered.dependencies.filter((item) => item.kind === 'semantic');
  const references = recovered.dependencies.filter((item) => item.kind === 'semantic-reference');
  expect(references.length).toBeGreaterThan(0);
  for (const reference of references) {
    expect(
      scopes.filter(
        (scope) => scope.scopeId === reference.scopeId && scope.digest === reference.digest,
      ),
    ).toHaveLength(1);
  }

  const missingImport = path.join(external, 'config-options.ts');
  f.write(
    'ng-doc.config.ts',
    `import { useCache } from ${JSON.stringify(missingImport)};
    export default { docsPath: 'docs', cache: useCache };`,
  );
  const failedConfig = await compile(service, 3, previous);
  expect(failedConfig.candidate).toBeUndefined();
  expect(failedConfig.diagnostics.some((item) => item.severity === 'error')).toBe(true);
  expect(failedConfig.dependencies).toContainEqual({
    kind: 'existence',
    path: missingImport,
    exists: false,
  });
  writeFileSync(missingImport, 'export const useCache = false;');
  success(await compile(service, 4, previous));
}, 60000);

test('corrupt cache index is a diagnostic miss; aborted/disposed/concurrent requests cannot yield candidates', async () => {
  const f = fixture();
  const service = f.create();
  const pending = compile(service);
  const concurrent = await compile(service, 2);
  expect(concurrent.candidate).toBeUndefined();
  success(await pending);
  for (const file of readdirSync(f.options.defaults.cacheRoot).filter((file) =>
    file.endsWith('compilation-index.json'),
  ))
    writeFileSync(path.join(f.options.defaults.cacheRoot, file), '{broken');
  const recovered = await compile(f.create());
  success(recovered);
  expect(recovered.diagnostics.some((item) => item.code === 'COMPILATION_CACHE_INDEX')).toBe(true);
  expect(recovered.whyRebuilt.every((item) => item.reason === 'cache-miss')).toBe(true);
  const abort = new AbortController();
  abort.abort();
  expect(
    (await service.compile({ generation: 3, mode: 'production', changes: [] }, abort.signal))
      .candidate,
  ).toBeUndefined();
  await service.dispose();
  expect((await compile(service, 4)).candidate).toBeUndefined();
}, 60000);

test('categories retain provider imports, metadata and flags; duplicate keyword policy is explicit', async () => {
  const f = fixture();
  f.write(
    'docs/ng-doc.category.ts',
    `/** Parent description. */ const category = { title: 'Parent', route: 'parent', order: 0, hidden: false, expandable: false, expanded: true, providers: [() => 'provider'] }; export default category;`,
  );
  f.write(
    'docs/guide/ng-doc.page.ts',
    `import parent from '../ng-doc.category'; const page = { title: 'Guide', route: 'guide', category: parent, mdFile: './index.md' }; export default page;`,
  );
  f.write(
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', keywords: { keywords: { Actual: { title: 'Other', url: '/other' } } } };`,
  );
  const built = await compile(f.create());
  const candidate = success(built);
  expect(built.diagnostics.some((item) => item.code === 'KEYWORD_DUPLICATE')).toBe(true);
  const category = candidate.artifacts.find((item) => item.identity.role === 'category')!;
  expect(category.routes[0]).toMatchObject({
    order: 0,
    hidden: false,
    category: { expandable: false, expanded: true },
    metadata: { description: expect.stringContaining('Parent description') },
  });
  expect(
    candidate.artifacts.flatMap((item) => item.outputs).find((item) => item.role === 'routes')!
      .content,
  ).toContain('.providers');
}, 60000);

test('a configured keyword settles loader collisions and picks among local exports; other collisions are reported', async () => {
  const f = fixture();
  const loaders = `loaders: [
    async () => ({ shared: { url: 'https://a.example/shared' }, pinned: { url: 'https://a.example/pinned' }, Actual: { url: 'https://a.example/Actual' } }),
    async () => ({ shared: { url: 'https://b.example/shared' }, pinned: { url: 'https://b.example/pinned' }, replaced: { url: 'https://b.example/replaced' } }),
  ]`;
  const duplicates = (result: CompilationResult) =>
    result.diagnostics
      .filter((item) => item.code === 'KEYWORD_DUPLICATE')
      .map((item) => item.message.split(' ')[1]);
  const keywords = (result: CompilationResult): Record<string, { path: string }> =>
    JSON.parse(
      success(result)
        .artifacts.flatMap((item) => item.outputs)
        .find((item) => item.path.endsWith('/keywords.json'))!.content,
    );

  f.write('ng-doc.config.ts', `export default { docsPath: 'docs', keywords: { ${loaders} } };`);
  const unsettled = await compile(f.create());
  // Two loaders define `shared` and `pinned`: the later loader wins, and both are reported. A local
  // declaration still replaces a loader keyword with a warning.
  expect(duplicates(unsettled)).toEqual(['pinned', 'shared', 'Actual']);

  f.write(
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', keywords: { ${loaders}, keywords: { pinned: { url: 'https://a.example/pinned' }, replaced: { url: 'https://c.example/replaced' }, Actual: { url: 'https://c.example/Actual' } } } };`,
  );
  const settled = await compile(f.create());
  // The configured `pinned` chooses the first loader's link and `replaced` replaces a loader's
  // link, both without a warning; the local `Actual` still wins over the configured one, reported.
  expect(duplicates(settled)).toEqual(['shared', 'Actual']);
  expect(keywords(settled)['pinned'].path).toBe('https://a.example/pinned');
  expect(keywords(settled)['replaced'].path).toBe('https://c.example/replaced');

  // Two API declarations named `Twin` (an interface and a function) and a loader keyword `Twin`.
  f.write(
    'docs/api-interface.ts',
    '/** Interface twin. */ export interface Twin { value: number; }',
  );
  f.write('docs/api-function.ts', '/** Function twin. */ export function Twin(): void {}');
  const twinLoader = `loaders: [async () => ({ Twin: { url: 'https://a.example/Twin' } })]`;
  f.write('ng-doc.config.ts', `export default { docsPath: 'docs', keywords: { ${twinLoader} } };`);
  const twins = await compile(f.create());
  expect(duplicates(twins)).toEqual(['Twin', 'Twin']);
  const routes = success(twins)
    .artifacts.flatMap((item) => item.exportedKeywords ?? [])
    .filter((item) => item.key === 'Twin')
    .map((item) => item.path);
  expect(routes).toHaveLength(2);
  // The configured url names one of the local routes (with or without a leading slash): that export
  // wins over the loader and the other declaration, without a warning, on either route.
  for (const route of routes) {
    for (const url of [route, `/${route}`]) {
      f.write(
        'ng-doc.config.ts',
        `export default { docsPath: 'docs', keywords: { ${twinLoader}, keywords: { Twin: { url: ${JSON.stringify(url)} } } } };`,
      );
      const picked = await compile(f.create());
      expect(duplicates(picked)).toEqual([]);
      expect(keywords(picked)['Twin'].path).toBe(route);
    }
  }
}, 60000);

test('a route pin resolves through new exports, and reports a route no export has any more', async () => {
  const f = fixture();
  const codes = (result: CompilationResult) =>
    result.diagnostics
      .filter((item) => item.code.startsWith('KEYWORD_'))
      .map((item) => `${item.code} ${item.message.split(' ')[1]}`);
  const keywords = (result: CompilationResult): Record<string, { path: string }> =>
    JSON.parse(
      success(result)
        .artifacts.flatMap((item) => item.outputs)
        .find((item) => item.path.endsWith('/keywords.json'))!.content,
    );
  const config = (url: string) =>
    f.write(
      'ng-doc.config.ts',
      `export default { docsPath: 'docs', keywords: { loaders: [async () => ({ Twin: { url: 'https://a.example/Twin' } })], keywords: { Twin: { url: ${JSON.stringify(url)} } } } };`,
    );
  f.write(
    'docs/api-interface.ts',
    '/** Interface twin. */ export interface Twin { value: number; }',
  );
  f.write('docs/api-function.ts', '/** Function twin. */ export function Twin(): void {}');
  const declared = success(await compile(f.create()))
    .artifacts.flatMap((item) => item.exportedKeywords ?? [])
    .filter((item) => item.key === 'Twin')
    .map((item) => item.path)
    .sort();
  const pin = declared.find((route) => route.includes('interface'))!;
  config(`/${pin}`);

  // A third export of the name keeps the pinned page, silently.
  f.write('docs/api-class.ts', '/** Class twin. */ export class Twin {}');
  const third = await compile(f.create());
  expect(codes(third)).toEqual([]);
  expect(keywords(third)['Twin'].path).toBe(pin);

  // The pinned declaration is gone, others remain: a local export wins, reported as a duplicate.
  rmSync(path.join(f.root, 'docs/api-interface.ts'));
  const moved = await compile(f.create());
  expect(codes(moved)).toEqual(['KEYWORD_DUPLICATE Twin', 'KEYWORD_DUPLICATE Twin']);
  expect(keywords(moved)['Twin'].path).not.toBe(pin);

  // No export of the name is left: the pin would replace the loader's link with a dead route.
  rmSync(path.join(f.root, 'docs/api-function.ts'));
  rmSync(path.join(f.root, 'docs/api-class.ts'));
  const dead = await compile(f.create());
  expect(codes(dead)).toEqual(['KEYWORD_PIN_UNRESOLVED Twin']);
  expect(dead.diagnostics.find((item) => item.code === 'KEYWORD_PIN_UNRESOLVED')).toMatchObject({
    severity: 'warning',
    message: expect.stringContaining(`/${pin}`),
  });

  // A route of a page of this build (with an anchor) or an external url is no dead link.
  for (const url of [
    '/guide#guide-heading',
    'guide',
    'https://b.example/Twin',
    '//b.example/Twin',
  ]) {
    config(url);
    const live = await compile(f.create());
    expect(codes(live)).toEqual([]);
    expect(keywords(live)['Twin'].path).toBe(url);
  }

  // A JavaScript configuration entry without a url is reported and left out; the loader's link stays.
  f.write(
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', keywords: { loaders: [async () => ({ Twin: { url: 'https://a.example/Twin' } })], keywords: { Twin: { title: 'No url' } } } };`,
  );
  const invalid = await compile(f.create());
  expect(invalid.diagnostics.map((item) => item.code)).toContain('DISCOVERY_KEYWORD_INVALID');
  expect(keywords(invalid)['Twin'].path).toBe('https://a.example/Twin');
}, 60000);

test('invalid discovery/semantic inputs and unusable cache location produce diagnostics, then recover', async () => {
  const f = fixture();
  f.write('ng-doc.config.ts', `throw new Error('broken configuration'); export default {};`);
  expect((await compile(f.create())).candidate).toBeUndefined();
  f.write('ng-doc.config.ts', `export default { docsPath: 'docs' };`);
  f.write('docs/api.ts', 'export class { broken !!!');
  const semanticError = await compile(f.create());
  expect(semanticError.candidate).toBeUndefined();
  expect(semanticError.diagnostics.some((item) => item.code === 'SEMANTIC_SYNTAX')).toBe(true);
  f.write('docs/api.ts', 'export class Recovered {}');
  f.write('cache', 'cannot be a directory');
  const failedCache = await compile(f.create());
  expect(failedCache.candidate).toBeUndefined();
  expect(failedCache.diagnostics.some((item) => item.code === 'COMPILATION_FAILED')).toBe(true);
  unlinkSync(path.join(f.root, 'cache'));
  success(await compile(f.create()));
}, 60000);

test('abort and disposal during discovery settle without a candidate', async () => {
  const f = fixture();
  const service = f.create();
  const controller = new AbortController();
  const pending = service.compile(
    { generation: 1, mode: 'production', changes: [] },
    controller.signal,
  );
  controller.abort();
  expect((await pending).candidate).toBeUndefined();
  let settled = false;
  const pendingDispose = compile(service, 2).then((value) => {
    settled = true;
    return value;
  });
  await service.dispose();
  expect(settled).toBe(true);
  expect((await pendingDispose).candidate).toBeUndefined();
}, 60000);

test('invalid index shapes and corrupt artifacts are recoverable cache misses', async () => {
  const f = fixture();
  success(await compile(f.create()));
  const index = readdirSync(f.options.defaults.cacheRoot).find((file) =>
    file.endsWith('compilation-index.json'),
  )!;
  const location = path.join(f.options.defaults.cacheRoot, index);
  const keys = readFileSync(location, 'utf8');
  for (const bad of ['{}', '[null]', '[{"identity":{"projectId":"other"},"fingerprint":{}}]']) {
    writeFileSync(location, bad);
    const built = await compile(f.create());
    success(built);
    expect(built.diagnostics.some((item) => item.code === 'COMPILATION_CACHE_INDEX')).toBe(true);
  }
  writeFileSync(location, keys);
  for (const directory of readdirSync(f.options.defaults.cacheRoot, { withFileTypes: true }).filter(
    (item) => item.isDirectory(),
  )) {
    const cacheDir = path.join(f.options.defaults.cacheRoot, directory.name);
    for (const name of readdirSync(cacheDir)) writeFileSync(path.join(cacheDir, name), '{}');
  }
  const built = await compile(f.create());
  success(built);
  expect(built.diagnostics.some((item) => item.code === 'ARTIFACT_CACHE_INVALID')).toBe(true);
}, 60000);

test('real demo resources are compiled, linked and refreshed through the full service composition', async () => {
  const f = fixture();
  symlinkSync(
    path.resolve(import.meta.dirname, '../../../../node_modules'),
    path.join(f.root, 'node_modules'),
    'dir',
  );
  f.write(
    'docs/guide/demo.ts',
    `import { Component } from '@angular/core'; @Component({selector:'fixture-demo', templateUrl:'./demo.html', styleUrls:['./demo.scss']}) export class Demo {}`,
  );
  f.write('docs/guide/demo.html', '<b>External demo body</b>');
  f.write('docs/guide/demo.scss', 'b {color: red;}');
  f.write(
    'docs/guide/ng-doc.page.ts',
    `import { Demo } from './demo'; const page = { title:'Guide', route:'guide', mdFile:'./index.md', demos:{Demo} }; export default page;`,
  );
  f.write('docs/guide/index.md', '# Guide\n\n{{ NgDocActions.demo("Demo") }}');
  const service = f.create();
  const cold = success(await compile(service));
  const output = cold.artifacts
    .flatMap((item) => item.outputs)
    .find((item) => item.path.endsWith('/demo-assets.ts'))!;
  expect(output.content).toContain('External demo body');
  const edited = f.write('docs/guide/demo.html', '<b>Changed external body</b>');
  const changed = success(await compile(service, 2, cold, [{ kind: 'update', path: edited }]));
  expect(
    changed.artifacts
      .flatMap((item) => item.outputs)
      .find((item) => item.path.endsWith('/demo-assets.ts'))!.content,
  ).toContain('Changed external body');
}, 60000);

test('compiler and toolchain changes explain incompatible cached fingerprints', async () => {
  const f = fixture();
  success(await compile(f.create()));
  const changed = createCompilationService({
    ...f.options,
    compilerVersion: 'test-v2',
    toolchainDigest: 'changed',
  });
  cleanup.push(() => changed.dispose());
  const built = await compile(changed);
  success(built);
  expect(built.whyRebuilt.length).toBeGreaterThan(0);
  expect(built.whyRebuilt.every((item) => item.reason === 'cache-miss')).toBe(true);
});

test('same-name API declarations retain all physical outputs and qualified keywords through warm restoration', async () => {
  const f = fixture();
  f.write(
    'docs/api-one.ts',
    '/** First implementation. */ export function generate() { return "first"; }',
  );
  f.write(
    'docs/api-two.ts',
    '/** Second implementation. */ export function generate() { return "second"; }',
  );
  const coldResult = await compile(f.create());
  const cold = success(coldResult);
  expect(
    coldResult.diagnostics.filter((item) => item.code === 'SEMANTIC_ROUTE_DISAMBIGUATED'),
  ).toHaveLength(1);
  const declarations = cold.artifacts.filter((item) =>
    item.apiList.some((entry) => entry.name === 'generate'),
  );
  expect(declarations).toHaveLength(2);
  const routes = declarations
    .flatMap((item) => item.routes)
    .filter((item) => item.modulePath)
    .map((item) => item.path);
  expect(new Set(routes).size).toBe(routes.length);
  const exports = declarations.flatMap((item) => item.exportedKeywords);
  expect(exports.filter((item) => item.key === 'generate')).toEqual([
    { key: 'generate', title: 'generate', path: 'api/functions/public/generate' },
  ]);
  expect(exports.some((item) => /^generate--[a-f0-9]+$/.test(item.key))).toBe(true);
  const outputs = declarations.flatMap((item) => item.outputs);
  expect(new Set(outputs.map((item) => item.path)).size).toBe(outputs.length);
  expect(outputs.some((item) => item.content.includes('First implementation.'))).toBe(true);
  expect(outputs.some((item) => item.content.includes('Second implementation.'))).toBe(true);
  const warmResult = await compile(f.create());
  expect(success(warmResult)).toEqual(cold);
  expect(warmResult.whyRebuilt).toEqual([]);
});

test('compacted TypeScript program inputs outside documentation globs still invalidate cached API content', async () => {
  const f = fixture();
  const basePath = f.write(
    'types/base.ts',
    'export class Base { /** Original inherited property. */ before = 1; }',
  );
  f.write(
    'docs/api.ts',
    "import { Base } from '../types/base'; export class Actual extends Base {}",
  );
  const cold = success(await compile(f.create()));
  const apiHtml = (snapshot: ArtifactSnapshot) =>
    snapshot.artifacts.flatMap((item) => item.content).find((item) => item.ir.role === 'api-tab')!
      .html;
  expect(apiHtml(cold)).toContain('before');
  f.write('types/base.ts', 'export class Base { /** Updated inherited property. */ after = 2; }');
  const changedResult = await compile(f.create(), 2, cold, [{ kind: 'update', path: basePath }]);
  const changed = success(changedResult);
  expect(apiHtml(changed)).toContain('after');
  expect(apiHtml(changed)).not.toContain('Original inherited property');
  expect(changedResult.whyRebuilt.some((item) => item.reason === 'semantic')).toBe(true);
  const diskWarm = await compile(f.create());
  expect(success(diskWarm)).toEqual(changed);
  expect(diskWarm.whyRebuilt).toEqual([]);
});

test('semantic scope references survive warm cache and a missing provenance owner causes safe full recovery', async () => {
  const f = fixture();
  const cold = success(await compile(f.create()));
  const allDependencies = cold.artifacts.flatMap((item) => [
    ...item.dependencies,
    ...item.content.flatMap((content) => content.ir.dependencies),
  ]);
  expect(allDependencies.filter((item) => item.kind === 'semantic')).toHaveLength(1);
  expect(allDependencies.some((item) => item.kind === 'semantic-reference')).toBe(true);
  expect(
    cold.artifacts
      .filter((item) => item.identity.role !== 'aggregate')
      .every((item) =>
        item.dependencies.some((dependency) => dependency.kind === 'semantic-reference'),
      ),
  ).toBe(true);
  const location = path.join(
    f.options.defaults.cacheRoot,
    readdirSync(f.options.defaults.cacheRoot).find((name) =>
      name.endsWith('.compilation-index.json'),
    )!,
  );
  const keys = JSON.parse(readFileSync(location, 'utf8'));
  expect(keys.some((key: any) => key.identity.role === 'aggregate')).toBe(true);
  writeFileSync(
    location,
    JSON.stringify(keys.filter((key: any) => key.identity.role !== 'aggregate')),
  );
  const restored = await compile(f.create());
  expect(success(restored)).toEqual(cold);
  expect(restored.diagnostics.some((item) => item.code === 'COMPILATION_CACHE_SCOPE')).toBe(true);
  expect(restored.whyRebuilt.every((item) => item.reason === 'cache-miss')).toBe(true);
  const invalidPrevious = {
    ...cold,
    artifacts: cold.artifacts.filter((item) => item.identity.role !== 'aggregate'),
  };
  const recovered = await compile(f.create(), 2, invalidPrevious);
  expect(success(recovered)).toEqual(cold);
  expect(recovered.diagnostics.some((item) => item.code === 'COMPILATION_CACHE_SCOPE')).toBe(true);
  const expanded = JSON.parse(JSON.stringify(cold)) as ArtifactSnapshot;
  const scope = expanded.artifacts
    .flatMap((item) => item.dependencies)
    .find((item) => item.kind === 'semantic')!;
  for (const artifact of expanded.artifacts) {
    artifact.dependencies = artifact.dependencies.map((item) =>
      item.kind === 'semantic-reference' ? scope : item,
    );
    for (const content of artifact.content)
      content.ir.dependencies = content.ir.dependencies.map((item) =>
        item.kind === 'semantic-reference' ? scope : item,
      );
  }
  const migrated = await compile(f.create(), 3, expanded);
  expect(success(migrated)).toEqual(cold);
  expect(migrated.diagnostics.some((item) => item.code === 'COMPILATION_CACHE_FORMAT')).toBe(true);
});

test('shared semantic scope observes package metadata, config extends, and previously missing resolution targets', async () => {
  const f = fixture();
  const packageFile = f.write(
    'node_modules/fixture-types/package.json',
    JSON.stringify({ name: 'fixture-types', types: 'first.d.ts' }),
  );
  f.write(
    'node_modules/fixture-types/first.d.ts',
    'export declare class Base { firstPackage: string }',
  );
  f.write(
    'node_modules/fixture-types/second.d.ts',
    'export declare class Base { secondPackage: string }',
  );
  f.write(
    'docs/api.ts',
    "import { Base } from 'fixture-types'; export class Actual extends Base {}",
  );
  const html = (snapshot: ArtifactSnapshot) =>
    snapshot.artifacts.flatMap((item) => item.content).find((item) => item.ir.role === 'api-tab')!
      .html;
  let previous = success(await compile(f.create()));
  expect(html(previous)).toContain('firstPackage');
  f.write(
    'node_modules/fixture-types/package.json',
    JSON.stringify({ name: 'fixture-types', types: 'second.d.ts' }),
  );
  const changed = await compile(f.create(), 2, previous, [{ kind: 'update', path: packageFile }]);
  previous = success(changed);
  expect(html(previous)).toContain('secondPackage');
  expect(html(previous)).not.toContain('firstPackage');
  expect(changed.whyRebuilt.some((item) => item.reason === 'semantic')).toBe(true);
  const baseConfig = f.write(
    'base.json',
    JSON.stringify({ compilerOptions: { paths: { 'fixture-types': ['./types/resolved.ts'] } } }),
  );
  f.write(
    'tsconfig.json',
    JSON.stringify({
      extends: './base.json',
      compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
      include: ['docs/**/*.ts'],
    }),
  );
  f.write('types/resolved.ts', 'export class Base { fromConfig = 1 }');
  previous = success(
    await compile(f.create(), 3, previous, [{ kind: 'update', path: f.options.defaults.tsConfig }]),
  );
  expect(html(previous)).toContain('fromConfig');
  f.write(
    'base.json',
    JSON.stringify({ compilerOptions: { paths: { 'fixture-types': ['./types/missing.ts'] } } }),
  );
  previous = success(
    await compile(f.create(), 4, previous, [{ kind: 'update', path: baseConfig }]),
  );
  const missingPath = f.write('types/missing.ts', 'export class Base { recoveredResolution = 1 }');
  const recovered = await compile(f.create(), 5, previous, [{ kind: 'create', path: missingPath }]);
  previous = success(recovered);
  expect(html(previous)).toContain('recoveredResolution');
  expect(recovered.whyRebuilt.some((item) => item.reason === 'semantic')).toBe(true);
  expect(success(await compile(f.create()))).toEqual(previous);
}, 20_000);

test('category metadata retains external snippet dependencies outside the TypeScript program', async () => {
  const f = fixture();
  const snippet = f.write('snippets/example.txt', 'const originalSnippet = 1;');
  f.write(
    'docs/ng-doc.category.ts',
    [
      '/** Category source.',
      ' * ```typescript file="../snippets/example.txt"',
      ' * ignored',
      ' * ```',
      ' */',
      "const category = { title: 'Parent', route: 'parent' }; export default category;",
    ].join('\n'),
  );
  f.write(
    'docs/guide/ng-doc.page.ts',
    "import parent from '../ng-doc.category'; const page = { title:'Guide', route:'guide', category:parent, mdFile:'./index.md' }; export default page;",
  );
  const cold = success(await compile(f.create()));
  const category = cold.artifacts.find((item) => item.identity.role === 'category')!;
  expect(category.routes[0].metadata?.description).toContain('originalSnippet');
  expect(category.dependencies).toContainEqual(
    expect.objectContaining({ kind: 'content', path: snippet }),
  );
  f.write('snippets/example.txt', 'const changedSnippet = 2;');
  const changedResult = await compile(f.create(), 2, cold, [{ kind: 'update', path: snippet }]);
  const changed = success(changedResult);
  expect(
    changed.artifacts.find((item) => item.identity.role === 'category')!.routes[0].metadata
      ?.description,
  ).toContain('changedSnippet');
  expect(changedResult.whyRebuilt).toContainEqual(
    expect.objectContaining({ ownerId: category.id, reason: 'input' }),
  );
  expect(success(await compile(f.create()))).toEqual(changed);
});

test('search preserves explicit tab breadcrumbs, untitled tabs and header navigation across disk cache', async () => {
  const f = fixture();
  f.write(
    'docs/guide/ng-doc.page.ts',
    `/** Header navigation. */ const page = { title: 'Guide', route: 'guide', mdFile: ['./index.md', './same.md', './untitled.md'] }; export default page;`,
  );
  f.write('docs/guide/index.md', '---\ntitle: Manual\nroute: manual\n---\nDistinct tab body.');
  f.write('docs/guide/same.md', '---\ntitle: Guide\nroute: same\n---\nSame title tab body.');
  f.write('docs/guide/untitled.md', '---\nroute: untitled\n---\nUntitled tab body.');
  const service = f.create();
  const cold = success(await compile(service));
  const records = cold.artifacts.flatMap((artifact) => artifact.searchRecords);
  for (const [text, breadcrumbs] of [
    ['Distinct tab body.', ['Guide', 'Manual']],
    ['Same title tab body.', ['Guide', 'Guide']],
    ['Untitled tab body.', ['Guide']],
    ['Header navigation.', ['Guide']],
  ] as const) {
    expect(records.find((record) => record.content.includes(text))?.breadcrumbs).toEqual(
      breadcrumbs,
    );
  }
  await service.dispose();
  const restored = await compile(f.create());
  expect(success(restored)).toEqual(cold);
  expect(restored.whyRebuilt).toEqual([]);
}, 20000);

test('published configuration follows legacy outDir parent semantics and changes revision on host settings edits', async () => {
  const f = fixture();
  const service = f.create();
  const first = success(await compile(service));
  const config = f.write(
    'ng-doc.config.ts',
    `export default { docsPath: 'docs', outDir: 'custom-parent', cache: true };`,
  );
  const moved = success(await compile(service, 2, first, [{ kind: 'update', path: config }]));
  expect(moved.configuration?.outputRoot).toBe(
    path.join(f.root, 'custom-parent', 'ng-doc', 'fixture'),
  );
  expect(moved.configuration?.digest).not.toBe(first.configuration?.digest);
  expect(moved.revision).not.toBe(first.revision);
  expect(moved.configuration?.cacheRoot).toBe(first.configuration?.cacheRoot);
  await service.dispose();
  expect(success(await compile(f.create()))).toEqual(moved);
}, 20000);

test('one keyword refresh per compile yields each page exactly its own per-page keyword dependencies', async () => {
  const f = fixture(false);
  f.write(
    'docs/second/ng-doc.page.ts',
    `const page = { title: 'Second', route: 'second', mdFile: './index.md' }; export default page;`,
  );
  f.write('docs/second/index.md', '# Second\n\nUses `Guide` and `Actual` and `Absent`.');
  const linkedKeywords: KeywordExport[][] = [];
  const link = GeneratorContentCompiler.prototype.link;
  vi.spyOn(GeneratorContentCompiler.prototype, 'link').mockImplementation(function (
    this: GeneratorContentCompiler,
    request: {
      ir: ContentIR;
      keywords: KeywordExport[];
      breadcrumbs: string[];
      pageType: 'guide' | 'api';
    },
    signal: AbortSignal,
  ) {
    linkedKeywords.push(request.keywords);
    return link.call(this, request, signal);
  });
  const snapshot = success(await compile(f.create()));
  // Every link of the compile shares one frozen keyword set.
  expect(linkedKeywords.length).toBeGreaterThan(2);
  expect(new Set(linkedKeywords).size).toBe(1);
  expect(Object.isFrozen(linkedKeywords[0])).toBe(true);
  const keywordPages = snapshot.artifacts.filter((artifact) => artifact.usedKeywords.length);
  expect(keywordPages.length).toBeGreaterThan(1);
  for (const artifact of snapshot.artifacts) {
    const expected = (
      await refreshDependencies(
        artifact.usedKeywords.map((key) => ({ kind: 'keyword' as const, key, digest: '' })),
        linkedKeywords[0],
      )
    ).dependencies;
    // Artifact dependencies are re-sorted by the compiler; compare the keyword entries by key.
    const byKey = (items: typeof expected) =>
      [...items].sort((left, right) =>
        left.kind === 'keyword' && right.kind === 'keyword' ? left.key.localeCompare(right.key) : 0,
      );
    expect(byKey(artifact.dependencies.filter((item) => item.kind === 'keyword'))).toEqual(
      byKey(expected),
    );
  }
  vi.restoreAllMocks();
}, 60000);

test('memoised observations never cross generations: changed files and bindings refresh', async () => {
  const f = fixture(false);
  const service = f.create();
  const keywordDigest = (snapshot: ArtifactSnapshot, key: string) =>
    snapshot.artifacts
      .flatMap((artifact) => artifact.dependencies)
      .flatMap((item) => (item.kind === 'keyword' && item.key === key ? [item.digest] : []))[0];
  const contentDigest = (snapshot: ArtifactSnapshot, file: string) =>
    snapshot.artifacts
      .flatMap((artifact) => artifact.dependencies)
      .flatMap((item) => (item.kind === 'content' && item.path === file ? [item.digest] : []))[0];
  const guideOwner = (snapshot: ArtifactSnapshot) =>
    snapshot.artifacts.find((artifact) => artifact.usedKeywords.includes('Actual'))!.id;
  const markdown = path.join(f.root, 'docs/guide/index.md');
  const api = path.join(f.root, 'docs/api.ts');
  const first = success(await compile(service));
  const actual = keywordDigest(first, 'Actual');
  const guideBytes = contentDigest(first, markdown);
  expect(actual).toBeDefined();
  expect(guideBytes).toBeDefined();

  // Unchanged inputs: the next generation observes identical digests.
  const unchanged = success(await compile(service, 2, first));
  expect(keywordDigest(unchanged, 'Actual')).toBe(actual);
  expect(contentDigest(unchanged, markdown)).toBe(guideBytes);

  // A file edited between generations is hashed again, not served from the last compile.
  f.write('docs/guide/index.md', readFileSync(markdown, 'utf8') + '\n\nEdited paragraph.');
  const edited = await compile(service, 3, unchanged, [{ kind: 'update', path: markdown }]);
  const editedSnapshot = success(edited);
  expect(contentDigest(editedSnapshot, markdown)).not.toBe(guideBytes);
  expect(edited.whyRebuilt.some((item) => item.ownerId === guideOwner(first))).toBe(true);
  expect(JSON.stringify(editedSnapshot.artifacts.flatMap((item) => item.searchRecords))).toContain(
    'Edited paragraph.',
  );
  expect(keywordDigest(editedSnapshot, 'Actual')).toBe(actual);

  // A changed binding changes the consuming page's keyword dependency in the next generation.
  f.write('docs/api.ts', '/** Renamed declaration. */ export class Other { value = 1; }');
  const rebound = success(
    await compile(service, 4, editedSnapshot, [{ kind: 'update', path: api }]),
  );
  expect(keywordDigest(rebound, 'Actual')).toBeDefined();
  expect(keywordDigest(rebound, 'Actual')).not.toBe(actual);
  f.write(
    'docs/api.ts',
    '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
  );
  const restored = success(await compile(service, 5, rebound, [{ kind: 'update', path: api }]));
  expect(keywordDigest(restored, 'Actual')).toBe(actual);
}, 60000);
