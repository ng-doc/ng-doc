import { create } from '@orama/orama';
import { type NodeContent, defaultHtmlSchema, populate } from '@orama/plugin-parsedoc';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nunjucks from 'nunjucks';
import { parseFragment } from 'parse5';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ContentCompilerServices,
  ContentDescriptor,
  ContentDescriptorProvenance,
  ContentIR,
  DeclarationDescriptor,
  JsonValue,
  KeywordExport,
  SearchRecord,
  TemplateActions,
  TemplateEvaluationService,
  TemplateRequest,
} from '../../contracts';
import { hostPath } from '../../kernel/paths';
import { GeneratorContentCompiler, linkedKeywordDigest } from '../content-compiler';

// The generator loads the HTML utilities lazily (see content-compiler.ts); so does this test.
const { removeNotIndexableContent } = await import('@ng-doc/utils');

const configuration = {
  projectId: 'test',
  workspaceRoot: '/',
  docsRoots: ['/'],
  tsConfig: '/tsconfig.json',
  outputRoot: '/out',
  cacheRoot: '/cache',
  routePrefix: 'docs',
  guideDirectory: 'guides',
  apiDirectory: 'api',
  assetDirectory: 'assets',
  inlineStyleLanguage: 'CSS' as const,
  anchorHeadings: ['h1', 'h2'] as Array<'h1' | 'h2'>,
  themes: { light: 'github-light', dark: 'ayu-dark' },
  cacheEnabled: false,
  digest: 'config',
  executables: [],
};

const templates: TemplateEvaluationService = {
  render(request: TemplateRequest, actions: TemplateActions) {
    const env = new nunjucks.Environment(
      new nunjucks.FileSystemLoader(request.scope, { noCache: true }),
      { autoescape: false },
    );
    env.addGlobal('NgDocActions', {
      ...Object.fromEntries(
        ['demo', 'demoPane', 'playground'].map((name) => [
          name,
          (...args: JsonValue[]) => actions.invoke('NgDocActions', name, args),
        ]),
      ),
    });
    try {
      return {
        value: env.renderString(request.text, {
          ...request.values,
          NgDocPage: { title: request.values.title },
        }),
        dependencies: [],
        diagnostics: [],
      };
    } catch (error) {
      return {
        dependencies: [],
        diagnostics: [
          { code: 'TEMPLATE', severity: 'error', stage: 'content', message: String(error) },
        ],
      };
    }
  },
};

function services(): ContentCompilerServices {
  return {
    configuration,
    templates,
    semantic: {
      synchronize: async () => ({ value: null, dependencies: [], diagnostics: [] }),
      enumerateApi: () => ({ dependencies: [], diagnostics: [] }),
      describeGuide: () => ({
        value: { demos: { Demo: [] }, playgrounds: [] },
        dependencies: [],
        diagnostics: [],
      }),
      renderFragment: (request) => ({
        value:
          request.kind === 'entry-doc'
            ? {
                format: 'value',
                value: { description: 'Guide <strong>description</strong>.', tags: {} },
              }
            : request.kind === 'api-header'
              ? { format: 'html', value: '<h1>API header</h1>' }
              : { format: 'html', value: '<p>fragment</p>' },
        dependencies: [],
        diagnostics: [],
      }),
      dispose: async () => {},
    },
  };
}

/** The previous implementation: index into a throw-away Orama database, then read it back. */
async function oramaSearchRecords(
  html: string,
  request: { ir: ContentIR; breadcrumbs: string[]; pageType: 'guide' | 'api' },
) {
  interface Parsed {
    type: string;
    content: string;
    properties?: Record<string, unknown>;
  }
  const database = await create({ schema: { ...defaultHtmlSchema } });
  await populate(database, html, 'html', {
    transformFn: (node: NodeContent) =>
      ['strong', 'a', 'time', 'span', 'small', 'b', 'p', 'ul'].includes(node.tag)
        ? { ...node, raw: `<p>${node.content}</p>` }
        : node,
    mergeStrategy: 'split',
  });
  const records: unknown[] = [];
  let section: Parsed | undefined;
  for (const document of Object.values(
    database.data.docs.docs as unknown as Record<string, Parsed>,
  )) {
    if (!document?.content?.trim()) continue;
    if (
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(document.type) &&
      !!document.properties?.['id']
    ) {
      section = document;
      continue;
    }
    const fragment = section?.properties?.['id'];
    records.push({
      breadcrumbs: request.breadcrumbs,
      pageType: request.pageType,
      // The legacy engine trims the title and the section name in the same way (`build-indexes.ts`).
      title: request.ir.title.trim(),
      section: (section?.content ?? '').trim(),
      route: request.ir.absoluteRoute,
      ...(typeof fragment === 'string' && fragment ? { fragment } : {}),
      content: document.content,
    });
  }
  return records;
}

function expectJsonSafe(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toStrictEqual(value);
}

