import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

import { createOutputCommitter, JsonArtifactCache } from '../artifacts';
import { GeneratorContentCompiler } from '../content/content-compiler';
import type { ArtifactSnapshot, CompilationResult } from '../contracts';
import { hostPath } from '../kernel/paths';
import { OutputAssemblerImpl } from '../outputs';
import { createBuildSession } from '../session/build-session';
import {
  type Fixture,
  type Step,
  cleanup,
  cold,
  compile,
  disposeAll,
  fixture,
  published,
  runChain,
  steps,
  success,
  update,
} from './testing/incremental-support';

// Exact incremental reuse must be invisible: every incremental result equals the reference
// path (`incrementalReuse: false`, which recomputes everything) exactly, and every published
// output, search record, keyword and diagnostic equals a cold build of the same tree.

afterEach(disposeAll);

test('differential: guide, include, API, no-op, keyword and removal edits equal reference and cold builds', async () => {
  const f = fixture();
  const colds: CompilationResult[] = [];
  const reference = await runChain(f, f.create({ incrementalReuse: false }), async () => {
    colds.push(await cold(f));
  });
  f.reset();
  const incremental = await runChain(f, f.create());
  expect(incremental).toHaveLength(steps.length + 1);
  for (const [index, result] of incremental.entries()) {
    const label = index ? steps[index - 1].name : 'initial';
    // Byte-for-byte: candidate (every revision), diagnostics, whyRebuilt, dependencies.
    expect({ label, result: JSON.stringify(result) }).toEqual({
      label,
      result: JSON.stringify(reference[index]),
    });
    expect({ label, ...published(result) }).toEqual({ label, ...published(colds[index]) });
  }
  // The sequence exercised every reuse decision and every rebuild reason kind it can.
  const reasons = new Set(
    incremental.flatMap((result) => result.whyRebuilt.map((reason) => reason.reason)),
  );
  // (Outputs are never committed here, so retained paths also report `output-missing`.)
  expect(reasons).toEqual(
    new Set([
      'initial',
      'cache-miss',
      'input',
      'existence',
      'semantic',
      'keyword',
      'output-missing',
    ]),
  );
  expect(incremental[4].whyRebuilt.filter((reason) => reason.reason !== 'output-missing')).toEqual(
    [],
  );
}, 240_000);

