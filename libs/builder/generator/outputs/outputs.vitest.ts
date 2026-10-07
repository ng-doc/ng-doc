import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Environment, FileSystemLoader } from 'nunjucks';
import ts from 'typescript';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  type ApiDescriptor,
  type CategoryDescriptor,
  type ContentDescriptor,
  type ContentIR,
  type DeclarationDescriptor,
  type EntryDescriptor,
  type FileOutput,
  type GeneratorConfiguration,
  type GuideDescriptor,
  type GuideSemantics,
  type KeywordExport,
  type LinkedContent,
  type PageArtifact,
  type RouteRecord,
  GENERATOR_SCHEMA_VERSION,
} from '../contracts';
import { hostPath } from '../kernel/paths';
import { projectWatchInputs } from '../session/watch-inputs';
import {
  type AggregateRequest,
  type PageAssemblyRequest,
  createOutputAssembler,
  pageAssemblyKey,
} from './index';

const cleanup: string[] = [];

afterEach(() => {
  for (const root of cleanup.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; configuration: GeneratorConfiguration } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-outputs-')));
  cleanup.push(root);
  return {
    root,
    configuration: {
      projectId: 'docs-project',
      workspaceRoot: root,
      docsRoots: [path.join(root, 'docs')],
      tsConfig: path.join(root, 'tsconfig.json'),
      outputRoot: path.join(root, '.generated'),
      cacheRoot: path.join(root, '.cache'),
      routePrefix: 'docs',
      guideDirectory: 'guides',
      apiDirectory: 'api',
      assetDirectory: 'assets/ng-doc',
      inlineStyleLanguage: 'SCSS',
      anchorHeadings: ['h2', 'h3'],
      themes: { light: 'github-light', dark: 'github-dark' },
      repo: {
        url: 'https://github.com/ng-doc/example/',
        platform: 'github',
        mainBranch: 'main',
        releaseBranch: 'v1',
      },
      cacheEnabled: true,
      digest: 'configuration-digest',
      executables: [],
    },
  };
}

function guide(root: string, overrides: Partial<GuideDescriptor> = {}): GuideDescriptor {
  const directory = path.join(root, 'docs', 'start');
  return {
    kind: 'guide',
    id: 'guide:start',
    source: { path: path.join(directory, 'ng-doc.page.ts'), line: 4 },
    title: 'Start',
    route: 'start',
    absoluteRoute: 'docs/start',
    breadcrumbs: ['Docs', 'Start'],
    parentId: 'category:docs',
    order: 2,
    hidden: false,
    runtimeImport: { source: path.join(directory, 'ng-doc.page.ts'), exportName: 'default' },
    dependencies: [],
    markdown: [path.join(directory, 'index.md'), path.join(directory, 'advanced.md')],
    hasImports: true,
    ...overrides,
  };
}

function api(root: string, overrides: Partial<ApiDescriptor> = {}): ApiDescriptor {
  return {
    kind: 'api',
    id: 'api:main',
    source: { path: path.join(root, 'docs', 'ng-doc.api.ts') },
    title: 'API Reference',
    route: 'api',
    absoluteRoute: 'docs/api',
    breadcrumbs: ['Docs', 'API'],
    order: 3,
    runtimeImport: { source: path.join(root, 'docs', 'ng-doc.api.ts'), exportName: 'default' },
    dependencies: [],
    assetRoute: '',
    scopes: [
      { id: 'public', name: 'Public', route: 'public', include: ['src/**/*.ts'], exclude: [] },
      { id: 'extra', name: 'Extra', route: 'extra', include: ['extra/**/*.ts'], exclude: [] },
    ],
    ...overrides,
  };
}

function declaration(
  root: string,
  overrides: Partial<DeclarationDescriptor> = {},
): DeclarationDescriptor {
  return {
    id: 'declaration:button',
    apiEntryId: 'api:main',
    scopeId: 'public',
    source: { path: path.join(root, 'src', 'button.ts'), line: 12 },
    name: 'Button',
    kind: 'class-declaration',
    apiListType: 'Component',
    route: 'docs/api/classes/public/Button',
    breadcrumbs: ['API', 'Public', 'Button'],
    exportedKeywords: [],
    ...overrides,
  };
}

function linked(
  entryId: string,
  role: ContentIR['role'],
  id: string,
  html: string,
  overrides: Partial<ContentIR> = {},
): LinkedContent {
  const ir: ContentIR = {
    schemaVersion: GENERATOR_SCHEMA_VERSION,
    id,
    entryId,
    role,
    title: id,
    route: role === 'guide-tab' ? id.replace(/^tab:/, '') : '',
    absoluteRoute: `docs/${id}`,
    html: `unlinked:${id}`,
    anchors: [],
    exportedKeywords: [],
    usedKeywords: [],
    dependencies: [],
    diagnostics: [],
    ...overrides,
  };
  return { ir, html, searchRecords: [], keywordDigest: `keyword:${id}` };
}

function descriptor(
  item: LinkedContent,
  ownerId: string,
  ordinal: number,
  locator: ContentDescriptor['locator'],
): ContentDescriptor {
  return {
    schemaVersion: GENERATOR_SCHEMA_VERSION,
    id: item.ir.id,
    ownerId,
    ordinal,
    role: item.ir.role as ContentDescriptor['role'],
    locator,
    title: item.ir.title,
    route: item.ir.route,
    absoluteRoute: item.ir.absoluteRoute,
    searchBreadcrumbs: [],
    dependencies: [],
    inputDigest: `input:${item.ir.id}`,
    requestDigest: `request:${item.ir.id}`,
    closureIds: [],
  };
}

function guideSemantics(root: string): GuideSemantics {
  return {
    demos: {
      'demo<&': [
        {
          title: 'Button source',
          language: 'ts',
          source: path.join(root, 'src', 'button.ts'),
          icon: 'code',
          opened: true,
          code: 'export class Button {}',
        },
      ],
    },
    playgrounds: [
      {
        id: 'button',
        target: { source: path.join(root, 'src', 'button.ts'), exportName: 'Button' },
        standalone: true,
        selector: 'demo-button',
        template: '<demo-button/>',
        templatesBySelector: { 'demo-button': '<demo-button [kind]="kind" />' },
        properties: { kind: 'primary' },
        content: {},
      },
    ],
  };
}

function artifact(
  id: string,
  routes: RouteRecord[] = [],
  outputs: FileOutput[] = [],
  apiList: PageArtifact['apiList'] = [],
): PageArtifact {
  return {
    id,
    identity: { projectId: 'docs-project', entryId: id, role: 'page-shell' },
    revision: `revision:${id}`,
    fingerprint: {
      schemaVersion: GENERATOR_SCHEMA_VERSION,
      compilerVersion: 'test',
      toolchainDigest: 'toolchain',
      configurationDigest: 'configuration',
      inputDigest: 'input',
      keywordDigest: 'keywords',
    },
    dependencies: [],
    content: [],
    exportedKeywords: [],
    usedKeywords: [],
    searchRecords: [],
    routes,
    apiList,
    outputs,
    diagnostics: [],
  };
}

function byPath(outputs: FileOutput[], target: string): FileOutput {
  const found = outputs.find((item) => item.path === target);
  expect(found, `missing ${target}`).toBeDefined();
  return found!;
}

function expectValidTypeScript(outputs: FileOutput[]): void {
  for (const item of outputs.filter((candidate) => candidate.path.endsWith('.ts'))) {
    const result = ts.transpileModule(item.content, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
      fileName: item.path,
    });
    expect(
      result.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      ) ?? [],
      item.path,
    ).toEqual([]);
  }
}

