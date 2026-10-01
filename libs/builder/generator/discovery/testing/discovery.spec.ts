/** @vitest-environment node */

import { once } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import { Dependency, DiscoveryRequest, TemplateActions } from '../../contracts';
import { createDiscoveryServices, DiscoveryServiceImpl } from '..';

interface Fixture {
  root: string;
  docs: string;
  config: string;
  request: DiscoveryRequest;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 *
 * @param file
 * @param content
 */
function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 *
 */
function fixture(): Fixture {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ng-doc-discovery-')));
  roots.push(root);
  const docs = path.join(root, '.docs');
  const config = path.join(root, 'ng-doc.config.ts');
  write(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022' } }),
  );
  write(path.join(root, 'config-value.ts'), `export const routePrefix = 'manual';`);
  write(
    config,
    `
    import { routePrefix } from './config-value';
    const config = {
      docsPath: '.docs', routePrefix, outDir: '.generated', cache: false,
      guide: { anchorHeadings: ['h1', 'h3'], headerTemplate: '.docs/header.nunj' },
      shiki: { themes: { light: 'light-one', dark: 'dark-one' } },
      repoConfig: { url: 'https://example.test/repo', mainBranch: 'main', releaseBranch: 'v1' },
      keywords: {
        keywords: { local: { title: 'Local', url: '/local' } },
        loaders: [async function remoteDocs() { return { remote: { url: '/remote' } }; }],
      },
    };
    export default config;
  `,
  );
  write(path.join(docs, 'header.nunj'), 'Header');
  write(path.join(docs, 'shared.ts'), `export const suffix = '!';`);
  write(
    path.join(docs, 'parent', 'ng-doc.category.ts'),
    `
    const Parent = { title: 'Parent', route: 'parent-route', expandable: true, providers: [() => 'live'] };
    export default Parent;
  `,
  );
  write(
    path.join(docs, 'parent', 'child', 'ng-doc.category.ts'),
    `
    import Parent from '../ng-doc.category';
    const Child = { title: 'Child', category: Parent, expanded: true };
    export default Child;
  `,
  );
  write(
    path.join(docs, 'parent', 'child', 'guide', 'ng-doc.page.ts'),
    `
    import Child from '../ng-doc.category';
    import { suffix } from '../../../shared';
    const Page = {
      title: 'Guide', category: Child, mdFile: ['./first.md.nunj', './second.md'], order: 2,
      route: { path: 'custom', children: [{ path: 'ignored' }] },
      data: {
        greet(name: string) { return 'Hello ' + name + suffix; }, imports: 'kept',
        spin() { while (true) {} },
        later() { setTimeout(() => { process.env.NG_DOC_OWNED_TIMER_TEST = 'leaked'; }, 40); return 'scheduled'; },
      },
      imports: [class Heavy {}], providers: [() => true], demos: { Heavy: class {} },
      playgrounds: { Demo: { target: class {}, controls: { label: { type: 'string', alias: 'name' } } } },
    };
    export default Page;
  `,
  );
  write(path.join(docs, 'parent', 'child', 'guide', 'first.md.nunj'), 'One');
  write(path.join(docs, 'parent', 'child', 'guide', 'second.md'), 'Two');
  write(
    path.join(docs, 'ng-doc.api.ts'),
    `
    const Api = { title: 'Reference', scopes: [
      { name: 'Second', route: 'second', include: ['b.ts', 'a.ts'], exclude: 'x.ts', order: 2 },
      { name: 'First', route: 'first', include: 'c.ts' },
    ] };
    export default Api;
  `,
  );
  return {
    root,
    docs,
    config,
    request: {
      generation: 1,
      projectId: 'fixture',
      workspaceRoot: root,
      configFile: config,
      defaults: {
        docsRoot: path.join(root, 'unused-docs'),
        tsConfig: path.join(root, 'tsconfig.json'),
        outputRoot: path.join(root, 'fallback-output'),
        cacheRoot: path.join(root, '.cache'),
      },
      changes: [],
    },
  };
}

/**
 *
 * @param dependencies
 * @param kind
 * @param suffix
 */
function findDependency(
  dependencies: Dependency[],
  kind: Dependency['kind'],
  suffix: string,
): Dependency | undefined {
  return dependencies.find(
    (item) => item.kind === kind && ('path' in item ? item.path.endsWith(suffix) : false),
  );
}

test('discovers real config, nested categories, ordered guide tabs and API scopes', async () => {
  const f = fixture();
  const service = new DiscoveryServiceImpl({ inlineStyleLanguage: 'SCSS' });
  const result = await service.discover(f.request, new AbortController().signal);

  expect(result.diagnostics).toEqual([]);
  expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  expect(result.value?.configuration).toMatchObject({
    projectId: 'fixture',
    workspaceRoot: f.root,
    docsRoots: [f.docs],
    outputRoot: path.join(f.root, '.generated', 'ng-doc', 'fixture'),
    routePrefix: 'manual',
    inlineStyleLanguage: 'SCSS',
    anchorHeadings: ['h1', 'h3'],
    themes: { light: 'light-one', dark: 'dark-one' },
    cacheEnabled: false,
    repo: { url: 'https://example.test/repo', platform: 'github' },
  });
  expect(result.value?.globalKeywords).toEqual([{ key: 'local', title: 'Local', path: '/local' }]);
  expect(result.value?.remoteKeywords).toMatchObject([
    {
      loaderId: 'config-loader:0:remoteDocs',
      keywords: [{ key: 'remote', title: 'remote', path: '/remote' }],
    },
  ]);

  const guide = result.value?.entries.find((entry) => entry.kind === 'guide');
  const categories = result.value?.entries.filter((entry) => entry.kind === 'category');
  const api = result.value?.entries.find((entry) => entry.kind === 'api');
  expect(api?.assetRoute).toBe('');
  expect(categories).toHaveLength(2);
  expect(guide).toMatchObject({
    title: 'Guide',
    route: 'custom',
    absoluteRoute: 'manual/parent-route/child/custom',
    breadcrumbs: ['Parent', 'Child', 'Guide'],
    order: 2,
    hasImports: true,
    runtimeImport: {
      source: path.join(f.docs, 'parent/child/guide/ng-doc.page.ts'),
      exportName: 'default',
    },
    markdown: [
      path.join(f.docs, 'parent/child/guide/first.md.nunj'),
      path.join(f.docs, 'parent/child/guide/second.md'),
    ],
  });
  expect(api && api.kind === 'api' ? api.scopes : []).toEqual([
    expect.objectContaining({
      name: 'Second',
      route: 'second',
      include: ['b.ts', 'a.ts'],
      exclude: ['x.ts'],
      order: 2,
    }),
    expect.objectContaining({ name: 'First', route: 'first', include: ['c.ts'], exclude: [] }),
  ]);
  expect(findDependency(result.dependencies, 'content', '/config-value.ts')).toBeDefined();
  expect(findDependency(result.dependencies, 'content', '/.docs/shared.ts')).toBeDefined();
  expect(result.dependencies).toContainEqual(
    expect.objectContaining({ kind: 'glob', root: f.docs }),
  );
  expect(guide?.dependencies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'content',
        path: path.join(f.docs, 'parent/child/guide/first.md.nunj'),
      }),
      expect.objectContaining({ kind: 'content', path: guide!.source.path }),
    ]),
  );
});

