import matter from 'gray-matter';
import { type RendererObject, Marked } from 'marked';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { keywordHeadingTitle } from '../../helpers/keyword-heading-title';
import { removeLinesFromCode } from '../../helpers/remove-lines-from-code';
import { parseCodeBlockParams } from '../../parsers/parse-code-block-params';
import type {
  ContentAnchor,
  ContentCompiler,
  ContentCompilerServices,
  ContentDescriptor,
  ContentDescriptorProvenance,
  ContentIR,
  ContentRequest,
  DeferredContentRequest,
  Dependency,
  Diagnostic,
  GuideSemantics,
  JsonValue,
  KeywordExport,
  LinkedContent,
  SearchRecord,
  ServiceResult,
  TemplateActions,
} from '../contracts';
import { GENERATOR_SCHEMA_VERSION, isDeclarationDescriptor } from '../contracts';
import {
  canonicalJson as stableValue,
  digestOf as hashValue,
  sha256Hex,
} from '../kernel/canonical';
import {
  type FootprintScopeKind,
  type RecorderMode,
  attachFootprint,
  footprintOf,
  FootprintScope,
  readText,
  recorderMode,
} from '../kernel/footprint';
import { readTextFile } from '../kernel/observations';
import { hostPath } from '../kernel/paths';
import { snippetRegion } from './code-snippet';
import { type HighlightSession, HIGHLIGHT_CACHE_MISMATCH } from './highlight-cache';
import {
  type LinkedDocument,
  type LinkTask,
  type RenderDocument,
  type RenderedDocument,
  type RenderTask,
  bindingsOf,
  linkDocument,
  renderDocuments,
} from './html-pipeline';

/** The warning of `NGDOC_PARALLEL_RENDER=verify` (`./html-pool`). */
export const PARALLEL_RENDER_MISMATCH = 'CONTENT_PARALLEL_MISMATCH';

const DEFAULT_GUIDE_HEADER = `<h1 class="ngde">{{ NgDocPage.title }}</h1>
{% if Metadata.description %}<p class="ngde">{{ Metadata.description }}</p>{% endif %}`;
// The keyword digest reaches generated content modules (their revision), so it keeps its own
// fixed formula rather than canonical JSON.
const digest = (value: string) => sha256Hex(value);
const asString = (value: JsonValue): string => (typeof value === 'string' ? value : '');

interface ProcessedHtml {
  html: string;
  anchors: ContentAnchor[];
  usedKeywords: string[];
}

type DescriptorFields = Omit<
  ContentDescriptor,
  'ownerId' | 'ordinal' | 'requestDigest' | 'closureIds'
>;

/**
 * Where a generation runs the back half of its content (`./html-pipeline`): in the main thread or
 * on render threads (`./html-pool`). Either way a task's result is the pipeline's result for its
 * input, so the content compiler cannot tell them apart.
 */
export interface ContentBack {
  render(task: RenderTask, signal: AbortSignal): Promise<RenderedDocument[]>;
  link(
    task: LinkTask,
    keywords: readonly KeywordExport[],
    signal: AbortSignal,
  ): Promise<LinkedDocument>;
}

/** A link whose back half was dispatched ahead of its turn (`prepareLink`). */
export interface PreparedLink {
  readonly ir: ContentIR;
  readonly keywords: KeywordExport[];
  readonly outcome: Promise<LinkedDocument>;
}

/**
 * Stateless, per-document content compiler. It never touches legacy stores.
 *
 * A compile has a front, which reads files, evaluates templates and queries the program, and a back
 * half, the HTML pipeline, which is a pure function of the HTML the front produced
 * (`./html-pipeline`). `compileStaged` resolves once the front is done and the back half is
 * dispatched, so a caller can run the next front while the back half of this one runs elsewhere.
 */
export class GeneratorContentCompiler implements ContentCompiler {
  /**
   * @param services - What the compiler reads.
   * @param highlight - The generation's cache of highlighted code blocks; without it, every block
   *   is highlighted (`./highlight-cache`).
   * @param back - Where the HTML pipeline runs; without it, in this thread, at once.
   */
  constructor(
    private readonly services: ContentCompilerServices,
    private readonly highlight?: HighlightSession,
    private readonly back?: ContentBack,
  ) {}

  /**
   * Whether this call records its footprint. The semantic service's effective recorder state
   * decides when it reports one: a service that records nothing, or whose probe or install failed,
   * gets no content footprint either. Otherwise the environment
   * decides. A query that still returns no footprint makes the content footprint incomplete.
   */
  private recording(): boolean {
    const semantic = (
      this.services.semantic as {
        recording?: () => { mode: RecorderMode; unavailable?: string };
      }
    ).recording?.();
    return semantic
      ? semantic.mode !== 'off' && semantic.unavailable === undefined
      : recorderMode() !== 'off';
  }

  /**
   * One recorder scope per content phase call. The files channel is every physical dependency the
   * call reports, and the semantic queries it made are merged in. The footprint is attached to the
   * result out of band; the result itself is unchanged.
   */
  private scope(kind: FootprintScopeKind, key: string): FootprintScope | undefined {
    return this.recording() ? new FootprintScope(kind, key) : undefined;
  }

  private sealed<T>(scope: FootprintScope | undefined, result: ServiceResult<T>): ServiceResult<T> {
    if (!scope) return result;
    scope.observeAll(result.dependencies);
    return attachFootprint(result, scope.seal());
  }

  async describe(
    request: DeferredContentRequest,
    provenance: ContentDescriptorProvenance,
    signal: AbortSignal,
  ): Promise<ServiceResult<ContentDescriptor>> {
    const scope = this.scope('content-describe', request.id);
    return this.sealed(scope, await this.describeContent(request, provenance, signal));
  }