describe('OutputAssembler page assembly', () => {
  test('renders a guide wrapper, ordered tabs, linked demo assets and runtime playground references', async () => {
    const { root, configuration } = fixture();
    const entry = guide(root);
    const content: LinkedContent[] = [
      linked(entry.id, 'header', 'header', '<h1>Start</h1>'),
      linked(
        entry.id,
        'guide-tab',
        'tab:index',
        '<p>Intro ${safe} ☃ \'single\' "double" `backtick`</p>',
        {
          title: 'Overview',
          route: '',
          dependencies: [{ kind: 'content', path: entry.markdown[0], digest: 'intro' }],
        },
      ),
      linked(entry.id, 'guide-tab', 'tab:advanced', '<p>Advanced</p>', {
        title: 'Advanced',
        route: 'advanced',
        icon: 'rocket',
        dependencies: [{ kind: 'content', path: entry.markdown[1], digest: 'advanced' }],
      }),
      linked(
        entry.id,
        'demo-assets',
        'demo-assets',
        '<ng-doc-demo-assets name="demo&lt;&amp;"><pre><code class="language-ts">linked code</code></pre></ng-doc-demo-assets>',
      ),
    ];
    const result = createOutputAssembler().assemblePage({
      configuration,
      entry,
      content,
      semantics: guideSemantics(root),
      metadata: { description: 'A starting guide', tags: { since: ['1.0'] } },
    });

    const proseEdit = createOutputAssembler().assemblePage({
      configuration,
      entry,
      content: content.map((item) =>
        item.ir.id === content[1].ir.id ? { ...item, html: '<p>New prose</p>' } : item,
      ),
      semantics: guideSemantics(root),
      metadata: { description: 'A starting guide', tags: { since: ['1.0'] } },
    });
    expect(proseEdit.diagnostics).toEqual([]);
    expect(
      proseEdit.outputs
        .filter((item) => byPath(result.outputs, item.path).content !== item.content)
        .map((item) => item.path),
    ).toEqual(['guides/start/index/page.content.mjs']);
    const structuralEdit = createOutputAssembler().assemblePage({
      configuration,
      entry,
      content: content.map((item) =>
        item.ir.id === content[2].ir.id
          ? { ...item, ir: { ...item.ir, title: 'Renamed tab' } }
          : item,
      ),
      semantics: guideSemantics(root),
      metadata: { description: 'A starting guide', tags: { since: ['1.0'] } },
    });
    expect(structuralEdit.diagnostics).toEqual([]);
    expect(byPath(structuralEdit.outputs, 'guides/start/page.ts').content).toContain('Renamed tab');
    expect(byPath(structuralEdit.outputs, 'guides/start/page.ts').content).not.toBe(
      byPath(result.outputs, 'guides/start/page.ts').content,
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.outputs.map((item) => item.path)).toEqual([
      'guides/start/index/page.ts',
      'guides/start/index/page.content.mjs',
      'guides/start/index/page.source.mjs',
      'guides/start/index/page.content.d.mts',
      'guides/start/index/page.source.d.mts',
      'guides/start/advanced/page.ts',
      'guides/start/advanced/page.content.mjs',
      'guides/start/advanced/page.source.mjs',
      'guides/start/advanced/page.content.d.mts',
      'guides/start/advanced/page.source.d.mts',
      'guides/start/page.ts',
      'guides/start/page.content.mjs',
      'guides/start/page.source.mjs',
      'guides/start/page.content.d.mts',
      'guides/start/page.source.d.mts',
      'guides/start/demo-assets.ts',
      'guides/start/playgrounds.ts',
    ]);
    const overview = byPath(result.outputs, 'guides/start/index/page.ts').content;
    expect(overview).toContain("import entry from '../../../../docs/start/ng-doc.page'");
    expect(overview).toContain('...entry.imports');
    expect(overview).toContain('docs(): describe your changes here...');
    expect(overview).toContain('/blob/v1/docs/start/index.md');
    expect(overview).toContain("import pageContentSource from './page.source.mjs'");
    expect(overview).toContain('readonly pageContent: string = pageContent;');
    expect(overview).toContain('readonly pageContentSource = pageContentSource;');
    // The route waits for its content, so navigation keeps the previous page until it is ready.
    expect(overview).toContain("import {ɵwithNgDocContent} from '@ng-doc/app';");
    expect(overview).toMatch(
      /const routes: Routes = \[ɵwithNgDocContent\(\{[\s\S]*\}, pageContentSource\)\]/,
    );
    // The page route inherits its tab's title, so a page's own `route.title` is the only one.
    expect(overview).toMatch(
      /\{\n {2}\.\.\.\(isRoute\(entry\.route\) \? entry\.route : \{\}\),\n {2}path: '',\n {2}component: PageComponent,\n\}/,
    );
    expect(overview).not.toContain('title:');
    const bodyPayload = byPath(result.outputs, 'guides/start/index/page.content.mjs').content;
    expect(bodyPayload).toContain('"schemaVersion":1');
    expect(JSON.parse(bodyPayload.replace(/^export default |;\n$/g, '')).html).toBe(
      '<p>Intro ${safe} ☃ \'single\' "double" `backtick`</p>',
    );
    const bodySource = byPath(result.outputs, 'guides/start/index/page.source.mjs').content;
    expect(bodySource).toContain('import("./page.content.mjs")');
    // The package root: `@ng-doc/core` has no `exports`, and NodeNext refuses a subpath of it.
    expect(byPath(result.outputs, 'guides/start/index/page.content.d.mts').content).toBe(
      "import type {NgDocContentModule} from '@ng-doc/core';\ndeclare const payload: NgDocContentModule;\nexport default payload;\n",
    );
    expect(byPath(result.outputs, 'guides/start/index/page.source.d.mts').content).toBe(
      "import type {NgDocContentSource} from '@ng-doc/core';\ndeclare const source: NgDocContentSource;\nexport default source;\n",
    );
    const moduleRoot = path.join(root, 'modules');
    mkdirSync(path.join(moduleRoot, 'guides/start/index'), { recursive: true });
    writeFileSync(path.join(moduleRoot, 'guides/start/index/page.content.mjs'), bodyPayload);
    writeFileSync(path.join(moduleRoot, 'guides/start/index/page.source.mjs'), bodySource);
    const facade = await import(
      `${pathToFileURL(path.join(moduleRoot, 'guides/start/index/page.source.mjs')).href}?test=${Date.now()}`
    );
    const payload = await facade.default.load(new AbortController().signal);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      html: '<p>Intro ${safe} ☃ \'single\' "double" `backtick`</p>',
    });
    expect(payload.id).toBe(facade.default.id);
    const missing = path.join(moduleRoot, 'missing');
    mkdirSync(missing, { recursive: true });
    writeFileSync(path.join(missing, 'page.source.mjs'), bodySource);
    const missingFacade = await import(
      `${pathToFileURL(path.join(missing, 'page.source.mjs')).href}?missing=${Date.now()}`
    );
    await expect(missingFacade.default.load(new AbortController().signal)).rejects.toThrow();
    expect(byPath(result.outputs, 'guides/start/page.ts').content).toContain('headerContentSource');
    const wrapper = byPath(result.outputs, 'guides/start/page.ts').content;
    expect(wrapper.indexOf("path: ''")).toBeLessThan(wrapper.indexOf("path: 'advanced'"));
    expect(wrapper).toContain("import('./index/page')");
    expect(wrapper).toContain("icon: 'rocket'");
    // Only the tabs have titles here: the wrapper route inherits the page's from `routes.ts`.
    expect(wrapper.match(/title: /g)).toHaveLength(2);
    expect(wrapper.match(/ngDocTitle: 'tab'/g)).toHaveLength(2);
    expect(wrapper).toContain("ngDocPageType: 'guide'");
    expect(wrapper).toMatch(
      /const routes: Routes = \[ɵwithNgDocContent\(\{[\s\S]*\}, headerContentSource\)\]/,
    );
    const assets = byPath(result.outputs, 'guides/start/demo-assets.ts').content;
    expect(assets).toContain('linked code');
    expect(assets).toContain("icon: 'code'");
    expect(assets).toContain('opened: true');
    const playgrounds = byPath(result.outputs, 'guides/start/playgrounds.ts').content;
    expect(playgrounds).toContain("pageEntity.playgrounds['button'].target");
    // The signal contract of NgDocBasePlayground: queries with viewChild(), no constructor.
    expect(playgrounds).toContain(
      "readonly viewContainerRef = viewChild(pageEntity.playgrounds['button'].target, {read: ViewContainerRef});",
    );
    expect(playgrounds).not.toContain('@ViewChild');
    expect(playgrounds).not.toContain('super(');
    expect(playgrounds).toContain('...pageEntity.imports');
    expect(playgrounds).toContain("import pageEntity from '../../../docs/start/ng-doc.page'");
    // Identical playgrounds of two pages must not compile to components with the same ID.
    expect(playgrounds).toContain("host: {'data-ng-doc-playground-page': 'docs/start'},");
    expect(result.routes).toEqual([
      expect.objectContaining({
        id: entry.id,
        parentId: 'category:docs',
        path: 'start',
        modulePath: 'guides/start/page.ts',
        metadata: { description: 'A starting guide', tags: { since: ['1.0'] } },
      }),
    ]);
    for (const item of result.outputs) {
      expect(item.digest).toBe(createHash('sha256').update(item.content).digest('hex'));
    }
    expectValidTypeScript(result.outputs);
  });

  test('retains legacy template string branches without source context', () => {
    const templates = path.resolve(import.meta.dirname, '../../templates');
    const environment = new Environment(new FileSystemLoader(templates), { autoescape: false });
    environment.addFilter('toTemplateString', (value: unknown) => String(value));
    const page = environment.render('page.ts.nunj', {
      id: 'legacy',
      content: '<p>legacy</p>',
      metadata: { title: 'Legacy', outDir: '' },
      pageType: 'guide',
    });
    const wrapper = environment.render('page-wrapper.ts.nunj', {
      id: 'legacy',
      headerContent: '<h1>legacy</h1>',
      metadata: { title: 'Legacy' },
      entries: {},
      pageType: 'guide',
      hasBreadcrumb: false,
    });
    expect(page).toContain('const pageContent: string = `<p>legacy</p>`');
    expect(page).not.toContain('pageContentSource');
    expect(wrapper).toContain('const headerContent: string = `<h1>legacy</h1>`');
    expect(wrapper).not.toContain('headerContentSource');
    expect(page).not.toContain('ɵwithNgDocContent');
    expect(wrapper).not.toContain('ɵwithNgDocContent');
    // The legacy branch has the same titles: none on the page route or the wrapper route.
    expect(page).not.toContain('title:');
    expect(wrapper).not.toContain('title:');
    expect(wrapper).toContain("ngDocPageType: 'guide'");
  });

  test('writes route paths and API list segments as escaped string literals', () => {
    const templates = path.resolve(import.meta.dirname, '../../templates');
    const environment = new Environment(new FileSystemLoader(templates), { autoescape: false });
    environment.addFilter('toTemplateString', (value: unknown) => String(value));
    environment.addFilter('createImportPath', () => './page');
    const tricky = "it's\\a\npath";
    const routes = environment.render('routes.ts.nunj', {
      curDir: '/out',
      entries: [
        {
          item: { route: tricky, title: 'Tricky', apiListSegment: tricky, outDir: '/out/api' },
          children: [],
        },
        { item: { route: 'plain', title: 'Plain', outDir: '/out/plain' }, children: [] },
      ],
    });
    // Ordinary routes keep their single-quoted form, byte for byte.
    expect(routes).toContain("path: 'plain',");
    const literals = [...routes.matchAll(/(?:path|ngDocApiListSegment): ('(?:[^'\\\n]|\\.)*')/g)];
    expect(literals.map((match) => new Function(`return ${match[1]};`)())).toEqual([
      tricky,
      tricky,
      'plain',
    ]);
  });

  test('keeps facades and shells stable for body prose while revising only the payload', () => {
    const { root, configuration } = fixture();
    const entry = guide(root);
    const request = (html: string): PageAssemblyRequest => ({
      configuration,
      entry,
      content: [
        linked(entry.id, 'header', 'header', '<h1>Start</h1>'),
        linked(entry.id, 'guide-tab', 'tab:index', html, { title: 'Overview', route: '' }),
      ],
      semantics: { demos: {}, playgrounds: [] },
    });
    const first = createOutputAssembler().assemblePage(request('<p>one</p>'));
    const second = createOutputAssembler().assemblePage(request('<p>two</p>'));
    for (const path of [
      'guides/start/index/page.ts',
      'guides/start/index/page.source.mjs',
      'guides/start/page.ts',
    ]) {
      expect(byPath(second.outputs, path).content).toBe(byPath(first.outputs, path).content);
    }
    const firstPayload = byPath(first.outputs, 'guides/start/index/page.content.mjs').content;
    const secondPayload = byPath(second.outputs, 'guides/start/index/page.content.mjs').content;
    expect(secondPayload).not.toBe(firstPayload);
    expect(JSON.parse(secondPayload.replace(/^export default |;\n$/g, '')).revision).not.toBe(
      JSON.parse(firstPayload.replace(/^export default |;\n$/g, '')).revision,
    );
    const headerChanged = createOutputAssembler().assemblePage({
      ...request('<p>one</p>'),
      content: [
        linked(entry.id, 'header', 'header', '<h1>Changed</h1>'),
        linked(entry.id, 'guide-tab', 'tab:index', '<p>one</p>', { title: 'Overview', route: '' }),
      ],
    });
    expect(byPath(headerChanged.outputs, 'guides/start/page.ts').content).toBe(
      byPath(first.outputs, 'guides/start/page.ts').content,
    );
    expect(byPath(headerChanged.outputs, 'guides/start/page.content.mjs').content).not.toBe(
      byPath(first.outputs, 'guides/start/page.content.mjs').content,
    );
    expect(byPath(headerChanged.outputs, 'guides/start/index/page.content.mjs').content).toBe(
      byPath(first.outputs, 'guides/start/index/page.content.mjs').content,
    );
  });

  test('aggregates the physical search index and keyword map, with no search source', () => {
    const { configuration } = fixture();
    const aggregated = createOutputAssembler().aggregate({
      configuration,
      artifacts: [],
      entries: [],
      keywords: [],
    });
    expect(aggregated.diagnostics).toEqual([]);
    const paths = aggregated.outputs.map((item) => item.path);
    expect(paths).toContain('assets/ng-doc/indexes.json');
    expect(paths).toContain('assets/ng-doc/keywords.json');
    expect(paths).not.toContain('search.source.mjs');
    expect(byPath(aggregated.outputs, 'context.ts').content).not.toContain(
      'NG_DOC_SEARCH_INDEX_SOURCE',
    );
  });

  test('emits every descriptor of a plan as a physical payload and rejects missing content', () => {
    const { root, configuration } = fixture();
    const entry = guide(root, { markdown: [path.join(root, 'docs', 'start', 'index.md')] });
    const header = linked(entry.id, 'header', 'header', '<h1>Start</h1>', {
      title: 'Start',
      absoluteRoute: 'docs/start',
    });
    const tab = linked(entry.id, 'guide-tab', 'tab:index', '<p>Ready</p>', {
      title: 'Overview',
      route: '',
      absoluteRoute: 'docs/start',
    });
    const descriptors = [
      descriptor(header, 'actual-artifact-hash', 0, { kind: 'header' }),
      descriptor(tab, 'actual-artifact-hash', 1, {
        kind: 'guide-tab',
        markdown: entry.markdown[0],
      }),
    ];
    const common = {
      configuration,
      entry,
      ownerId: 'actual-artifact-hash',
      semantics: { demos: {}, playgrounds: [] },
      contentDescriptors: descriptors,
    };
    const ready = createOutputAssembler().assemblePage({
      ...common,
      content: [header, tab],
    });
    expect(ready.diagnostics).toEqual([]);
    expect(byPath(ready.outputs, 'guides/start/index/page.content.mjs').content).toContain(
      '<p>Ready</p>',
    );
    expect(byPath(ready.outputs, 'guides/start/index/page.source.mjs').content).toContain(
      'await import("./page.content.mjs")',
    );
    // A descriptor without linked content cannot be emitted as a page file.
    const missing = createOutputAssembler().assemblePage({
      ...common,
      content: [header],
    });
    expect(missing.diagnostics).toEqual([
      expect.objectContaining({
        code: 'OUTPUT_DESCRIPTOR_FILE_DEFERRED',
        message: `Generated files cannot omit content: ${tab.ir.id}.`,
      }),
    ]);
    expect(missing.outputs).toEqual([]);
    const unknown = createOutputAssembler().assemblePage({
      ...common,
      content: [header, tab, { ...tab, ir: { ...tab.ir, id: 'tab:unknown' } }],
    });
    expect(unknown.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'OUTPUT_DESCRIPTOR_PARTITION' })]),
    );
    const duplicate = createOutputAssembler().assemblePage({
      ...common,
      content: [header, tab, tab],
    });
    expect(duplicate.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OUTPUT_DESCRIPTOR_PARTITION',
          message: 'Ready content IDs must be unique.',
        }),
      ]),
    );
  });

  test('rejects stale and cyclic descriptor plans before shell publication', () => {
    const { root, configuration } = fixture();
    const entry = guide(root, { markdown: [path.join(root, 'docs', 'start', 'index.md')] });
    const header = linked(entry.id, 'header', 'header', 'header', {
      title: 'Start',
      absoluteRoute: 'docs/start',
    });
    const tab = linked(entry.id, 'guide-tab', 'tab:index', 'tab', {
      title: 'Overview',
      route: '',
      absoluteRoute: 'docs/start',
    });
    const descriptors = [
      {
        ...descriptor(header, 'actual-artifact-hash', 0, { kind: 'header' }),
        closureIds: ['tab:index'],
      },
      {
        ...descriptor(tab, 'actual-artifact-hash', 1, {
          kind: 'guide-tab',
          markdown: entry.markdown[0],
        }),
        closureIds: ['header'],
        title: 'stale',
      },
    ];
    const result = createOutputAssembler().assemblePage({
      configuration,
      entry,
      ownerId: 'actual-artifact-hash',
      content: [header, tab],
      contentDescriptors: descriptors,
      semantics: { demos: {}, playgrounds: [] },
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OUTPUT_DESCRIPTOR_CURRENT' }),
        expect.objectContaining({ code: 'OUTPUT_DESCRIPTOR_CLOSURE' }),
      ]),
    );
  });

  test('renders API list shells from raw asset routes and declaration pages as flat public routes', () => {
    const { root, configuration } = fixture();
    const entry = api(root);
    const assembler = createOutputAssembler();
    const shell = assembler.assemblePage({ configuration, entry, content: [] });
    expect(shell.diagnostics).toEqual([]);
    expect(shell.outputs).toHaveLength(1);
    expect(shell.outputs[0].path).toBe('api/page.ts');
    expect(shell.outputs[0].content).toContain('segment=""');
    expect(shell.routes[0]).toMatchObject({
      path: 'api',
      modulePath: 'api/page.ts',
      apiListSegment: '',
    });

    const item = declaration(root, {
      description: 'A button.',
      signature: '@Component({ … })\nexport class Button',
    });
    const page = assembler.assemblePage({
      configuration,
      entry,
      declaration: item,
      content: [
        linked(entry.id, 'header', 'api-header', '<h1>Button API</h1>'),
        linked(entry.id, 'api-tab', 'api-tab', '<p>Button details</p>'),
      ],
    });
    expect(page.diagnostics).toEqual([]);
    expect(page.outputs.map((output) => output.path)).toEqual([
      'api/api/classes/public/Button/api/page.ts',
      'api/api/classes/public/Button/api/page.content.mjs',
      'api/api/classes/public/Button/api/page.source.mjs',
      'api/api/classes/public/Button/api/page.content.d.mts',
      'api/api/classes/public/Button/api/page.source.d.mts',
      'api/api/classes/public/Button/page.ts',
      'api/api/classes/public/Button/page.content.mjs',
      'api/api/classes/public/Button/page.source.mjs',
      'api/api/classes/public/Button/page.content.d.mts',
      'api/api/classes/public/Button/page.source.d.mts',
    ]);
    expect(byPath(page.outputs, 'api/api/classes/public/Button/page.ts').content).toContain(
      "import('./api/page')",
    );
    expect(byPath(page.outputs, 'api/api/classes/public/Button/page.ts').content).toContain(
      "ngDocPageType: 'api'",
    );
    expect(
      JSON.parse(
        byPath(page.outputs, 'api/api/classes/public/Button/page.content.mjs').content.replace(
          /^export default |;\n$/g,
          '',
        ),
      ),
    ).toMatchObject({ schemaVersion: 1, html: '<h1>Button API</h1>' });
    expect(
      JSON.parse(
        byPath(page.outputs, 'api/api/classes/public/Button/api/page.content.mjs').content.replace(
          /^export default |;\n$/g,
          '',
        ),
      ),
    ).toMatchObject({ schemaVersion: 1, html: '<p>Button details</p>' });
    expect(page.routes).toEqual([
      expect.objectContaining({
        id: item.id,
        path: 'api/classes/public/Button',
        hidden: true,
        modulePath: 'api/api/classes/public/Button/page.ts',
      }),
    ]);
    expect(page.apiList).toEqual([
      {
        apiEntryId: entry.id,
        scopeId: 'public',
        scopeTitle: 'Public',
        name: 'Button',
        type: 'Component',
        route: 'docs/api/classes/public/Button',
        description: 'A button.',
        signature: '@Component({ … })\nexport class Button',
      },
    ]);
    expectValidTypeScript([...shell.outputs, ...page.outputs]);
  });

  test('retains compatibility fallbacks for fixtures created before assetRoute and apiListType', () => {
    const { root, configuration } = fixture();
    const entry = api(root, { assetRoute: undefined, route: 'reference' });
    const item = declaration(root, { apiListType: undefined, kind: 'interface-declaration' });
    const shell = createOutputAssembler().assemblePage({ configuration, entry, content: [] });
    expect(shell.outputs[0].path).toBe('api/reference/page.ts');
    expect(shell.outputs[0].content).toContain('segment="reference"');
    const page = createOutputAssembler().assemblePage({
      configuration,
      entry,
      declaration: item,
      content: [
        linked(entry.id, 'header', 'header', 'Header'),
        linked(entry.id, 'api-tab', 'tab', 'Body'),
      ],
    });
    expect(page.apiList[0].type).toBe('Interface');
    expect(page.apiList[0]).not.toHaveProperty('description');
    expect(shell.routes[0].apiListSegment).toBe('reference');
  });
});