test('a template include is compiled from exactly the bytes whose digest is recorded', async () => {
  const f = fixture();
  const service = new DiscoveryServiceImpl();
  const discovery = await service.discover(f.request, new AbortController().signal);
  const guide = discovery.value!.entries.find((entry) => entry.kind === 'guide')!;
  const partial = path.join(f.docs, 'parent/child/guide/partial.nunj');
  write(partial, 'A');
  // The file changes between two uses of it in one render (an A→B write during the render).
  const actions: TemplateActions = {
    invoke: () => {
      write(partial, 'B');
      return '|';
    },
  };
  const rendered = service.render(
    {
      entryId: guide.id,
      source: guide.source,
      scope: path.dirname(guide.source.path),
      kind: 'guide',
      text: `{% include './partial.nunj' %}{{ NgDocActions.demo('x') }}{% include './partial.nunj' %}`,
      values: {},
    },
    actions,
  );
  expect(rendered.diagnostics).toEqual([]);
  // One read per render: both uses compile the bytes that were hashed.
  expect(rendered.value).toBe('A|A');
  const { createHash } = await import('node:crypto');
  expect(findDependency(rendered.dependencies, 'content', '/partial.nunj')).toEqual({
    kind: 'content',
    path: partial,
    digest: createHash('sha256').update('A').digest('hex'),
  });
  // Bundle inputs are loaded through the same recorded read: the digest is that of the source.
  expect(findDependency(discovery.dependencies, 'content', '/.docs/shared.ts')).toEqual({
    kind: 'content',
    path: path.join(f.docs, 'shared.ts'),
    digest: createHash('sha256').update(`export const suffix = '!';`).digest('hex'),
  });
  await service.dispose();
});

test('renders live functions, actions, and tracked includes, then ends the scope on dispose', async () => {
  const f = fixture();
  const service = new DiscoveryServiceImpl();
  const discovery = await service.discover(f.request, new AbortController().signal);
  const guide = discovery.value?.entries.find((entry) => entry.kind === 'guide');
  expect(guide).toBeDefined();
  write(path.join(f.docs, 'parent/child/guide/partial.nunj'), 'include={{ value }}');
  const actions: TemplateActions = {
    invoke: (namespace, name, args) => `${namespace}.${name}:${args.join(',')}`,
  };
  const rendered = service.render(
    {
      entryId: guide!.id,
      source: guide!.source,
      scope: path.dirname(guide!.source.path),
      kind: 'guide',
      text: `{{ NgDocPage.data.greet('World') }} {{ NgDocPage.data.imports }} {{ NgDocActions.demo('Button', 2) }} {% include './partial.nunj' %}`,
      values: { value: 'tracked' },
    },
    actions,
  );
  expect(rendered.value).toBe('Hello World! kept NgDocActions.demo:Button,2 include=tracked');
  expect(findDependency(rendered.dependencies, 'content', '/partial.nunj')).toBeDefined();

  await service.dispose();
  const disposed = service.render(
    {
      entryId: guide!.id,
      source: guide!.source,
      scope: f.docs,
      kind: 'guide',
      text: 'x',
      values: {},
    },
    actions,
  );
  expect(disposed.value).toBeUndefined();
  expect(disposed.diagnostics).toEqual([
    {
      code: 'TEMPLATE_ENTRY_SCOPE_MISSING',
      severity: 'error',
      stage: 'evaluation',
      message: expect.any(String),
      source: guide!.source,
      ownerId: guide!.id,
    },
  ]);
  const recovered = await service.discover(
    { ...f.request, generation: 2 },
    new AbortController().signal,
  );
  expect(recovered.value).toBeDefined();
});

test('a partial that fails to compile is a synchronous diagnostic naming it; nothing escapes; a fix recovers', async () => {
  // Nunjucks compiles included/imported/extended templates lazily and reports their
  // compile errors through `asap`, after a synchronous render has already returned `null`.
  const escaped: unknown[] = [];
  const onEscape = (error: unknown) => escaped.push(error);
  process.on('uncaughtException', onEscape);
  process.on('unhandledRejection', onEscape);
  const f = fixture();
  const service = new DiscoveryServiceImpl();
  try {
    const discovery = await service.discover(f.request, new AbortController().signal);
    const guide = discovery.value!.entries.find((entry) => entry.kind === 'guide')!;
    const directory = path.dirname(guide.source.path);
    const partial = path.join(directory, 'partial.nunj');
    const deep = path.join(directory, 'nested', 'deep.nunj');
    const render = (text: string, kind: 'guide' | 'header' = 'guide') =>
      service.render(
        { entryId: guide.id, source: guide.source, scope: directory, kind, text, values: {} },
        { invoke: () => null },
      );
    const settle = () => new Promise((done) => setTimeout(done, 20));

    write(partial, 'first line\n{% if %}');
    const broken = render('Body {% include "./partial.nunj" %} tail');
    await settle();
    expect(escaped).toEqual([]);
    expect(broken.value).toBeUndefined();
    expect(broken.diagnostics).toEqual([
      {
        code: 'DISCOVERY_EVALUATION_FAILED',
        severity: 'error',
        stage: 'evaluation',
        message: expect.stringContaining(`(${partial}) [Line 2, Column 7]`),
        source: guide.source,
        ownerId: guide.id,
      },
    ]);
    // The partial is a recorded dependency, so editing it invalidates the guide in watch mode.
    expect(findDependency(broken.dependencies, 'content', '/partial.nunj')).toBeDefined();

    // Nested include, import, from-import and extends of a broken template; a header too.
    write(partial, 'p{% include "./nested/deep.nunj" %}');
    write(deep, 'one\ntwo\nthree {% for %}');
    const failures = [
      render('{% include "./partial.nunj" %}'),
      render('{% import "./nested/deep.nunj" as d %}x'),
      render('{% from "./nested/deep.nunj" import m %}x'),
      render('{% extends "./nested/deep.nunj" %}'),
      render('{% include "./partial.nunj" %}', 'header'),
    ];
    await settle();
    expect(escaped).toEqual([]);
    for (const failure of failures) {
      expect(failure.value).toBeUndefined();
      expect(failure.diagnostics).toHaveLength(1);
      expect(failure.diagnostics[0].message).toContain(`(${deep}) [Line 3, Column 14]`);
      expect(findDependency(failure.dependencies, 'content', '/nested/deep.nunj')).toBeDefined();
    }
    expect(failures[0].diagnostics[0].message).toContain(`(${partial})`);

    // Not reached: still renders. Fixed: renders, including the environment's extension.
    const unreached = render('{% if false %}{% include "./nested/deep.nunj" %}{% endif %}ok');
    expect(unreached.value).toBe('ok');
    write(deep, '{% index true %}fixed {{ 1 + 1 }}{% endindex %}');
    const fixed = render('Body {% include "./partial.nunj" %} tail');
    expect(fixed.diagnostics).toEqual([]);
    expect(fixed.value).toBe('Body p<div indexable="true">fixed 2</div> tail');
    await settle();
    expect(escaped).toEqual([]);
  } finally {
    process.off('uncaughtException', onEscape);
    process.off('unhandledRejection', onEscape);
    await service.dispose();
  }
});