test('only changed units are relinked, reassembled, rehashed and rewritten to the cache', async () => {
  const f = fixture();
  const service = f.create();
  const link = GeneratorContentCompiler.prototype.link;
  const linked: string[] = [];
  vi.spyOn(GeneratorContentCompiler.prototype, 'link').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof link>
  ) {
    linked.push(args[0].ir.id);
    return link.apply(this, args);
  });
  const assemble = OutputAssemblerImpl.prototype.assemblePage;
  const assembled: string[] = [];
  vi.spyOn(OutputAssemblerImpl.prototype, 'assemblePage').mockImplementation(function (
    this: OutputAssemblerImpl,
    ...args: Parameters<typeof assemble>
  ) {
    assembled.push(args[0].ownerId!);
    return assemble.apply(this, args);
  });
  const writeStamped = JsonArtifactCache.prototype.writeStamped;
  const cached: string[] = [];
  vi.spyOn(JsonArtifactCache.prototype, 'writeStamped').mockImplementation(function (
    this: JsonArtifactCache,
    ...args: Parameters<typeof writeStamped>
  ) {
    cached.push(args[0].id);
    return writeStamped.apply(this, args);
  });
  const reset = () => [linked, assembled, cached].forEach((list) => list.splice(0));

  const initial = success(await compile(service, 1));
  const owners = initial.artifacts.filter((artifact) => artifact.identity.role !== 'aggregate');
  const aggregate = initial.artifacts.find((artifact) => artifact.identity.role === 'aggregate')!;
  const byTitle = (snapshot: ArtifactSnapshot, title: string) =>
    snapshot.artifacts.find((artifact) => artifact.routes.some((route) => route.title === title))!;
  const contentIds = (snapshot: ArtifactSnapshot, title: string) =>
    byTitle(snapshot, title)
      .content.map((item) => item.ir.id)
      .sort();
  expect(linked.length).toBe(initial.artifacts.flatMap((artifact) => artifact.content).length);
  expect(cached.length).toBe(initial.artifacts.length);

  // A no-op compile reuses every link, page assembly and cache entry.
  reset();
  const noop = success(await compile(service, 2, initial));
  expect(noop).toEqual(initial);
  expect({ linked, assembled, cached }).toEqual({ linked: [], assembled: [], cached: [] });

  // A guide edit touches only that guide and the aggregate.
  reset();
  f.write(
    'docs/guide/index.md',
    readFileSync(path.join(f.root, 'docs/guide/index.md'), 'utf8') + '\nMore.\n',
  );
  const edited = success(
    await compile(service, 3, noop, [update(path.join(f.root, 'docs/guide/index.md'))]),
  );
  const guide = byTitle(edited, 'Guide');
  expect(linked.sort()).toEqual(contentIds(edited, 'Guide').filter((id) => id.includes(':tab:')));
  expect(assembled).toEqual([guide.id]);
  expect(cached.sort()).toEqual([aggregate.id, guide.id].sort());

  // An API JSDoc edit re-renders the units whose recorded semantic closure read the edited file
  // and changes the edited declaration's keyword description; only documents that consulted it
  // are relinked.
  reset();
  f.write(
    'docs/api-helper.ts',
    "import { Actual } from './api';\n/** Returns the actual. */ export function helper(value: Actual): Actual { return value; }",
  );
  const api = success(
    await compile(service, 4, edited, [update(path.join(f.root, 'docs/api-helper.ts'))]),
  );
  const helperConsumers = api.artifacts
    .flatMap((artifact) => artifact.content)
    .filter((item) => item.html.includes('Returns the actual.'))
    .map((item) => item.ir.id)
    .sort();
  expect(helperConsumers.length).toBeGreaterThan(0);
  expect([...new Set(linked)].sort()).toEqual(helperConsumers);

  // A page-file edit leaves the configuration digest alone (the page is its own entry's input).
  // The page module is a program input here, but units record the semantic closure of what they
  // read, so only the renamed guide and the consumer of its changed binding are rebuilt.
  reset();
  f.write(
    'docs/guide/ng-doc.page.ts',
    `/** Guide introduction. */ const page = { title: 'Guide Renamed', route: 'guide', mdFile: './index.md' }; export default page;`,
  );
  const renamed = success(
    await compile(service, 5, api, [update(path.join(f.root, 'docs/guide/ng-doc.page.ts'))]),
  );
  expect(renamed.configuration!.digest).toBe(api.configuration!.digest);
  const second = byTitle(renamed, 'Second');
  const secondTab = second.content.find((item) => item.ir.role === 'guide-tab')!.ir.id;
  expect(second.content.find((item) => item.ir.id === secondTab)!.html).toContain('Guide Renamed');
  const guideOwner = byTitle(renamed, 'Guide Renamed').id;
  expect(linked).toContain(secondTab);
  expect(linked.filter((id) => !id.startsWith(`${guideOwner}:`) && id !== secondTab)).toEqual([]);
  expect(assembled.sort()).toEqual([guideOwner, second.id].sort());
}, 240_000);