describe('OutputAssembler aggregate assembly', () => {
  test('renders category providers, navigation, search, keywords and scope-ordered API lists', () => {
    const { root, configuration } = fixture();
    const category: CategoryDescriptor = {
      kind: 'category',
      id: 'category:docs',
      source: { path: path.join(root, 'docs', 'ng-doc.category.ts') },
      title: 'Documentation',
      route: 'guides',
      absoluteRoute: 'docs/guides',
      breadcrumbs: ['Docs'],
      order: 1,
      hidden: false,
      expandable: false,
      expanded: true,
      runtimeImport: {
        source: path.join(root, 'docs', 'ng-doc.category.ts'),
        exportName: 'default',
      },
      dependencies: [],
    };
    const guideEntry = guide(root);
    const apiEntry = api(root, { assetRoute: 'reference', route: 'reference' });
    const guideRoute: RouteRecord = {
      id: guideEntry.id,
      parentId: category.id,
      path: guideEntry.route,
      title: guideEntry.title,
      modulePath: 'guides/start/page.ts',
      metadata: { description: 'Guide description', tags: { status: ['stable'] } },
    };
    const apiRoute: RouteRecord = {
      id: apiEntry.id,
      path: apiEntry.route,
      title: apiEntry.title,
      modulePath: 'api/reference/page.ts',
      apiListSegment: 'reference',
    };
    const publicRecord = {
      apiEntryId: apiEntry.id,
      scopeId: 'public',
      scopeTitle: 'Public',
      name: 'Button',
      type: 'Component',
      route: 'docs/api/Button',
      description: 'A button.',
      signature: 'export class Button',
    };
    const extraRecord = {
      apiEntryId: apiEntry.id,
      scopeId: 'extra',
      scopeTitle: 'Extra',
      name: 'Helper',
      type: 'Function',
      route: 'docs/api/Helper',
    };
    const guideArtifact = artifact('guide-artifact', [guideRoute]);
    guideArtifact.searchRecords = [
      {
        breadcrumbs: ['Docs'],
        pageType: 'guide',
        title: 'Start',
        section: 'Intro',
        route: 'docs/start',
        content: 'Searchable body',
      },
    ];
    const apiArtifact = artifact('api-artifact', [apiRoute], [], [extraRecord, publicRecord]);
    const keywords: KeywordExport[] = [
      { key: 'Button', title: 'Button', path: '/docs/api/Button', type: 'link', languages: [] },
      { key: 'EmptyDescription', title: 'Empty', path: '/empty', description: '' },
    ];
    const result = createOutputAssembler().aggregate({
      configuration,
      artifacts: [guideArtifact, apiArtifact],
      entries: [category, guideEntry, apiEntry],
      keywords,
    });

    expect(result.diagnostics).toEqual([]);
    const routes = byPath(result.outputs, 'routes.ts').content;
    expect(routes).toMatch(/import NgDocCategory_[a-f0-9]+ from '\.\.\/docs\/ng-doc\.category'/);
    expect(routes).toMatch(/\.\.\.\(NgDocCategory_[a-f0-9]+\.providers \?\? \[\]\)/);
    expect(routes).toContain("import('./guides/start/page')");
    // Every route names what its title belongs to; only the API entry's route names its list.
    expect(routes.match(/data: \{ngDocTitle: 'category'\}/g)).toHaveLength(1);
    expect(routes.match(/data: \{ngDocTitle: 'page'\}/g)).toHaveLength(1);
    expect(
      routes.match(/data: \{ngDocTitle: 'page', ngDocApiListSegment: 'reference'\}/g),
    ).toHaveLength(1);
    expect(routes.match(/ngDocApiListSegment/g)).toHaveLength(1);
    expect(routes).not.toContain("ngDocApiListSegment: ''");
    const context = byPath(result.outputs, 'context.ts').content;
    expect(context).toContain('apiLists: ["reference"]');
    expect(context).toContain("route: '/docs/guides'");
    expect(context).toContain('expandable: false');
    expect(context).toContain('expanded: true');
    expect(context).toContain('Guide description');
    expect(context).toContain('provide: NG_DOC_ROUTE_PREFIX');
    expect(context).toContain("light: 'github-light'");
    expect(JSON.parse(byPath(result.outputs, 'assets/ng-doc/indexes.json').content)).toEqual(
      guideArtifact.searchRecords,
    );
    expect(JSON.parse(byPath(result.outputs, 'assets/ng-doc/keywords.json').content)).toEqual({
      Button: { title: 'Button', path: '/docs/api/Button', type: 'link', languages: [] },
      EmptyDescription: { title: 'Empty', path: '/empty', description: '' },
    });
    expect(
      JSON.parse(byPath(result.outputs, 'assets/ng-doc/reference/api-list.json').content),
    ).toEqual([
      {
        title: 'Public',
        items: [
          {
            route: '/docs/api/Button',
            type: 'Component',
            name: 'Button',
            description: 'A button.',
            signature: 'export class Button',
          },
        ],
      },
      {
        title: 'Extra',
        items: [{ route: '/docs/api/Helper', type: 'Function', name: 'Helper' }],
      },
    ]);
    expect(byPath(result.outputs, 'index.ts').content).toContain("export * from './routes'");
    expectValidTypeScript(result.outputs);
  });

  test('reports duplicate IDs, missing parents, cycles and aggregate output collisions while pruning empty categories', () => {
    const { root, configuration } = fixture();
    const makeCategory = (id: string, parentId?: string): CategoryDescriptor => ({
      kind: 'category',
      id,
      ...(parentId ? { parentId } : {}),
      source: { path: path.join(root, `${id}.ts`) },
      title: id,
      route: id,
      absoluteRoute: id,
      breadcrumbs: [],
      runtimeImport: { source: path.join(root, `${id}.ts`), exportName: 'default' },
      dependencies: [],
    });
    const one = api(root, { id: 'api:one', assetRoute: 'same' });
    const two = api(root, { id: 'api:two', assetRoute: 'same' });
    const records: RouteRecord[] = [
      { id: 'duplicate', path: 'one', title: 'One', modulePath: 'one/page.ts' },
      { id: 'duplicate', path: 'two', title: 'Two', modulePath: 'two/page.ts' },
      {
        id: 'orphan',
        parentId: 'missing',
        path: 'orphan',
        title: 'Orphan',
        modulePath: 'o/page.ts',
      },
    ];
    const result = createOutputAssembler().aggregate({
      configuration,
      artifacts: [artifact('routes', records)],
      entries: [
        makeCategory('empty-root'),
        makeCategory('nested-parent'),
        makeCategory('nested-empty', 'nested-parent'),
        makeCategory('cycle-a', 'cycle-b'),
        makeCategory('cycle-b', 'cycle-a'),
        one,
        two,
      ],
      keywords: [],
    });
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'OUTPUT_ROUTE_COLLISION',
        'OUTPUT_ROUTE_PARENT_MISSING',
        'OUTPUT_ROUTE_CYCLE',
        'OUTPUT_COLLISION',
      ]),
    );
    expect(result.diagnostics.map((item) => item.code)).not.toContain('OUTPUT_EMPTY_CATEGORY');
    const routes = byPath(result.outputs, 'routes.ts').content;
    const context = byPath(result.outputs, 'context.ts').content;
    for (const removed of ['empty-root', 'nested-parent', 'nested-empty']) {
      expect(routes).not.toContain(removed);
      expect(context).not.toContain(removed);
    }
  });

  test('rejects sibling and flattened public-route collisions plus cross-artifact output ownership', () => {
    const { root, configuration } = fixture();
    const category: CategoryDescriptor = {
      kind: 'category',
      id: 'category:guides',
      source: { path: path.join(root, 'docs', 'ng-doc.category.ts') },
      title: 'Guides',
      route: 'guides',
      absoluteRoute: 'docs/guides',
      breadcrumbs: [],
      runtimeImport: {
        source: path.join(root, 'docs', 'ng-doc.category.ts'),
        exportName: 'default',
      },
      dependencies: [],
    };
    const first = guide(root, {
      id: 'guide:first',
      parentId: category.id,
      route: 'start',
      absoluteRoute: 'docs/guides/start',
    });
    const sibling = guide(root, {
      id: 'guide:sibling',
      parentId: category.id,
      route: 'start',
      absoluteRoute: 'docs/guides/start',
    });
    const flat = api(root, {
      id: 'api:flat',
      route: 'guides/start',
      absoluteRoute: 'docs/guides/start',
      assetRoute: 'flat',
    });
    const sharedOutput: FileOutput = {
      path: 'shared/page.ts',
      role: 'angular',
      encoding: 'utf8',
      content: 'shared',
      digest: createHash('sha256').update('shared').digest('hex'),
    };
    const aggregateCollision: FileOutput = {
      ...sharedOutput,
      path: 'routes.ts',
    };
    const result = createOutputAssembler().aggregate({
      configuration,
      artifacts: [
        artifact(
          'first-artifact',
          [
            {
              id: first.id,
              parentId: category.id,
              path: first.route,
              title: first.title,
              modulePath: 'guides/first/page.ts',
            },
            {
              id: sibling.id,
              parentId: category.id,
              path: sibling.route,
              title: sibling.title,
              modulePath: 'guides/sibling/page.ts',
            },
            {
              id: flat.id,
              path: flat.route,
              title: flat.title,
              modulePath: 'api/flat/page.ts',
            },
          ],
          [sharedOutput, aggregateCollision],
        ),
        artifact('second-artifact', [], [sharedOutput]),
      ],
      entries: [category, first, sibling, flat],
      keywords: [],
    });
    const routeCollisions = result.diagnostics.filter(
      (item) => item.code === 'OUTPUT_ROUTE_PATH_COLLISION',
    );
    expect(routeCollisions).toHaveLength(2);
    expect(routeCollisions.every((item) => item.message.endsWith('guides/start'))).toBe(true);
    const outputCollisions = result.diagnostics.filter(
      (item) => item.code === 'OUTPUT_CANDIDATE_COLLISION',
    );
    expect(outputCollisions).toHaveLength(2);
    expect(outputCollisions.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('shared/page.ts'),
        expect.stringContaining('routes.ts'),
      ]),
    );
  });

  test('rejects unsafe asset paths and non-JSON aggregate data without throwing', () => {
    const { configuration } = fixture();
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    const keywords = [
      { key: 'Cycle', title: 'Cycle', path: '/cycle', languages: cyclic },
    ] as unknown as KeywordExport[];
    const unsafe = createOutputAssembler().aggregate({
      configuration: { ...configuration, assetDirectory: '../escape' },
      artifacts: [],
      entries: [],
      keywords: [],
    });
    expect(unsafe.diagnostics.map((item) => item.code)).toContain('OUTPUT_PATH_INVALID');
    const invalidJson = createOutputAssembler().aggregate({
      configuration,
      artifacts: [],
      entries: [],
      keywords,
    });
    expect(invalidJson.diagnostics.map((item) => item.code)).toContain('OUTPUT_AGGREGATE');
    expect(
      invalidJson.diagnostics.find((item) => item.code === 'OUTPUT_AGGREGATE')?.message,
    ).toContain('finite, acyclic JSON tree');
  });
});