test('re-evaluates imported config and description dependencies without a module cache leak', async () => {
  const f = fixture();
  const service = new DiscoveryServiceImpl();
  const first = await service.discover(f.request, new AbortController().signal);
  const firstGuide = first.value?.entries.find((entry) => entry.kind === 'guide');
  expect(firstGuide?.absoluteRoute).toContain('manual/');

  write(path.join(f.root, 'config-value.ts'), `export const routePrefix = 'changed';`);
  write(path.join(f.docs, 'shared.ts'), `export const suffix = '?';`);
  const second = await service.discover(
    {
      ...f.request,
      generation: 2,
      changes: [
        { kind: 'update', path: path.join(f.root, 'config-value.ts') },
        { kind: 'update', path: path.join(f.docs, 'shared.ts') },
      ],
    },
    new AbortController().signal,
  );
  const secondGuide = second.value?.entries.find((entry) => entry.kind === 'guide');
  expect(secondGuide?.absoluteRoute).toContain('changed/');
  expect(second.value?.configuration.digest).not.toBe(first.value?.configuration.digest);
  const rendered = service.render(
    {
      entryId: secondGuide!.id,
      source: secondGuide!.source,
      scope: f.docs,
      kind: 'guide',
      text: `{{ NgDocPage.data.greet('Again') }}`,
      values: {},
    },
    { invoke: () => null },
  );
  expect(rendered.value).toBe('Hello Again?');
});

test('glob membership tracks create and delete in dot directories', async () => {
  const f = fixture();
  const service = new DiscoveryServiceImpl();
  const initial = await service.discover(f.request, new AbortController().signal);
  const created = path.join(f.docs, '.new', 'ng-doc.page.ts');
  write(created, `const Added = { title: 'Added', mdFile: './index.md' }; export default Added;`);
  write(path.join(f.docs, '.new', 'index.md'), 'Added');
  const added = await service.discover(
    { ...f.request, generation: 2, changes: [{ kind: 'create', path: created }] },
    new AbortController().signal,
  );
  expect(added.value?.entries.some((entry) => entry.title === 'Added')).toBe(true);
  const membership = added.dependencies.find(
    (item) => item.kind === 'glob' && item.root === f.docs,
  );
  expect(membership && membership.kind === 'glob' ? membership.members : []).toContain(created);

  rmSync(path.dirname(created), { recursive: true });
  const removed = await service.discover(
    { ...f.request, generation: 3, changes: [{ kind: 'delete', path: created }] },
    new AbortController().signal,
  );
  expect(removed.value?.entries.some((entry) => entry.title === 'Added')).toBe(false);
  expect(removed.value?.entries).toHaveLength(initial.value!.entries.length);
});

test.each(['relative', 'absolute'] as const)(
  'records a missing %s import edge and recovers after creation',
  async (kind) => {
    const f = fixture();
    const missingPage = path.join(f.docs, 'missing', 'ng-doc.page.ts');
    const specifier =
      kind === 'absolute' ? path.join(f.docs, 'missing/missing-title.ts') : './missing-title';
    write(
      missingPage,
      `import { title } from ${JSON.stringify(specifier)}; const Page = { title, mdFile: './index.md' }; export default Page;`,
    );
    write(path.join(f.docs, 'missing', 'index.md'), 'Missing');
    const service = new DiscoveryServiceImpl();
    const failed = await service.discover(f.request, new AbortController().signal);
    expect(failed.value).toBeUndefined();
    expect(failed.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DISCOVERY_MODULE_BUILD_FAILED' })]),
    );
    expect(failed.dependencies).toContainEqual({
      kind: 'existence',
      path: path.join(f.docs, 'missing/missing-title.ts'),
      exists: false,
    });

    write(path.join(f.docs, 'missing', 'missing-title.ts'), `export const title = 'Recovered';`);
    const recovered = await service.discover(
      { ...f.request, generation: 2 },
      new AbortController().signal,
    );
    expect(recovered.value?.entries.some((entry) => entry.title === 'Recovered')).toBe(true);
    service.dispose();
  },
);

test('reports unsupported descriptions with source coordinates', async () => {
  const f = fixture();
  write(
    path.join(f.docs, 'bad', 'ng-doc.page.ts'),
    `\nexport default { title: 'Bad', mdFile: './index.md' };`,
  );
  const result = await new DiscoveryServiceImpl().discover(f.request, new AbortController().signal);
  expect(result.value).toBeUndefined();
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: 'DISCOVERY_UNSUPPORTED_DEFAULT_EXPORT',
      source: expect.objectContaining({ line: 2, column: 1 }),
    }),
  );
});

test('reports and leaves out global keywords without a url', async () => {
  const f = fixture();
  write(
    f.config,
    `const config = { docsPath: '.docs', keywords: { keywords: { valid: { url: '/valid' }, titled: { title: 'No url' }, blank: { url: ' ' }, empty: null } } }; export default config;`,
  );
  const result = await new DiscoveryServiceImpl().discover(f.request, new AbortController().signal);
  expect(result.value?.globalKeywords).toEqual([{ key: 'valid', title: 'valid', path: '/valid' }]);
  expect(
    result.diagnostics
      .filter((item) => item.code === 'DISCOVERY_KEYWORD_INVALID')
      .map((item) => [item.severity, item.message, item.source?.path]),
  ).toEqual(
    ['blank', 'empty', 'titled'].map((key) => [
      'warning',
      `Keyword ${key} of keywords.keywords has no url; it is left out.`,
      f.config,
    ]),
  );
});

