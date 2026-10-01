import type { NgDocContentModule, NgDocContentSource } from '@ng-doc/core/interfaces';
import { describe, expect, it } from 'vitest';

import {
  ArtifactSnapshot,
  BuildResult,
  CompilationRequest,
  ContentDescriptor,
  ContentIR,
  ContentModule,
  DeclarationDescriptor,
  DemoAsset,
  Dependency,
  EntryDescriptor,
  GENERATOR_SCHEMA_VERSION,
  GeneratorConfiguration,
  isDeclarationDescriptor,
  nonPhysicalIdentity,
  OUTPUT_SCHEMA_VERSION,
  PageArtifact,
  ProgramRetentionOutcome,
  SemanticFragmentRequest,
  SemanticProgramSynchronization,
  SemanticService,
  TemplateActions,
  WatchInputs,
} from '../contracts';

const root = '/workspace/.worktrees/docs';
const guideId = 'site:guide:docs/example/ng-doc.page.ts';
const apiId = 'site:api:docs/api/ng-doc.api.ts';

type IsJson<T> = T extends string | number | boolean | null | undefined
  ? true
  : T extends (...args: never[]) => unknown
    ? false
    : T extends Array<infer Item>
      ? IsJson<Item>
      : T extends object
        ? false extends { [Key in keyof T]-?: IsJson<T[Key]> }[keyof T]
          ? false
          : true
        : false;
type Assert<Condition extends true> = Condition;
// Optional properties are allowed in schemas; runtime validation rejects explicit undefined.
type DataContractsAreJson = Assert<
  IsJson<
    | ArtifactSnapshot
    | EntryDescriptor
    | GeneratorConfiguration
    | DeclarationDescriptor
    | BuildResult
  >
>;
type NodesAreNotJson = Assert<IsJson<{ getText(): string }> extends false ? true : false>;
type ContentPayloadIsJson = Assert<IsJson<ContentModule>>;
type RuntimeContentSourceIsNotJson = Assert<
  IsJson<NgDocContentSource> extends false ? true : false
>;
type SharedContentSchema = Assert<ContentModule extends NgDocContentModule ? true : false>;
type RuntimeContentSchema = Assert<NgDocContentModule extends ContentModule ? true : false>;

/** Example validation only; the artifacts layer supplies the production cache/transport one. */
function assertJson(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach(assertJson);
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    Object.values(value).forEach(assertJson);
    return;
  }
  throw new Error('Not lossless JSON data');
}