describe('navigation order', () => {
  test('entries without an order are sorted by title in English, whatever the process locale', () => {
    const { root, configuration } = fixture();
    /** A top-level guide without an order: the navigation sorts it by title. */
    const unordered = (id: string, title: string, route: string): GuideDescriptor => {
      const {
        parentId: _parent,
        order: _order,
        ...entry
      } = guide(root, {
        id,
        title,
        route,
        absoluteRoute: `docs/${route}`,
      });
      return entry;
    };
    const zeta = unordered('guide:zeta', 'Zeta', 'zeta');
    const arlig = unordered('guide:arlig', 'Ärlig', 'arlig');
    const route = (entry: GuideDescriptor, modulePath: string): RouteRecord => ({
      id: entry.id,
      path: entry.route,
      title: entry.title,
      modulePath,
    });
    const aggregate = () =>
      createOutputAssembler().aggregate({
        configuration,
        artifacts: [
          artifact('zeta-artifact', [route(zeta, 'guides/zeta/page.ts')]),
          artifact('arlig-artifact', [route(arlig, 'guides/arlig/page.ts')]),
        ],
        entries: [zeta, arlig],
        keywords: [],
      });
    const english = aggregate();
    expect(english.diagnostics).toEqual([]);
    // A Swedish default locale sorts `Ä` after `Z` with `localeCompare`; the output is unchanged.
    const swedish = new Intl.Collator('sv');
    const spy = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (
      this: string,
      other: string,
    ) {
      return swedish.compare(String(this), other);
    });
    let local;
    try {
      local = aggregate();
    } finally {
      spy.mockRestore();
    }
    const context = byPath(english.outputs, 'context.ts').content;
    expect(context.indexOf('Ärlig')).toBeGreaterThan(-1);
    expect(context.indexOf('Ärlig')).toBeLessThan(context.indexOf('Zeta'));
    expect(JSON.stringify(local.outputs)).toBe(JSON.stringify(english.outputs));
  });
});