test('surfaces loader, cancellation, missing include, invalid action, and category errors', async () => {
  const f = fixture();
  write(
    f.config,
    `const config = { docsPath: '.docs', keywords: { loaders: [async () => { throw new Error('offline'); }] } }; export default config;`,
  );
  const service = new DiscoveryServiceImpl();
  const loaderFailure = await service.discover(f.request, new AbortController().signal);
  expect(loaderFailure.diagnostics).toContainEqual(
    expect.objectContaining({
      code: 'DISCOVERY_KEYWORD_LOADER_FAILED',
      message: expect.stringContaining('offline'),
    }),
  );

  const aborted = new AbortController();
  aborted.abort(new DOMException('stopped', 'AbortError'));
  const cancelled = await service.discover(f.request, aborted.signal);
  expect(cancelled.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'DISCOVERY_ABORTED' }),
  );

  write(f.config, `const config = { docsPath: '.docs' }; export default config;`);
  const ready = await service.discover(
    { ...f.request, generation: 3 },
    new AbortController().signal,
  );
  const guide = ready.value?.entries.find((entry) => entry.kind === 'guide');
  const missing = service.render(
    {
      entryId: guide!.id,
      source: guide!.source,
      scope: path.dirname(guide!.source.path),
      kind: 'header',
      text: `{% include './absent.nunj' %}`,
      values: {},
    },
    { invoke: () => null },
  );
  expect(missing.value).toBeUndefined();
  expect(findDependency(missing.dependencies, 'existence', '/absent.nunj')).toEqual(
    expect.objectContaining({ exists: false }),
  );
  const invalid = service.render(
    {
      entryId: guide!.id,
      source: guide!.source,
      scope: f.docs,
      kind: 'guide',
      text: `{{ NgDocApi.bad(NgDocPage.data.greet) }}`,
      values: {},
    },
    { invoke: () => null },
  );
  expect(invalid.diagnostics[0]?.message).toContain('not JSON-safe');

  write(
    path.join(f.docs, 'orphan', 'ng-doc.page.ts'),
    `const Ghost = { title: 'Ghost' }; const Page = { title: 'Orphan', mdFile: './x.md', category: Ghost }; export default Page;`,
  );
  const orphan = await service.discover(
    { ...f.request, generation: 4 },
    new AbortController().signal,
  );
  expect(orphan.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'DISCOVERY_CATEGORY_SOURCE_MISSING' }),
  );
});

test('supports defaults without a config and the explicit service composition port', async () => {
  const f = fixture();
  const plainDocs = path.join(f.root, 'plain-docs');
  write(
    path.join(plainDocs, 'topic', 'ng-doc.page.ts'),
    `const Page = { title: 'Plain', mdFile: './readme.md', hidden: true }; export default Page;`,
  );
  write(path.join(plainDocs, 'topic', 'readme.md'), 'Plain');
  const request: DiscoveryRequest = {
    ...f.request,
    configFile: undefined,
    defaults: { ...f.request.defaults, docsRoot: plainDocs },
  };
  rmSync(f.config);
  const services = createDiscoveryServices({
    defaultAnchorHeadings: ['h2'],
    defaultThemes: { light: 'default-light', dark: 'default-dark' },
  });
  expect(services.discovery).toBe(services.templates);
  expect(services.runtime).toBe(services.discovery);
  expect(services.values).toBe(services.discovery);
  const result = await services.discovery.discover(request, new AbortController().signal);
  expect(result.value?.configuration).toMatchObject({
    docsRoots: [plainDocs],
    routePrefix: '',
    outputRoot: f.request.defaults.outputRoot,
    anchorHeadings: ['h2'],
    themes: { light: 'default-light', dark: 'default-dark' },
    cacheEnabled: true,
  });
  expect(result.value?.entries).toEqual([
    expect.objectContaining({
      title: 'Plain',
      route: 'topic',
      absoluteRoute: 'topic',
      hidden: true,
    }),
  ]);
});

test('fails an explicit missing config and detects a category cycle', async () => {
  const f = fixture();
  const missingConfig = path.join(f.root, 'absent.config.ts');
  const missing = await new DiscoveryServiceImpl().discover(
    { ...f.request, configFile: missingConfig },
    new AbortController().signal,
  );
  expect(missing.value).toBeUndefined();
  expect(missing.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'DISCOVERY_CONFIG_MISSING' }),
  );
  expect(findDependency(missing.dependencies, 'existence', '/absent.config.ts')).toEqual(
    expect.objectContaining({ exists: false }),
  );

  write(
    path.join(f.docs, 'cycle', 'ng-doc.category.ts'),
    `
    const Cycle: any = { title: 'Cycle' };
    Cycle.category = Cycle;
    export default Cycle;
  `,
  );
  const cycle = await new DiscoveryServiceImpl().discover(f.request, new AbortController().signal);
  expect(cycle.value).toBeUndefined();
  expect(cycle.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'DISCOVERY_CATEGORY_CYCLE' }),
  );
});

test('evaluates every current application description without executing Angular providers', async () => {
  const temporary = fixture();
  const workspaceRoot = process.cwd();
  const docsRoot = path.join(workspaceRoot, 'apps/ng-doc/docs');
  write(
    temporary.config,
    `const Config = { docsPath: ${JSON.stringify(docsRoot)} }; export default Config;`,
  );
  const result = await new DiscoveryServiceImpl().discover(
    {
      generation: 1,
      projectId: 'ng-doc-real-smoke',
      workspaceRoot,
      configFile: temporary.config,
      defaults: {
        docsRoot,
        tsConfig: path.join(workspaceRoot, 'apps/ng-doc/tsconfig.app.json'),
        outputRoot: temporary.root,
        cacheRoot: path.join(temporary.root, '.cache'),
      },
      changes: [],
    },
    new AbortController().signal,
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.value?.entries.length).toBeGreaterThan(30);
  expect(
    result.value?.entries.some(
      (entry) => entry.title === 'Demos' && entry.kind === 'guide' && entry.route === 'demos',
    ),
  ).toBe(true);
});