  private async describeContent(
    request: DeferredContentRequest,
    provenance: ContentDescriptorProvenance,
    signal: AbortSignal,
  ): Promise<ServiceResult<ContentDescriptor>> {
    const dependencies: Dependency[] = [];
    const diagnostics: Diagnostic[] = [];
    if (this.stopIfAborted(signal, diagnostics, 'Description was aborted')) {
      return { dependencies, diagnostics };
    }
    const provenanceError = this.validateProvenance(request, provenance);
    if (provenanceError) {
      diagnostics.push(this.diag('CONTENT_DESCRIPTOR_PROVENANCE', provenanceError));
      return { dependencies, diagnostics };
    }
    try {
      const fields = await this.descriptorFields(request, dependencies, diagnostics, signal);
      if (!fields) return { dependencies, diagnostics };
      const valueWithoutDigest = {
        ...fields,
        ownerId: provenance.ownerId,
        ordinal: provenance.ordinal,
        closureIds: [...provenance.closureIds],
      };
      return {
        dependencies,
        diagnostics,
        value: {
          ...valueWithoutDigest,
          requestDigest: hashValue({ value: valueWithoutDigest, provenance }),
        },
      };
    } catch (error) {
      diagnostics.push(this.diag('CONTENT_DESCRIPTOR', String(error)));
      return { dependencies, diagnostics };
    }
  }

  async compile(
    request: ContentRequest,
    signal: AbortSignal,
    descriptor?: ContentDescriptor,
  ): Promise<ServiceResult<ContentIR>> {
    return (await this.compileStaged(request, signal, descriptor)).finish;
  }

  /**
   * `compile` in two stages: resolves once the front of the compile is done (everything it reads,
   * evaluates and queries) and its HTML pipeline is dispatched to the back (`ContentBack`); `finish`
   * then settles with exactly what `compile` returns. The rest of the compile after the pipeline is
   * pure, so a caller may start the next front before `finish` settles: the fronts, and with them
   * the semantic queries and their order, stay those of sequential compiles.
   */
  async compileStaged(
    request: ContentRequest,
    signal: AbortSignal,
    descriptor?: ContentDescriptor,
  ): Promise<{ finish: Promise<ServiceResult<ContentIR>> }> {
    const scope = this.scope('content-compile', request.id);
    let staged!: () => void;
    const front = new Promise<void>((resolve) => (staged = resolve));
    const finish = this.compileContent(request, signal, descriptor, scope, staged).then((result) =>
      this.sealed(scope, result),
    );
    await Promise.race([front, finish]);
    return { finish };
  }

  private async compileContent(
    request: ContentRequest,
    signal: AbortSignal,
    descriptor: ContentDescriptor | undefined,
    scope: FootprintScope | undefined,
    staged: () => void,
  ): Promise<ServiceResult<ContentIR>> {
    const dependencies: Dependency[] = [];
    const diagnostics: Diagnostic[] = [];
    if (this.stopIfAborted(signal, diagnostics, 'Compilation was aborted')) {
      return { dependencies, diagnostics };
    }

    try {
      if (descriptor) {
        if (request.kind === 'demo-assets') {
          diagnostics.push(
            this.diag(
              'CONTENT_DESCRIPTOR_STALE',
              'Demo assets do not accept a deferred content descriptor.',
            ),
          );
          return { dependencies, diagnostics };
        }
        const current = await this.descriptorFields(request, dependencies, diagnostics, signal);
        if (!current) {
          if (!diagnostics.some((item) => item.code === 'CONTENT_ABORTED')) {
            diagnostics.push(
              this.diag(
                'CONTENT_DESCRIPTOR_STALE',
                `Content descriptor no longer matches request "${request.id}".`,
                request.kind === 'guide-tab' ? request.markdown : undefined,
              ),
            );
          }
          return { dependencies, diagnostics };
        }
        if (!this.matchesDescriptor(request, descriptor, current)) {
          diagnostics.push(
            this.diag(
              'CONTENT_DESCRIPTOR_STALE',
              `Content descriptor no longer matches request "${request.id}".`,
              request.kind === 'guide-tab' ? request.markdown : undefined,
            ),
          );
          return { dependencies, diagnostics };
        }
        dependencies.length = 0;
        diagnostics.length = 0;
      }

      let result: ServiceResult<ContentIR>;
      switch (request.kind) {
        case 'guide-tab':
          result = await this.guideTab(request, dependencies, diagnostics, signal, scope, staged);
          break;
        case 'api-tab':
          result = await this.apiTab(request, dependencies, diagnostics, signal, scope, staged);
          break;
        case 'demo-assets':
          result = await this.demoAssets(request, dependencies, diagnostics, signal, staged);
          break;
        case 'header':
          result = await this.header(request, dependencies, diagnostics, signal, scope, staged);
          break;
      }
      if (descriptor && !this.matchesCompiledDependencies(descriptor, result.dependencies)) {
        return {
          dependencies: result.dependencies,
          diagnostics: [
            ...result.diagnostics,
            this.diag(
              'CONTENT_DESCRIPTOR_STALE',
              `Physical content changed while compiling request "${request.id}".`,
              request.kind === 'guide-tab' ? request.markdown : undefined,
            ),
          ],
        };
      }
      return result;
    } catch (error) {
      diagnostics.push(this.diag('CONTENT_COMPILE', String(error)));
      return { dependencies, diagnostics };
    }
  }