describe('OutputAssembler diagnostics and dependencies', () => {
  test('tracks exact structural template bytes and reports every missing template', async () => {
    const assembler = createOutputAssembler();
    const found = await assembler.templateDependencies();
    expect(found.value).toBeNull();
    expect(found.diagnostics).toEqual([]);
    expect(found.dependencies).toHaveLength(10);
    expect(found.dependencies.every((item) => item.kind === 'content')).toBe(true);
    for (const dependency of found.dependencies) {
      if (dependency.kind !== 'content') continue;
      // Recorded with forward slashes on every OS: the session rejects a dependency path with a
      // backslash, so a native Windows path here fails every build.
      expect(dependency.path).toBe(hostPath(dependency.path));
      expect(dependency.digest).toBe(
        createHash('sha256').update(readFileSync(dependency.path, 'utf8')).digest('hex'),
      );
    }

    const missing = await createOutputAssembler({
      templateRoot: path.join(fixture().root, 'missing'),
    }).templateDependencies();
    expect(missing.value).toBeUndefined();
    expect(missing.dependencies).toHaveLength(10);
    expect(missing.dependencies.every((item) => item.kind === 'existence' && !item.exists)).toBe(
      true,
    );
    expect(projectWatchInputs([...found.dependencies, ...missing.dependencies]).files).toHaveLength(
      20,
    );
    expect(missing.diagnostics).toHaveLength(10);
  });

  test('returns actionable page diagnostics for invalid ownership, missing inputs and unsafe routes', () => {
    const { root, configuration } = fixture();
    const assembler = createOutputAssembler();
    const entry = guide(root);
    const missing = assembler.assemblePage({ configuration, entry, content: [] });
    expect(missing.diagnostics.map((item) => item.code)).toEqual([
      'OUTPUT_HEADER_MISSING',
      'OUTPUT_TABS_MISSING',
      'OUTPUT_SEMANTICS_MISSING',
    ]);
    const outside = assembler.assemblePage({
      configuration,
      entry: guide(root, { source: { path: path.join(root, 'outside.ts') } }),
      content: [],
    });
    expect(outside.diagnostics[0].code).toBe('OUTPUT_GUIDE_ROOT');
    const wrongOwner = assembler.assemblePage({
      configuration,
      entry: api(root),
      declaration: declaration(root, { apiEntryId: 'another-api' }),
      content: [],
    });
    expect(wrongOwner.diagnostics[0].code).toBe('OUTPUT_DECLARATION_OWNER');
    const unsafe = assembler.assemblePage({
      configuration,
      entry: api(root, { assetRoute: '../../escape' }),
      content: [],
    });
    expect(unsafe.diagnostics[0].code).toBe('OUTPUT_PATH_INVALID');
  });

  test('reports template rendering and demo-link mismatches instead of fabricating output', () => {
    const { root, configuration } = fixture();
    const entry = guide(root);
    const request: PageAssemblyRequest = {
      configuration,
      entry,
      content: [
        linked(entry.id, 'header', 'header', 'Header'),
        linked(entry.id, 'guide-tab', 'tab', 'Tab'),
        linked(entry.id, 'demo-assets', 'assets', ''),
      ],
      semantics: guideSemantics(root),
    };
    const mismatch = createOutputAssembler().assemblePage(request);
    expect(mismatch.diagnostics.map((item) => item.code)).toContain('OUTPUT_DEMO_ASSET_MISMATCH');
    const missingTemplates = createOutputAssembler({
      templateRoot: path.join(root, 'none'),
    }).assemblePage(request);
    expect(missingTemplates.outputs).toEqual([]);
    expect(
      missingTemplates.diagnostics.some((item) => item.code === 'OUTPUT_TEMPLATE_RENDER'),
    ).toBe(true);
  });

  test('covers root guides, GitLab links, route-prefix variants and optional descriptor fields', () => {
    const { root, configuration } = fixture();
    const rootEntry = guide(root, {
      id: 'guide:root',
      source: { path: path.join(root, 'docs', 'ng-doc.page.ts') },
      runtimeImport: { source: path.join(root, 'docs', 'ng-doc.page.ts'), exportName: 'default' },
      markdown: [path.join(root, 'docs', 'index.md')],
      parentId: undefined,
      order: undefined,
      hidden: undefined,
      breadcrumbs: [],
      hasImports: false,
    });
    const noRepo = createOutputAssembler().assemblePage({
      configuration: {
        ...configuration,
        outputRoot: path.join(root, 'docs'),
        guideDirectory: 'generated',
        repo: undefined,
      },
      entry: rootEntry,
      content: [
        linked(rootEntry.id, 'header', 'header', 'Header'),
        linked(rootEntry.id, 'guide-tab', 'tab', 'Body', {
          title: 'Root `{title}`',
          route: '',
        }),
      ],
      semantics: { demos: {}, playgrounds: [] },
    });
    expect(noRepo.diagnostics).toEqual([]);
    expect(noRepo.routes[0]).not.toHaveProperty('parentId');
    expect(noRepo.routes[0]).not.toHaveProperty('metadata');
    expect(byPath(noRepo.outputs, 'generated/page.ts').content).toContain('hasBreadcrumb = false');

    const entry = api(root);
    const gitlab = {
      ...configuration,
      routePrefix: '',
      repo: {
        url: 'https://gitlab.example/docs',
        platform: 'gitlab' as const,
        mainBranch: 'main',
        releaseBranch: 'release',
      },
    };
    const page = createOutputAssembler().assemblePage({
      configuration: gitlab,
      entry,
      declaration: declaration(root, {
        scopeId: 'unknown',
        kind: '',
        apiListType: undefined,
        route: 'public/Button',
      }),
      content: [
        linked(entry.id, 'header', 'header', 'Header'),
        linked(entry.id, 'api-tab', 'tab', 'Body'),
      ],
    });
    expect(page.diagnostics).toEqual([]);
    expect(page.apiList[0]).toMatchObject({ scopeTitle: 'unknown', type: '' });
    expect(page.routes[0].path).toBe('public/Button');
    expect(page.outputs[0].content).toContain('/-/edit/main/src/button.ts');
    expect(page.outputs[0].content).toContain('/-/blob/release/src/button.ts#L12');

    const localLinks = createOutputAssembler().assemblePage({
      configuration: {
        ...configuration,
        repo: { url: 'https://example.invalid/docs', platform: 'github' },
      },
      entry,
      declaration: declaration(root),
      content: [
        linked(entry.id, 'header', 'header', 'Header'),
        linked(entry.id, 'api-tab', 'tab', 'Body'),
      ],
    });
    expect(localLinks.outputs[0].content).toContain("editSourceFileUrl: string = 'src/button.ts'");
    expect(localLinks.outputs[0].content).toContain("viewSourceFileUrl: string = 'src/button.ts'");

    const exactPrefix = createOutputAssembler().assemblePage({
      configuration,
      entry,
      declaration: declaration(root, { route: 'docs' }),
      content: [
        linked(entry.id, 'header', 'header', 'Header'),
        linked(entry.id, 'api-tab', 'tab', 'Body'),
      ],
    });
    expect(exactPrefix.routes[0].path).toBe('');
    expect(exactPrefix.outputs.map((item) => item.path)).toContain('api/page.ts');

    const missingContent = createOutputAssembler().assemblePage({
      configuration,
      entry,
      declaration: declaration(root),
      content: [linked(entry.id, 'header', 'header', 'Header')],
    });
    expect(missingContent.diagnostics[0].code).toBe('OUTPUT_API_CONTENT_MISSING');
  });

  test('rejects sparse arrays, negative zero, undefined and unsupported JSON objects cleanly', () => {
    const { configuration } = fixture();
    const sparse = new Array<string>(1);
    const cases: AggregateRequest[] = [
      {
        configuration,
        artifacts: [],
        entries: [],
        keywords: [{ key: 'Sparse', title: 'Sparse', path: '/sparse', languages: sparse }],
      },
      {
        configuration,
        artifacts: [
          {
            ...artifact('negative-zero'),
            searchRecords: [-0] as unknown as PageArtifact['searchRecords'],
          },
        ],
        entries: [],
        keywords: [],
      },
      {
        configuration,
        artifacts: [
          {
            ...artifact('undefined'),
            searchRecords: [
              {
                breadcrumbs: [],
                pageType: 'guide',
                title: 'Undefined',
                section: 'Undefined',
                route: 'undefined',
                fragment: undefined,
                content: 'Undefined',
              },
            ],
          },
        ],
        entries: [],
        keywords: [],
      },
      {
        configuration,
        artifacts: [
          {
            ...artifact('date'),
            searchRecords: [new Date()] as unknown as PageArtifact['searchRecords'],
          },
        ],
        entries: [],
        keywords: [],
      },
    ];
    expect(cases.map((item) => createOutputAssembler().aggregate(item).diagnostics)).toEqual(
      cases.map(() => [expect.objectContaining({ code: 'OUTPUT_AGGREGATE' })]),
    );
  });

  test('keeps the runtime import closure narrow', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'index.ts'), 'utf8');
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(imports).toEqual(
      expect.arrayContaining([
        'node:fs',
        'node:path',
        'node:url',
        'nunjucks',
        '../contracts',
        '../kernel/canonical',
        '../kernel/observations',
      ]),
    );
    // Digests and file reads go through the kernel's one digest domain.
    expect(imports).not.toContain('node:crypto');
    expect(source).not.toMatch(/engine|GLOBALS|@ng-doc\/builder|@angular-devkit\/architect/);
  });
});