test('a corrupt or missing memo and a missing cache entry only disable reuse', async () => {
  const f = fixture();
  const service = f.create();
  const referenceService = f.create({ incrementalReuse: false });
  const initial = success(await compile(service, 1));
  const memo = readdirSync(f.options.defaults.cacheRoot).find((file) =>
    file.endsWith('.compiler-memo.json'),
  )!;
  expect(memo).toBeDefined();
  const memoPath = path.join(f.options.defaults.cacheRoot, memo);
  const recorded = JSON.parse(readFileSync(memoPath, 'utf8')) as {
    cache: Record<string, unknown>;
    link: Record<string, unknown>;
  };
  expect(Object.keys(recorded.cache)).toHaveLength(initial.artifacts.length);
  expect(Object.keys(recorded.link)).toHaveLength(
    initial.artifacts.flatMap((artifact) => artifact.content).length,
  );

  const writeStamped = JsonArtifactCache.prototype.writeStamped;
  const cached: string[] = [];
  vi.spyOn(JsonArtifactCache.prototype, 'writeStamped').mockImplementation(function (
    this: JsonArtifactCache,
    ...args: Parameters<typeof writeStamped>
  ) {
    cached.push(args[0].id);
    return writeStamped.apply(this, args);
  });
  // A deleted cache entry is rewritten; the others are not.
  const victim = initial.artifacts[0];
  const projectDirectory = readdirSync(f.options.defaults.cacheRoot, { withFileTypes: true }).find(
    (entry) => entry.isDirectory(),
  )!;
  const entries = readdirSync(path.join(f.options.defaults.cacheRoot, projectDirectory.name));
  const before = new Map(
    entries.map((name) => [
      name,
      readFileSync(path.join(f.options.defaults.cacheRoot, projectDirectory.name, name), 'utf8'),
    ]),
  );
  const victimFile = entries.find((name) =>
    before.get(name)!.startsWith(`{"id":${JSON.stringify(victim.id)}`),
  )!;
  unlinkSync(path.join(f.options.defaults.cacheRoot, projectDirectory.name, victimFile));
  const repaired = success(await compile(service, 2, initial));
  expect(cached).toEqual([victim.id]);
  for (const [name, bytes] of before)
    expect(
      readFileSync(path.join(f.options.defaults.cacheRoot, projectDirectory.name, name), 'utf8'),
    ).toBe(bytes);

  // A corrupt memo: everything is recomputed and written, the result is unchanged.
  cached.splice(0);
  writeFileSync(memoPath, '{"schemaVersion":1,"link":[]}');
  f.write(
    'docs/guide/ng-doc.page.ts',
    `const page = { title: 'Guide Two', route: 'guide', mdFile: './index.md' }; export default page;`,
  );
  const changes = [update(path.join(f.root, 'docs/guide/ng-doc.page.ts'))];
  const corrupt = await compile(service, 3, repaired, changes);
  expect(cached).toHaveLength(initial.artifacts.length);
  const reference = await compile(referenceService, 3, repaired, changes);
  expect(JSON.stringify(corrupt)).toBe(JSON.stringify(reference));
  // A memo from another compiler version is ignored as well.
  const foreign = JSON.parse(readFileSync(memoPath, 'utf8')) as Record<string, unknown>;
  writeFileSync(memoPath, JSON.stringify({ ...foreign, compilerVersion: 'other' }));
  cached.splice(0);
  success(await compile(service, 4, success(corrupt)));
  expect(cached).toHaveLength(initial.artifacts.length);
}, 240_000);

test('without a cache, keyword-set reuse still yields the reference results and writes no memo', async () => {
  const f = fixture(false);
  const colds: CompilationResult[] = [];
  const reference = await runChain(f, f.create({ incrementalReuse: false }), async () => {
    colds.push(await cold(f));
  });
  f.reset();
  const incremental = await runChain(f, f.create());
  for (const [index, result] of incremental.entries()) {
    expect(JSON.stringify(result)).toBe(JSON.stringify(reference[index]));
    expect(published(result)).toEqual(published(colds[index]));
  }
  expect(existsSync(f.options.defaults.cacheRoot)).toBe(false);
}, 240_000);

// Keyword-set and configuration changes that a reused link could miss. Configuration keywords,
// their URL/languages, keyword addition (previously unlinked inline and code-block text), a case
// variant, a guide route rename, a routePrefix change and keyword removal.
const keywordConfig = (keywords: string, extra = '') =>
  `export default { docsPath: 'docs', cache: true, ${extra} keywords: { keywords: { ${keywords} } } };`;