  private async descriptorFields(
    request: DeferredContentRequest,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
    signal: AbortSignal,
  ): Promise<DescriptorFields | undefined> {
    let metadata: {
      title: string;
      route: string;
      absoluteRoute: string;
      searchBreadcrumbs: string[];
      icon?: string;
      keyword?: string;
    };
    if (request.kind === 'guide-tab') {
      const dependencyIndex =
        dependencies.push({ kind: 'existence', path: request.markdown, exists: false }) - 1;
      let source: string;
      let sourceDigest: string;
      try {
        ({ text: source, digest: sourceDigest } = await readTextFile(request.markdown));
      } catch (error) {
        diagnostics.push(this.diag('CONTENT_READ', String(error), request.markdown));
        return undefined;
      }
      dependencies[dependencyIndex] = {
        kind: 'content',
        path: request.markdown,
        digest: sourceDigest,
      };
      if (this.stopIfAborted(signal, diagnostics, 'Description was aborted')) return undefined;
      let parsed: matter.GrayMatterFile<string>;
      try {
        parsed = matter(source);
      } catch (error) {
        diagnostics.push(this.diag('CONTENT_FRONTMATTER', String(error), request.markdown));
        return undefined;
      }
      const route = typeof parsed.data.route === 'string' ? parsed.data.route : '';
      metadata = {
        title: typeof parsed.data.title === 'string' ? parsed.data.title : request.entry.title,
        route,
        absoluteRoute: route
          ? `${request.entry.absoluteRoute.replace(/\/$/, '')}/${route.replace(/^\//, '')}`
          : request.entry.absoluteRoute,
        searchBreadcrumbs: [
          ...request.entry.breadcrumbs,
          ...(typeof parsed.data.title === 'string' ? [parsed.data.title] : []),
        ],
        ...(typeof parsed.data.icon === 'string' ? { icon: parsed.data.icon } : {}),
        ...(typeof parsed.data.keyword === 'string' ? { keyword: parsed.data.keyword } : {}),
      };
    } else {
      const entry = request.kind === 'api-tab' ? request.declaration : request.entry;
      const declaration = isDeclarationDescriptor(entry);
      metadata = {
        title: declaration ? entry.name : entry.title,
        route: entry.route,
        absoluteRoute: isDeclarationDescriptor(entry) ? entry.route : entry.absoluteRoute,
        searchBreadcrumbs: [...entry.breadcrumbs],
      };
      if (request.kind === 'header' && !declaration && this.services.configuration.headerTemplate) {
        const template = this.services.configuration.headerTemplate;
        dependencies.push({ kind: 'existence', path: template, exists: false });
        try {
          const { text: source, digest } = await readTextFile(template);
          dependencies[dependencies.length - 1] = {
            kind: 'content',
            path: template,
            digest,
          };
        } catch (error) {
          diagnostics.push(this.diag('CONTENT_HEADER_READ', String(error), template));
          return undefined;
        }
      }
    }
    if (this.stopIfAborted(signal, diagnostics, 'Description was aborted')) return undefined;
    return {
      schemaVersion: GENERATOR_SCHEMA_VERSION,
      id: request.id,
      role: request.kind,
      locator:
        request.kind === 'guide-tab'
          ? { kind: request.kind, markdown: request.markdown }
          : request.kind === 'api-tab'
            ? { kind: request.kind, declarationId: request.declaration.id }
            : { kind: request.kind },
      ...metadata,
      dependencies: dependencies.map((dependency) => ({ ...dependency })),
      inputDigest: hashValue(dependencies),
    };
  }

  private validateProvenance(
    request: DeferredContentRequest,
    provenance: ContentDescriptorProvenance,
  ): string | undefined {
    if (!provenance.ownerId || !Number.isSafeInteger(provenance.ordinal) || provenance.ordinal < 0)
      return 'Descriptor owner and non-negative ordinal are required.';
    if (expectedContentId(request, provenance.ownerId) !== request.id)
      return `Request "${request.id}" does not belong to owner "${provenance.ownerId}".`;
    const expectedClosure = request.kind === 'header' ? [] : [`${provenance.ownerId}:header`];
    if (!sameValue(provenance.closureIds, expectedClosure))
      return `Descriptor closure for "${request.id}" is invalid.`;
    return undefined;
  }

  private matchesDescriptor(
    request: DeferredContentRequest,
    descriptor: ContentDescriptor,
    current: DescriptorFields,
  ): boolean {
    return (
      /^[a-f0-9]{64}$/.test(descriptor.requestDigest) &&
      expectedContentId(request, descriptor.ownerId) === request.id &&
      Number.isSafeInteger(descriptor.ordinal) &&
      descriptor.ordinal >= 0 &&
      sameValue(
        descriptor.closureIds,
        request.kind === 'header' ? [] : [`${descriptor.ownerId}:header`],
      ) &&
      sameValue(omitDescriptorPublication(descriptor), current)
    );
  }

  private matchesCompiledDependencies(
    descriptor: ContentDescriptor,
    dependencies: Dependency[],
  ): boolean {
    return descriptor.dependencies.every((expected) => {
      if (expected.kind !== 'content' && expected.kind !== 'existence') return false;
      return dependencies.some(
        (actual) =>
          (actual.kind === 'content' || actual.kind === 'existence') &&
          actual.path === expected.path &&
          sameValue(actual, expected),
      );
    });
  }

  private async guideTab(
    request: Extract<ContentRequest, { kind: 'guide-tab' }>,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
    signal: AbortSignal,
    scope: FootprintScope | undefined,
    staged: () => void,
  ): Promise<ServiceResult<ContentIR>> {
    dependencies.push({ kind: 'existence', path: request.markdown, exists: false });
    let source: string;
    let sourceDigest: string;
    try {
      ({ text: source, digest: sourceDigest } = await readTextFile(request.markdown));
    } catch (error) {
      diagnostics.push(this.diag('CONTENT_READ', String(error), request.markdown));
      return { dependencies, diagnostics };
    }
    dependencies[0] = { kind: 'content', path: request.markdown, digest: sourceDigest };
    if (this.stopIfAborted(signal, diagnostics, 'Compilation was aborted')) {
      return { dependencies, diagnostics };
    }

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(source);
    } catch (error) {
      diagnostics.push(this.diag('CONTENT_FRONTMATTER', String(error), request.markdown));
      return { dependencies, diagnostics };
    }

    const rendered = this.services.templates.render(
      {
        entryId: request.entry.id,
        source: { path: request.markdown },
        text: parsed.content,
        scope: path.dirname(request.markdown),
        kind: 'guide',
        values: {
          title: request.entry.title,
          route: request.entry.route,
          absoluteRoute: request.entry.absoluteRoute,
        },
      },
      this.actions(request.entry.id, dependencies, diagnostics, scope),
    );
    dependencies.push(...rendered.dependencies);
    diagnostics.push(...rendered.diagnostics.map(contentTemplateDiagnostic));
    if (rendered.value === undefined) return { dependencies, diagnostics };