test('provides JSON-only playground controls and the legacy index extension', async () => {
  const f = fixture();
  const service = new DiscoveryServiceImpl();
  const discovery = await service.discover(f.request, new AbortController().signal);
  const guide = discovery.value?.entries.find((entry) => entry.kind === 'guide');
  expect(service.readGuideValues(guide!.id)).toEqual({
    value: { playgrounds: { Demo: { controls: { label: { type: 'string', alias: 'name' } } } } },
    dependencies: guide!.dependencies,
    diagnostics: [],
  });
  const rendered = service.render(
    {
      entryId: guide!.id,
      source: guide!.source,
      scope: f.docs,
      kind: 'guide',
      text: `{% index false %}inside{% endindex %}`,
      values: {},
    },
    { invoke: () => null },
  );
  expect(rendered.value).toBe('<div indexable="false">inside</div>');
  await service.dispose();
  expect(service.readGuideValues(guide!.id).diagnostics).toEqual([
    expect.objectContaining({ code: 'DISCOVERY_GUIDE_VALUES_MISSING' }),
  ]);
});

test('bounds synchronous modules/templates, aborts pending loaders on dispose, and owns timers', async () => {
  const f = fixture();
  write(
    path.join(f.docs, 'blocked', 'ng-doc.page.ts'),
    `const Page = { title: 'Blocked', mdFile: './x.md' }; while (true) {} export default Page;`,
  );
  const moduleService = new DiscoveryServiceImpl({ moduleTimeoutMs: 20 });
  const blocked = await moduleService.discover(f.request, new AbortController().signal);
  expect(blocked.value).toBeUndefined();
  expect(blocked.diagnostics[0]?.message).toContain('Script execution timed out');
  rmSync(path.join(f.docs, 'blocked'), { recursive: true });

  const service = new DiscoveryServiceImpl({ templateTimeoutMs: 20, templateWallTimeoutMs: 200 });
  const ready = await service.discover(f.request, new AbortController().signal);
  const guide = ready.value?.entries.find((entry) => entry.kind === 'guide');
  const template = service.render(
    {
      entryId: guide!.id,
      source: guide!.source,
      scope: f.docs,
      kind: 'guide',
      text: `{{ NgDocPage.data.spin() }}`,
      values: {},
    },
    { invoke: () => null },
  );
  expect(template.value).toBeUndefined();
  expect(template.diagnostics[0]?.message).toBe(
    'Template evaluation was stopped at its 200ms wall-clock cap; the template and page code ' +
      'had exceeded its 20ms time budget.',
  );

  delete process.env.NG_DOC_OWNED_TIMER_TEST;
  const scheduled = service.render(
    {
      entryId: guide!.id,
      source: guide!.source,
      scope: f.docs,
      kind: 'guide',
      text: `{{ NgDocPage.data.later() }}`,
      values: {},
    },
    { invoke: () => null },
  );
  expect(scheduled.value).toBe('scheduled');
  await service.dispose();
  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(process.env.NG_DOC_OWNED_TIMER_TEST).toBeUndefined();

  write(
    f.config,
    `const config = { docsPath: '.docs', keywords: { loaders: [() => new Promise(() => {})] } }; export default config;`,
  );
  const deadlineService = new DiscoveryServiceImpl({ loaderTimeoutMs: 20 });
  const deadline = await deadlineService.discover(f.request, new AbortController().signal);
  expect(deadline.value).toBeUndefined();
  expect(deadline.diagnostics).toContainEqual(
    expect.objectContaining({
      code: 'DISCOVERY_KEYWORD_LOADER_FAILED',
      message: expect.stringContaining('exceeded 20ms'),
    }),
  );

  const pendingService = new DiscoveryServiceImpl({ loaderTimeoutMs: 5_000 });
  const pending = pendingService.discover(f.request, new AbortController().signal);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await pendingService.dispose();
  const disposed = await Promise.race([
    pending,
    new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), 200)),
  ]);
  expect(disposed).not.toBe('late');
  expect(disposed).toMatchObject({
    diagnostics: [
      expect.objectContaining({ message: expect.stringContaining('Discovery disposed') }),
    ],
  });
  expect(disposed === 'late' ? 'late' : disposed.value).toBeUndefined();

  const immediateService = new DiscoveryServiceImpl();
  const immediate = immediateService.discover(f.request, new AbortController().signal);
  await immediateService.dispose();
  const immediatelyDisposed = await immediate;
  expect(immediatelyDisposed.value).toBeUndefined();
  expect(immediatelyDisposed.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'DISCOVERY_ABORTED' }),
  );
  expect(immediateService.readGuideValues(guide!.id).value).toBeUndefined();
});

/**
 * Busy-waits, as a slow synchronous semantic query does.
 * @param ms How long, in milliseconds.
 */
function block(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Synchronous work: nothing else runs meanwhile.
  }
}

/**
 * Discovers the fixture plus a guide whose data holds stateful, looping and error-catching
 * functions.
 * @param options The discovery options.
 */
/**
 * The diagnostic of a render whose template and page code used up its user-time budget.
 * @param ms The budget.
 */
function budgetExceeded(ms: number): string {
  return (
    `Template evaluation exceeded its ${ms}ms time budget for the template and page code ` +
    '(time spent in the template actions NgDocActions, NgDocApi and JSDoc is not counted).'
  );
}

async function actionsGuide(options: ConstructorParameters<typeof DiscoveryServiceImpl>[0]) {
  const f = fixture();
  write(
    path.join(f.docs, 'actions', 'ng-doc.page.ts'),
    `
    let count = 0;
    type Api = { api(path: string): string };
    const Page = {
      title: 'Actions', mdFile: './index.md',
      data: {
        stamp() { count += 1; return 'S' + count; },
        spin() { while (true) {} },
        swallow(api: Api) { for (;;) { try { api.api('a.ts#A'); } catch {} } },
        repeat(api: Api) { for (;;) api.api('a.ts#A'); },
        embeds(api: Api, n: number) {
          let out = '';
          for (let i = 0; i < n; i++) out += api.api('a.ts#A' + i);
          return out.length;
        },
      },
    };
    export default Page;
  `,
  );
  write(path.join(f.docs, 'actions', 'index.md'), '# Actions');
  const service = new DiscoveryServiceImpl(options);
  const discovery = await service.discover(f.request, new AbortController().signal);
  const guide = discovery.value!.entries.find((entry) => entry.title === 'Actions')!;
  const render = (text: string, actions: TemplateActions) =>
    service.render(
      {
        entryId: guide.id,
        source: guide.source,
        scope: path.dirname(guide.source.path),
        kind: 'guide',
        text,
        values: {},
      },
      actions,
    );
  return { service, render };
}