describe('page assembly key', () => {
  test('covers every non-content input exactly and rejects inputs without a JSON identity', () => {
    const { root, configuration } = fixture();
    const entry = guide(root);
    const templates = [
      { kind: 'content' as const, path: '/templates/page.ts.nunj', digest: 'page' },
    ];
    const base: Omit<PageAssemblyRequest, 'content'> = {
      ownerId: 'owner',
      configuration,
      entry,
      contentDescriptors: [],
      semantics: guideSemantics(root),
      metadata: { description: 'Start', tags: { since: ['1'] } },
    };
    const key = pageAssemblyKey(base, templates);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    // Equal values in another key order, and content, do not matter.
    const reordered = JSON.parse(JSON.stringify(base)) as typeof base;
    expect(pageAssemblyKey({ ...reordered, entry: { ...entry } }, templates)).toBe(key);
    expect(pageAssemblyKey({ ...base, content: [] } as PageAssemblyRequest, templates)).toBe(key);
    // Every input and every template observation is part of the key.
    const variants: Array<[Omit<PageAssemblyRequest, 'content'>, typeof templates]> = [
      [{ ...base, ownerId: 'other' }, templates],
      [{ ...base, configuration: { ...configuration, routePrefix: 'other' } }, templates],
      [{ ...base, entry: { ...entry, title: 'Other' } }, templates],
      [{ ...base, declaration: declaration(root) }, templates],
      [{ ...base, contentDescriptors: undefined }, templates],
      [{ ...base, semantics: undefined }, templates],
      [{ ...base, metadata: { description: 'Other', tags: {} } }, templates],
      [base, [{ ...templates[0], digest: 'changed' }]],
      [base, []],
    ];
    const keys = variants.map(([request, observed]) => pageAssemblyKey(request, observed));
    expect(new Set([key, ...keys]).size).toBe(variants.length + 1);
    // Absent and undefined optional fields are the same request.
    const { metadata: _metadata, ...withoutMetadata } = base;
    expect(pageAssemblyKey(withoutMetadata, templates)).toBe(
      pageAssemblyKey({ ...base, metadata: undefined }, templates),
    );
    // Values JSON cannot represent exactly have no key.
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    for (const exotic of [
      { ...entry, title: Number.NaN },
      { ...entry, order: -0 },
      { ...entry, title: (() => 'x') as unknown as string },
      // A hole is the input under test.
      // eslint-disable-next-line no-sparse-arrays
      { ...entry, markdown: [, 'hole'] as unknown as string[] },
      { ...entry, title: new String('x') as unknown as string },
      { ...entry, title: cyclic as unknown as string },
    ])
      expect(
        pageAssemblyKey({ ...base, entry: exotic as GuideDescriptor }, templates),
      ).toBeUndefined();
  });
});