    const route = typeof parsed.data.route === 'string' ? parsed.data.route : '';
    const absoluteRoute = route
      ? `${request.entry.absoluteRoute.replace(/\/$/, '')}/${route.replace(/^\//, '')}`
      : request.entry.absoluteRoute;
    const processed = await this.process(
      this.markdownToHtml(
        rendered.value,
        path.dirname(request.markdown),
        dependencies,
        diagnostics,
      ),
      absoluteRoute,
      diagnostics,
      signal,
      staged,
    );
    if (!processed) return { dependencies, diagnostics };

    const title = typeof parsed.data.title === 'string' ? parsed.data.title : request.entry.title;
    const keywordTitle =
      route && typeof parsed.data.title === 'string'
        ? `${request.entry.title} - ${parsed.data.title}`
        : request.entry.title;
    const keyword = typeof parsed.data.keyword === 'string' ? parsed.data.keyword : '';
    const exportedKeywords = keyword
      ? this.anchorKeywords(`*${keyword}`, keywordTitle, absoluteRoute, processed.anchors, true)
      : [];

    return {
      dependencies,
      diagnostics,
      value: {
        ...this.ir(
          request.id,
          request.entry.id,
          'guide-tab',
          title,
          route,
          absoluteRoute,
          processed,
          dependencies,
          diagnostics,
        ),
        searchBreadcrumbs: [
          ...request.entry.breadcrumbs,
          ...(typeof parsed.data.title === 'string' ? [parsed.data.title] : []),
        ],
        ...(typeof parsed.data.icon === 'string' ? { icon: parsed.data.icon } : {}),
        exportedKeywords,
      },
    };
  }

  private async apiTab(
    request: Extract<ContentRequest, { kind: 'api-tab' }>,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
    signal: AbortSignal,
    scope: FootprintScope | undefined,
    staged: () => void,
  ): Promise<ServiceResult<ContentIR>> {
    const fragment = this.services.semantic.renderFragment({
      kind: 'api-page',
      target: 'declaration',
      declarationId: request.declaration.id,
    });
    scope?.merge(footprintOf(fragment));
    dependencies.push(...fragment.dependencies);
    diagnostics.push(...fragment.diagnostics);
    if (!fragment.value || typeof fragment.value.value !== 'string') {
      if (!fragment.diagnostics.length) {
        diagnostics.push(this.diag('CONTENT_API_FRAGMENT', 'API page fragment is not HTML'));
      }
      return { dependencies, diagnostics };
    }
    const processed = await this.process(
      fragment.value.value,
      request.declaration.route,
      diagnostics,
      signal,
      staged,
    );
    if (!processed) return { dependencies, diagnostics };
    const rootKey = request.declaration.exportedKeywords[0]?.key ?? request.declaration.name;
    const exportedKeywords = [
      ...request.declaration.exportedKeywords,
      ...this.anchorKeywords(
        rootKey,
        request.declaration.name,
        request.declaration.route,
        processed.anchors.map((anchor) =>
          anchor.scope?.key === request.declaration.name
            ? { ...anchor, scope: { ...anchor.scope, key: rootKey } }
            : anchor,
        ),
        false,
      ).slice(1),
    ];
    return {
      dependencies,
      diagnostics,
      value: {
        ...this.ir(
          request.id,
          request.declaration.apiEntryId,
          'api-tab',
          request.declaration.name,
          request.declaration.route,
          request.declaration.route,
          processed,
          dependencies,
          diagnostics,
        ),
        searchBreadcrumbs: [...request.declaration.breadcrumbs],
        exportedKeywords,
      },
    };
  }

  private async demoAssets(
    request: Extract<ContentRequest, { kind: 'demo-assets' }>,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
    signal: AbortSignal,
    staged: () => void,
  ): Promise<ServiceResult<ContentIR>> {
    // The front reads every asset (up to the first that cannot be read) before the back processes
    // them, in order, until the first that fails. What each asset recorded is then replayed in the
    // order a one-asset-at-a-time compile records it, and nothing after the first failure counts:
    // an unread asset is not a dependency, and reading one has no effect but its result.
    const reads: Array<{
      name: string;
      dependencies: Dependency[];
      diagnostics: Diagnostic[];
      document?: RenderDocument;
    }> = [];
    reading: for (const [name, assets] of Object.entries(request.semantics.demos)) {
      for (const asset of assets) {
        const read = { name, dependencies: [], diagnostics: [] } as (typeof reads)[number];
        reads.push(read);
        if (
          this.readPhysicalFile(
            asset.source,
            read.dependencies,
            read.diagnostics,
            'CONTENT_DEMO_ASSET_READ',
          ) === undefined
        )
          break reading;
        const meta = codeMetadata({
          name: asset.title,
          ...(asset.icon === undefined ? {} : { icon: asset.icon }),
          ...(asset.opened === undefined ? {} : { opened: asset.opened }),
        });
        read.document = {
          html: `<pre><code class="language-${escapeAttribute(asset.language)}" lang="${escapeAttribute(asset.language)}" metastring="${meta}">${escapeHtml(asset.code)}</code></pre>`,
        };
      }
    }
    const documents = reads.flatMap((read) => (read.document ? [read.document] : []));
    const rendered = documents.length ? await this.render(documents, signal, staged) : [];
    const blocks: string[] = [];
    const anchors: ContentAnchor[] = [];
    const usedKeywords = new Set<string>();
    for (const [index, read] of reads.entries()) {
      dependencies.push(...read.dependencies);
      diagnostics.push(...read.diagnostics);
      if (!read.document) return { dependencies, diagnostics };
      const processed = this.processed(rendered[index]!, diagnostics);
      if (!processed) return { dependencies, diagnostics };
      anchors.push(...processed.anchors);
      processed.usedKeywords.forEach((keyword) => usedKeywords.add(keyword));
      blocks.push(
        `<ng-doc-demo-assets name="${escapeAttribute(read.name)}">${processed.html}</ng-doc-demo-assets>`,
      );
    }
    return {
      dependencies,
      diagnostics,
      value: this.ir(
        request.id,
        request.entry.id,
        'demo-assets',
        request.entry.title,
        request.entry.route,
        request.entry.absoluteRoute,
        { html: blocks.join(''), anchors, usedKeywords: [...usedKeywords] },
        dependencies,
        diagnostics,
      ),
    };
  }

  private async header(
    request: Extract<ContentRequest, { kind: 'header' }>,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
    signal: AbortSignal,
    scope: FootprintScope | undefined,
    staged: () => void,
  ): Promise<ServiceResult<ContentIR>> {
    const entry = request.entry;
    if (isDeclarationDescriptor(entry)) {
      const fragment = this.services.semantic.renderFragment({
        kind: 'api-header',
        target: 'declaration',
        declarationId: entry.id,
      });
      scope?.merge(footprintOf(fragment));
      dependencies.push(...fragment.dependencies);
      diagnostics.push(...fragment.diagnostics);
      if (!fragment.value || typeof fragment.value.value !== 'string') {
        if (!fragment.diagnostics.length) {
          diagnostics.push(this.diag('CONTENT_API_HEADER', 'API header fragment is not HTML'));
        }
        return { dependencies, diagnostics };
      }
      const processed = await this.process(
        fragment.value.value,
        entry.route,
        diagnostics,
        signal,
        staged,
      );
      return processed
        ? {
            dependencies,
            diagnostics,
            value: {
              ...this.ir(
                request.id,
                entry.apiEntryId,
                'header',
                entry.name,
                entry.route,
                entry.route,
                processed,
                dependencies,
                diagnostics,
              ),
              searchBreadcrumbs: [...entry.breadcrumbs],
            },
          }
        : { dependencies, diagnostics };
    }

    const metadata = this.services.semantic.renderFragment({
      kind: 'entry-doc',
      entryId: entry.id,
    });
    scope?.merge(footprintOf(metadata));
    dependencies.push(...metadata.dependencies);
    diagnostics.push(...metadata.diagnostics);
    if (!metadata.value && metadata.diagnostics.length) return { dependencies, diagnostics };

    let text = DEFAULT_GUIDE_HEADER;
    const template = this.services.configuration.headerTemplate;
    if (template) {
      dependencies.push({ kind: 'existence', path: template, exists: false });
      try {
        const read = await readTextFile(template);
        text = read.text;
        dependencies[dependencies.length - 1] = {
          kind: 'content',
          path: template,
          digest: read.digest,
        };
      } catch (error) {
        diagnostics.push(this.diag('CONTENT_HEADER_READ', String(error), template));
        return { dependencies, diagnostics };
      }
    }
    if (this.stopIfAborted(signal, diagnostics, 'Compilation was aborted')) {
      return { dependencies, diagnostics };
    }

    const rendered = this.services.templates.render(
      {
        entryId: entry.id,
        source: entry.source,
        text,
        scope: this.services.configuration.workspaceRoot,
        kind: 'header',
        values: {
          Metadata: metadata.value?.value ?? { description: '', tags: {} },
          title: entry.title,
          route: entry.route,
          absoluteRoute: entry.absoluteRoute,
        },
      },
      this.actions(entry.id, dependencies, diagnostics, scope),
    );
    dependencies.push(...rendered.dependencies);
    diagnostics.push(...rendered.diagnostics.map(contentTemplateDiagnostic));
    if (rendered.value === undefined) return { dependencies, diagnostics };
    const processed = await this.process(
      rendered.value,
      entry.absoluteRoute,
      diagnostics,
      signal,
      staged,
    );
    return processed
      ? {
          dependencies,
          diagnostics,
          value: {
            ...this.ir(
              request.id,
              entry.id,
              'header',
              entry.title,
              entry.route,
              entry.absoluteRoute,
              processed,
              dependencies,
              diagnostics,
            ),
            searchBreadcrumbs: [...entry.breadcrumbs],
          },
        }
      : { dependencies, diagnostics };
  }

  /** Processes one document (`./html-pipeline`) and reports what failed. */
  private async process(
    html: string,
    route: string | undefined,
    diagnostics: Diagnostic[],
    signal: AbortSignal,
    staged: () => void,
  ): Promise<ProcessedHtml | undefined> {
    const document: RenderDocument = {
      html,
      ...(route === undefined ? {} : { route }),
      headings: this.services.configuration.anchorHeadings,
    };
    const [rendered] = await this.render([document], signal, staged);
    return this.processed(rendered!, diagnostics);
  }

  /**
   * Dispatches a render task to the back (or runs it here), then tells the caller of
   * `compileStaged` that the front is done: everything after the pipeline is pure.
   */
  private render(
    documents: RenderDocument[],
    signal: AbortSignal,
    staged: () => void,
  ): Promise<RenderedDocument[]> {
    const task: RenderTask = { documents, themes: this.services.configuration.themes };
    const rendered = this.back
      ? this.back.render(task, signal)
      : renderDocuments(
          task,
          () => this.highlight?.call(),
          () => signal.aborted,
        );
    staged();
    return rendered;
  }

  /** A document's diagnostics, in the order the pipeline met them, and its HTML when it succeeded. */
  private processed(
    rendered: RenderedDocument,
    diagnostics: Diagnostic[],
  ): ProcessedHtml | undefined {
    if (rendered.mismatches)
      diagnostics.push({
        ...this.diag(
          HIGHLIGHT_CACHE_MISMATCH,
          `${rendered.mismatches} cached code block(s) differ from highlighting them again; the fresh highlighting is used.`,
        ),
        severity: 'warning',
      });
    if (rendered.differs !== undefined) diagnostics.push(this.parallelMismatch(rendered.differs));
    if ('failed' in rendered) {
      diagnostics.push(
        this.diag(
          rendered.failed === 'process' ? 'CONTENT_HTML_PROCESS' : 'CONTENT_HTML_POST_PROCESS',
          rendered.message,
        ),
      );
      return undefined;
    }
    if ('aborted' in rendered) {
      diagnostics.push(this.diag('CONTENT_ABORTED', 'Compilation was aborted'));
      return undefined;
    }
    return { html: rendered.html, anchors: rendered.anchors, usedKeywords: rendered.usedKeywords };
  }

  private ir(
    id: string,
    entryId: string,
    role: ContentIR['role'],
    title: string,
    route: string,
    absoluteRoute: string,
    processed: ProcessedHtml,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
  ): ContentIR {
    return {
      schemaVersion: GENERATOR_SCHEMA_VERSION,
      id,
      entryId,
      role,
      title,
      route,
      absoluteRoute,
      html: processed.html,
      anchors: processed.anchors,
      exportedKeywords: [],
      usedKeywords: processed.usedKeywords,
      dependencies,
      diagnostics,
    };
  }

  /**
   * `consulted`, when given, receives every keyword key the link pass looked up. The linked
   * HTML is a function of the IR HTML and the bindings of exactly those keys: each lookup is
   * made before any branch on its result.
   *
   * `prepared`, when given, is this request's back half dispatched earlier (`prepareLink`).
   */
  async link(
    request: {
      ir: ContentIR;
      keywords: KeywordExport[];
      breadcrumbs: string[];
      pageType: 'guide' | 'api';
    },
    signal: AbortSignal,
    consulted?: Set<string>,
    prepared?: PreparedLink,
  ): Promise<ServiceResult<LinkedContent>> {
    // Link reads no file: its footprint is empty, and its result carries the IR's dependencies.
    const scope = this.scope('link', request.ir.id);
    const result = await this.linkContent(request, signal, consulted, prepared);
    return scope ? attachFootprint(result, scope.seal()) : result;
  }

  /**
   * Dispatches the back half of a link before its turn. Linking is a pure function of the IR and
   * the keyword set, so the result `link` makes of it is the one it would make of linking then.
   */
  prepareLink(
    request: Parameters<GeneratorContentCompiler['link']>[0],
    signal: AbortSignal,
  ): PreparedLink {
    return {
      ir: request.ir,
      keywords: request.keywords,
      outcome: this.linkBack(request, signal),
    };
  }

  private linkBack(
    request: Parameters<GeneratorContentCompiler['link']>[0],
    signal: AbortSignal,
  ): Promise<LinkedDocument> {
    const task: LinkTask = {
      html: request.ir.html,
      title: request.ir.title,
      absoluteRoute: request.ir.absoluteRoute,
      breadcrumbs: request.breadcrumbs,
      pageType: request.pageType,
    };
    if (this.back) return this.back.link(task, request.keywords, signal);
    const bindings = keywordBindings(request.keywords);
    return linkDocument(
      task,
      (key) => bindings.get(key),
      () => signal.aborted,
    );
  }

  private async linkContent(
    request: Parameters<GeneratorContentCompiler['link']>[0],
    signal: AbortSignal,
    consulted: Set<string> | undefined,
    prepared: PreparedLink | undefined,
  ): Promise<ServiceResult<LinkedContent>> {
    const aborted = (): ServiceResult<LinkedContent> => ({
      dependencies: request.ir.dependencies,
      diagnostics: [...request.ir.diagnostics, this.diag('CONTENT_ABORTED', 'Linking was aborted')],
    });
    if (signal.aborted) return aborted();
    const outcome = await (prepared?.ir === request.ir && prepared.keywords === request.keywords
      ? prepared.outcome
      : this.linkBack(request, signal));
    for (const key of outcome.consulted) consulted?.add(key);
    const checked =
      outcome.differs === undefined
        ? request.ir.diagnostics
        : [...request.ir.diagnostics, this.parallelMismatch(outcome.differs)];
    if ('failed' in outcome)
      return {
        dependencies: request.ir.dependencies,
        diagnostics: [...checked, this.diag('CONTENT_LINK', outcome.failed)],
      };
    if ('aborted' in outcome || signal.aborted) return aborted();
    return {
      dependencies: request.ir.dependencies,
      diagnostics: checked,
      value: {
        ir: request.ir,
        html: outcome.html,
        searchRecords: outcome.searchRecords,
        keywordDigest: keywordDigestFor(request.ir, keywordBindings(request.keywords)),
      },
    };
  }

  private actions(
    entryId: string,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
    scope: FootprintScope | undefined,
  ): TemplateActions {
    let guide: ServiceResult<GuideSemantics> | undefined;
    const getGuide = (): ServiceResult<GuideSemantics> => {
      if (!guide) {
        guide = this.services.semantic.describeGuide(entryId);
        scope?.merge(footprintOf(guide));
        dependencies.push(...guide.dependencies);
        diagnostics.push(...guide.diagnostics);
      }
      return guide;
    };
    // A guide whose semantics failed has no demo or playground list, so every lookup would also
    // report "Unknown demo" or "Unknown playground" for IDs that may well exist. The guide's own
    // error (getGuide adds it once per render) already explains the failure: after a template
    // render elsewhere in the generation reached its wall-clock cap inside a semantic query, it is
    // `SEMANTIC_QUERY_INTERRUPTED`. The lookups are its consequences and add nothing.
    const failed = (result: ServiceResult<GuideSemantics>): boolean =>
      !result.value && result.diagnostics.some((item) => item.severity === 'error');
    return {
      invoke: (namespace, name, args) => {
        try {
          if (namespace === 'NgDocActions') {
            const id = asString(args[0] ?? '');
            const options = escapeHtml(JSON.stringify(args[1] ?? {}));
            if (name === 'demo' || name === 'demoPane') {
              const guide = getGuide();
              if (failed(guide)) return '';
              if (!guide.value?.demos[id]) {
                diagnostics.push(this.diag('CONTENT_DEMO', `Unknown demo: ${id}`));
                return '';
              }
              const element = name === 'demoPane' ? 'demo-pane' : 'demo';
              return `\n<ng-doc-${element} componentName="${escapeAttribute(id)}" indexable="false">\n<div id="options">${options}</div>\n</ng-doc-${element}>\n`;
            }
            if (name === 'playground') {
              const guide = getGuide();
              if (failed(guide)) return '';
              const found = guide.value?.playgrounds.find((playground) => playground.id === id);
              if (!found) {
                diagnostics.push(this.diag('CONTENT_PLAYGROUND', `Unknown playground: ${id}`));
                return '';
              }
              if (existsSync(found.target.source)) {
                dependencies.push({
                  kind: 'content',
                  path: found.target.source,
                  digest: readText(found.target.source).digest,
                });
              } else {
                dependencies.push({ kind: 'existence', path: found.target.source, exists: false });
                diagnostics.push(
                  this.diag(
                    'CONTENT_PLAYGROUND_SOURCE',
                    `Playground source does not exist: ${found.target.source}`,
                    found.target.source,
                  ),
                );
              }
              const data = escapeHtml(JSON.stringify(found.properties).replace(/\\/g, '\\\\'));
              return `\n<ng-doc-playground id="${escapeAttribute(id)}" indexable="false">\n<div id="selectors">${escapeHtml(found.selector ?? '')}</div><div id="pipeName">${escapeHtml(found.pipeName ?? '')}</div><div id="data">${data}</div><div id="options">${options}</div>\n</ng-doc-playground>\n`;
            }
            diagnostics.push(
              this.diag('CONTENT_ACTION', `Unsupported NgDocActions action: ${name}`),
            );
            return '';
          }
          if (namespace === 'NgDocApi' && name !== 'api' && name !== 'details') {
            diagnostics.push(this.diag('CONTENT_ACTION', `Unsupported NgDocApi action: ${name}`));
            return '';
          }
          if (namespace === 'JSDoc' && !['description', 'tag', 'tags', 'hasTag'].includes(name)) {
            diagnostics.push(this.diag('CONTENT_ACTION', `Unsupported JSDoc action: ${name}`));
            return '';
          }
          const fragment = this.services.semantic.renderFragment(
            namespace === 'NgDocApi'
              ? {
                  kind: name === 'details' ? 'api-details' : 'api',
                  entryId,
                  declarationPath: asString(args[0] ?? ''),
                }
              : {
                  kind:
                    name === 'hasTag'
                      ? 'js-doc-has-tag'
                      : name === 'tags'
                        ? 'js-doc-tags'
                        : name === 'tag'
                          ? 'js-doc-tag'
                          : 'js-doc',
                  entryId,
                  declarationPath: asString(args[0] ?? ''),
                  ...(name === 'tag' || name === 'tags' || name === 'hasTag'
                    ? { tag: asString(args[1] ?? '') }
                    : {}),
                },
          );
          scope?.merge(footprintOf(fragment));
          dependencies.push(...fragment.dependencies);
          diagnostics.push(...fragment.diagnostics);
          if (!fragment.value) {
            if (!fragment.diagnostics.length) {
              diagnostics.push(
                this.diag('CONTENT_FRAGMENT', `No semantic fragment for ${namespace}.${name}`),
              );
            }
            return '';
          }
          return fragment.value.value;
        } catch (error) {
          diagnostics.push(this.diag('CONTENT_ACTION', String(error)));
          return '';
        }
      },
    };
  }

  private anchorKeywords(
    rootKey: string,
    rootTitle: string,
    route: string,
    anchors: ContentAnchor[],
    rootIsLink: boolean,
  ): KeywordExport[] {
    return [
      {
        key: rootKey,
        title: rootTitle,
        path: route,
        ...(rootIsLink ? { type: 'link' as const } : {}),
      },
      ...anchors.map((anchor) => {
        const key = anchor.scope?.key ?? rootKey;
        const title = anchor.scope?.title ?? rootTitle;
        return {
          key: formatKeywordKey(
            anchor.type === 'heading' ? `${key}#${anchor.anchor}` : `${key}.${anchor.anchor}`,
          ),
          title:
            anchor.type === 'heading'
              ? `${title} [${keywordHeadingTitle(anchor.title)}]`
              : `${title}.${anchor.title}`,
          path: `${route}#${anchor.anchorId}`,
          ...(anchor.type === 'heading' ? { type: 'link' as const } : {}),
        };
      }),
    ];
  }

  /** A per-document renderer copied from the legacy Markdown contract without Marked.use globals. */
  private markdownToHtml(
    markdown: string,
    context: string,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
  ): string {
    const renderer: RendererObject = {
      code: (code, language) => {
        const options = parseCodeBlockParams(language?.trim() || 'typescript', { snippets: true });
        if (options.file) {
          // The engine's spelling of the path: it is recorded as a dependency.
          const source = hostPath(path.resolve(context, options.file));
          const fullSource = this.readPhysicalFile(
            source,
            dependencies,
            diagnostics,
            'CONTENT_SNIPPET_READ',
          );
          if (fullSource !== undefined && options.snippet !== undefined) {
            const region = snippetRegion(fullSource, options.snippet);
            if (region.status === 'found') code = region.code;
            else
              diagnostics.push(
                this.diag(
                  'CONTENT_SNIPPET_UNKNOWN',
                  region.status === 'unknown'
                    ? `Snippet "${options.snippet}" is not in ${options.file}: no "snippet#${options.snippet}" marker.`
                    : `Snippet "${options.snippet}" in ${options.file} has no closing "snippet#${options.snippet}" marker.`,
                  source,
                ),
              );
          } else if (fullSource !== undefined) {
            try {
              // Lines end with LF on every platform (a CRLF file keeps its CR on each line), so
              // the output never depends on the operating system that builds the site.
              const sourceCode = fullSource
                .split('\n')
                .slice(options.fileLineStart, options.fileLineEnd)
                .join('\n')
                .trim();
              code = removeLinesFromCode(sourceCode);
            } catch (error) {
              diagnostics.push(this.diag('CONTENT_SNIPPET_READ', String(error), source));
            }
          }
        }
        const meta = codeMetadata({
          ...(!options.group && options.name !== undefined ? { name: options.name } : {}),
          ...(!options.group && options.icon !== undefined ? { icon: options.icon } : {}),
          highlightedlines: JSON.stringify(options.highlightedLines ?? []),
        });
        const element = `<pre><code class="language-${escapeAttribute(options.language ?? 'ts')}" lang="${escapeAttribute(options.language ?? '')}" metastring="${meta}">${escapeHtml(code)}</code></pre>`;
        return options.group
          ? `<div><ng-doc-tab group="${escapeAttribute(options.group)}" name="${escapeAttribute(options.name ?? '')}" icon="${escapeAttribute(options.icon ?? '')}"${options.active ? ' active' : ''}>${element}</ng-doc-tab></div>`
          : element;
      },
      blockquote: (quote) => {
        const match = quote.match(/^<p><strong>(\w+)<\/strong>\s*/);
        return match
          ? `<ng-doc-blockquote type="${match[1].toLowerCase()}">${quote.replace(/^<p><strong>(\w+)<\/strong>\s*/, '<p>')}</ng-doc-blockquote>`
          : `<ng-doc-blockquote>${quote}</ng-doc-blockquote>`;
      },
      html: (html, block) => (block ? html : html.trim()),
    };
    return new Marked({ renderer }).parse(markdown) as string;
  }

  private stopIfAborted(signal: AbortSignal, diagnostics: Diagnostic[], message: string): boolean {
    if (!signal.aborted) return false;
    diagnostics.push(this.diag('CONTENT_ABORTED', message));
    return true;
  }

  private readPhysicalFile(
    source: string,
    dependencies: Dependency[],
    diagnostics: Diagnostic[],
    diagnosticCode: string,
  ): string | undefined {
    const dependencyIndex =
      dependencies.push({ kind: 'existence', path: source, exists: false }) - 1;
    try {
      const { text, digest } = readText(source);
      dependencies[dependencyIndex] = { kind: 'content', path: source, digest };
      return text;
    } catch (error) {
      diagnostics.push(this.diag(diagnosticCode, String(error), source));
      return undefined;
    }
  }

  /** `NGDOC_PARALLEL_RENDER=verify`: a thread result differed; the main thread's is used. */
  private parallelMismatch(at: string): Diagnostic {
    return {
      ...this.diag(
        PARALLEL_RENDER_MISMATCH,
        `A render thread's result differs from the main thread's at ${at}; the main thread's result is used.`,
      ),
      severity: 'warning',
    };
  }

  private diag(code: string, message: string, file?: string): Diagnostic {
    return {
      code,
      message,
      severity: 'error',
      stage: 'content',
      ...(file ? { source: { path: file } } : {}),
    };
  }
}