/** Actions that answer `<first argument>` and count their calls. */
function counting(): TemplateActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    invoke: (namespace, name, args) => {
      calls.push(`${namespace}.${name}(${args.join(',')})`);
      return `<${args[0]}>`;
    },
  };
}

/**
 * Renders and measures the wall time.
 * @param run The render.
 */
function timed<T>(run: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = run();
  return { result, ms: performance.now() - start };
}

test('user template code is evaluated exactly once, and template actions run in call order', async () => {
  const { service, render } = await actionsGuide({});
  const actions: TemplateActions = {
    invoke: (_namespace, name, args) => {
      if (name === 'hasTag') return true;
      if (name === 'tags') return ['<p>one</p>', '<p>two</p>'];
      if (name === 'missing') return undefined as unknown as string;
      return `[${name}:${args[0]}]`;
    },
  };
  const rendered = render(
    [
      '{{ NgDocPage.data.stamp() }}',
      '{{ JSDoc.description("a.ts#A") }}',
      '{{ NgDocApi.details("a.ts#A") }}',
      '{% if JSDoc.hasTag("a.ts#A", "deprecated") %}deprecated{% endif %}',
      '{% for tag in JSDoc.tags("a.ts#A", "see") %}{{ tag }}{% endfor %}',
      // An action's `undefined` stays undefined.
      '{% if JSDoc.missing("a.ts#A") === undefined %}undefined{% endif %}',
      '{{ NgDocPage.data.stamp() }}',
    ].join('|'),
    actions,
  );
  expect(rendered.diagnostics).toEqual([]);
  // The page function ran once per call site, as in the legacy engine (S1, then S2).
  expect(rendered.value).toBe(
    'S1|[description:a.ts#A]|[details:a.ts#A]|deprecated|<p>one</p><p>two</p>|undefined|S2',
  );
  await service.dispose();
});

test('the budget counts user time only: slow template actions do not time the template out', async () => {
  const { service, render } = await actionsGuide({ templateTimeoutMs: 50 });
  const calls: string[] = [];
  // Each action takes longer than the whole budget, as `NgDocApi.api` of a real library does.
  const actions: TemplateActions = {
    invoke: (namespace, name, args) => {
      calls.push(`${namespace}.${name}(${args.join(',')})`);
      block(80);
      return `[${name}]`;
    },
  };
  const rendered = render(
    '{{ JSDoc.description("a.ts#A") }}{{ NgDocApi.details("a.ts#A") }}{{ NgDocApi.api("a.ts#A") }}',
    actions,
  );
  expect(rendered.diagnostics).toEqual([]);
  expect(rendered.value).toBe('[description][details][api]');
  expect(calls).toHaveLength(3);
  await service.dispose();
});

test('repeated template action calls are memoized for the render; distinct ones are not', async () => {
  const { service, render } = await actionsGuide({});
  const actions = counting();
  const rendered = render(
    '{% for i in range(0, 3000) %}{{ NgDocApi.api("a.ts#A") }}{% endfor %}' +
      '{{ NgDocActions.demo("D", { b: 1, a: 2 }) }}{{ NgDocActions.demo("D", { a: 2, b: 1 }) }}',
    actions,
  );
  expect(rendered.diagnostics).toEqual([]);
  expect(rendered.value).toBe(`${'<a.ts#A>'.repeat(3000)}<D><D>`);
  // Argument key order is part of the key: an action may print its options as they are written.
  expect(actions.calls).toEqual([
    'NgDocApi.api(a.ts#A)',
    'NgDocActions.demo(D,[object Object])',
    'NgDocActions.demo(D,[object Object])',
  ]);
  // A second render runs its actions again: the memo is the render's.
  const again = counting();
  render('{{ NgDocApi.api("a.ts#A") }}', again);
  expect(again.calls).toEqual(['NgDocApi.api(a.ts#A)']);
  await service.dispose();
});