const keywordFiles = (): Record<string, string> => ({
  'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
    include: ['docs/**/*.ts'],
  }),
  'ng-doc.config.ts': keywordConfig(`GlobalKw: { url: '/global', title: 'GlobalKw' }`),
  'docs/ng-doc.api.ts': `const api = { title: 'API', keyword: 'ApiIndex', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default api;`,
  'docs/api.ts': '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
  'docs/guide/ng-doc.page.ts': `const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
  'docs/guide/index.md':
    '---\nkeyword: Guide\n---\n# Guide heading\n\n' +
    'Inline `Actual`, `Extra`, `extra`, `GlobalKw`, `NewGlobal` and `Actual.value`.\n\n' +
    '```typescript\nconst a: Actual = new Actual();\nconst b: Extra = null!;\nconst c = extra;\nconst d = GlobalKw + NewGlobal;\n```\n',
  'docs/second/ng-doc.page.ts': `const page = { title: 'Second', route: 'second', mdFile: './index.md' }; export default page;`,
  'docs/second/index.md': '# Second\n\nSee `*Guide` and `Extra` for details.\n',
  'docs/third/ng-doc.page.ts': `const page = { title: 'Third', route: 'third', mdFile: './index.md' }; export default page;`,
  'docs/third/index.md': '# Third\n\nPlain prose only, no code.\n',
});

const readFixture = (f: Fixture, file: string) => readFileSync(path.join(f.root, file), 'utf8');
const twoGlobals = `GlobalKw: { url: '/global-2', title: 'GlobalKw' }, NewGlobal: { url: '/new', title: 'New global' }`;
const htmlOnlyGlobals = `GlobalKw: { url: '/global-2', title: 'GlobalKw', languages: ['html'] }, NewGlobal: { url: '/new', title: 'New global' }`;

const keywordSteps: Step[] = [
  {
    name: 'keyword addition (Extra now links previously unlinked text)',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          readFixture(f, 'docs/api.ts') + '\n/** Extra class. */ export class Extra {}',
        ),
      ),
    ],
  },
  {
    name: 'case-variant keyword addition (extra next to Extra)',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          readFixture(f, 'docs/api.ts') + '\n/** Lower. */ export const extra = 1;',
        ),
      ),
    ],
  },
  {
    name: 'configuration keyword URL change',
    apply: (f) => [
      update(
        f.write(
          'ng-doc.config.ts',
          keywordConfig(`GlobalKw: { url: '/global-2', title: 'GlobalKw' }`),
        ),
      ),
    ],
  },
  {
    name: 'configuration keyword addition',
    apply: (f) => [update(f.write('ng-doc.config.ts', keywordConfig(twoGlobals)))],
  },
  {
    name: 'configuration keyword languages change',
    apply: (f) => [update(f.write('ng-doc.config.ts', keywordConfig(htmlOnlyGlobals)))],
  },
  {
    name: 'guide route rename (retargets *Guide)',
    apply: (f) => [
      update(
        f.write(
          'docs/guide/ng-doc.page.ts',
          `const page = { title: 'Guide', route: 'guide-moved', mdFile: './index.md' }; export default page;`,
        ),
      ),
    ],
  },
  {
    name: 'routePrefix change',
    apply: (f) => [
      update(f.write('ng-doc.config.ts', keywordConfig(htmlOnlyGlobals, `routePrefix: 'docs',`))),
    ],
  },
  {
    name: 'API keyword removal (Extra and extra)',
    apply: (f) => [
      update(
        f.write(
          'docs/api.ts',
          '/** Actual declaration. */ export class Actual { /** Value. */ value = 1; }',
        ),
      ),
    ],
  },
  {
    name: 'configuration keyword removal',
    apply: (f) => [update(f.write('ng-doc.config.ts', keywordConfig(``, `routePrefix: 'docs',`)))],
  },
  {
    name: 'no-op save',
    apply: (f) => [update(f.write('docs/guide/index.md', readFixture(f, 'docs/guide/index.md')))],
  },
];

const guideHtml = (result: CompilationResult) =>
  success(result)
    .artifacts.filter((artifact) => artifact.routes.some((route) => route.title === 'Guide'))
    .flatMap((artifact) => artifact.content)
    .filter((item) => item.ir.role === 'guide-tab')
    .map((item) => item.html)
    .join('\n');

test('differential: keyword additions, case, configuration keywords, route and routePrefix changes and removals', async () => {
  const f = fixture(true, keywordFiles);
  const colds: CompilationResult[] = [];
  const reference = await runChain(
    f,
    f.create({ incrementalReuse: false }),
    async () => {
      colds.push(await cold(f));
    },
    keywordSteps,
  );
  f.reset();
  const link = GeneratorContentCompiler.prototype.link;
  let linkCalls = 0;
  vi.spyOn(GeneratorContentCompiler.prototype, 'link').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof link>
  ) {
    linkCalls += 1;
    return link.apply(this, args);
  });
  const perStep: Array<{ step: string; linked: number; total: number }> = [];
  const incremental = await runChain(
    f,
    f.create(),
    (step, result) => {
      perStep.push({
        step,
        linked: linkCalls,
        total: success(result).artifacts.flatMap((artifact) => artifact.content).length,
      });
      linkCalls = 0;
    },
    keywordSteps,
  );
  const htmlChanges: string[] = [];
  for (const [index, result] of incremental.entries()) {
    const label = index ? keywordSteps[index - 1].name : 'initial';
    expect({ label, result: JSON.stringify(result) }).toEqual({
      label,
      result: JSON.stringify(reference[index]),
    });
    expect({ label, ...published(result) }).toEqual({ label, ...published(colds[index]) });
    if (index && guideHtml(result) !== guideHtml(incremental[index - 1])) htmlChanges.push(label);
  }
  // The steps really change the linked guide, so reuse had to be refused where it mattered...
  expect(htmlChanges).toEqual(
    expect.arrayContaining([
      keywordSteps[0].name,
      keywordSteps[1].name,
      keywordSteps[2].name,
      keywordSteps[3].name,
      keywordSteps[4].name,
      keywordSteps[6].name,
      keywordSteps[7].name,
      keywordSteps[8].name,
    ]),
  );
  // ...and reuse still happened across keyword-set changes (the consulted-bindings memo).
  expect(perStep.slice(1, 6).every(({ linked, total }) => linked < total)).toBe(true);
  expect(perStep.at(-1)!.linked).toBe(0);
}, 600_000);

test('two sessions sharing one cache root (one memo file) both equal the reference chain', async () => {
  const f = fixture(true, keywordFiles);
  const reference = await runChain(
    f,
    f.create({ incrementalReuse: false }),
    undefined,
    keywordSteps,
  );
  f.reset();
  const a = f.create();
  const b = f.create();
  let previousA = success(await compile(a, 1));
  let previousB = success(await compile(b, 1));
  for (const [index, step] of keywordSteps.entries()) {
    const changes = step.apply(f);
    const resultA = await compile(a, index + 2, previousA, changes);
    const resultB = await compile(b, index + 2, previousB, changes);
    expect({ step: step.name, a: JSON.stringify(resultA) }).toEqual({
      step: step.name,
      a: JSON.stringify(reference[index + 1]),
    });
    expect({ step: step.name, b: JSON.stringify(resultB) }).toEqual({
      step: step.name,
      b: JSON.stringify(reference[index + 1]),
    });
    previousA = success(resultA);
    previousB = success(resultB);
  }
}, 600_000);

test('production generations and a production buildOnce use no reuse, write no memo and write every cache entry', async () => {
  const f = fixture();
  const write = JsonArtifactCache.prototype.write;
  const written: string[] = [];
  vi.spyOn(JsonArtifactCache.prototype, 'write').mockImplementation(function (
    this: JsonArtifactCache,
    ...args: Parameters<typeof write>
  ) {
    written.push(args[0].id);
    return write.apply(this, args);
  });
  // (A conditional spy keeps this test meaningful against sources without `confirm`.)
  const confirm =
    'confirm' in JsonArtifactCache.prototype
      ? vi.spyOn(JsonArtifactCache.prototype, 'confirm')
      : undefined;
  const confirmed = () => confirm?.mock.calls.length ?? 0;
  const link = GeneratorContentCompiler.prototype.link;
  const consulted: unknown[] = [];
  vi.spyOn(GeneratorContentCompiler.prototype, 'link').mockImplementation(function (
    this: GeneratorContentCompiler,
    ...args: Parameters<typeof link>
  ) {
    consulted.push(args[2]);
    return link.apply(this, args);
  });
  const assemble = OutputAssemblerImpl.prototype.assemblePage;
  let assembled = 0;
  vi.spyOn(OutputAssemblerImpl.prototype, 'assemblePage').mockImplementation(function (
    this: OutputAssemblerImpl,
    ...args: Parameters<typeof assemble>
  ) {
    assembled += 1;
    return assemble.apply(this, args);
  });
  const memoFiles = () =>
    existsSync(f.options.defaults.cacheRoot)
      ? readdirSync(f.options.defaults.cacheRoot).filter((file) =>
          file.endsWith('.compiler-memo.json'),
        )
      : [];

  // A production buildOnce through the real session and transactional committer, twice.
  const session = createBuildSession({
    compiler: f.create(),
    committer: createOutputCommitter({ outputRoot: f.options.defaults.outputRoot }),
  });
  cleanup.push(() => session.dispose());
  const first = await session.buildOnce({ mode: 'production' });
  expect(first.status).toBe('success');
  const artifacts = first.status === 'success' ? first.snapshot.artifacts : [];
  const pages = artifacts.filter(
    (artifact) => artifact.outputs.length && artifact.identity.role !== 'aggregate',
  ).length;
  expect(written).toHaveLength(artifacts.length);
  expect(assembled).toBeGreaterThanOrEqual(pages);
  const second = await session.buildOnce({ mode: 'production' });
  expect(second.status).toBe('success');
  expect(written).toHaveLength(2 * artifacts.length);
  expect(confirmed()).toBe(0);
  expect(consulted.every((value) => value === undefined)).toBe(true);
  expect(memoFiles()).toEqual([]);

  // Production compiles with a previous snapshot equal the reference path exactly.
  written.splice(0);
  const production = f.create();
  const reference = f.create({ incrementalReuse: false });
  const request = (previous?: ArtifactSnapshot) => ({
    generation: 3,
    mode: 'production' as const,
    changes: [],
    ...(previous ? { previous } : {}),
  });
  const base = success(await production.compile(request(), new AbortController().signal));
  f.write(
    'docs/guide/index.md',
    readFileSync(path.join(f.root, 'docs/guide/index.md'), 'utf8') + '\nProduction edit.\n',
  );
  const next = await production.compile(request(base), new AbortController().signal);
  const expected = await reference.compile(request(base), new AbortController().signal);
  expect(JSON.stringify(next)).toBe(JSON.stringify(expected));
  expect(written).toHaveLength(3 * artifacts.length);
  expect(memoFiles()).toEqual([]);
  expect(confirmed()).toBe(0);
}, 240_000);

// `onlyForTags`: a tag-filtered entry does not exist in the build. Flipping a page or a category
// with children in and out mid-watch must equal the reference path and a cold build of the same
// tree, and a cache warmed under other tags that select the same entries must be reused exactly.
const tagFiles = (): Record<string, string> => ({
  'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
    include: ['docs/**/*.ts'],
  }),
  'ng-doc.config.ts': `export default { docsPath: 'docs', cache: true };`,
  'docs/guide/ng-doc.page.ts': `const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;`,
  'docs/guide/index.md': '---\nkeyword: Guide\n---\n# Guide\n\nPublic prose.\n',
  'docs/develop/ng-doc.page.ts': `const page = { title: 'Develop', route: 'develop', mdFile: './index.md' }; export default page;`,
  'docs/develop/index.md': '---\nkeyword: DevelopPage\n---\n# Develop\n\nSandbox prose.\n',
  'docs/beta/ng-doc.category.ts': `const Beta = { title: 'Beta', route: 'beta' }; export default Beta;`,
  'docs/beta/child/ng-doc.page.ts': `import Beta from '../ng-doc.category'; const page = { title: 'Beta child', category: Beta, route: 'child', mdFile: './index.md' }; export default page;`,
  'docs/beta/child/index.md': '# Beta child\n\nBeta prose.\n',
  'docs/beta/ng-doc.api.ts': `import Beta from './ng-doc.category'; const api = { title: 'Beta API', category: Beta, scopes: [{ name: 'Beta', route: 'beta-scope', include: ['docs/beta/api.ts'] }] }; export default api;`,
  'docs/beta/api.ts': '/** Beta declaration. */ export class BetaThing {}',
});

const developPage = (extra: string) =>
  `const page = { title: 'Develop', route: 'develop', mdFile: './index.md'${extra} }; export default page;`;
const betaCategory = (extra: string) =>
  `const Beta = { title: 'Beta', route: 'beta'${extra} }; export default Beta;`;

const tagSteps: Step[] = [
  {
    name: 'page gains onlyForTags (left out)',
    apply: (f) => [
      update(f.write('docs/develop/ng-doc.page.ts', developPage(`, onlyForTags: ['development']`))),
    ],
  },
  {
    name: 'page loses onlyForTags (back)',
    apply: (f) => [update(f.write('docs/develop/ng-doc.page.ts', developPage('')))],
  },
  {
    name: 'category with children gains onlyForTags (left out)',
    apply: (f) => [
      update(
        f.write('docs/beta/ng-doc.category.ts', betaCategory(`, onlyForTags: ['development']`)),
      ),
    ],
  },
  {
    name: 'left-out page edit (no visible change)',
    apply: (f) => [
      update(f.write('docs/beta/child/index.md', '# Beta child\n\nEdited beta prose.\n')),
    ],
  },
  {
    name: 'category loses onlyForTags (back)',
    apply: (f) => [update(f.write('docs/beta/ng-doc.category.ts', betaCategory('')))],
  },
  {
    name: 'page tag now matches the build',
    apply: (f) => [
      update(f.write('docs/develop/ng-doc.page.ts', developPage(`, onlyForTags: ['production']`))),
    ],
  },
];

const routeTitles = (result: CompilationResult) =>
  success(result)
    .artifacts.flatMap((artifact) => artifact.routes.map((route) => route.title))
    .sort();

test('differential: onlyForTags flips of a page and of a category with children equal reference and cold builds', async () => {
  const f = fixture(true, tagFiles);
  f.options.discovery = { tags: ['production'] };
  const colds: CompilationResult[] = [];
  const reference = await runChain(
    f,
    f.create({ incrementalReuse: false }),
    async () => {
      colds.push(await cold(f));
    },
    tagSteps,
  );
  f.reset();
  const incremental = await runChain(f, f.create(), undefined, tagSteps);
  for (const [index, result] of incremental.entries()) {
    const label = index ? tagSteps[index - 1].name : 'initial';
    expect({ label, result: JSON.stringify(result) }).toEqual({
      label,
      result: JSON.stringify(reference[index]),
    });
    expect({ label, ...published(result) }).toEqual({ label, ...published(colds[index]) });
  }
  // The flips really changed what the build contains.
  const titles = incremental.map(routeTitles);
  expect(titles[0]).toEqual(expect.arrayContaining(['Develop', 'Beta child', 'BetaThing']));
  expect(titles[1]).not.toContain('Develop');
  expect(titles[2]).toContain('Develop');
  expect(titles[3]).not.toEqual(expect.arrayContaining(['Beta child']));
  expect(titles[3].some((title) => title === 'Beta child' || title === 'BetaThing')).toBe(false);
  expect(titles[4]).toEqual(titles[3]);
  expect(titles[5]).toEqual(expect.arrayContaining(['Beta child', 'BetaThing']));
  expect(titles[6]).toEqual(titles[0]);
  // A flip changes the entry set, not the configuration: only a build tag that some
  // `onlyForTags` names enters the configuration digest.
  const digests = incremental.map((result) => success(result).configuration!.digest);
  expect(new Set([digests[0], digests[1], digests[3]]).size).toBe(1);
  expect(digests[6]).not.toBe(digests[0]);
}, 600_000);

test('a cache warmed under other tags that select the same entries is reused byte-identically', async () => {
  const f = fixture(true, tagFiles);
  f.write('docs/develop/ng-doc.page.ts', developPage(`, onlyForTags: ['development']`));
  const withTags = (tags: string[]) => f.create({ discovery: { tags } });
  // Warm the cache under `production`.
  const warm = success(await compile(withTags(['production']), 1));
  const write = JsonArtifactCache.prototype.write;
  const written: string[] = [];
  vi.spyOn(JsonArtifactCache.prototype, 'write').mockImplementation(function (
    this: JsonArtifactCache,
    ...args: Parameters<typeof write>
  ) {
    written.push(args[0].id);
    return write.apply(this, args);
  });
  const writeStamped = JsonArtifactCache.prototype.writeStamped;
  vi.spyOn(JsonArtifactCache.prototype, 'writeStamped').mockImplementation(function (
    this: JsonArtifactCache,
    ...args: Parameters<typeof writeStamped>
  ) {
    written.push(args[0].id);
    return writeStamped.apply(this, args);
  });
  // `staging` selects the same entries: same digest, every cache entry reused, nothing rewritten.
  const staging = await compile(withTags(['staging']), 1);
  expect(success(staging).configuration!.digest).toBe(warm.configuration!.digest);
  expect(written).toEqual([]);
  expect(staging.whyRebuilt.map((reason) => reason.reason)).not.toContain('cache-miss');
  written.splice(0);
  vi.restoreAllMocks();
  const referenceStaging = await compile(
    f.create({ discovery: { tags: ['staging'] }, incrementalReuse: false }),
    1,
  );
  expect(JSON.stringify(staging)).toBe(JSON.stringify(referenceStaging));
  f.options.discovery = { tags: ['staging'] };
  expect(published(staging)).toEqual(published(await cold(f)));
  // `development` selects the Develop page: another digest, so the warm cache is not reused.
  const development = success(await compile(withTags(['development']), 1));
  expect(development.configuration!.digest).not.toBe(warm.configuration!.digest);
  expect(routeTitles(await compile(withTags(['development']), 1))).toContain('Develop');
}, 600_000);

test('a link to the keyword of a left-out page names the page and its onlyForTags', async () => {
  const f = fixture(true, tagFiles);
  f.write('docs/develop/ng-doc.page.ts', developPage(`, onlyForTags: ['development']`));
  f.write('docs/guide/index.md', '---\nkeyword: Guide\n---\n# Guide\n\nSee `*DevelopPage`.\n');
  const service = f.create({ discovery: { tags: ['production'] } });
  const result = await service.compile(
    { generation: 1, mode: 'production', changes: [] },
    new AbortController().signal,
  );
  const errors = result.diagnostics.filter((item) => item.severity === 'error');
  expect(errors).toEqual([
    expect.objectContaining({
      code: 'CONTENT_KEYWORD_FILTERED',
      message: expect.stringContaining(
        `Keyword *DevelopPage belongs to "Develop" (${hostPath(path.join(f.root, 'docs/develop/ng-doc.page.ts'))}), which onlyForTags [development] leaves out of this build (build tags: [production]).`,
      ),
    }),
  ]);
  // The same link to a category-filtered page names the category.
  f.write('docs/develop/ng-doc.page.ts', developPage(''));
  f.write('docs/beta/ng-doc.category.ts', betaCategory(`, onlyForTags: ['development']`));
  f.write('docs/beta/child/index.md', '---\nkeyword: BetaChild\n---\n# Beta child\n');
  f.write('docs/guide/index.md', '---\nkeyword: Guide\n---\n# Guide\n\nSee `*BetaChild`.\n');
  const category = await f
    .create({ discovery: { tags: ['production'] } })
    .compile({ generation: 1, mode: 'production', changes: [] }, new AbortController().signal);
  expect(category.diagnostics.filter((item) => item.severity === 'error')).toEqual([
    expect.objectContaining({
      code: 'CONTENT_KEYWORD_FILTERED',
      message: expect.stringContaining(
        `of its category "Beta" (${hostPath(path.join(f.root, 'docs/beta/ng-doc.category.ts'))})`,
      ),
    }),
  ]);
  // A missing keyword that no left-out entry declares keeps the plain diagnostic.
  f.write('docs/guide/index.md', '---\nkeyword: Guide\n---\n# Guide\n\nSee `*Nowhere`.\n');
  const plain = await f
    .create({ discovery: { tags: ['production'] } })
    .compile({ generation: 1, mode: 'production', changes: [] }, new AbortController().signal);
  expect(
    plain.diagnostics.filter((item) => item.severity === 'error').map((item) => item.code),
  ).toEqual(['CONTENT_LINK']);
}, 240_000);

test('a cache written by the previous schema version is rebuilt with one warning', async () => {
  const f = fixture(true);
  const first = success(await compile(f.create(), 1));
  const cacheRoot = f.options.defaults.cacheRoot;
  // Rewrite every cache file as the previous schema version wrote it.
  const downgrade = (file: string) => {
    const text = readFileSync(file, 'utf8');
    writeFileSync(
      file,
      text
        .replaceAll('"schemaVersion":4', '"schemaVersion":3')
        .replaceAll('"generatorSchemaVersion":4', '"generatorSchemaVersion":3'),
    );
  };
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.json')) downgrade(file);
    }
  };
  walk(cacheRoot);
  // A version-3 entry is a miss, never a hit.
  const entry = first.artifacts[0]!;
  const old = await new JsonArtifactCache({ root: cacheRoot }).read({
    identity: entry.identity,
    fingerprint: { ...entry.fingerprint, schemaVersion: 3 as never },
  });
  expect(old).toMatchObject({ status: 'miss', reason: 'invalid' });
  const written: string[] = [];
  const write = JsonArtifactCache.prototype.writeStamped;
  vi.spyOn(JsonArtifactCache.prototype, 'writeStamped').mockImplementation(function (
    this: JsonArtifactCache,
    ...args: Parameters<typeof write>
  ) {
    written.push(args[0].id);
    return write.apply(this, args);
  });
  const rebuilt = await compile(f.create(), 2);
  const candidate = success(rebuilt);
  expect(rebuilt.diagnostics.filter((item) => item.severity !== 'info')).toEqual([
    expect.objectContaining({ code: 'COMPILATION_CACHE_FORMAT', severity: 'warning' }),
  ]);
  expect(candidate.artifacts.map((artifact) => artifact.revision)).toEqual(
    first.artifacts.map((artifact) => artifact.revision),
  );
  expect(written.sort()).toEqual(first.artifacts.map((artifact) => artifact.id).sort());
  // The rewritten cache is read back: no warning, every entry restored.
  const restored = await compile(f.create(), 3);
  expect(restored.diagnostics.filter((item) => item.severity !== 'info')).toEqual([]);
  expect(success(restored).artifacts).toEqual(candidate.artifacts);
  expect(restored.whyRebuilt.filter((reason) => reason.reason === 'cache-miss')).toEqual([]);
  expect(rebuilt.whyRebuilt.some((reason) => reason.reason === 'cache-miss')).toBe(true);
}, 240_000);