/**
 * A compile links every page against one frozen keyword array; build its lookup once.
 * Unfrozen arrays may change between calls and get a fresh lookup. A later duplicate key
 * wins, exactly as `new Map(keywords.map(...))` does.
 */
const bindingsByKeywords = new WeakMap<KeywordExport[], ReadonlyMap<string, KeywordExport>>();
export function keywordBindings(keywords: KeywordExport[]): ReadonlyMap<string, KeywordExport> {
  let bindings = bindingsByKeywords.get(keywords);
  if (!bindings) {
    bindings = bindingsOf(keywords);
    if (Object.isFrozen(keywords)) bindingsByKeywords.set(keywords, bindings);
  }
  return bindings;
}

/** The `keywordDigest` of linked content: the bindings of the IR's used keywords. */
export function linkedKeywordDigest(ir: ContentIR, keywords: KeywordExport[]): string {
  return keywordDigestFor(ir, keywordBindings(keywords));
}

function keywordDigestFor(ir: ContentIR, bindings: ReadonlyMap<string, KeywordExport>): string {
  const consumedBindings = [...new Set(ir.usedKeywords)].sort().map((key) => ({
    key,
    binding: normalizeBinding(bindings.get(key)),
  }));
  return digest(JSON.stringify(consumedBindings));
}