test('3000 distinct embeds render in one evaluation in a sane time', async () => {
  const { service, render } = await actionsGuide({});
  const actions = counting();
  const { result, ms } = timed(() =>
    render(
      '{% for i in range(0, 3000) %}{{ NgDocApi.api("a.ts#A" + i) }}{% endfor %}|' +
        '{{ NgDocPage.data.embeds(NgDocApi, 3000) }}',
      actions,
    ),
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.value).toMatch(/^<a\.ts#A0>.*<a\.ts#A2999>\|\d+$/s);
  // The loop's 3000 calls, then the page function's: the same arguments, memoized.
  expect(actions.calls).toHaveLength(3000);
  expect(ms).toBeLessThan(2_000);
  await service.dispose();
});

test('runaway user code stops within its bound, with and without template action calls', async () => {
  const { service, render } = await actionsGuide({
    templateTimeoutMs: 20,
    templateWallTimeoutMs: 300,
    templateActionLimit: 1_000_000,
  });
  const actions = counting();
  // No action call: only the wall-clock watchdog can stop it.
  const spin = timed(() => render('{{ NgDocPage.data.spin() }}', actions));
  expect(spin.result.value).toBeUndefined();
  // The watchdog stops it at the wall-clock cap; its own time had used up the budget long before.
  expect(spin.result.diagnostics).toEqual([
    expect.objectContaining({
      code: 'DISCOVERY_EVALUATION_FAILED',
      message:
        'Template evaluation was stopped at its 300ms wall-clock cap; the template and page ' +
        'code had exceeded its 20ms time budget.',
    }),
  ]);
  expect(spin.ms).toBeLessThan(2_000);

  // Calling actions in a loop: the budget is exceeded at an action call.
  const repeat = timed(() => render('{{ NgDocPage.data.repeat(NgDocApi) }}', actions));
  expect(repeat.result.diagnostics).toEqual([
    expect.objectContaining({ message: budgetExceeded(20) }),
  ]);
  expect(repeat.ms).toBeLessThan(250);

  // Swallowing that failure: every later call fails again, and the watchdog stops the loop.
  const swallow = timed(() => render('{{ NgDocPage.data.swallow(NgDocApi) }}', actions));
  expect(swallow.result.value).toBeUndefined();
  expect(swallow.result.diagnostics).toEqual([
    expect.objectContaining({ message: budgetExceeded(20) }),
  ]);
  expect(swallow.ms).toBeLessThan(2_000);
  // The memo ran the action once for all of those calls.
  expect(actions.calls).toEqual(['NgDocApi.api(a.ts#A)', 'NgDocApi.api(a.ts#A)']);
  await service.dispose();
});

test('a render stopped at the wall-clock cap within its user-time budget names only the cap', async () => {
  const { service, render } = await actionsGuide({
    templateTimeoutMs: 300,
    templateWallTimeoutMs: 600,
  });
  // The action uses most of the wall time, which the budget does not count; the user code then
  // spins until the watchdog stops it, with less than its budget used.
  const stopped = render('{{ NgDocApi.api("a.ts#A") }}{{ NgDocPage.data.spin() }}', {
    invoke: () => {
      block(450);
      return 'x';
    },
  });
  expect(stopped.value).toBeUndefined();
  expect(stopped.diagnostics).toEqual([
    expect.objectContaining({
      code: 'DISCOVERY_EVALUATION_FAILED',
      message:
        'Template evaluation was stopped at its 600ms wall-clock cap, template actions included.',
    }),
  ]);
  await service.dispose();
});

test('the action call limit and the wall-clock cap fail the render with a clear message', async () => {
  const { service, render } = await actionsGuide({
    templateActionLimit: 100,
    templateTimeoutMs: 100,
    templateWallTimeoutMs: 200,
  });
  // A loop that swallows the limit's failure still fails the render.
  const limited = render('{{ NgDocPage.data.swallow(NgDocApi) }}', counting());
  expect(limited.value).toBeUndefined();
  expect(limited.diagnostics).toEqual([
    expect.objectContaining({
      code: 'DISCOVERY_EVALUATION_FAILED',
      message:
        'The template made more than 100 template action calls (NgDocActions, NgDocApi, JSDoc) ' +
        'in one render; it probably loops over them without end.',
    }),
  ]);
  expect(render('{{ NgDocPage.data.embeds(NgDocApi, 100) }}', counting())).toMatchObject({
    value: expect.any(String),
    diagnostics: [],
  });

  // Actions whose own time reaches the wall-clock cap: the watchdog terminates the action.
  const slow = render('{{ NgDocApi.api("a.ts#A") }}{{ NgDocApi.api("b.ts#B") }}', {
    invoke: () => {
      block(150);
      return 'x';
    },
  });
  expect(slow.value).toBeUndefined();
  expect(slow.diagnostics).toEqual([
    expect.objectContaining({
      code: 'DISCOVERY_EVALUATION_FAILED',
      message:
        'Template evaluation exceeded its 200ms wall-clock cap inside the template action ' +
        'NgDocApi.api.',
    }),
  ]);
  await service.dispose();
});

test('a template action error fails the render at its call; arguments must be JSON', async () => {
  const { service, render } = await actionsGuide({});
  let invoked = 0;
  const failing = render('before {{ NgDocApi.api("a.ts#A") }} after', {
    invoke: () => {
      invoked++;
      throw new Error('semantic query failed');
    },
  });
  expect(invoked).toBe(1);
  expect(failing.value).toBeUndefined();
  expect(failing.diagnostics).toEqual([
    expect.objectContaining({
      code: 'DISCOVERY_EVALUATION_FAILED',
      message: expect.stringContaining('semantic query failed'),
    }),
  ]);
  const invalid = render('{{ NgDocApi.api(NgDocPage.data.spin) }}', counting());
  expect(invalid.diagnostics[0]?.message).toContain('Template action argument is not JSON-safe');
  await service.dispose();
});

test('reads config before scanning its selected docs root', async () => {
  const f = fixture();
  write(path.join(f.root, 'unused-docs', 'bad', 'ng-doc.page.ts'), `export default makePage();`);
  const result = await new DiscoveryServiceImpl().discover(f.request, new AbortController().signal);
  expect(result.diagnostics).toEqual([]);
  expect(result.value?.entries.some((entry) => entry.title === 'Guide')).toBe(true);
  expect(result.dependencies).not.toContainEqual(
    expect.objectContaining({ path: expect.stringContaining('unused-docs/bad') }),
  );
});

test('derives stable entry IDs from workspace-relative sources across checkouts', async () => {
  const first = fixture();
  const second = fixture();
  const firstResult = await new DiscoveryServiceImpl().discover(
    first.request,
    new AbortController().signal,
  );
  const secondResult = await new DiscoveryServiceImpl().discover(
    second.request,
    new AbortController().signal,
  );
  const ids = (result: typeof firstResult) => result.value?.entries.map((entry) => entry.id).sort();
  expect(ids(firstResult)).toEqual(ids(secondResult));
  expect(firstResult.value?.entries[0]?.source.path).not.toBe(
    secondResult.value?.entries[0]?.source.path,
  );
});

test('rejects a symlinked description source outside the workspace', async () => {
  const f = fixture();
  const external = realpathSync(mkdtempSync(path.join(tmpdir(), 'ng-doc-external-')));
  roots.push(external);
  write(
    path.join(external, 'ng-doc.page.ts'),
    `const Page = { title: 'External', mdFile: './index.md' }; export default Page;`,
  );
  write(path.join(external, 'index.md'), 'External');
  symlinkSync(external, path.join(f.root, 'linked-docs'), 'dir');
  write(f.config, `const config = { docsPath: 'linked-docs' }; export default config;`);
  const result = await new DiscoveryServiceImpl().discover(f.request, new AbortController().signal);
  expect(result.value).toBeUndefined();
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'DISCOVERY_SOURCE_OUTSIDE_WORKSPACE' }),
  );
});

test('returns lossless JSON with absent optional fields and diagnoses non-finite metadata', async () => {
  const f = fixture();
  write(f.config, `const config = { docsPath: '.docs' }; export default config;`);
  const service = new DiscoveryServiceImpl();
  const result = await service.discover(f.request, new AbortController().signal);
  expect(result.diagnostics).toEqual([]);
  expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  write(
    path.join(f.docs, 'bad', 'ng-doc.page.ts'),
    `const page = { title: 'Bad', mdFile: 'index.md', order: Infinity }; export default page;`,
  );
  const invalid = await service.discover(f.request, new AbortController().signal);
  expect(invalid.value).toBeUndefined();
  expect(invalid.diagnostics.some((item) => item.message.includes('non-JSON'))).toBe(true);
  await service.dispose();
});

test('accepts a double-dot-prefixed directory inside the workspace', async () => {
  const f = fixture();
  write(f.config, `const config = { docsPath: '..docs' }; export default config;`);
  write(
    path.join(f.root, '..docs', 'ng-doc.page.ts'),
    `const page = { title: 'Inside', mdFile: 'index.md' }; export default page;`,
  );
  const service = new DiscoveryServiceImpl();
  const result = await service.discover(f.request, new AbortController().signal);
  expect(result.diagnostics).toEqual([]);
  expect(result.value?.entries).toHaveLength(1);
  await service.dispose();
});