function roundTrip<T>(value: T): T {
  assertJson(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

const entries: EntryDescriptor[] = [
  {
    kind: 'category',
    id: 'site:category:outer',
    source: { path: `${root}/docs/ng-doc.category.ts` },
    title: 'Outer',
    route: 'outer',
    absoluteRoute: 'docs/outer',
    breadcrumbs: ['Outer'],
    runtimeImport: { source: `${root}/docs/ng-doc.category.ts`, exportName: 'default' },
    dependencies: [],
    expanded: false,
  },
  {
    kind: 'category',
    id: 'site:category:inner',
    parentId: 'site:category:outer',
    source: { path: `${root}/docs/example/ng-doc.category.ts` },
    title: 'Inner',
    route: 'inner',
    absoluteRoute: 'docs/outer/inner',
    breadcrumbs: ['Outer', 'Inner'],
    runtimeImport: { source: `${root}/docs/example/ng-doc.category.ts`, exportName: 'default' },
    dependencies: [],
  },
  {
    kind: 'guide',
    id: guideId,
    parentId: 'site:category:inner',
    source: { path: `${root}/docs/example/ng-doc.page.ts` },
    title: "User's `${title}`",
    route: 'example',
    absoluteRoute: 'docs/outer/inner/example',
    breadcrumbs: ['Outer', 'Inner', 'Example'],
    runtimeImport: { source: `${root}/docs/example/ng-doc.page.ts`, exportName: 'default' },
    markdown: [`${root}/docs/example/overview.md`, `${root}/docs/example/manual.md`],
    hasImports: true,
    dependencies: [{ kind: 'content', path: `${root}/docs/shared/config.ts`, digest: 'shared-v1' }],
  },
];

function ir(part: string, route: string): ContentIR {
  return {
    schemaVersion: GENERATOR_SCHEMA_VERSION,
    id: `${guideId}:tab:${part}`,
    entryId: guideId,
    role: 'guide-tab',
    title: part,
    route,
    absoluteRoute: `docs/outer/inner/example${route ? `/${route}` : ''}`,
    html: '<h2 id="方法">方法</h2><ng-doc-keyword key="Widget">Widget</ng-doc-keyword>',
    anchors: [
      { anchorId: '方法', anchor: '方法', title: '方法', type: 'heading' },
      {
        anchorId: 'Widget.value',
        anchor: 'value',
        title: 'value',
        type: 'member',
        scope: { key: 'Widget', title: 'Widget' },
      },
    ],
    exportedKeywords: [
      {
        key: `*example.${part}`,
        title: part,
        path: `docs/outer/inner/example/${route}`,
        type: 'link',
      },
    ],
    usedKeywords: ['Widget', '*forward'],
    dependencies: [
      { kind: 'content', path: `${root}/docs/example/${part}.md`, digest: `${part}-v1` },
      { kind: 'existence', path: `${root}/docs/shared/include.nunj`, exists: true },
    ],
    diagnostics: [],
  };
}

function artifact(
  part: string,
  role: PageArtifact['identity']['role'],
  output: string,
): PageArtifact {
  return {
    id: `${guideId}:${role}:${part}`,
    identity: { projectId: 'site', entryId: guideId, role, part },
    revision: 'revision-1',
    fingerprint: {
      schemaVersion: GENERATOR_SCHEMA_VERSION,
      compilerVersion: 'ng-doc-v1',
      toolchainDigest: 'tuple-v1',
      configurationDigest: 'config-v1',
      inputDigest: `${part}-v1`,
      keywordDigest: 'keywords-v1',
    },
    dependencies: [],
    content: [],
    exportedKeywords: [],
    usedKeywords: [],
    searchRecords: [],
    routes: [],
    apiList: [],
    outputs: [
      {
        path: output,
        role: role === 'content' ? 'content' : 'angular',
        encoding: 'utf8',
        content: `output:${part}`,
        digest: `output-${part}-v1`,
      },
    ],
    diagnostics: [],
  };
}

function guideSnapshot(): ArtifactSnapshot {
  const tabs = [
    ['overview', ''],
    ['manual', 'manual'],
  ].map(([part, route]) => {
    const content = ir(part, route);
    const result = artifact(part, 'content', `guides/example/${part}/content.json`);
    const record = {
      breadcrumbs: ['Outer', 'Inner', 'Example'],
      pageType: 'guide' as const,
      title: part,
      section: '方法',
      route: content.absoluteRoute,
      fragment: '方法',
      content: 'Searchable content',
    };
    result.content = [
      {
        ir: content,
        html: '<h2 id="方法">方法</h2>',
        searchRecords: [record],
        keywordDigest: 'keywords-v1',
      },
    ];
    result.dependencies = content.dependencies;
    result.exportedKeywords = content.exportedKeywords;
    result.usedKeywords = content.usedKeywords;
    result.searchRecords = [record];
    return result;
  });
  const shell = artifact('wrapper', 'page-shell', 'guides/example/page.ts');
  shell.routes = [
    {
      id: guideId,
      parentId: 'site:category:inner',
      path: 'example',
      title: 'Example',
      modulePath: 'guides/example/page.ts',
    },
  ];
  return {
    projectId: 'site',
    revision: 'snapshot-v1',
    artifacts: [
      shell,
      ...tabs,
      artifact('shared', 'demo-assets', 'guides/example/demo-assets.ts'),
      artifact('shared', 'playgrounds', 'guides/example/playgrounds.ts'),
    ],
    globalKeywords: [{ key: 'Widget', title: 'Widget', path: 'api/Widget', languages: ['html'] }],
    remoteKeywords: [
      {
        loaderId: 'external',
        digest: 'actual-keywords-v1',
        keywords: [
          { key: 'TS', title: 'TypeScript', path: 'https://www.typescriptlang.org', type: 'link' },
        ],
      },
    ],
  };
}

describe('generator contract examples', () => {
  it('round-trips nested category imports and two tabs with shared demo/playground owners', () => {
    expect(roundTrip(entries)).toEqual(entries);
    const snapshot = guideSnapshot();
    const restored = roundTrip(snapshot);
    expect(restored).toEqual(snapshot);
    expect(restored.artifacts.filter((item) => item.identity.role === 'content')).toHaveLength(2);
    expect(restored.artifacts.filter((item) => item.identity.role === 'demo-assets')).toHaveLength(
      1,
    );
    expect(restored.artifacts.filter((item) => item.identity.role === 'playgrounds')).toHaveLength(
      1,
    );
    const paths = restored.artifacts.flatMap((item) => item.outputs.map((output) => output.path));
    expect(new Set(paths).size).toBe(paths.length);
    expect(entries[1].runtimeImport.source).not.toBe(entries[0].runtimeImport.source);
  });

  it('restores records, unresolved keyword uses, scoped Unicode anchors and dependencies together', () => {
    const restored = roundTrip(guideSnapshot());
    const content = restored.artifacts.find((item) => item.identity.role === 'content')!;
    expect(content.searchRecords[0].fragment).toBe('方法');
    expect(content.usedKeywords).toContain('*forward');
    expect(content.content[0].ir.anchors[1]).toEqual({
      anchorId: 'Widget.value',
      anchor: 'value',
      title: 'value',
      type: 'member',
      scope: { key: 'Widget', title: 'Widget' },
    });
    expect(content.dependencies).toContainEqual({
      kind: 'existence',
      path: `${root}/docs/shared/include.nunj`,
      exists: true,
    });
    expect(restored.globalKeywords[0].languages).toEqual(['html']);
    expect(restored.globalKeywords[0]).not.toHaveProperty('type');
    expect(restored.remoteKeywords[0].digest).toBe('actual-keywords-v1');
  });

  it('represents two declarations from one file without losing scope, keywords or cache identity', () => {
    const declarations: DeclarationDescriptor[] = ['Widget', 'widgetPipe'].map((name) => ({
      id: `site:${apiId}:public:src/widget.ts#${name}`,
      apiEntryId: apiId,
      scopeId: 'public',
      source: { path: `${root}/src/widget.ts`, line: 5 },
      name,
      kind: 'ClassDeclaration',
      route: `reference/classes/public/${name}`,
      breadcrumbs: ['Reference', 'Public', name],
      exportedKeywords: [
        { key: name, title: name, path: `reference/classes/public/${name}`, languages: ['html'] },
      ],
    }));
    const artifacts = declarations.map((declaration) => ({
      ...artifact('api', 'content', `api/${declaration.name}/api/page.ts`),
      id: `${declaration.id}:content:api`,
      identity: {
        projectId: 'site',
        entryId: apiId,
        declarationId: declaration.id,
        role: 'content' as const,
        part: 'api',
      },
      exportedKeywords: declaration.exportedKeywords,
    }));
    expect(roundTrip(declarations)).toEqual(declarations);
    expect(roundTrip(artifacts)).toEqual(artifacts);
    expect(declarations[0].source.path).toBe(declarations[1].source.path);
    expect(artifacts[0].identity).not.toEqual(artifacts[1].identity);
    expect({ ...artifacts[0].identity, projectId: 'consumer' }).not.toEqual(artifacts[0].identity);
  });

  it('preserves failed-read dependencies even without usable content', () => {
    const failure = {
      dependencies: [
        { kind: 'existence' as const, path: `${root}/docs/missing.nunj`, exists: false },
      ],
      diagnostics: [
        {
          code: 'CONTENT_INCLUDE_MISSING',
          severity: 'error' as const,
          stage: 'content' as const,
          message: 'Include is missing',
          source: { path: `${root}/docs/missing.nunj` },
        },
      ],
    };
    expect(roundTrip(failure)).toEqual(failure);
    expect(failure).not.toHaveProperty('value');
  });

  it('keeps synchronous action results process-local while transporting only fragment data', () => {
    const renderFragment: SemanticService['renderFragment'] = () => ({
      value: { format: 'html', value: '<table><tr><td>value</td></tr></table>' },
      dependencies: [
        {
          kind: 'semantic',
          scopeId: 'public',
          digest: 'scope-v1',
          files: [`${root}/src/widget.ts`],
          reason: 'Conservative scope invalidation',
        },
      ],
      diagnostics: [],
    });
    const actions: TemplateActions = {
      invoke: () =>
        renderFragment({ kind: 'api', entryId: guideId, declarationPath: 'src/widget.ts#Widget' })
          .value!.value,
    };
    expect(actions.invoke('NgDocApi', 'api', ['src/widget.ts#Widget'])).toContain('<table>');
    expect(
      roundTrip(
        renderFragment({ kind: 'api-page', target: 'declaration', declarationId: 'Widget' }),
      ),
    ).toHaveProperty('value.format', 'html');
    expect(() => assertJson(actions)).toThrow('Not lossless JSON data');
  });

  it('preserves snippet icon and opened state through the semantic content boundary', () => {
    const asset: DemoAsset = {
      title: 'Example',
      language: 'ts',
      source: '/workspace/example.ts',
      code: 'const x = 1;',
      icon: 'code',
      opened: true,
    };
    expect(roundTrip(asset)).toEqual(asset);
  });

  it.each([new Map(), new Set(), new Date(), () => 'callback', undefined, NaN, Infinity])(
    'rejects a non-JSON artifact payload in the example validation',
    (payload) => {
      expect(() => assertJson({ payload })).toThrow('Not lossless JSON data');
    },
  );
});

// Type-only negative examples. Run the focused tsc command from ADR; the test runner transpiles
// without checking these expectations. AST-like objects/functions cannot substitute for IR fields.
function invalidTransportExamples(content: ContentIR): void {
  // @ts-expect-error Content HTML is data, not a deferred renderer.
  content.html = () => '<p>deferred</p>';
  // @ts-expect-error Node methods cannot substitute for serializable anchor data.
  content.anchors = [{ getText: () => 'node' }];
  // @ts-expect-error Dependencies are explicit DTO arrays, not an Observable or collection class.
  content.dependencies = new Set();
}
void invalidTransportExamples;

describe('current-attempt watch input contract', () => {
  it('round-trips a failed partial observation including missing files and empty membership', () => {
    const watchInputs: WatchInputs = {
      files: ['/shared/not-created/header.nunj'],
      globs: [{ root: '/shared/not-created', include: ['**/*.md'], exclude: ['**/draft/**'] }],
    };
    const result: BuildResult = {
      status: 'failure',
      generation: 2,
      diagnostics: [],
      whyRebuilt: [],
      lastGoodRevision: 'published-revision',
      watchInputs,
    };
    expect(roundTrip(result)).toEqual(result);
    expect(roundTrip(result)).not.toHaveProperty('snapshot');
  });

  it('distinguishes an absent observation from an explicitly empty observation', () => {
    const result: BuildResult = {
      status: 'failure',
      generation: 1,
      diagnostics: [],
      whyRebuilt: [],
    };
    expect(roundTrip(result)).not.toHaveProperty('watchInputs');
    expect(roundTrip({ ...result, watchInputs: { files: [], globs: [] } })).toHaveProperty(
      'watchInputs',
      { files: [], globs: [] },
    );
  });
});

function invalidCancelledObservation(result: Extract<BuildResult, { status: 'cancelled' }>): void {
  // @ts-expect-error A superseded attempt cannot publish new watch inputs.
  result.watchInputs = { files: ['/stale/input'], globs: [] };
}
void invalidCancelledObservation;

it('shares a JSON-only content payload between the runtime and generator', () => {
  const payload: NgDocContentModule = {
    schemaVersion: 1,
    id: 'guide:welcome:body',
    revision: 'linked-content-digest',
    html: '<h1>Привет</h1>',
  };
  const generated: ContentModule = payload;
  expect(roundTrip(generated)).toEqual(payload);
});

it('round-trips a compact descriptor plan whose descriptors are all ready', () => {
  const descriptor: ContentDescriptor = {
    schemaVersion: GENERATOR_SCHEMA_VERSION,
    id: 'owner:tab:source',
    ownerId: 'owner',
    ordinal: 0,
    role: 'guide-tab',
    locator: { kind: 'guide-tab', markdown: '/docs/page.md' },
    title: 'Page',
    route: '',
    absoluteRoute: 'docs/page',
    searchBreadcrumbs: ['Page'],
    dependencies: [{ kind: 'content', path: '/docs/page.md', digest: 'bytes' }],
    inputDigest: 'input',
    requestDigest: 'request',
    closureIds: ['owner:header'],
  };
  const plan: Pick<PageArtifact, 'contentDescriptors'> = { contentDescriptors: [descriptor] };
  expect(roundTrip(plan)).toEqual(plan);
  expect(JSON.stringify(plan)).not.toMatch(/semantics|declarationTree|html|render/);
});

it('keeps the watch origin JSON-only', () => {
  const request: CompilationRequest = {
    generation: 3,
    mode: 'development',
    changes: [],
    contentRequest: { origin: 'reconcile' },
  };
  expect(roundTrip({ request })).toEqual({ request });
});

/**
 * Type-only negative examples: the demand origins, the deferred content IDs and the snapshot
 * content index are gone.
 * @param request A compilation request.
 * @param artifact A page artifact.
 * @param snapshot A snapshot.
 */
function invalidDemandExamples(
  request: CompilationRequest,
  artifact: PageArtifact,
  snapshot: ArtifactSnapshot,
): void {
  // @ts-expect-error Content demand origins were removed with the lazy transport.
  request.contentRequest = { origin: 'interactive' };
  // @ts-expect-error Every descriptor is ready, so artifacts carry no deferred IDs.
  artifact.deferredContentIds = [];
  // @ts-expect-error Snapshots carry no content index.
  snapshot.contentIndex = undefined;
}
void invalidDemandExamples;

describe('non-physical dependency kinds, descriptor and fragment discriminants', () => {
  const closure: Dependency = {
    kind: 'semantic-closure',
    scopeId: 'public',
    key: 'site:api:docs/api/ng-doc.api.ts#Widget',
    digest: 'a'.repeat(64),
  };
  const evaluated: Dependency = { kind: 'evaluated', entryId: guideId, digest: 'b'.repeat(64) };

  it('round-trips both kinds as JSON with their exact shapes', () => {
    expect(roundTrip([closure, evaluated])).toEqual([closure, evaluated]);
    expect(Object.keys(closure).sort()).toEqual(['digest', 'key', 'kind', 'scopeId']);
    expect(Object.keys(evaluated).sort()).toEqual(['digest', 'entryId', 'kind']);
  });

  it('gives a closure one identity per scope and key, and an evaluated digest one per entry', () => {
    expect(nonPhysicalIdentity(closure as never)).toBe(
      'semantic-closure:public:site:api:docs/api/ng-doc.api.ts#Widget',
    );
    expect(nonPhysicalIdentity({ ...closure, key: 'other' } as never)).not.toBe(
      nonPhysicalIdentity(closure as never),
    );
    expect(nonPhysicalIdentity(evaluated as never)).toBe(`evaluated:${guideId}`);
    expect(nonPhysicalIdentity({ ...evaluated, digest: 'c' } as never)).toBe(
      nonPhysicalIdentity(evaluated as never),
    );
  });

  it('versions the dependency-carrying shapes apart from the output formats', () => {
    // Version 2: entries record their evaluation closure and an `evaluated` dependency.
    // Version 3: artifacts carry no deferred content IDs and snapshots no content index.
    // Version 4: declaration summaries (signature, description) reach search records, API list
    // records and descriptors, and API entry routes carry their list segment.
    expect(GENERATOR_SCHEMA_VERSION).toBe(4);
    expect(OUTPUT_SCHEMA_VERSION).toBe(1);
  });

  it('tells a declaration descriptor from an entry with or without its discriminant', () => {
    const declaration: DeclarationDescriptor = {
      id: 'Widget',
      apiEntryId: apiId,
      scopeId: 'public',
      source: { path: `${root}/src/widget.ts` },
      name: 'Widget',
      kind: 'Class',
      signature: 'export class Widget',
      description: 'A widget.',
      route: 'widget',
      breadcrumbs: ['API'],
      exportedKeywords: [],
    };
    const marked = roundTrip({ ...declaration, descriptorKind: 'declaration' as const });
    expect(isDeclarationDescriptor(declaration)).toBe(true);
    expect(isDeclarationDescriptor(marked)).toBe(true);
    for (const entry of entries) expect(isDeclarationDescriptor(entry)).toBe(false);
  });

  it('names the target of a declaration-keyed fragment request', () => {
    const requests: SemanticFragmentRequest[] = [
      { kind: 'api-header', target: 'declaration', declarationId: 'Widget' },
      { kind: 'entry-doc', entryId: guideId },
      { kind: 'js-doc', target: 'entry', entryId: guideId, declarationPath: 'src/widget.ts#W' },
    ];
    expect(roundTrip(requests).map((request) => request.target ?? 'entry')).toEqual([
      'declaration',
      'entry',
      'entry',
    ]);
  });

  it('lists the four retention outcomes, and hands back only a patched-failed program', () => {
    const outcomes: ProgramRetentionOutcome[] = ['reused', 'patched', 'patched-failed', 'full'];
    const handedBack = { retained: true as const };
    const failed: SemanticProgramSynchronization = { outcome: 'patched-failed', handedBack };
    expect(outcomes).toHaveLength(4);
    expect(failed.handedBack).toBe(handedBack);
  });
});

// Type-only: a declaration-keyed fragment request must name its target.
function invalidFragmentRequests(): SemanticFragmentRequest[] {
  return [
    // @ts-expect-error A declaration id without `target: 'declaration'` is not a request.
    { kind: 'api-page', declarationId: 'Widget' },
    // @ts-expect-error An entry-keyed request cannot claim a declaration target.
    { kind: 'entry-doc', target: 'declaration', entryId: guideId },
  ];
}
void invalidFragmentRequests;
