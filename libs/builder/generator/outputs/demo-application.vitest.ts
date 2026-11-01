import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, test } from 'vitest';

import {
  type CategoryDescriptor,
  type ContentIR,
  type FileOutput,
  type GeneratorConfiguration,
  type GuideDescriptor,
  type GuideSemantics,
  type LinkedContent,
  type PageArtifact,
  GENERATOR_SCHEMA_VERSION,
} from '../contracts';
import { createOutputAssembler } from './index';

const cleanup: string[] = [];

afterEach(() => {
  for (const root of cleanup.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(demoApplication?: GeneratorConfiguration['demoApplication']): {
  root: string;
  configuration: GeneratorConfiguration;
} {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ngdoc-demo-outputs-')));
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
      cacheEnabled: true,
      digest: 'configuration-digest',
      executables: [],
      ...(demoApplication ? { demoApplication } : {}),
    },
  };
}

function category(root: string, id: string, parentId?: string): CategoryDescriptor {
  const folder = id.replace(/^category:/, '');
  return {
    kind: 'category',
    id,
    source: { path: path.join(root, 'docs', folder, 'ng-doc.category.ts') },
    title: folder,
    route: folder,
    absoluteRoute: `docs/${folder}`,
    breadcrumbs: [folder],
    ...(parentId ? { parentId } : {}),
    runtimeImport: {
      source: path.join(root, 'docs', folder, 'ng-doc.category.ts'),
      exportName: 'default',
    },
    dependencies: [],
  };
}

function guide(root: string): GuideDescriptor {
  const directory = path.join(root, 'docs', 'start');
  return {
    kind: 'guide',
    id: 'guide:start',
    source: { path: path.join(directory, 'ng-doc.page.ts') },
    title: 'Start',
    route: 'start',
    absoluteRoute: 'docs/outer/inner/start',
    breadcrumbs: ['Start'],
    parentId: 'category:inner',
    runtimeImport: { source: path.join(directory, 'ng-doc.page.ts'), exportName: 'default' },
    dependencies: [],
    markdown: [path.join(directory, 'index.md')],
    hasImports: false,
  };
}

/**
 * A `demo` action as the content compiler writes it and the HTML pipeline keeps it.
 */
function demoAction(name: string, options: object): string {
  const json = JSON.stringify(options).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<ng-doc-demo componentname="${name}" indexable="false" class="ngde"><div id="options" class="ngde">${json}</div></ng-doc-demo>`;
}

function linked(entryId: string, role: ContentIR['role'], id: string, html: string): LinkedContent {
  return {
    ir: {
      schemaVersion: GENERATOR_SCHEMA_VERSION,
      id,
      entryId,
      role,
      title: id,
      route: '',
      absoluteRoute: 'docs/outer/inner/start',
      html,
      anchors: [],
      exportedKeywords: [],
      usedKeywords: [],
      dependencies: [],
      diagnostics: [],
    },
    html,
    searchRecords: [],
    keywordDigest: `keyword:${id}`,
  };
}

const SEMANTICS: GuideSemantics = {
  demos: {
    ButtonDemo: [{ title: 'TypeScript', language: 'ts', source: 'button.ts', code: 'x' }],
    'Odd name': [],
  },
  playgrounds: [],
};

function assemble(
  configuration: GeneratorConfiguration,
  root: string,
  body: string,
  semantics: GuideSemantics = SEMANTICS,
) {
  const entry = guide(root);
  const content = [
    linked(entry.id, 'header', 'header', '<h1>Start</h1>'),
    linked(entry.id, 'guide-tab', 'tab:index', body),
    linked(
      entry.id,
      'demo-assets',
      'demo-assets',
      // One element per asset: `<ng-doc-demo-assets name="ButtonDemo">…` for the default demos.
      Object.entries(semantics.demos)
        .flatMap(([name, assets]) =>
          assets.map(() => `<ng-doc-demo-assets name="${name}"><pre>x</pre></ng-doc-demo-assets>`),
        )
        .join(''),
    ),
  ];
  const page = createOutputAssembler().assemblePage({
    configuration,
    entry,
    content,
    semantics,
  });
  const pageArtifact: PageArtifact = {
    id: 'artifact:start',
    identity: { projectId: 'docs-project', entryId: entry.id, role: 'page-shell' },
    revision: 'revision',
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
    routes: page.routes,
    apiList: [],
    outputs: page.outputs,
    diagnostics: [],
  };
  const aggregate = createOutputAssembler().aggregate({
    configuration,
    artifacts: [pageArtifact],
    entries: [
      category(root, 'category:outer'),
      category(root, 'category:inner', 'category:outer'),
      entry,
    ],
    keywords: [],
  });
  return { page, aggregate, outputs: [...page.outputs, ...aggregate.outputs] };
}

function byPath(outputs: FileOutput[], target: string): string {
  const found = outputs.find((item) => item.path === target);
  expect(found, `missing ${target}`).toBeDefined();
  return found!.content;
}

/**
 * The digest of every output, with the temporary root replaced, so it is the same on every run.
 */
function digest(outputs: FileOutput[], root: string): string {
  const hash = createHash('sha256');
  for (const item of [...outputs].sort((left, right) => (left.path < right.path ? -1 : 1))) {
    hash.update(`${item.path}\0${item.role}\0${item.content.replaceAll(root, '<root>')}\0`);
  }
  return hash.digest('hex');
}

function expectValidTypeScript(outputs: FileOutput[]): void {
  for (const item of outputs.filter((candidate) => candidate.path.endsWith('.ts'))) {
    const result = ts.transpileModule(item.content, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
      fileName: item.path,
    });
    expect(
      result.diagnostics?.filter((value) => value.category === ts.DiagnosticCategory.Error) ?? [],
      item.path,
    ).toEqual([]);
  }
}

describe('demo pages', () => {
  // A site that doesn't opt in generates exactly what the engine generated before demo pages
  // existed: the digest was taken from the 22.1 base engine (its outputs module and templates)
  // with this fixture.
  test('a site without isolated demos or demo options generates the same bytes as before', () => {
    const { root, configuration } = workspace();
    const { page, aggregate, outputs } = assemble(
      configuration,
      root,
      `<p>Intro</p>${demoAction('ButtonDemo', { expanded: true, isolated: false })}`,
    );
    expect([...page.diagnostics, ...aggregate.diagnostics]).toEqual([]);
    expect(outputs.map((item) => item.path)).not.toContain('guides/start/demo-routes.ts');
    expect(outputs.map((item) => item.path)).not.toContain('demo-app.ts');
    expect(page.routes[0]).not.toHaveProperty('demoModulePath');
    expect(digest(outputs, root)).toBe(BASE_DIGEST);
  });

  test('a guide with an isolated demo gets demo pages by default', () => {
    const { root, configuration } = workspace();
    const { page, aggregate, outputs } = assemble(
      configuration,
      root,
      `<p>Intro</p>${demoAction('ButtonDemo', { isolated: true, inputs: { label: '<b>' } })}`,
    );
    expect(aggregate.diagnostics).toEqual([]);
    // A demo whose name is no URL segment gets no page, with a warning.
    expect(page.diagnostics).toEqual([
      expect.objectContaining({
        code: 'OUTPUT_DEMO_NAME_INVALID',
        severity: 'warning',
        ownerId: 'guide:start',
      }),
    ]);
    expect(page.routes[0].demoModulePath).toBe('guides/start/demo-routes.ts');
    expect(page.routes[0].demoNames).toEqual(['ButtonDemo']);

    const routes = byPath(outputs, 'guides/start/demo-routes.ts');
    expect(routes).toContain("import {NgDocDemoHostComponent} from '@ng-doc/app/demo-app';");
    expect(routes).toContain("import entry from '../../../docs/start/ng-doc.page';");
    expect(routes).toContain('providers: [...(entry.providers ?? [])],');
    expect(routes).toContain("path: 'ButtonDemo',");
    expect(routes).toContain('title: `Start: ButtonDemo`,');
    expect(routes).toContain("data: {ngDocDemo: entry.demos?.['ButtonDemo']},");
    expect(routes).not.toContain('Odd name');

    for (const tab of ['guides/start/index/page.ts']) {
      expect(byPath(outputs, tab)).toContain(
        "readonly demoRoute: string = 'demo-preview/docs/outer/inner/start';",
      );
      expect(byPath(outputs, tab)).not.toContain('isolatedDemos');
    }

    const application = byPath(outputs, 'demo-app.ts');
    expect(application).toContain("export const NG_DOC_DEMO_PATH = 'demo-preview';");
    expect(application).toContain(
      'export const NG_DOC_DEMO_PAGES: string[] = ["demo-preview/docs/outer/inner/start/ButtonDemo"];',
    );
    expect(application).toContain("path: 'demo-preview/docs/outer/inner/start',");
    expect(application).toContain("loadChildren: () => import('./guides/start/demo-routes'),");
    // The categories' providers, outer first, as the documentation routes nest them.
    const outer = /import (NgDocCategory_\w+) from '\.\.\/docs\/outer\/ng-doc\.category';/.exec(
      application,
    )?.[1];
    const inner = /import (NgDocCategory_\w+) from '\.\.\/docs\/inner\/ng-doc\.category';/.exec(
      application,
    )?.[1];
    expect(outer && inner).toBeTruthy();
    expect(application.indexOf(`...(${outer}.providers ?? []),`)).toBeLessThan(
      application.indexOf(`...(${inner}.providers ?? []),`),
    );
    expect(application).toContain('export const NG_DOC_DEMO_PROVIDERS = undefined;');
    expect(aggregate.outputs.find((item) => item.path === 'demo-app.ts')?.role).toBe('routes');
    expect(byPath(outputs, 'index.ts')).toBe(EXPECTED_INDEX);
    expectValidTypeScript(outputs);
  });

  test('every guide gets demo pages with the site options, under their path and providers', () => {
    const { root, configuration } = workspace({
      pages: 'all',
      isolated: true,
      path: 'previews/live',
      providers: '<root>/src/demo.providers.ts',
    });
    configuration.demoApplication!.providers = path.join(root, 'src', 'demo.providers.ts');
    const { outputs } = assemble(configuration, root, '<p>No demo action</p>');
    const tab = byPath(outputs, 'guides/start/index/page.ts');
    expect(tab).toContain("readonly demoRoute: string = 'previews/live/docs/outer/inner/start';");
    expect(tab).toContain('readonly isolatedDemos: boolean = true;');
    const application = byPath(outputs, 'demo-app.ts');
    expect(application).toContain("export const NG_DOC_DEMO_PATH = 'previews/live';");
    expect(application).toContain("path: 'previews/live/docs/outer/inner/start',");
    expect(application).toContain(
      "export const NG_DOC_DEMO_PROVIDERS = () => import('../src/demo.providers');",
    );
    expect(byPath(outputs, 'index.ts')).toBe(EXPECTED_INDEX);
    expectValidTypeScript(outputs);
  });

  test('no guide gets demo pages when demoApplication is false, isolated demos included', () => {
    const { root, configuration } = workspace({ pages: 'none' });
    const { outputs } = assemble(configuration, root, demoAction('ButtonDemo', { isolated: true }));
    expect(outputs.map((item) => item.path)).not.toContain('guides/start/demo-routes.ts');
    expect(outputs.map((item) => item.path)).not.toContain('demo-app.ts');
    expect(byPath(outputs, 'guides/start/index/page.ts')).not.toContain('demoRoute');
  });

  test('reads isolated options only from demo actions, whatever their character references', () => {
    const { root, configuration } = workspace();
    const isolated = (html: string) =>
      assemble(configuration, root, html).outputs.some(
        (item) => item.path === 'guides/start/demo-routes.ts',
      );
    // Hexadecimal and decimal references, as the HTML pipeline may write them.
    expect(
      isolated(
        '<ng-doc-demo componentname="ButtonDemo"><div id="options">{&#x22;isolated&#34;:true}</div></ng-doc-demo>',
      ),
    ).toBe(true);
    expect(isolated(demoAction('ButtonDemo', { isolated: 'yes' }))).toBe(false);
    expect(
      isolated(
        '<ng-doc-demo componentname="ButtonDemo"><div id="options">{oops</div></ng-doc-demo>',
      ),
    ).toBe(false);
    // A playground with the option is no demo.
    expect(
      isolated(
        '<ng-doc-playground id="x"><div id="options">{"isolated":true}</div></ng-doc-playground>',
      ),
    ).toBe(false);
  });

  test('a guide without demos gets no demo pages, even with the site options', () => {
    const { root, configuration } = workspace({ pages: 'all' });
    const entry = guide(root);
    const page = createOutputAssembler().assemblePage({
      configuration,
      entry,
      content: [
        linked(entry.id, 'header', 'header', '<h1>Start</h1>'),
        linked(entry.id, 'guide-tab', 'tab:index', '<p>Text</p>'),
      ],
      semantics: { demos: {}, playgrounds: [] },
    });
    expect(page.diagnostics).toEqual([]);
    expect(page.routes[0]).not.toHaveProperty('demoModulePath');
    const aggregate = createOutputAssembler().aggregate({
      configuration,
      artifacts: [],
      entries: [entry],
      keywords: [],
    });
    expect(aggregate.outputs.map((item) => item.path)).not.toContain('demo-app.ts');
  });
});

/** The index of a site with demo pages: the demo modules stay in the Angular compilation. */
const EXPECTED_INDEX =
  "export * from './context';\nexport * from './routes';\n" +
  "// Keeps the demo application's modules, the demo routes and the module of `demoProviders`, in the\n" +
  "// application's Angular compilation, which compiles them: only the demo application imports them.\n" +
  "import type {} from './demo-app';\n";

/** See the first test. */
const BASE_DIGEST = '452f5ad4bf935a23e51256de5d7c206f22cf957d6b3f05e58dbe20cd976be3dd';

/**
 * A `playground` action as the content compiler writes it and the HTML pipeline keeps it.
 */
function playgroundAction(id: string, selectors: string, options: object): string {
  const json = JSON.stringify(options).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return (
    `<ng-doc-playground id="${id}" indexable="false" class="ngde">` +
    `<div id="selectors" class="ngde">${selectors}</div><div id="pipeName" class="ngde"></div>` +
    `<div id="data" class="ngde">{&#x22;label&#x22;:{&#x22;type&#x22;:&#x22;string&#x22;}}</div>` +
    `<div id="options" class="ngde">${json}</div></ng-doc-playground>`
  );
}

function playground(
  id: string,
  target: { selector: string } | { pipeName: string },
  isolated?: true,
): GuideSemantics['playgrounds'][number] {
  const keys = 'pipeName' in target ? [target.pipeName] : target.selector.split(',');
  return {
    id,
    target: { source: 'button.ts', exportName: 'Button' },
    standalone: true,
    ...target,
    template: '<ng-doc-selector></ng-doc-selector>',
    templatesBySelector: Object.fromEntries(keys.map((key) => [key, `<${key}></${key}>`])),
    properties: { label: { type: 'string' } },
    content: {},
    ...(isolated ? { isolated } : {}),
  };
}

const BUTTON = 'button[ngDocButton],a[ngDocButton]';

function playgroundSemantics(
  playgrounds: GuideSemantics['playgrounds'],
  demos: GuideSemantics['demos'] = SEMANTICS.demos,
): GuideSemantics {
  return { demos, playgrounds };
}

describe('playground pages', () => {
  // A site that doesn't opt in generates exactly what the engine generated before playground
  // pages existed: the digest was taken from the base engine (its outputs module and templates,
  // before isolated playgrounds) with this fixture.
  test('a site without isolated playgrounds generates the same bytes as before', () => {
    const { root, configuration } = workspace();
    const { page, aggregate, outputs } = assemble(
      configuration,
      root,
      `<p>Intro</p>${demoAction('ButtonDemo', { expanded: true })}${playgroundAction(
        'ButtonPlayground',
        BUTTON,
        { isolated: false, selectors: 'button[ngDocButton]' },
      )}`,
      playgroundSemantics([
        playground('ButtonPlayground', { selector: BUTTON }),
        playground('PipePlayground', { pipeName: 'currency' }),
      ]),
    );
    expect([...page.diagnostics, ...aggregate.diagnostics]).toEqual([]);
    expect(outputs.map((item) => item.path)).not.toContain('guides/start/demo-routes.ts');
    expect(outputs.map((item) => item.path)).not.toContain('demo-app.ts');
    expect(page.routes[0]).not.toHaveProperty('playgroundPages');
    expect(digest(outputs, root)).toBe(BASE_PLAYGROUND_DIGEST);
    // With isolated demos only (`isolatedDemos`), the guide gets demo pages and no playground
    // page: the bytes of the base engine too.
    const site = workspace({ pages: 'all', isolated: true });
    const demos = assemble(
      site.configuration,
      site.root,
      `<p>Intro</p>${demoAction('ButtonDemo', { expanded: true })}`,
      playgroundSemantics([playground('ButtonPlayground', { selector: BUTTON })]),
    );
    expect(byPath(demos.outputs, 'guides/start/demo-routes.ts')).not.toContain('playground');
    expect(digest(demos.outputs, site.root)).toBe(BASE_ISOLATED_DEMOS_DIGEST);
  });

  test('an isolated playground action gives its guide playground and demo pages', () => {
    const { root, configuration } = workspace();
    const { page, aggregate, outputs } = assemble(
      configuration,
      root,
      `<p>Intro</p>${playgroundAction('ButtonPlayground', BUTTON, { isolated: true })}`,
      playgroundSemantics([
        playground('ButtonPlayground', { selector: BUTTON }),
        playground('PipePlayground', { pipeName: 'currency' }),
      ]),
    );
    expect(aggregate.diagnostics).toEqual([]);
    expect(page.diagnostics.map((item) => item.code)).toEqual(['OUTPUT_DEMO_NAME_INVALID']);
    expect(page.routes[0].demoModulePath).toBe('guides/start/demo-routes.ts');
    // The demos of the page get their pages too: the page has a demo route.
    expect(page.routes[0].demoNames).toEqual(['ButtonDemo']);
    expect(page.routes[0].playgroundPages).toEqual([
      'playground/ButtonPlayground/button-ngdocbutton',
      'playground/ButtonPlayground/a-ngdocbutton',
      'playground/PipePlayground/currency',
    ]);

    const routes = byPath(outputs, 'guides/start/demo-routes.ts');
    expect(routes).toContain("import {NgDocDemoHostComponent} from '@ng-doc/app/demo-app';");
    expect(routes).toContain(
      "import {NgDocPlaygroundHostComponent} from '@ng-doc/app/components/playground';",
    );
    expect(routes).toContain("import {PLAYGROUND_PROVIDERS} from './playgrounds';");
    expect(routes).toContain('providers: [PLAYGROUND_PROVIDERS, ...(entry.providers ?? [])],');
    expect(routes).toContain("path: 'ButtonDemo',");
    for (const [path, data] of [
      [
        'playground/ButtonPlayground/button-ngdocbutton',
        '{"id":"ButtonPlayground","selector":"button[ngDocButton]"}',
      ],
      [
        'playground/ButtonPlayground/a-ngdocbutton',
        '{"id":"ButtonPlayground","selector":"a[ngDocButton]"}',
      ],
      ['playground/PipePlayground/currency', '{"id":"PipePlayground","pipeName":"currency"}'],
    ]) {
      expect(routes).toContain(
        [
          `      path: '${path}',`,
          '      component: NgDocPlaygroundHostComponent,',
          `      title: \`Start: ${path.split('/')[1]}\`,`,
          `      data: {ngDocPlayground: ${data}},`,
        ].join('\n'),
      );
    }
    // Demo routes first, then the playground routes in the order of the playgrounds.
    expect(routes.indexOf("path: 'ButtonDemo'")).toBeLessThan(routes.indexOf("path: 'playground"));

    const tab = byPath(outputs, 'guides/start/index/page.ts');
    expect(tab).toContain("readonly demoRoute: string = 'demo-preview/docs/outer/inner/start';");
    expect(tab).not.toContain('isolatedPlaygrounds');
    expect(tab).not.toContain('isolatedDemos');

    const application = byPath(outputs, 'demo-app.ts');
    expect(application).toContain(
      'export const NG_DOC_DEMO_PAGES: string[] = [' +
        '"demo-preview/docs/outer/inner/start/ButtonDemo",' +
        '"demo-preview/docs/outer/inner/start/playground/ButtonPlayground/button-ngdocbutton",' +
        '"demo-preview/docs/outer/inner/start/playground/ButtonPlayground/a-ngdocbutton",' +
        '"demo-preview/docs/outer/inner/start/playground/PipePlayground/currency"];',
    );
    expect(application).toContain("loadChildren: () => import('./guides/start/demo-routes'),");
    expect(byPath(outputs, 'index.ts')).toBe(EXPECTED_INDEX);
    expectValidTypeScript(outputs);
  });

  test('a playground isolated in the page configuration gives its guide playground pages', () => {
    const { root, configuration } = workspace();
    const { page, outputs } = assemble(
      configuration,
      root,
      '<p>No playground action</p>',
      playgroundSemantics(
        [
          playground('ButtonPlayground', { selector: BUTTON }, true),
          playground('Other', { selector: 'ng-doc-other' }),
        ],
        {},
      ),
    );
    expect(page.diagnostics).toEqual([]);
    expect(page.routes[0].demoNames).toEqual([]);
    expect(page.routes[0].playgroundPages).toEqual([
      'playground/ButtonPlayground/button-ngdocbutton',
      'playground/ButtonPlayground/a-ngdocbutton',
      'playground/Other/ng-doc-other',
    ]);
    // Without demos the routes need no demo host.
    const routes = byPath(outputs, 'guides/start/demo-routes.ts');
    expect(routes).not.toContain('NgDocDemoHostComponent');
    expect(routes).not.toContain('ngDocDemo:');
    // The page has a demo route for its playground pages alone.
    expect(byPath(outputs, 'guides/start/index/page.ts')).toContain(
      "readonly demoRoute: string = 'demo-preview/docs/outer/inner/start';",
    );
    expectValidTypeScript(outputs);
  });

  test('every playground gets pages with the site options, under their path', () => {
    const { root, configuration } = workspace({
      playgroundPages: 'all',
      isolatedPlaygrounds: true,
      path: 'previews',
    });
    const { page, outputs } = assemble(
      configuration,
      root,
      '<p>Text</p>',
      playgroundSemantics([playground('ButtonPlayground', { selector: 'ng-doc-button' })], {}),
    );
    expect(page.routes[0].playgroundPages).toEqual(['playground/ButtonPlayground/ng-doc-button']);
    const tab = byPath(outputs, 'guides/start/index/page.ts');
    expect(tab).toContain("readonly demoRoute: string = 'previews/docs/outer/inner/start';");
    expect(tab).toContain('readonly isolatedPlaygrounds: boolean = true;');
    expect(tab).not.toContain('isolatedDemos');
    expect(byPath(outputs, 'demo-app.ts')).toContain(
      'export const NG_DOC_DEMO_PAGES: string[] = ' +
        '["previews/docs/outer/inner/start/playground/ButtonPlayground/ng-doc-button"];',
    );
    // A guide without playgrounds gets no playground page, even with the site options.
    const none = assemble(configuration, root, '<p>Text</p>', playgroundSemantics([], {}));
    expect(none.outputs.map((item) => item.path)).not.toContain('guides/start/demo-routes.ts');
    expect(byPath(none.outputs, 'guides/start/index/page.ts')).not.toContain('demoRoute');
  });

  test('no guide gets playground pages when demoApplication is false', () => {
    const { root, configuration } = workspace({ pages: 'none' });
    const { outputs } = assemble(
      configuration,
      root,
      playgroundAction('ButtonPlayground', BUTTON, { isolated: true }),
      playgroundSemantics([playground('ButtonPlayground', { selector: BUTTON }, true)]),
    );
    expect(outputs.map((item) => item.path)).not.toContain('guides/start/demo-routes.ts');
    expect(outputs.map((item) => item.path)).not.toContain('demo-app.ts');
    expect(byPath(outputs, 'guides/start/index/page.ts')).not.toContain('demoRoute');
  });

  test('targets take the URL segments of the page, in the order of its selectors', () => {
    const { root, configuration } = workspace({ playgroundPages: 'all' });
    const { page, outputs } = assemble(
      configuration,
      root,
      '',
      playgroundSemantics(
        [
          // Empty selectors are left out, as the page leaves them out; equal segments are
          // numbered in selector order; a selector without letters or digits is `target`.
          playground('Collide', { selector: "x-y, x_y,,X-Y ,[type='*'], ::" }),
          playground('Pipe', { pipeName: 'myPipe' }),
        ],
        {},
      ),
    );
    expect(page.routes[0].playgroundPages).toEqual([
      'playground/Collide/x-y',
      'playground/Collide/x-y-2',
      'playground/Collide/x-y-3',
      'playground/Collide/type',
      'playground/Collide/target',
      'playground/Pipe/mypipe',
    ]);
    const routes = byPath(outputs, 'guides/start/demo-routes.ts');
    expect(routes).toContain('data: {ngDocPlayground: {"id":"Collide","selector":"x_y"}},');
    expect(routes).toContain('data: {ngDocPlayground: {"id":"Collide","selector":"X-Y"}},');
    expect(routes).toContain(
      'data: {ngDocPlayground: {"id":"Collide","selector":"[type=\'*\']"}},',
    );
    expect(routes).toContain('data: {ngDocPlayground: {"id":"Pipe","pipeName":"myPipe"}},');
    expectValidTypeScript(outputs);
  });

  test('a demo named like the playground segment, or a playground without a URL name, gets no page', () => {
    const { root, configuration } = workspace({ playgroundPages: 'all' });
    const semantics = playgroundSemantics(
      [
        playground('Odd playground', { selector: 'ng-doc-odd' }),
        playground('ButtonPlayground', { selector: 'ng-doc-button' }),
      ],
      { playground: [], ButtonDemo: [] },
    );
    const { page, outputs } = assemble(configuration, root, '', semantics);
    expect(page.diagnostics).toEqual([
      expect.objectContaining({
        code: 'OUTPUT_PLAYGROUND_NAME_INVALID',
        severity: 'warning',
        ownerId: 'guide:start',
      }),
      expect.objectContaining({
        code: 'OUTPUT_DEMO_NAME_RESERVED',
        severity: 'warning',
        ownerId: 'guide:start',
      }),
    ]);
    expect(page.routes[0].demoNames).toEqual(['ButtonDemo']);
    expect(page.routes[0].playgroundPages).toEqual(['playground/ButtonPlayground/ng-doc-button']);
    expect(byPath(outputs, 'guides/start/demo-routes.ts')).not.toContain('Odd playground');

    // A guide without playground pages keeps the page of such a demo: nothing collides.
    const other = workspace({ pages: 'all' });
    const demos = assemble(
      other.configuration,
      other.root,
      '',
      playgroundSemantics([], { playground: [] }),
    );
    expect(demos.page.diagnostics).toEqual([]);
    expect(demos.page.routes[0].demoNames).toEqual(['playground']);
  });

  test('reads isolated options only from playground actions, whatever their character references', () => {
    const { root, configuration } = workspace();
    const semantics = playgroundSemantics([playground('ButtonPlayground', { selector: BUTTON })]);
    const isolated = (html: string) =>
      assemble(configuration, root, html, semantics).outputs.some(
        (item) => item.path === 'guides/start/demo-routes.ts',
      );
    expect(
      isolated(
        '<ng-doc-playground id="ButtonPlayground"><div id="selectors">a</div>' +
          '<div id="options">{&#x22;isolated&#34;:true}</div></ng-doc-playground>',
      ),
    ).toBe(true);
    expect(isolated(playgroundAction('ButtonPlayground', BUTTON, { isolated: 'yes' }))).toBe(false);
    expect(
      isolated(
        '<ng-doc-playground id="ButtonPlayground"><div id="options">{oops</div></ng-doc-playground>',
      ),
    ).toBe(false);
    expect(
      isolated(
        '<ng-doc-playground id="ButtonPlayground"><div id="data">{}</div></ng-doc-playground>',
      ),
    ).toBe(false);
    // A demo with the option is no playground: it gives demo pages, without playground pages.
    const demo = assemble(
      configuration,
      root,
      demoAction('ButtonDemo', { isolated: true }),
      semantics,
    );
    expect(demo.page.routes[0].demoNames).toEqual(['ButtonDemo']);
    expect(demo.page.routes[0]).not.toHaveProperty('playgroundPages');
  });
});

/** See the first playground test: the base engine's bytes of a guide with a playground. */
const BASE_PLAYGROUND_DIGEST = '1caab32465341b19ab2370b6b22becc0ed64da4154642e1a116baa2c17c3c152';
/** See the first playground test: the base engine's bytes of a site with isolated demos. */
const BASE_ISOLATED_DEMOS_DIGEST =
  'ba2247ec17f5c6d9d9651ab04841a3c012fdc980d8afef133f5a3054ed1a533b';