test('diagnoses sparse arrays instead of silently serializing holes as null', async () => {
  const f = fixture();
  write(
    f.config,
    `const config = { docsPath: '.docs', guide: { anchorHeadings: new Array(2) } }; export default config;`,
  );
  const service = new DiscoveryServiceImpl();
  const result = await service.discover(f.request, new AbortController().signal);
  expect(result.value).toBeUndefined();
  expect(result.diagnostics.some((item) => item.message.includes('non-JSON'))).toBe(true);
  await service.dispose();
});

test('rejects opaque objects in the live JSON controls port', async () => {
  const f = fixture();
  write(
    path.join(f.docs, 'parent', 'child', 'guide', 'ng-doc.page.ts'),
    `
    const Page = { title: 'Guide', mdFile: './first.md.nunj', playgrounds: {
      Demo: { target: class {}, controls: { value: new Date() } }
    } }; export default Page;
  `,
  );
  const service = new DiscoveryServiceImpl();
  const result = await service.discover(f.request, new AbortController().signal);
  const guide = result.value!.entries.find((entry) => entry.kind === 'guide')!;
  expect(service.readGuideValues(guide.id).diagnostics[0]?.code).toBe(
    'DISCOVERY_GUIDE_VALUES_INVALID',
  );
  await service.dispose();
});

test('omitted renderer settings take the default headings and syntax theme', async () => {
  const f = fixture();
  write(f.config, `export default { docsPath: '.docs' };`);
  const services = createDiscoveryServices();
  try {
    const result = await services.discovery.discover(f.request, new AbortController().signal);
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.configuration).toMatchObject({
      anchorHeadings: ['h1', 'h2', 'h3', 'h4'],
      themes: { light: 'css-variables', dark: 'css-variables' },
    });
  } finally {
    await services.runtime.dispose();
  }
});

test('preserves explicit API asset route separately from the omitted default', async () => {
  const f = fixture();
  const apiPath = path.join(f.root, '.docs', 'ng-doc.api.ts');
  write(apiPath, `const api = { title: 'API', route: 'api', scopes: [] }; export default api;`);
  const runtime = createDiscoveryServices();
  try {
    const result = await runtime.discovery.discover(f.request, new AbortController().signal);
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.entries.find((entry) => entry.kind === 'api')).toMatchObject({
      route: 'api',
      assetRoute: 'api',
    });
  } finally {
    await runtime.runtime.dispose();
  }
});

test('real remote loaders use VM-local global and native fetch without cross-generation leakage', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ Remote: { title: 'Remote', url: '/remote' } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const f = fixture();
  write(
    f.config,
    `
    if (global !== globalThis || global.Promise !== Promise) throw new Error('Wrong global');
    global.__ngDocScopeProbe = (global.__ngDocScopeProbe ?? 0) + 1;
    if (global.__ngDocScopeProbe !== 1) throw new Error('Leaked generation');
    export default { docsPath: '.docs', keywords: { loaders: [async () => {
      const response = await fetch('http://127.0.0.1:${address.port}'); return response.json();
    }] } };
  `,
  );
  const runtime = createDiscoveryServices();
  try {
    for (const generation of [1, 2]) {
      const result = await runtime.discovery.discover(
        { ...f.request, generation },
        new AbortController().signal,
      );
      expect(result.diagnostics).toEqual([]);
      expect(result.value?.remoteKeywords[0].keywords).toEqual([
        { key: 'Remote', title: 'Remote', path: '/remote' },
      ]);
    }
    expect((globalThis as Record<string, unknown>).__ngDocScopeProbe).toBeUndefined();
  } finally {
    await runtime.runtime.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('pinned keyword loader results are used instead of invoking loaders with the same loaderId', async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ Remote: { title: 'Remote', url: `/remote-${requests}` } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const f = fixture();
  write(
    f.config,
    `export default { docsPath: '.docs', keywords: { loaders: [
      async function remoteStub() { return (await fetch('http://127.0.0.1:${address.port}')).json(); },
      async function localStub() { return { Local: { title: 'Local', url: '/local' } }; },
    ] } };`,
  );
  const runtime = createDiscoveryServices();
  const discover = (
    generation: number,
    pinnedRemoteKeywords?: DiscoveryRequest['pinnedRemoteKeywords'],
  ) =>
    runtime.discovery.discover(
      { ...f.request, generation, ...(pinnedRemoteKeywords ? { pinnedRemoteKeywords } : {}) },
      new AbortController().signal,
    );
  try {
    const evaluated = await discover(1);
    expect(requests).toBe(1);
    const remote = evaluated.value!.remoteKeywords;
    expect(remote.map((item) => item.loaderId)).toEqual([
      'config-loader:0:remoteStub',
      'config-loader:1:localStub',
    ]);
    // Every loader pinned: none is invoked, and the snapshot equals the evaluated one.
    const pinned = await discover(2, remote);
    expect(requests).toBe(1);
    expect(pinned).toEqual(evaluated);
    // Only a matching loaderId is pinned: the remote loader is evaluated again.
    const partly = await discover(3, [
      { ...remote[0], loaderId: 'config-loader:0:otherName' },
      remote[1],
    ]);
    expect(requests).toBe(2);
    expect(partly.value!.remoteKeywords[0].keywords).toEqual([
      { key: 'Remote', title: 'Remote', path: '/remote-2' },
    ]);
    expect(partly.value!.remoteKeywords[1]).toEqual(remote[1]);
    expect(partly.value!.configuration).toEqual(evaluated.value!.configuration);
  } finally {
    await runtime.runtime.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('disposing discovery aborts an in-flight native fetch owned by a loader', async () => {
  let received!: () => void;
  const incoming = new Promise<void>((resolve) => {
    received = resolve;
  });
  const server = createServer(() => received());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const f = fixture();
  write(
    f.config,
    `export default { docsPath: '.docs', keywords: { loaders: [async () => {
    const request = new Request('http://127.0.0.1:${address.port}');
    return (await fetch(request)).json();
  }] } };`,
  );
  const runtime = createDiscoveryServices();
  const pending = runtime.discovery.discover(f.request, new AbortController().signal);
  try {
    await incoming;
    await runtime.runtime.dispose();
    const result = await pending;
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.some((item) => item.severity === 'error')).toBe(true);
  } finally {
    await runtime.runtime.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