describe('GeneratorContentCompiler', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'content.compiler.'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = (markdown: string) => ({
    id: 'guide',
    kind: 'guide' as const,
    source: { path: path.join(root, 'guide.ts') },
    title: 'Guide',
    route: 'guide',
    absoluteRoute: 'docs/guide',
    breadcrumbs: ['Guide'],
    runtimeImport: { source: path.join(root, 'guide.ts'), exportName: 'default' },
    dependencies: [],
    markdown: [markdown],
    hasImports: false,
  });
  const declaration = (overrides: Partial<DeclarationDescriptor> = {}): DeclarationDescriptor => ({
    id: 'decl',
    apiEntryId: 'api-entry',
    scopeId: 'scope',
    source: { path: '/api.ts' },
    name: 'Thing',
    kind: 'class',
    route: 'api/thing',
    breadcrumbs: ['API'],
    exportedKeywords: [{ key: 'Thing', title: 'Thing', path: 'api/thing' }],
    ...overrides,
  });
  const provenance = (
    ownerId: string,
    ordinal: number,
    closureIds: string[],
    ownerInputDigest = 'owner-input',
  ): ContentDescriptorProvenance => ({
    ownerId,
    ordinal,
    ownerInputDigest,
    compilerVersion: 'compiler',
    toolchainDigest: 'toolchain',
    configurationDigest: configuration.digest,
    closureIds,
  });
  const guideId = (ownerId: string, markdown: string): string =>
    `${ownerId}:tab:${createHash('sha256').update(JSON.stringify(markdown)).digest('hex')}`;

  it('describes raw guide metadata without invoking heavy services and compiles with parity', async () => {
    const markdown = path.join(root, 'described.md');
    fs.writeFileSync(
      markdown,
      '---\ntitle: "{{ Literal }}"\nroute: child\nkeyword: guide\nicon: book\n---\n# Heading\n\nBody.',
    );
    const calls = { template: 0, fragment: 0, guide: 0 };
    const local = services();
    const render = local.templates.render.bind(local.templates);
    local.templates = {
      render: (...args) => {
        calls.template += 1;
        return render(...args);
      },
    };
    const renderFragment = local.semantic.renderFragment.bind(local.semantic);
    const describeGuide = local.semantic.describeGuide.bind(local.semantic);
    local.semantic = {
      ...local.semantic,
      renderFragment: (...args) => {
        calls.fragment += 1;
        return renderFragment(...args);
      },
      describeGuide: (...args) => {
        calls.guide += 1;
        return describeGuide(...args);
      },
    };
    const ownerId = 'owner-guide';
    const request = {
      kind: 'guide-tab' as const,
      id: guideId(ownerId, markdown),
      entry: entry(markdown),
      markdown,
    };
    const compiler = new GeneratorContentCompiler(local);
    const described = await compiler.describe(
      request,
      provenance(ownerId, 1, [`${ownerId}:header`]),
      new AbortController().signal,
    );

    expect(described.diagnostics).toEqual([]);
    expect(calls).toEqual({ template: 0, fragment: 0, guide: 0 });
    expect(described.value).toMatchObject({
      schemaVersion: 4,
      id: request.id,
      ownerId,
      ordinal: 1,
      role: 'guide-tab',
      locator: { kind: 'guide-tab', markdown },
      title: '{{ Literal }}',
      route: 'child',
      absoluteRoute: 'docs/guide/child',
      searchBreadcrumbs: ['Guide', '{{ Literal }}'],
      keyword: 'guide',
      icon: 'book',
      closureIds: [`${ownerId}:header`],
      dependencies: [{ kind: 'content', path: markdown }],
    });
    expect(described.value?.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(described.value?.requestDigest).toMatch(/^[a-f0-9]{64}$/);
    expectJsonSafe(described.value);

    const compiled = await compiler.compile(request, new AbortController().signal, described.value);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.value).toMatchObject({
      id: request.id,
      title: described.value?.title,
      route: described.value?.route,
      absoluteRoute: described.value?.absoluteRoute,
      searchBreadcrumbs: described.value?.searchBreadcrumbs,
    });
    expect(compiled.value?.exportedKeywords).toContainEqual(
      expect.objectContaining({ key: '*guide', path: 'docs/guide/child' }),
    );
    expect(calls.template).toBe(1);
  });

  it('describes custom and API-entry headers without evaluating templates or semantic fragments', async () => {
    const markdown = path.join(root, 'header-owner.md');
    const headerTemplate = path.join(root, 'header.nunj');
    fs.writeFileSync(markdown, '# Body');
    fs.writeFileSync(headerTemplate, '<h1>{{ title }}</h1>');
    const calls = { template: 0, fragment: 0 };
    const local = services();
    local.configuration = { ...configuration, workspaceRoot: root, headerTemplate };
    const render = local.templates.render.bind(local.templates);
    local.templates = {
      render: (...args) => {
        calls.template += 1;
        return render(...args);
      },
    };
    const renderFragment = local.semantic.renderFragment.bind(local.semantic);
    local.semantic = {
      ...local.semantic,
      renderFragment: (...args) => {
        calls.fragment += 1;
        return renderFragment(...args);
      },
    };
    const apiEntry = {
      ...entry(markdown),
      id: 'api-entry',
      kind: 'api' as const,
      scopes: [],
    };
    const ownerId = 'owner-api-entry';
    const request = { kind: 'header' as const, id: `${ownerId}:header`, entry: apiEntry };
    const compiler = new GeneratorContentCompiler(local);
    const described = await compiler.describe(
      request,
      provenance(ownerId, 0, []),
      new AbortController().signal,
    );

    expect(described.diagnostics).toEqual([]);
    expect(calls).toEqual({ template: 0, fragment: 0 });
    expect(described.value).toMatchObject({
      role: 'header',
      locator: { kind: 'header' },
      title: 'Guide',
      route: 'guide',
      absoluteRoute: 'docs/guide',
      searchBreadcrumbs: ['Guide'],
      dependencies: [{ kind: 'content', path: headerTemplate }],
    });

    const compiled = await compiler.compile(request, new AbortController().signal, described.value);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.value).toMatchObject({ role: 'header', title: 'Guide' });
    expect(calls).toEqual({ template: 1, fragment: 1 });
  });

  it('describes API slots from declaration metadata without physical or heavy dependencies', async () => {
    const calls = { template: 0, fragment: 0 };
    const local = services();
    local.templates = {
      render: () => {
        calls.template += 1;
        throw new Error('descriptor must not render');
      },
    };
    local.semantic = {
      ...local.semantic,
      renderFragment: () => {
        calls.fragment += 1;
        throw new Error('descriptor must not render a fragment');
      },
    };
    const ownerId = 'owner-declaration';
    const compiler = new GeneratorContentCompiler(local);
    const api = await compiler.describe(
      { kind: 'api-tab', id: `${ownerId}:api`, declaration: declaration() },
      provenance(ownerId, 1, [`${ownerId}:header`]),
      new AbortController().signal,
    );
    const header = await compiler.describe(
      { kind: 'header', id: `${ownerId}:header`, entry: declaration() },
      provenance(ownerId, 0, []),
      new AbortController().signal,
    );

    expect(calls).toEqual({ template: 0, fragment: 0 });
    expect(api.value).toMatchObject({
      role: 'api-tab',
      locator: { kind: 'api-tab', declarationId: 'decl' },
      title: 'Thing',
      route: 'api/thing',
      absoluteRoute: 'api/thing',
      searchBreadcrumbs: ['API'],
      dependencies: [],
    });
    expect(header.value).toMatchObject({
      role: 'header',
      locator: { kind: 'header' },
      title: 'Thing',
      dependencies: [],
    });
  });

  it('retains existence observations for missing descriptor inputs and honors cancellation', async () => {
    const markdown = path.join(root, 'missing-description.md');
    const ownerId = 'owner-missing';
    const request = {
      kind: 'guide-tab' as const,
      id: guideId(ownerId, markdown),
      entry: entry(markdown),
      markdown,
    };
    const compiler = new GeneratorContentCompiler(services());
    const missing = await compiler.describe(
      request,
      provenance(ownerId, 1, [`${ownerId}:header`]),
      new AbortController().signal,
    );
    expect(missing.value).toBeUndefined();
    expect(missing.dependencies).toEqual([{ kind: 'existence', path: markdown, exists: false }]);
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({ code: 'CONTENT_READ' }));

    const aborted = new AbortController();
    aborted.abort();
    const cancelled = await compiler.describe(
      request,
      provenance(ownerId, 1, [`${ownerId}:header`]),
      aborted.signal,
    );
    expect(cancelled.value).toBeUndefined();
    expect(cancelled.dependencies).toEqual([]);
    expect(cancelled.diagnostics).toEqual([expect.objectContaining({ code: 'CONTENT_ABORTED' })]);
  });

  it('rejects invalid provenance and stale descriptors before publishing heavy content', async () => {
    const markdown = path.join(root, 'stale.md');
    fs.writeFileSync(markdown, '---\ntitle: First\n---\n# First');
    let renders = 0;
    const local = services();
    const render = local.templates.render.bind(local.templates);
    local.templates = {
      render: (...args) => {
        renders += 1;
        return render(...args);
      },
    };
    const ownerId = 'owner-stale';
    const request = {
      kind: 'guide-tab' as const,
      id: guideId(ownerId, markdown),
      entry: entry(markdown),
      markdown,
    };
    const compiler = new GeneratorContentCompiler(local);
    const invalid = await compiler.describe(
      request,
      provenance(ownerId, 0, []),
      new AbortController().signal,
    );
    expect(invalid.value).toBeUndefined();
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_DESCRIPTOR_PROVENANCE' }),
    );

    const described = await compiler.describe(
      request,
      provenance(ownerId, 1, [`${ownerId}:header`]),
      new AbortController().signal,
    );
    for (const tampered of [
      { ...described.value!, title: 'Forged' },
      { ...described.value!, ownerId: 'another-owner' },
      { ...described.value!, locator: { kind: 'guide-tab' as const, markdown: '/other.md' } },
      { ...described.value!, closureIds: [] },
      { ...described.value!, requestDigest: 'not-a-digest' },
    ] satisfies ContentDescriptor[]) {
      const rejected = await compiler.compile(request, new AbortController().signal, tampered);
      expect(rejected.value).toBeUndefined();
      expect(rejected.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'CONTENT_DESCRIPTOR_STALE' }),
      );
    }
    expect(renders).toBe(0);

    fs.writeFileSync(markdown, '---\ntitle: Second\n---\n# Second');
    const stale = await compiler.compile(request, new AbortController().signal, described.value);
    expect(stale.value).toBeUndefined();
    expect(stale.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_DESCRIPTOR_STALE' }),
    );
    expect(stale.dependencies).toEqual([
      expect.objectContaining({ kind: 'content', path: markdown }),
    ]);
    expect(renders).toBe(0);
  });

  it('rejects a physical edit between descriptor validation and the heavy read', async () => {
    const markdown = path.join(root, 'raced.md');
    fs.writeFileSync(markdown, '# Before');
    const ownerId = 'owner-race';
    const request = {
      kind: 'guide-tab' as const,
      id: guideId(ownerId, markdown),
      entry: entry(markdown),
      markdown,
    };
    const compiler = new GeneratorContentCompiler(services());
    const described = await compiler.describe(
      request,
      provenance(ownerId, 1, [`${ownerId}:header`]),
      new AbortController().signal,
    );
    let observations = 0;
    const signal = {
      get aborted() {
        observations += 1;
        if (observations === 2) fs.writeFileSync(markdown, '# After');
        return false;
      },
    } as AbortSignal;
    const raced = await compiler.compile(request, signal, described.value);

    expect(raced.value).toBeUndefined();
    expect(raced.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_DESCRIPTOR_STALE' }),
    );
    expect(raced.dependencies[0]).toMatchObject({
      kind: 'content',
      path: markdown,
      digest: createHash('sha256').update('# After').digest('hex'),
    });
  });

  it('keeps action configuration inside custom elements after Markdown and HTML processing', async () => {
    const markdown = path.join(root, 'actions.md');
    const source = path.join(root, 'demo.ts');
    fs.writeFileSync(source, 'export class Demo {}');
    fs.writeFileSync(
      markdown,
      '{{ NgDocActions.demo("Demo", {expanded: true}) }}\n\n{{ NgDocActions.demoPane("Demo", {expanded: false}) }}\n\n{{ NgDocActions.playground("Play", {hideSidePanel: true}) }}',
    );
    const ports = services();
    ports.semantic.describeGuide = () => ({
      value: {
        demos: { Demo: [] },
        playgrounds: [
          {
            id: 'Play',
            target: { source, exportName: 'Demo' },
            standalone: true,
            selector: 'demo-element',
            template: '<demo-element></demo-element>',
            templatesBySelector: { 'demo-element': '<demo-element></demo-element>' },
            properties: { label: { type: 'string', inputName: 'label' } },
            content: {},
          },
        ],
      },
      dependencies: [],
      diagnostics: [],
    });
    const result = await new GeneratorContentCompiler(ports).compile(
      { kind: 'guide-tab', id: 'actions', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
    const tree = parseFragment(result.value!.html);
    const find = (node: any, predicate: (value: any) => boolean): any =>
      predicate(node)
        ? node
        : (node.childNodes ?? []).map((child: any) => find(child, predicate)).find(Boolean);
    const element = (name: string) => find(tree, (node) => node.tagName === name);
    const json = (node: any, id: string) => {
      const value = find(node, (child) =>
        child.attrs?.some((attr: any) => attr.name === 'id' && attr.value === id),
      );
      expect(value).toBeDefined();
      return JSON.parse(value.childNodes.map((child: any) => child.value ?? '').join(''));
    };
    expect(json(element('ng-doc-demo'), 'options')).toEqual({ expanded: true });
    expect(json(element('ng-doc-demo-pane'), 'options')).toEqual({ expanded: false });
    expect(json(element('ng-doc-playground'), 'options')).toEqual({ hideSidePanel: true });
    expect(json(element('ng-doc-playground'), 'data')).toEqual({
      label: { type: 'string', inputName: 'label' },
    });
  });

  it('renders real front matter, Nunjucks action output, Unicode headings and keyword uses', async () => {
    const markdown = path.join(root, 'page.md');
    fs.writeFileSync(
      markdown,
      '---\ntitle: Tab\nroute: tab\nkeyword: guide\n---\n# Привет мир\n\n{{ NgDocActions.demo("Demo") }}\n\nSee `Known` and `Missing`.\n',
    );
    const result = await new GeneratorContentCompiler(services()).compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.title).toBe('Tab');
    expect(result.value?.route).toBe('tab');
    expect(result.value?.absoluteRoute).toBe('docs/guide/tab');
    expect(result.value?.searchBreadcrumbs).toEqual(['Guide', 'Tab']);
    expect(result.value?.html).toContain('id="привет-мир"');
    expect(result.value?.html).toContain('ng-doc-heading-anchor');
    expect(result.value?.anchors).toEqual([
      expect.objectContaining({
        anchor: 'привет-мир',
        anchorId: 'привет-мир',
        title: 'Привет мир',
      }),
    ]);
    expect(result.value?.exportedKeywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: '*guide', title: 'Guide - Tab', path: 'docs/guide/tab' }),
        expect.objectContaining({ key: '*guide#привет-мир', path: 'docs/guide/tab#привет-мир' }),
      ]),
    );
    expect(result.value?.html).toContain('ng-doc-demo');
    expect(result.value?.usedKeywords).toEqual(['Known', 'Missing']);
    expectJsonSafe(result.value);
  });

  it('links known keywords, retains missing uses, and creates search records', async () => {
    const markdown = path.join(root, 'page.md');
    fs.writeFileSync(markdown, '# Heading\nA prose body with `Known` and `Missing`.');
    const compiler = new GeneratorContentCompiler(services());
    const compiled = await compiler.compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    const linked = await compiler.link(
      {
        ir: compiled.value!,
        keywords: [{ key: 'Known', title: 'Known title', path: 'docs/known', type: 'link' }],
        breadcrumbs: ['Guide'],
        pageType: 'guide',
      },
      new AbortController().signal,
    );
    expect(linked.value?.html).toContain('href="docs/known"');
    expect(linked.value?.html).toContain('Missing');
    expect(linked.value?.searchRecords[0]?.content).toContain('prose body');
  });

  it('fails a link with unknown keys and links once the keyword set has them', async () => {
    const compiler = new GeneratorContentCompiler(services());
    const ir: ContentIR = {
      schemaVersion: 4,
      id: 'later-keywords',
      entryId: 'guide',
      role: 'guide-tab',
      title: 'Guide',
      route: '',
      absoluteRoute: 'docs/guide',
      html: '<p><code>Known</code> <code>*later</code> <code>Thing#later</code></p>',
      anchors: [],
      exportedKeywords: [],
      usedKeywords: ['Known', '*later', 'Thing#later'],
      dependencies: [],
      diagnostics: [],
    };
    const keywords = [
      { key: 'Known', title: 'Known title', path: 'docs/known', type: 'link' as const },
      { key: 'Thing', title: 'Thing', path: 'api/thing' },
    ];
    const complete = await compiler.link(
      { ir, keywords, breadcrumbs: ['Guide'], pageType: 'guide' },
      new AbortController().signal,
    );
    expect(complete.value).toBeUndefined();
    expect(complete.diagnostics).toContainEqual(expect.objectContaining({ code: 'CONTENT_LINK' }));

    const repaired = await compiler.link(
      {
        ir,
        keywords: [
          ...keywords,
          { key: '*later', title: 'Later guide', path: 'docs/later', type: 'link' as const },
          { key: 'Thing#later', title: 'Later member', path: 'api/thing#later' },
        ],
        breadcrumbs: ['Guide'],
        pageType: 'guide',
      },
      new AbortController().signal,
    );
    expect(repaired.diagnostics).toEqual([]);
    expect(repaired.value?.html).toContain('href="docs/known"');
    expect(repaired.value?.html).toContain('href="docs/later"');
    expect(repaired.value?.html).toContain('href="api/thing#later"');
  });

  it('exports no guide keywords without frontmatter keyword and uses the parent title for a default tab', async () => {
    const markdown = path.join(root, 'page.md');
    fs.writeFileSync(markdown, '---\nkeyword: root\n---\n# Anchor');
    const result = await new GeneratorContentCompiler(services()).compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(result.value?.absoluteRoute).toBe('docs/guide');
    expect(result.value?.searchBreadcrumbs).toEqual(['Guide']);
    expect(result.value?.exportedKeywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: '*root', title: 'Guide', path: 'docs/guide' }),
        expect.objectContaining({ key: '*root#anchor' }),
      ]),
    );
    fs.writeFileSync(markdown, '# Anchor');
    const noKeyword = await new GeneratorContentCompiler(services()).compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(noKeyword.value?.exportedKeywords).toEqual([]);
  });

  it('appends an explicit guide tab title even when it equals the parent breadcrumb', async () => {
    const markdown = path.join(root, 'same-title.md');
    fs.writeFileSync(markdown, '---\ntitle: Guide\n---\n# Same title');
    const result = await new GeneratorContentCompiler(services()).compile(
      { kind: 'guide-tab', id: 'same-title', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.searchBreadcrumbs).toEqual(['Guide', 'Guide']);
    expectJsonSafe(result.value);
  });

  it('records missing markdown existence and recovers on a later successful compile', async () => {
    const markdown = path.join(root, 'missing.md');
    const compiler = new GeneratorContentCompiler(services());
    const missing = await compiler.compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(missing.value).toBeUndefined();
    expect(missing.dependencies).toEqual([{ kind: 'existence', path: markdown, exists: false }]);
    fs.writeFileSync(markdown, '# Recovered');
    const recovered = await compiler.compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(recovered.value?.html).toContain('Recovered');
    expect(recovered.dependencies[0]).toMatchObject({ kind: 'content', path: markdown });
  });

  it('reports malformed front matter and every aborted request without creating a value', async () => {
    const markdown = path.join(root, 'page.md');
    fs.writeFileSync(markdown, '---\ntitle: [\n---\n# bad');
    const compiler = new GeneratorContentCompiler(services());
    const malformed = await compiler.compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(malformed.value).toBeUndefined();
    expect(malformed.diagnostics).toEqual([
      expect.objectContaining({ code: 'CONTENT_FRONTMATTER' }),
    ]);
    const controller = new AbortController();
    controller.abort();
    const aborted = await compiler.compile(
      { kind: 'header', id: 'header', entry: entry(markdown) },
      controller.signal,
    );
    expect(aborted.value).toBeUndefined();
    expect(aborted.diagnostics).toEqual([expect.objectContaining({ code: 'CONTENT_ABORTED' })]);
  });

  it('maps every NgDocApi and JSDoc action signature through the semantic port', () => {
    const calls: unknown[] = [];
    const local = services();
    local.semantic = {
      ...local.semantic,
      renderFragment: (request) => {
        calls.push(request);
        const value =
          request.kind === 'js-doc-has-tag'
            ? true
            : request.kind === 'js-doc-tags'
              ? ['<p>a</p>', '<p>b</p>']
              : '<p>fragment</p>';
        return {
          value: { format: 'value', value },
          dependencies: [{ kind: 'content', path: '/api.ts', digest: 'x' }],
          diagnostics: [],
        };
      },
    };
    const compiler = new GeneratorContentCompiler(local);
    const dependencies: any[] = [];
    const diagnostics: any[] = [];
    const actions = (compiler as any).actions('guide', dependencies, diagnostics);
    expect(actions.invoke('NgDocApi', 'api', ['Thing'])).toBe('<p>fragment</p>');
    expect(actions.invoke('NgDocApi', 'details', ['Thing'])).toBe('<p>fragment</p>');
    expect(actions.invoke('JSDoc', 'description', ['Thing'])).toBe('<p>fragment</p>');
    expect(actions.invoke('JSDoc', 'tag', ['Thing', 'remarks'])).toBe('<p>fragment</p>');
    expect(actions.invoke('JSDoc', 'tags', ['Thing', 'example'])).toEqual(['<p>a</p>', '<p>b</p>']);
    expect(actions.invoke('JSDoc', 'hasTag', ['Thing', 'returns'])).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'api' }),
        expect.objectContaining({ kind: 'api-details' }),
        expect.objectContaining({ kind: 'js-doc' }),
        expect.objectContaining({ kind: 'js-doc-tag', tag: 'remarks' }),
        expect.objectContaining({ kind: 'js-doc-tags', tag: 'example' }),
        expect.objectContaining({ kind: 'js-doc-has-tag', tag: 'returns' }),
      ]),
    );
    expect(dependencies).toHaveLength(6);
  });

  it('diagnoses unknown actions, unknown demos, missing playground sources, and empty semantic fragments', () => {
    const target = path.join(root, 'missing-playground.ts');
    const local = services();
    local.semantic = {
      ...local.semantic,
      describeGuide: () => ({
        value: {
          demos: {},
          playgrounds: [
            {
              id: 'Play',
              target: { source: target, exportName: 'Play' },
              standalone: true,
              template: '',
              templatesBySelector: {},
              properties: {},
              content: {},
            },
          ],
        },
        dependencies: [],
        diagnostics: [],
      }),
      renderFragment: () => ({ dependencies: [], diagnostics: [] }),
    };
    const compiler = new GeneratorContentCompiler(local);
    const dependencies: any[] = [];
    const diagnostics: any[] = [];
    const actions = (compiler as any).actions('guide', dependencies, diagnostics);
    expect(actions.invoke('NgDocActions', 'demo', ['Missing'])).toBe('');
    expect(actions.invoke('NgDocActions', 'playground', ['Missing'])).toBe('');
    expect(actions.invoke('NgDocActions', 'playground', ['Play'])).toContain('ng-doc-playground');
    expect(actions.invoke('NgDocActions', 'unknown', [])).toBe('');
    expect(actions.invoke('NgDocActions', 'demo', [1])).toBe('');
    expect(actions.invoke('NgDocApi', 'unknown', [])).toBe('');
    expect(actions.invoke('JSDoc', 'unknown', [])).toBe('');
    expect(actions.invoke('JSDoc', 'description', ['missing'])).toBe('');
    expect(diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'CONTENT_DEMO',
        'CONTENT_PLAYGROUND_SOURCE',
        'CONTENT_ACTION',
        'CONTENT_FRAGMENT',
      ]),
    );
    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'existence', path: target, exists: false }),
      ]),
    );
  });

  it('reports a failed guide query once, without follow-on unknown demo or playground errors', () => {
    const local = services();
    let queries = 0;
    const interrupted = {
      code: 'SEMANTIC_QUERY_INTERRUPTED',
      severity: 'error' as const,
      stage: 'semantic' as const,
      message: 'An earlier semantic query of this program was terminated',
    };
    local.semantic = {
      ...local.semantic,
      describeGuide: () => {
        queries++;
        return { dependencies: [], diagnostics: [interrupted] };
      },
    };
    const compiler = new GeneratorContentCompiler(local);
    const diagnostics: any[] = [];
    const actions = (compiler as any).actions('guide', [], diagnostics);
    expect(actions.invoke('NgDocActions', 'demo', ['ButtonDemo'])).toBe('');
    expect(actions.invoke('NgDocActions', 'demoPane', ['ButtonDemo'])).toBe('');
    expect(actions.invoke('NgDocActions', 'playground', ['ButtonPlayground'])).toBe('');
    expect(queries).toBe(1);
    expect(diagnostics).toEqual([interrupted]);

    // A guide whose query succeeded still reports IDs it does not declare.
    local.semantic = {
      ...local.semantic,
      describeGuide: () => ({
        value: { demos: {}, playgrounds: [] },
        dependencies: [],
        diagnostics: [],
      }),
    };
    const known = new GeneratorContentCompiler(local);
    const reported: any[] = [];
    const lookups = (known as any).actions('guide', [], reported);
    expect(lookups.invoke('NgDocActions', 'demo', ['ButtonDemo'])).toBe('');
    expect(lookups.invoke('NgDocActions', 'playground', ['ButtonPlayground'])).toBe('');
    expect(reported.map((item) => item.code)).toEqual(['CONTENT_DEMO', 'CONTENT_PLAYGROUND']);
  });

  it('covers default headers, empty template results, non-string API output, and aborts for every artifact kind', async () => {
    const markdown = path.join(root, 'page.md');
    fs.writeFileSync(markdown, '# Guide');
    const local = services();
    local.templates = { render: () => ({ dependencies: [], diagnostics: [] }) };
    const compiler = new GeneratorContentCompiler(local);
    const header = await compiler.compile(
      { kind: 'header', id: 'header', entry: entry(markdown) },
      new AbortController().signal,
    );
    expect(header.value).toBeUndefined();
    local.semantic = {
      ...local.semantic,
      renderFragment: () => ({
        value: { format: 'value', value: true },
        dependencies: [],
        diagnostics: [],
      }),
    };
    const api = await compiler.compile(
      {
        kind: 'api-tab',
        id: 'api',
        declaration: {
          id: 'decl',
          apiEntryId: 'api-entry',
          scopeId: 'scope',
          source: { path: '/api.ts' },
          name: 'Thing',
          kind: 'class',
          route: 'api/thing',
          breadcrumbs: [],
          exportedKeywords: [],
        },
      },
      new AbortController().signal,
    );
    expect(api.value).toBeUndefined();
    const controller = new AbortController();
    controller.abort();
    await expect(
      compiler.compile(
        {
          kind: 'demo-assets',
          id: 'assets',
          entry: entry(markdown),
          semantics: { demos: {}, playgrounds: [] },
        },
        controller.signal,
      ),
    ).resolves.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'CONTENT_ABORTED' })],
    });
    await expect(
      compiler.compile(
        {
          kind: 'api-tab',
          id: 'api',
          declaration: {
            id: 'decl',
            apiEntryId: 'api-entry',
            scopeId: 'scope',
            source: { path: '/api.ts' },
            name: 'Thing',
            kind: 'class',
            route: 'api/thing',
            breadcrumbs: [],
            exportedKeywords: [],
          },
        },
        controller.signal,
      ),
    ).resolves.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'CONTENT_ABORTED' })],
    });
  });

  it('keeps ordinary and typed blockquotes plus code defaults local to each renderer', () => {
    const compiler = new GeneratorContentCompiler(services());
    const dependencies: any[] = [];
    const diagnostics: any[] = [];
    const html = (compiler as any).markdownToHtml(
      '> **Warning** typed\n\n> plain\n\n```\n&lt;safe&gt;\n```',
      root,
      dependencies,
      diagnostics,
    );
    expect(html).toContain('ng-doc-blockquote type="warning"');
    expect(html).toContain('<ng-doc-blockquote><p>plain');
    expect(html).toContain('language-typescript');
    expect(html).toContain('&amp;lt;safe&amp;gt;');
  });

  it('converts action-port exceptions into diagnostics and preserves successful playground source dependencies', () => {
    const source = path.join(root, 'play.ts');
    fs.writeFileSync(source, 'export class Play {}');
    const local = services();
    local.semantic = {
      ...local.semantic,
      describeGuide: () => ({
        value: {
          demos: {},
          playgrounds: [
            {
              id: 'Play',
              target: { source, exportName: 'Play' },
              standalone: true,
              selector: 'x-play',
              template: '',
              templatesBySelector: {},
              properties: { text: '<safe>' },
              content: {},
            },
          ],
        },
        dependencies: [],
        diagnostics: [],
      }),
      renderFragment: () => {
        throw new Error('semantic failed');
      },
    };
    const compiler = new GeneratorContentCompiler(local);
    const dependencies: any[] = [];
    const diagnostics: any[] = [];
    const actions = (compiler as any).actions('guide', dependencies, diagnostics);
    expect(actions.invoke('NgDocActions', 'playground', ['Play', { width: 1 }])).toContain(
      '&lt;safe&gt;',
    );
    expect(actions.invoke('NgDocApi', 'api', ['Broken'])).toBe('');
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CONTENT_ACTION' })]),
    );
    expect(dependencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'content', path: source })]),
    );
  });

  it('preserves grouped code tabs, themes metadata, highlights, and multiple ignored source lines', async () => {
    const markdown = path.join(root, 'page.md');
    const snippet = path.join(root, 'snippet.ts');
    fs.writeFileSync(snippet, '// ng-doc-ignore-line 2\nremoveOne();\nremoveTwo();\nkeep();');
    fs.writeFileSync(
      markdown,
      '```ts group="examples" name="Example" icon="code" active {1,3}\nconst inline = true;\n```\n\n```ts file="snippet.ts"\nignored\n```',
    );
    const result = await new GeneratorContentCompiler(services()).compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.html).toContain('ng-doc-tab group="examples"');
    expect(result.value?.html).toContain('highlightedlines="[1,3]"');
    expect(result.value?.html).toContain('shiki-themes github-light ayu-dark');
    expect(result.value?.html).toContain('>keep</span>');
    expect(result.value?.html).not.toContain('removeOne');
    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'content', path: hostPath(snippet) }),
      ]),
    );
  });

  it('colours code with the --ng-doc-syntax variables of the css-variables theme', async () => {
    const markdown = path.join(root, 'page.md');
    fs.writeFileSync(markdown, '```ts\n// note\nexport const answer: number = 42;\n```');
    const local = services();
    local.configuration = {
      ...configuration,
      themes: { light: 'css-variables', dark: 'css-variables' },
    };
    const compile = () =>
      new GeneratorContentCompiler(local).compile(
        { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
        new AbortController().signal,
      );
    const result = await compile();
    expect(result.diagnostics).toEqual([]);
    const html = result.value?.html ?? '';
    expect(html).toContain('shiki-themes css-variables css-variables');
    for (const token of ['keyword', 'type', 'number', 'comment', 'punctuation'])
      expect(html).toContain(`color:var(--ng-doc-syntax-${token})`);
    expect(html).not.toMatch(/color:#/);
    // The theme object is created per render, so a second render is identical.
    expect((await compile()).value?.html).toBe(html);
  });

  it('colours code the same however slowly the process tokenizes it', async () => {
    const markdown = path.join(root, 'page.md');
    fs.writeFileSync(
      markdown,
      "```ts\nimport { Component } from '@angular/core'; export class Demo { value = 42; }\n```",
    );
    const local = services();
    local.configuration = {
      ...configuration,
      themes: { light: 'css-variables', dark: 'css-variables' },
    };
    const compile = async () =>
      (
        await new GeneratorContentCompiler(local).compile(
          { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
          new AbortController().signal,
        )
      ).value?.html;
    const fast = await compile();
    // An overloaded machine or a long pause of the process: every clock read is a second later.
    // Shiki's default time limit would then stop each line after its first token and colour the
    // rest like that token, so the output would depend on the load.
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000));
    try {
      expect(await compile()).toBe(fast);
    } finally {
      clock.mockRestore();
    }
    for (const token of ['keyword', 'punctuation', 'string', 'type', 'number'])
      expect(fast).toContain(`color:var(--ng-doc-syntax-${token})`);
  });

  it('diagnoses a missing snippet and compiles it after it appears', async () => {
    const markdown = path.join(root, 'page.md');
    const snippet = path.join(root, 'later.ts');
    fs.writeFileSync(markdown, '```ts file="later.ts"\nfallback\n```');
    const compiler = new GeneratorContentCompiler(services());
    const missing = await compiler.compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(missing.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CONTENT_SNIPPET_READ' })]),
    );
    fs.writeFileSync(snippet, 'const recovered = true;');
    const recovered = await compiler.compile(
      { kind: 'guide-tab', id: 'tab', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(recovered.value?.html).toContain('recovered');
    expect(recovered.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'content', path: hostPath(snippet) }),
      ]),
    );
  });

  it('compiles an API tab through the semantic fragment port', async () => {
    const compiler = new GeneratorContentCompiler(services());
    const result = await compiler.compile(
      {
        kind: 'api-tab',
        id: 'api',
        declaration: {
          id: 'decl',
          apiEntryId: 'api-entry',
          scopeId: 'scope',
          source: { path: '/api.ts' },
          name: 'Thing',
          kind: 'class',
          route: 'api/thing',
          breadcrumbs: [],
          exportedKeywords: [],
        },
      },
      new AbortController().signal,
    );
    expect(result.value?.role).toBe('api-tab');
    expect(result.value?.html).toContain('fragment');
    expectJsonSafe(result.value);
  });

  it('compiles demo assets with source dependencies', async () => {
    const compiler = new GeneratorContentCompiler(services());
    const markdown = path.join(root, 'page.md');
    const demoSource = path.join(root, 'demo.ts');
    const plainSource = path.join(root, 'plain.html');
    fs.writeFileSync(demoSource, 'const fullDemoSource = true;\n// source tail');
    fs.writeFileSync(plainSource, '<main>full plain source</main>');
    const result = await compiler.compile(
      {
        kind: 'demo-assets',
        id: 'assets',
        entry: entry(markdown),
        semantics: {
          playgrounds: [],
          demos: {
            Demo: [
              {
                title: 'Demo',
                language: 'ts',
                source: demoSource,
                code: 'const x = 1;',
                icon: 'code',
                opened: true,
              },
              {
                title: 'Plain',
                language: 'html',
                source: plainSource,
                code: '<safe>',
              },
            ],
          },
        },
      },
      new AbortController().signal,
    );
    expect(result.value?.role).toBe('demo-assets');
    expect(result.value?.html).toContain('ng-doc-demo-assets');
    expect(result.value?.html).toContain('>const</span>');
    expect(result.value?.html).toContain('opened=""');
    expect(result.value?.html).toContain('name="Demo"');
    expect(result.value?.html).toContain('icon="code"');
    expect(result.value?.html).toContain('name="Plain"');
    expect(result.dependencies).toEqual([
      {
        kind: 'content',
        path: demoSource,
        digest: createHash('sha256')
          .update('const fullDemoSource = true;\n// source tail')
          .digest('hex'),
      },
      {
        kind: 'content',
        path: plainSource,
        digest: createHash('sha256').update('<main>full plain source</main>').digest('hex'),
      },
    ]);
    expectJsonSafe(result.value);
  });

  it('recovers a custom header after its missing template is created', async () => {
    const header = path.join(root, 'header.md');
    const local = services();
    local.configuration = { ...configuration, headerTemplate: header };
    const compiler = new GeneratorContentCompiler(local);
    const markdown = path.join(root, 'page.md');
    const missing = await compiler.compile(
      { kind: 'header', id: 'header', entry: entry(markdown) },
      new AbortController().signal,
    );
    expect(missing.value).toBeUndefined();
    fs.writeFileSync(header, '# {{ title }}');
    const recovered = await compiler.compile(
      { kind: 'header', id: 'header', entry: entry(markdown) },
      new AbortController().signal,
    );
    expect(recovered.value?.html).toContain('Guide');
  });

  it('selects the legacy default guide header and supplies entry-doc metadata', async () => {
    const requests: TemplateRequest[] = [];
    const local = services();
    local.templates = {
      render(request: TemplateRequest, actions: TemplateActions) {
        requests.push(request);
        return templates.render(request, actions);
      },
    };
    const result = await new GeneratorContentCompiler(local).compile(
      { kind: 'header', id: 'header', entry: entry(path.join(root, 'page.md')) },
      new AbortController().signal,
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toMatchObject({
      role: 'header',
      title: 'Guide',
      route: 'guide',
      absoluteRoute: 'docs/guide',
    });
    expect(result.value?.html).toContain('<h1 class="ngde ngde" id="guide"');
    expect(result.value?.html).toContain('Guide <strong class="ngde">description</strong>.');
    expect(requests[0]).toMatchObject({
      kind: 'header',
      entryId: 'guide',
      scope: '/',
      values: {
        Metadata: { description: 'Guide <strong>description</strong>.', tags: {} },
      },
    });
    expect(requests[0].text).toContain('{{ NgDocPage.title }}');
    expectJsonSafe(result.value);
  });

  it('uses a workspace-scoped custom guide header and ignores it for semantic API headers', async () => {
    const header = path.join(root, 'header.html.nunj');
    fs.writeFileSync(
      header,
      '<section><h2>{{ NgDocPage.title }}</h2>{{ Metadata.description }}</section>',
    );
    const requests: TemplateRequest[] = [];
    const local = services();
    local.configuration = { ...configuration, workspaceRoot: root, headerTemplate: header };
    local.templates = {
      render(request: TemplateRequest, actions: TemplateActions) {
        requests.push(request);
        return templates.render(request, actions);
      },
    };
    const compiler = new GeneratorContentCompiler(local);
    const guide = await compiler.compile(
      { kind: 'header', id: 'guide-header', entry: entry(path.join(root, 'page.md')) },
      new AbortController().signal,
    );
    expect(guide.value?.html).toContain('<section class="ngde"><h2');
    expect(guide.value?.html).toContain('Guide <strong class="ngde">description</strong>.');
    expect(requests[0]).toMatchObject({ text: expect.stringContaining('<section>'), scope: root });
    expect(guide.dependencies).toContainEqual({
      kind: 'content',
      path: header,
      digest: expect.any(String),
    });

    local.semantic = {
      ...local.semantic,
      renderFragment: (request) => ({
        value:
          request.kind === 'api-header'
            ? {
                format: 'html',
                value: '<h1>Thing</h1><p>Header <code>Known</code></p>',
              }
            : { format: 'value', value: {} },
        dependencies: [{ kind: 'content', path: '/api.ts', digest: 'api-digest' }],
        diagnostics: [],
      }),
    };
    const api = await compiler.compile(
      { kind: 'header', id: 'api-header', entry: declaration() },
      new AbortController().signal,
    );
    expect(api.value).toMatchObject({
      entryId: 'api-entry',
      role: 'header',
      title: 'Thing',
      anchors: [expect.objectContaining({ anchor: 'thing', type: 'heading' })],
      usedKeywords: ['Known'],
    });
    expect(api.value?.html).toContain('Header <code');
    expect(requests).toHaveLength(1);
    expect(api.dependencies).toEqual([{ kind: 'content', path: '/api.ts', digest: 'api-digest' }]);
  });

  it('does not request guide semantics for default or custom API entry headers without actions', async () => {
    const markdown = path.join(root, 'page.md');
    const apiEntry = { ...entry(markdown), kind: 'api' as const, scopes: [] };
    const local = services();
    local.semantic = {
      ...local.semantic,
      describeGuide: () => {
        throw new Error('SEMANTIC_ENTRY_KIND');
      },
      renderFragment: () => ({
        value: { format: 'value', value: { description: 'API metadata', tags: {} } },
        dependencies: [],
        diagnostics: [],
      }),
    };
    const defaultHeader = await new GeneratorContentCompiler(local).compile(
      { kind: 'header', id: 'api-entry-header', entry: apiEntry },
      new AbortController().signal,
    );
    expect(defaultHeader.diagnostics).toEqual([]);
    expect(defaultHeader.value?.html).toContain('API metadata');

    const customTemplate = path.join(root, 'api-entry-header.nunj');
    fs.writeFileSync(customTemplate, '<header>{{ NgDocPage.title }}</header>');
    local.configuration = { ...configuration, workspaceRoot: root, headerTemplate: customTemplate };
    const customHeader = await new GeneratorContentCompiler(local).compile(
      { kind: 'header', id: 'custom-api-entry-header', entry: apiEntry },
      new AbortController().signal,
    );
    expect(customHeader.diagnostics).toEqual([]);
    expect(customHeader.value?.html).toContain('<header class="ngde">Guide</header>');
  });

  it('builds search records with parsedoc for body, lists, tables, entities and indexable=false', async () => {
    const markdown = path.join(root, 'search.md');
    fs.writeFileSync(
      markdown,
      [
        '<p>Opening body.</p>',
        '# Section',
        'Paragraph **bold** <time>today</time>.',
        '- One',
        '- Two',
        '<table><tbody><tr><td>Cell A</td><td>Cell B</td></tr></tbody></table>',
        '<widget-card>Entity <span>nested</span></widget-card>',
        '<aside indexable="false"><p>SECRET CONTENT</p><ul><li>SECRET ITEM</li></ul></aside>',
      ].join('\n\n'),
    );
    const compiler = new GeneratorContentCompiler(services());
    const compiled = await compiler.compile(
      { kind: 'guide-tab', id: 'search', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    const linked = await compiler.link(
      { ir: compiled.value!, keywords: [], breadcrumbs: ['Docs', 'Guide'], pageType: 'guide' },
      new AbortController().signal,
    );
    const records = linked.value!.searchRecords;
    expect(records.map((record) => record.content)).toEqual(
      expect.arrayContaining([
        'Opening body.',
        'Paragraph bold today.',
        'OneTwo',
        'Cell A',
        'Cell B',
        'Entity nested',
      ]),
    );
    expect(records.find((record) => record.content === 'Opening body.')).toMatchObject({
      section: '',
      route: 'docs/guide',
    });
    expect(records.find((record) => record.content === 'Cell A')).toMatchObject({
      breadcrumbs: ['Docs', 'Guide'],
      pageType: 'guide',
      title: 'Guide',
      section: 'Section',
      fragment: 'section',
    });
    expect(JSON.stringify(records)).not.toContain('SECRET');
    expectJsonSafe(linked.value);
  });

  it('builds exactly the records the Orama-populated database stored, in the same order', async () => {
    const compiler = new GeneratorContentCompiler(services());
    const bodies = [
      'Root text <p>Opening <strong>bold</strong> <a href="x">link</a> <span>span</span>.</p>' +
        '<h2 id="first">First &amp; <code>code</code></h2><p>One</p><p>  </p>' +
        '<h3>No id</h3><p>Two <small>small</small> <b>b</b> <time>now</time></p>' +
        '<ul><li>Alpha</li><li>Beta <em>em</em></li></ul>' +
        '<h4 id="second">Second</h4><table><tr><th>H</th><td>Cell &lt;x&gt;</td></tr></table>' +
        '<pre><code>const a = 1;\nconst b = 2;</code></pre>' +
        '<div indexable="false"><p>Hidden</p></div><ng-doc-blockquote><p>Quote</p></ng-doc-blockquote>',
      '',
      'Only text',
      '<h1 id="only">Only heading</h1>',
      '<h2 id="use-it"><span aria-hidden="true">🧰</span>\u00a0Use it\u00a0</h2><p>Body</p>' +
        '<h3 id="plain"> Plain <span aria-hidden="true">🧰</span></h3><p>Tail</p>',
    ];
    const all: SearchRecord[] = [];
    for (const html of bodies) {
      const ir: ContentIR = {
        schemaVersion: 4,
        id: 'records',
        entryId: 'guide',
        role: 'guide-tab',
        title: 'Guide',
        route: '',
        absoluteRoute: 'docs/guide',
        html,
        anchors: [],
        exportedKeywords: [],
        usedKeywords: [],
        dependencies: [],
        diagnostics: [],
      };
      const request = { ir, keywords: [], breadcrumbs: ['Docs'], pageType: 'guide' as const };
      const linked = await compiler.link(request, new AbortController().signal);
      expect(linked.diagnostics).toEqual([]);
      const expected = await oramaSearchRecords(
        await removeNotIndexableContent(linked.value!.html),
        request,
      );
      expect(linked.value!.searchRecords).toStrictEqual(expected);
      all.push(...linked.value!.searchRecords);
    }
    expect(all.length).toBeGreaterThan(8);
    expect(all.map((record) => record.fragment)).toEqual(
      expect.arrayContaining(['first', 'second']),
    );
    // A heading's decorative emoji is no record of its own, and no whitespace (a no-break space
    // included) surrounds a section name; an emoji that does not open the heading stays indexed.
    expect(
      all.filter((record) => record.content === '🧰').map((record) => record.fragment),
    ).toEqual(['plain']);
    expect(all.find((record) => record.content === 'Body')?.section).toBe('Use it');
    expect(all.find((record) => record.fragment === 'first')?.section).toBe('First &');
    expect(
      all.filter((record) => record.fragment === 'plain').map((record) => record.content),
    ).toEqual(['🧰', 'Tail']);
    expect(all.find((record) => record.content === 'Tail')?.section).toBe('Plain');
    expect(JSON.stringify(all)).not.toContain('Hidden');
  });

  it('builds the keyword lookup once for a frozen set and afresh for a mutable one', async () => {
    const compiler = new GeneratorContentCompiler(services());
    const ir: ContentIR = {
      schemaVersion: 4,
      id: 'ir',
      entryId: 'guide',
      role: 'guide-tab',
      title: 'Guide',
      route: '',
      absoluteRoute: 'docs/guide',
      html: '<p><code>Known</code></p>',
      anchors: [],
      exportedKeywords: [],
      usedKeywords: ['Known'],
      dependencies: [],
      diagnostics: [],
    };
    const link = (keywords: KeywordExport[]) =>
      compiler.link(
        { ir, keywords, breadcrumbs: [], pageType: 'guide' },
        new AbortController().signal,
      );
    const mutable: KeywordExport[] = [{ key: 'Known', title: 'First', path: 'docs/first' }];
    const first = await link(mutable);
    expect(first.value!.html).toContain('docs/first');
    mutable[0] = { key: 'Known', title: 'Second', path: 'docs/second' };
    const second = await link(mutable);
    expect(second.value!.html).toContain('docs/second');
    expect(second.value!.keywordDigest).not.toBe(first.value!.keywordDigest);

    const frozen = Object.freeze([
      { key: 'Known', title: 'Old', path: 'docs/old' },
      { key: 'Known', title: 'Frozen', path: 'docs/frozen' },
    ]) as unknown as KeywordExport[];
    const once = await link(frozen);
    const again = await link(frozen);
    // A later duplicate wins, as with a fresh Map, and repeated links agree.
    expect(once.value!.html).toContain('docs/frozen');
    expect(again.value).toStrictEqual(once.value);
    expect((await link([...frozen])).value).toStrictEqual(once.value);
  });

  it('hashes only sorted consumed keyword bindings, including missing bindings', async () => {
    const compiler = new GeneratorContentCompiler(services());
    const ir: ContentIR = {
      schemaVersion: 4,
      id: 'ir',
      entryId: 'guide',
      role: 'guide-tab',
      title: 'Guide',
      route: '',
      absoluteRoute: 'docs/guide',
      html: '<p><code>Known</code> <code>Missing</code></p>',
      anchors: [],
      exportedKeywords: [],
      usedKeywords: ['Missing', 'Known', 'Known'],
      dependencies: [],
      diagnostics: [],
    };
    const known = {
      key: 'Known',
      title: 'Known title',
      path: 'docs/known',
      type: 'link' as const,
      languages: ['ts'],
      description: 'Known docs',
    };
    const first = await compiler.link(
      {
        ir,
        keywords: [known, { key: 'Unused', title: 'One', path: 'unused' }],
        breadcrumbs: [],
        pageType: 'guide',
      },
      new AbortController().signal,
    );
    const reordered = await compiler.link(
      {
        ir: { ...ir, usedKeywords: ['Known', 'Missing'] },
        keywords: [
          { key: 'Unused', title: 'Changed', path: 'elsewhere' },
          {
            description: 'Known docs',
            languages: ['ts'],
            type: 'link',
            path: 'docs/known',
            title: 'Known title',
            key: 'Known',
          },
        ],
        breadcrumbs: [],
        pageType: 'guide',
      },
      new AbortController().signal,
    );
    expect(reordered.value?.keywordDigest).toBe(first.value?.keywordDigest);

    const resolvedMissing = await compiler.link(
      {
        ir,
        keywords: [known, { key: 'Missing', title: 'Now present', path: 'docs/missing' }],
        breadcrumbs: [],
        pageType: 'guide',
      },
      new AbortController().signal,
    );
    expect(resolvedMissing.value?.keywordDigest).not.toBe(first.value?.keywordDigest);
  });

  it('records every consulted keyword; equal consulted bindings link identically', async () => {
    const compiler = new GeneratorContentCompiler(services());
    const ir: ContentIR = {
      schemaVersion: 4,
      id: 'consulted',
      entryId: 'guide',
      role: 'guide-tab',
      title: 'Guide',
      route: '',
      absoluteRoute: 'docs/guide',
      html:
        '<h2 id="usage">Usage</h2><p>Call <code>Known</code>, <code>Thing.member</code>, ' +
        '<code>*Guide</code> and <code>Missing</code>. Plain Known prose.</p>' +
        '<pre><code class="language-typescript">const value: Known = Other.create();</code></pre>' +
        '<pre><code class="language-bash">Known --flag</code></pre>',
      anchors: [],
      exportedKeywords: [],
      usedKeywords: ['Known', 'Thing.member', '*Guide', 'Missing'],
      dependencies: [],
      diagnostics: [],
    };
    const keywords = Object.freeze([
      { key: '*Guide', title: 'Guide', path: 'docs/guide', type: 'link' as const },
      { key: 'Known', title: 'Known', path: 'api/known', description: 'Known docs' },
      { key: 'Thing', title: 'Thing', path: 'api/thing' },
      { key: 'Thing.member', title: 'Thing.member', path: 'api/thing#member' },
      { key: 'Unconsulted', title: 'Unconsulted', path: 'api/unconsulted' },
    ]) as KeywordExport[];
    const link = async (set: KeywordExport[], consulted?: Set<string>) =>
      compiler.link(
        { ir, keywords: set, breadcrumbs: ['Guide'], pageType: 'guide' },
        new AbortController().signal,
        consulted,
      );
    const consulted = new Set<string>();
    const recorded = await link(keywords, consulted);
    // Inline code and TypeScript blocks are consulted (root and anchored spellings); prose, other
    // languages and positions that never link (the reserved word `const`, the declared name
    // `value`) are not.
    expect([...consulted].sort()).toEqual(
      ['*Guide', 'Known', 'Missing', 'Other', 'Other.create', 'Thing', 'Thing.member'].sort(),
    );
    expect(recorded.value?.keywordDigest).toBe(linkedKeywordDigest(ir, keywords));
    const unrecorded = await link(keywords);
    expect(unrecorded).toEqual(recorded);

    // Changing an unconsulted binding cannot change the output; changing a consulted one does.
    const unconsultedChanged = keywords.map((keyword) =>
      keyword.key === 'Unconsulted' ? { ...keyword, title: 'Changed' } : keyword,
    );
    expect((await link(unconsultedChanged)).value).toEqual(recorded.value);
    const consultedChanged = keywords.map((keyword) =>
      keyword.key === 'Known' ? { ...keyword, path: 'api/moved' } : keyword,
    );
    const relinked = await link(consultedChanged);
    expect(relinked.value?.html).not.toBe(recorded.value?.html);
    expect(relinked.value?.html).toContain('api/moved');
    // A newly bound consulted key (previously missing) also changes the output.
    const bound = await link([
      ...keywords,
      { key: 'Other.create', title: 'Other.create', path: 'api/other#create' },
    ]);
    expect(bound.value?.html).not.toBe(recorded.value?.html);
    // A key in a position that never links is not consulted: binding it changes nothing.
    const declared = await link([...keywords, { key: 'value', title: 'value', path: 'api/value' }]);
    expect(declared.value).toEqual(recorded.value);
  });

  it('merges API seed exports with heading, member and scoped anchor exports', async () => {
    const local = services();
    local.semantic = {
      ...local.semantic,
      renderFragment: () => ({
        value: {
          format: 'html',
          value:
            '<h2>Ünicode Heading</h2><div dataSlug="member" dataSlugTitle="Member" dataSlugType="member"></div>' +
            '<ng-doc-keyword-scope id="Scope" title="Scoped"><h2>Scoped Heading</h2><div dataSlug="scoped-member" dataSlugTitle="Scoped Member" dataSlugType="member"></div></ng-doc-keyword-scope>',
        },
        dependencies: [],
        diagnostics: [],
      }),
    };
    const result = await new GeneratorContentCompiler(local).compile(
      { kind: 'api-tab', id: 'api', declaration: declaration() },
      new AbortController().signal,
    );
    expect(result.value?.exportedKeywords).toEqual(
      expect.arrayContaining([
        { key: 'Thing', title: 'Thing', path: 'api/thing' },
        expect.objectContaining({
          key: 'Thing#ünicode-heading',
          title: 'Thing [Ünicode Heading]',
          type: 'link',
        }),
        expect.objectContaining({ key: 'Thing.member', title: 'Thing.Member' }),
        expect.objectContaining({
          key: 'Scope#scoped-heading',
          title: 'Scoped [Scoped Heading]',
          type: 'link',
        }),
        expect.objectContaining({ key: 'Scope.scoped-member', title: 'Scoped.Scoped Member' }),
      ]),
    );
  });

  it('keeps heading emoji out of anchors, keyword titles and the accessible name', async () => {
    const local = services();
    local.semantic = {
      ...local.semantic,
      renderFragment: () => ({
        value: {
          format: 'html',
          value: '<h2>🎨\u00a0Custom theme</h2><h2>© Notice</h2><h2>Theme 🎨</h2>',
        },
        dependencies: [],
        diagnostics: [],
      }),
    };
    const result = await new GeneratorContentCompiler(local).compile(
      { kind: 'api-tab', id: 'api', declaration: declaration() },
      new AbortController().signal,
    );
    expect(result.value?.exportedKeywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'Thing#custom-theme', title: 'Thing [Custom theme]' }),
        expect.objectContaining({ key: 'Thing#-notice', title: 'Thing [© Notice]' }),
        expect.objectContaining({ key: 'Thing#theme-', title: 'Thing [Theme 🎨]' }),
      ]),
    );
    // The anchor and the TOC title keep the emoji; the rendered heading hides it from readers.
    expect(result.value?.anchors?.[0]).toMatchObject({
      anchorId: 'custom-theme',
      title: '🎨\u00a0Custom theme',
    });
    const html = String((result.value as { html?: string } | undefined)?.html);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>🎨<\/span>\u00a0Custom theme/);
    expect(html.match(/aria-hidden/g)).toHaveLength(1);
  });

  it('keeps disambiguated API anchors under their qualified declaration key', async () => {
    const local = services();
    local.semantic.renderFragment = () => ({
      value: {
        format: 'html',
        value:
          '<h2>Heading</h2><ng-doc-keyword-scope id="Thing" title="Thing"><div dataSlug="member" dataSlugTitle="Member" dataSlugType="member"></div></ng-doc-keyword-scope><ng-doc-keyword-scope id="Other" title="Other"><h2>Other heading</h2></ng-doc-keyword-scope>',
      },
      dependencies: [],
      diagnostics: [],
    });
    const result = await new GeneratorContentCompiler(local).compile(
      {
        kind: 'api-tab',
        id: 'qualified',
        declaration: declaration({
          exportedKeywords: [{ key: 'Thing--stable', title: 'Thing', path: 'api/thing--stable' }],
          route: 'api/thing--stable',
        }),
      },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
    const keys = result.value!.exportedKeywords.map((item) => item.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Thing--stable',
        'Thing--stable#heading',
        'Thing--stable.member',
        'Other#other-heading',
      ]),
    );
    expect(
      keys.some((key) => key === 'Thing' || key.startsWith('Thing#') || key.startsWith('Thing.')),
    ).toBe(false);
  });

  it('handles line-ranged snippets, fileName metadata, default ignore counts and empty demos', async () => {
    const snippet = path.join(root, 'range.ts');
    const markdown = path.join(root, 'ranges.md');
    const wholeSnippet = [
      'zero();',
      '// ng-doc-ignore-line',
      'remove();',
      'two();',
      'three();',
    ].join('\n');
    fs.writeFileSync(snippet, wholeSnippet);
    fs.writeFileSync(
      markdown,
      [
        '```ts file="range.ts"#L2-L5 fileName="Range" icon="star"',
        'fallback',
        '```',
        '```ts file="range.ts"#L4-',
        'fallback',
        '```',
        '``` file="range.ts"#L1',
        'fallback',
        '```',
      ].join('\n'),
    );
    const compiler = new GeneratorContentCompiler(services());
    const result = await compiler.compile(
      { kind: 'guide-tab', id: 'ranges', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.html).toContain('name="Range"');
    expect(result.value?.html).toContain('icon="star"');
    expect(result.value?.html).toContain('two');
    expect(result.value?.html).toContain('three');
    expect(result.value?.html).not.toContain('remove');
    const snippetDependencies = result.dependencies.filter(
      (item) => 'path' in item && item.path === hostPath(snippet),
    );
    expect(snippetDependencies).toHaveLength(3);
    expect(snippetDependencies).toEqual(
      Array(3).fill({
        kind: 'content',
        path: hostPath(snippet),
        digest: createHash('sha256').update(wholeSnippet).digest('hex'),
      }),
    );

    const empty = await compiler.compile(
      {
        kind: 'demo-assets',
        id: 'empty',
        entry: entry(markdown),
        semantics: { demos: {}, playgrounds: [] },
      },
      new AbortController().signal,
    );
    expect(empty.value).toMatchObject({ html: '', anchors: [], usedKeywords: [] });
  });

  it('shows named snippets of a file without their markers', async () => {
    const source = path.join(root, 'greeting.ts');
    const markup = path.join(root, 'greeting.html');
    const markdown = path.join(root, 'snippets.md');
    const greeting = [
      "import { Component } from '@angular/core';",
      '',
      'export class Greeter {',
      '  // snippet#greeting "Greeting" icon="star"',
      '  greet(name: string): string {',
      '    // snippet#inner',
      '    return `Hello, ${name}\\\\`;',
      '    // snippet#inner',
      '  }',
      '',
      '  // ng-doc-ignore-line',
      '  hidden(): void {}',
      '  /* snippet#greeting */',
      '}',
    ].join('\r\n');
    fs.writeFileSync(source, greeting);
    fs.writeFileSync(
      markup,
      '<p>before</p>\n<!-- snippet#part -->\n<b>part</b>\n<!-- snippet#part -->\n',
    );
    fs.writeFileSync(
      markdown,
      [
        '```ts name="greeting.ts" file="./greeting.ts"#greeting {2}',
        'fallback',
        '```',
        '```ts file="./greeting.ts"#inner',
        '```',
        '```html file="./greeting.html"#part',
        '```',
        '```ts file="./greeting.ts"#L3',
        '```',
      ].join('\n'),
    );
    const compiler = new GeneratorContentCompiler(services());
    const result = await compiler.compile(
      { kind: 'guide-tab', id: 'snippets', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(result.diagnostics).toEqual([]);
    const blocks = [...result.value!.html.matchAll(/<pre[\s\S]*?<\/pre>/g)].map(([block]) =>
      block
        .replace(/<[^>]*>/g, '')
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&'),
    );
    expect(blocks).toEqual([
      // Markers, nested ones included, and ignored lines are removed; the indentation and the CR
      // of each line are not kept.
      'greet(name: string): string {\n  return `Hello, ${name}\\\\`;\n}',
      'return `Hello, ${name}\\\\`;',
      '<b>part</b>',
      'export class Greeter {',
    ]);
    expect(result.value!.html).toContain('name="greeting.ts"');
    // Each block read the whole file once: an edit anywhere in it renders the page again.
    expect(
      result.dependencies.filter((item) => 'path' in item && item.path === hostPath(source)),
    ).toEqual(
      Array(3).fill({
        kind: 'content',
        path: hostPath(source),
        digest: createHash('sha256').update(greeting).digest('hex'),
      }),
    );

    fs.writeFileSync(
      markdown,
      [
        '```ts file="./greeting.ts"#farewell',
        'fallback',
        '```',
        '```html file="./greeting.html"#before',
        '```',
      ].join('\n'),
    );
    fs.writeFileSync(markup, '<!-- snippet#before -->\n<p>before</p>\n');
    const unknown = await compiler.compile(
      { kind: 'guide-tab', id: 'snippets', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(unknown.diagnostics).toEqual([
      expect.objectContaining({
        code: 'CONTENT_SNIPPET_UNKNOWN',
        severity: 'error',
        source: { path: hostPath(source) },
        message: 'Snippet "farewell" is not in ./greeting.ts: no "snippet#farewell" marker.',
      }),
      expect.objectContaining({
        code: 'CONTENT_SNIPPET_UNKNOWN',
        severity: 'error',
        source: { path: hostPath(markup) },
        message: 'Snippet "before" in ./greeting.html has no closing "snippet#before" marker.',
      }),
    ]);
  });

  it('tracks missing demo sources and recovers with the full physical-file digest', async () => {
    const source = path.join(root, 'later-demo.ts');
    const markdown = path.join(root, 'page.md');
    const request = {
      kind: 'demo-assets' as const,
      id: 'assets',
      entry: entry(markdown),
      semantics: {
        playgrounds: [],
        demos: {
          Demo: [{ title: 'Snippet', language: 'ts', source, code: 'selected();' }],
        },
      },
    };
    const compiler = new GeneratorContentCompiler(services());
    const missing = await compiler.compile(request, new AbortController().signal);
    expect(missing.value).toBeUndefined();
    expect(missing.dependencies).toEqual([{ kind: 'existence', path: source, exists: false }]);
    expect(missing.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_DEMO_ASSET_READ' }),
    );

    const wholeFile = 'before();\nselected();\nafter();';
    fs.writeFileSync(source, wholeFile);
    const recovered = await compiler.compile(request, new AbortController().signal);
    expect(recovered.diagnostics).toEqual([]);
    expect(recovered.dependencies).toEqual([
      {
        kind: 'content',
        path: source,
        digest: createHash('sha256').update(wholeFile).digest('hex'),
      },
    ]);
    expect(recovered.value?.html).toContain('selected');
  });

  it('uses the established code-block grammar and diagnoses invalid syntax', async () => {
    const valid = path.join(root, 'valid-options.md');
    fs.writeFileSync(
      valid,
      '```typescript lineNumbers name="Named" icon="star" {1-2, 4} active\nfirst();\nsecond();\n```',
    );
    const compiler = new GeneratorContentCompiler(services());
    const compiled = await compiler.compile(
      { kind: 'guide-tab', id: 'valid', entry: entry(valid), markdown: valid },
      new AbortController().signal,
    );
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.value?.html).toContain('name="Named"');
    expect(compiled.value?.html).toContain('icon="star"');

    const invalid = path.join(root, 'invalid-options.md');
    fs.writeFileSync(invalid, '```typescript unsupported-option\nvalue();\n```');
    const rejected = await compiler.compile(
      { kind: 'guide-tab', id: 'invalid', entry: entry(invalid), markdown: invalid },
      new AbortController().signal,
    );
    expect(rejected.value).toBeUndefined();
    expect(rejected.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CONTENT_COMPILE',
        message: expect.stringContaining('Unable to parse code block options'),
      }),
    );
  });

  it('compiles code blocks in the Shiki languages whose names have symbols, with their options', async () => {
    const markdown = path.join(root, 'languages.md');
    fs.writeFileSync(
      markdown,
      [
        '```c++ name="main.cpp" {1}\nint main() { return 0; }\n```',
        '```c#\nvar answer = 42;\n```',
        '```objective-c\n@interface Answer : NSObject\n@end\n```',
      ].join('\n\n'),
    );
    const compiled = await new GeneratorContentCompiler(services()).compile(
      { kind: 'guide-tab', id: 'languages', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(compiled.diagnostics).toEqual([]);
    const html = compiled.value!.html;
    expect(html).toContain('name="main.cpp"');
    for (const language of ['c++', 'c#', 'objective-c']) {
      expect(html).toContain(`language-${language}`);
    }
  });

  it('attributes slot template evaluation failures to content while preserving global failures', async () => {
    const markdown = path.join(root, 'template-failure.md');
    fs.writeFileSync(markdown, '# Page');
    const local = services();
    const diagnostic = {
      code: 'DISCOVERY_EVALUATION_FAILED',
      severity: 'error' as const,
      stage: 'evaluation' as const,
      message: 'Template include not found',
      source: { path: markdown },
      ownerId: 'guide',
    };
    for (const kind of ['guide-tab', 'header'] as const) {
      for (const failure of [
        diagnostic,
        { ...diagnostic, code: 'TEMPLATE_ENTRY_SCOPE_MISSING' },
        { ...diagnostic, code: 'DISCOVERY_ABORTED' },
        { ...diagnostic, stage: 'discovery' as const },
      ]) {
        local.templates = { render: () => ({ dependencies: [], diagnostics: [failure] }) };
        const result = await new GeneratorContentCompiler(local).compile(
          kind === 'guide-tab'
            ? { kind, id: 'slot', entry: entry(markdown), markdown }
            : { kind, id: 'slot', entry: entry(markdown) },
          new AbortController().signal,
        );
        expect(result.value).toBeUndefined();
        expect(result.diagnostics).toEqual([
          failure === diagnostic ? { ...failure, stage: 'content' } : failure,
        ]);
      }
    }
  });

  it('returns structured diagnostics for semantic, template, HTML and keyword-link failures', async () => {
    const markdown = path.join(root, 'failure.md');
    fs.writeFileSync(markdown, '# Failure');
    const semanticDiagnostic = {
      code: 'SEMANTIC_FAILURE',
      severity: 'error' as const,
      stage: 'semantic' as const,
      message: 'semantic failed',
    };

    const missingApi = services();
    missingApi.semantic = {
      ...missingApi.semantic,
      renderFragment: () => ({ dependencies: [], diagnostics: [] }),
    };
    const api = await new GeneratorContentCompiler(missingApi).compile(
      { kind: 'api-tab', id: 'api', declaration: declaration() },
      new AbortController().signal,
    );
    expect(api.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_API_FRAGMENT' }),
    );

    missingApi.semantic = {
      ...missingApi.semantic,
      renderFragment: () => ({ dependencies: [], diagnostics: [semanticDiagnostic] }),
    };
    const diagnosedApi = await new GeneratorContentCompiler(missingApi).compile(
      { kind: 'api-tab', id: 'api', declaration: declaration() },
      new AbortController().signal,
    );
    expect(diagnosedApi.diagnostics).toEqual([semanticDiagnostic]);

    const missingHeader = await new GeneratorContentCompiler(
      servicesWithFragment(undefined),
    ).compile({ kind: 'header', id: 'header', entry: declaration() }, new AbortController().signal);
    expect(missingHeader.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_API_HEADER' }),
    );
    const diagnosedHeader = await new GeneratorContentCompiler(
      servicesWithFragment(undefined, [semanticDiagnostic]),
    ).compile({ kind: 'header', id: 'header', entry: declaration() }, new AbortController().signal);
    expect(diagnosedHeader.diagnostics).toEqual([semanticDiagnostic]);

    const metadataFailure = services();
    metadataFailure.semantic = {
      ...metadataFailure.semantic,
      renderFragment: (request) =>
        request.kind === 'entry-doc'
          ? { dependencies: [], diagnostics: [semanticDiagnostic] }
          : { value: { format: 'html', value: '<p>ok</p>' }, dependencies: [], diagnostics: [] },
    };
    const guideHeader = await new GeneratorContentCompiler(metadataFailure).compile(
      { kind: 'header', id: 'header', entry: entry(markdown) },
      new AbortController().signal,
    );
    expect(guideHeader.value).toBeUndefined();
    expect(guideHeader.diagnostics).toEqual([semanticDiagnostic]);

    const thrownTemplate = services();
    thrownTemplate.templates = {
      render: () => {
        throw new Error('template exploded');
      },
    };
    const thrown = await new GeneratorContentCompiler(thrownTemplate).compile(
      { kind: 'guide-tab', id: 'guide', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(thrown.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CONTENT_COMPILE',
        message: expect.stringContaining('exploded'),
      }),
    );

    const invalidTheme = services();
    invalidTheme.configuration = {
      ...configuration,
      themes: { light: 'missing-light-theme', dark: 'missing-dark-theme' },
    };
    const htmlFailure = await new GeneratorContentCompiler(invalidTheme).compile(
      { kind: 'api-tab', id: 'api', declaration: declaration() },
      new AbortController().signal,
    );
    expect(htmlFailure.value).toBeUndefined();
    expect(htmlFailure.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_HTML_PROCESS' }),
    );

    const compiler = new GeneratorContentCompiler(services());
    const ir: ContentIR = {
      schemaVersion: 4,
      id: 'missing-link',
      entryId: 'guide',
      role: 'guide-tab',
      title: 'Guide',
      route: '',
      absoluteRoute: 'docs/guide',
      html: '<p><code>*Missing</code></p>',
      anchors: [],
      exportedKeywords: [],
      usedKeywords: ['*Missing'],
      dependencies: [],
      diagnostics: [],
    };
    const failedLink = await compiler.link(
      { ir, keywords: [], breadcrumbs: [], pageType: 'guide' },
      new AbortController().signal,
    );
    expect(failedLink.value).toBeUndefined();
    expect(failedLink.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_LINK' }),
    );
  });

  it('honors aborts before linking and at asynchronous processing boundaries', async () => {
    const compiler = new GeneratorContentCompiler(services());
    const ir: ContentIR = {
      schemaVersion: 4,
      id: 'abort',
      entryId: 'guide',
      role: 'header',
      title: 'Guide',
      route: 'guide',
      absoluteRoute: 'docs/guide',
      html: '<p>Body</p>',
      anchors: [],
      exportedKeywords: [],
      usedKeywords: [],
      dependencies: [{ kind: 'content', path: '/source', digest: 'digest' }],
      diagnostics: [],
    };
    const aborted = new AbortController();
    aborted.abort();
    const before = await compiler.link(
      { ir, keywords: [], breadcrumbs: [], pageType: 'guide' },
      aborted.signal,
    );
    expect(before.dependencies).toEqual(ir.dependencies);
    expect(before.diagnostics).toContainEqual(expect.objectContaining({ code: 'CONTENT_ABORTED' }));

    for (const abortAtRead of [2, 3, 4]) {
      let reads = 0;
      const stagedSignal = {
        get aborted() {
          reads += 1;
          return reads === abortAtRead;
        },
      } as AbortSignal;
      const staged = await compiler.link(
        { ir, keywords: [], breadcrumbs: [], pageType: 'guide' },
        stagedSignal,
      );
      expect(staged.value).toBeUndefined();
      expect(staged.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'CONTENT_ABORTED' }),
      );
    }

    for (const abortAtRead of [1, 2, 3, 4]) {
      let reads = 0;
      const stagedSignal = {
        get aborted() {
          reads += 1;
          return reads === abortAtRead;
        },
      } as AbortSignal;
      const diagnostics: Array<{ code: string }> = [];
      const processed = await (compiler as any).process(
        '<p>Body</p>',
        'docs/guide',
        diagnostics,
        stagedSignal,
        () => undefined,
      );
      expect(processed).toBeUndefined();
      expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'CONTENT_ABORTED' }));
    }
  });

  it('diagnoses a snippet path that exists but cannot be read as a file', async () => {
    const folder = path.join(root, 'snippet-folder');
    const markdown = path.join(root, 'unreadable.md');
    fs.mkdirSync(folder);
    fs.writeFileSync(markdown, '```ts file="snippet-folder"\nfallback\n```');
    const result = await new GeneratorContentCompiler(services()).compile(
      { kind: 'guide-tab', id: 'unreadable', entry: entry(markdown), markdown },
      new AbortController().signal,
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONTENT_SNIPPET_READ', source: { path: hostPath(folder) } }),
    );
    expect(result.value?.html).toContain('fallback');
  });
});

function servicesWithFragment(
  value: string | undefined,
  diagnostics: Array<{
    code: string;
    severity: 'error';
    stage: 'semantic';
    message: string;
  }> = [],
): ContentCompilerServices {
  const local = services();
  local.semantic = {
    ...local.semantic,
    renderFragment: () => ({
      ...(value === undefined ? {} : { value: { format: 'html' as const, value } }),
      dependencies: [],
      diagnostics,
    }),
  };
  return local;
}