function normalizeBinding(keyword: KeywordExport | undefined): KeywordExport | null {
  if (!keyword) return null;
  return {
    key: keyword.key,
    title: keyword.title,
    path: keyword.path,
    ...(keyword.type === undefined ? {} : { type: keyword.type }),
    ...(keyword.languages === undefined ? {} : { languages: keyword.languages }),
    ...(keyword.description === undefined ? {} : { description: keyword.description }),
  };
}

function formatKeywordKey(name: string): string {
  return name
    .split('#')
    .map((part, index) => (index === 1 ? part.toLowerCase() : part))
    .join('#');
}

function codeMetadata(value: Record<string, JsonValue>): string {
  return escapeAttribute(JSON.stringify(value).replace(/"/g, '\\"'));
}

function expectedContentId(request: DeferredContentRequest, ownerId: string): string {
  switch (request.kind) {
    case 'header':
      return `${ownerId}:header`;
    case 'api-tab':
      return `${ownerId}:api`;
    case 'guide-tab':
      return `${ownerId}:tab:${hashValue(request.markdown)}`;
  }
}

function omitDescriptorPublication(descriptor: ContentDescriptor): DescriptorFields {
  const {
    ownerId: _ownerId,
    ordinal: _ordinal,
    requestDigest: _requestDigest,
    closureIds: _closureIds,
    ...fields
  } = descriptor;
  return fields;
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableValue(left) === stableValue(right);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

/** A template evaluated for a content slot belongs to that slot's render phase. */
function contentTemplateDiagnostic(diagnostic: Diagnostic): Diagnostic {
  // Missing live scope, cancellation and semantic failures remain global failures.
  return diagnostic.code === 'DISCOVERY_EVALUATION_FAILED' && diagnostic.stage === 'evaluation'
    ? { ...diagnostic, stage: 'content' }
    : diagnostic;
}
