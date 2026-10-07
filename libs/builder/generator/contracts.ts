/** Internal generator contract. Data types are JSON; service ports are process-local. */
/**
 * Versions the persisted shapes that carry dependencies: the artifact fingerprint (the cache key),
 * content descriptors and content IR. Version 2: entries record their own evaluation closure and
 * an `evaluated` dependency, and development units and IRs record a `semantic-closure` per
 * semantic query in place of the global `semantic-reference`, so a cache written by version 1 is a
 * miss and is rebuilt. Version 2 also computes every digest canonically (`kernel/canonical.ts`);
 * that changed digest values only, not shapes, so it is not a version of its own: the input
 * digest names its formulas (`dependencyRepresentation`), and an entry written with other
 * formulas never matches it. Version 3: page artifacts no longer carry `deferredContentIds` and
 * snapshots no `contentIndex` (both held one value since every descriptor is always ready), so
 * artifact and snapshot revisions changed and a cache written by version 2 is a miss. Version 4:
 * declaration descriptors carry the declaration's `signature` and `description`, the search records
 * of an API page's summary carry them with its `kind`, API list records a `description` and a `signature`, and the
 * route of an API entry its `apiListSegment`, so a cache written by version 3 is a miss.
 */
export const GENERATOR_SCHEMA_VERSION = 4 as const;
/**
 * Versions the output format other processes read across generator versions: the output
 * manifest in the output root. Unchanged by {@link GENERATOR_SCHEMA_VERSION}.
 */
export const OUTPUT_SCHEMA_VERSION = 1 as const;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type ProjectId = string;
export type EntryId = string;
export type ArtifactId = string;
export type Generation = number;

/** Absolute normalized filesystem path, never a URL. DTO paths use forward slashes. */
export type FilePath = string;
/** Route segments have no leading slash; asset URLs are resolved separately by the host. */
export type DocRoute = string;

export interface SourceLocation {
  path: FilePath;
  /** One-based coordinates, when available. */
  line?: number;
  column?: number;
}

export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  stage:
    | 'discovery'
    | 'evaluation'
    | 'semantic'
    | 'content'
    | 'aggregate'
    | 'cache'
    | 'commit'
    | 'host';
  source?: SourceLocation;
  ownerId?: ArtifactId;
  related?: Array<{ message: string; source: SourceLocation }>;
}

/** File dependencies are observed even when reads fail; absence is not an empty file hash. */
export type Dependency =
  | { kind: 'content'; path: FilePath; digest: string }
  | { kind: 'existence'; path: FilePath; exists: boolean }
  | {
      kind: 'glob';
      root: FilePath;
      include: string[];
      exclude: string[];
      /** Sorted resolved membership; include dot directories unless explicitly excluded. */
      members: FilePath[];
    }
  | {
      kind: 'semantic';
      scopeId: string;
      /** Fingerprint includes TS config/extends, resolution, libraries and source membership. */
      digest: string;
      files: FilePath[];
      reason: string;
    }
  | {
      /** Resolves to one aggregate-owned full semantic scope in a complete candidate. */
      kind: 'semantic-reference';
      scopeId: string;
      digest: string;
      reason: string;
    }
  | { kind: 'keyword'; key: string; /** Includes a stable missing-key sentinel. */ digest: string }
  | SemanticClosureDependency
  | EvaluatedDependency;

/**
 * The semantic footprint of one semantic query of a unit or IR: a digest over the program
 * environment and the content and type closure of exactly the program files the query read (and
 * the derived-class lists it read). Non-physical: it is never a path, a watch input or a graph path
 * edge. Only the digest is persisted; the files it covers stay with the runtime's retained program,
 * where the refresher recomputes the digest from them (`semantic/semantic-closure.ts`). Development
 * generations record it (schema version 2); production records the global `semantic-reference`.
 */
export interface SemanticClosureDependency {
  kind: 'semantic-closure';
  scopeId: string;
  /** The query: its recorder scope kind and key (one closure per query and scope). */
  key: string;
  digest: string;
}

/**
 * The digest of one entry's evaluated default export and its guide values. Discovery records it in
 * the entry's dependencies (so every unit of the entry records it) and in every template render
 * of the entry. The refresher recomputes it from the generation's fresh discovery snapshot, never
 * from disk. Non-physical, like {@link SemanticClosureDependency}.
 */
export interface EvaluatedDependency {
  kind: 'evaluated';
  entryId: EntryId;
  digest: string;
}

/** Dependency kinds that name no file, glob or keyword: they are refreshed from compiler state. */
export type NonPhysicalDependency = SemanticClosureDependency | EvaluatedDependency;

/**
 * The identity of a non-physical dependency, shared by every dependency key and collapse: a unit
 * records one closure per scope and key, and one evaluated digest per entry.
 */
export function nonPhysicalIdentity(dependency: NonPhysicalDependency): string {
  return dependency.kind === 'semantic-closure'
    ? `semantic-closure:${dependency.scopeId}:${dependency.key}`
    : `evaluated:${dependency.entryId}`;
}

export interface ServiceResult<T> {
  /** Absent when this operation cannot produce usable data. Errors always fail the generation. */
  value?: T;
  dependencies: Dependency[];
  diagnostics: Diagnostic[];
}

export interface RuntimeImport {
  source: FilePath;
  exportName: string;
}

export interface ExecutableProvenance {
  id: string;
  source: SourceLocation;
  exportName: string;
  inputDigest: string;
  /** Opaque executable values never enter descriptors, artifacts or the persistent cache. */
  policy: 'evaluate-each-generation' | 'input-fingerprint';
}

export interface KeywordExport {
  key: string;
  title: string;
  path: string;
  /** Missing type preserves the current inline-code keyword presentation. */
  type?: 'link';
  languages?: string[];
  description?: string;
}

export interface RemoteKeywordSnapshot {
  loaderId: string;
  /** Digest of the actual normalized result, not function.toString(). */
  digest: string;
  keywords: KeywordExport[];
  /** Optional upstream validator is evidence, never an assumed lifetime guarantee. */
  validator?: string;
}

/** A Shiki (TextMate) language registration of `shiki.langs`: a grammar as plain JSON. */
export interface ShikiLanguage {
  readonly name: string;
  readonly scopeName: string;
  readonly [key: string]: JsonValue;
}

export interface GeneratorConfiguration {
  projectId: ProjectId;
  workspaceRoot: FilePath;
  docsRoots: FilePath[];
  tsConfig: FilePath;
  outputRoot: FilePath;
  cacheRoot: FilePath;
  routePrefix: DocRoute;
  /** Paths relative to outputRoot. Do not conflate these with public URLs/base href. */
  guideDirectory: string;
  apiDirectory: string;
  assetDirectory: string;
  inlineStyleLanguage: 'CSS' | 'SCSS' | 'SASS' | 'LESS';
  anchorHeadings: Array<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'>;
  headerTemplate?: FilePath;
  /**
   * `false` when `api.protectedMembers` is `false`: API templates then list only public class
   * members. Absent otherwise, so every other configuration keeps its digest.
   */
  apiProtectedMembers?: false;
  /**
   * The demo pages (`isolatedDemos`, `demoApplication`, `demoProviders`). Absent when none of them
   * is set, so every other configuration keeps its digest, and so is every default field:
   * - `pages`: `all` builds a demo page for every demo, `none` for none; absent, only the guides
   *   with an isolated demo get them.
   * - `isolated`: `true` when `isolatedDemos` is: every `demo` action shows an iframe by default.
   * - `path`: the URL path of the demo pages, absent for `demo-preview`.
   * - `providers`: the module that `demoProviders` imports.
   */
  demoApplication?: {
    pages?: 'all' | 'none';
    isolated?: true;
    path?: string;
    providers?: FilePath;
  };
  themes: { light: string; dark: string };
  /**
   * The Shiki language registrations of `shiki.langs`, flattened, as plain JSON in configuration
   * order. Absent without any, so every other configuration keeps its digest.
   */
  shikiLangs?: ShikiLanguage[];
  repo?: {
    url: string;
    platform: 'github' | 'gitlab';
    mainBranch?: string;
    releaseBranch?: string;
  };
  cacheEnabled: boolean;
  /**
   * Build tags matched against `onlyForTags` (sorted, unique). Discovery always sets it; only the
   * tags that some `onlyForTags` names enter the digest.
   */
  tags?: string[];
  /** Digest of normalized settings AND executable/input provenance. */
  digest: string;
  executables: ExecutableProvenance[];
}

interface BaseEntryDescriptor {
  id: EntryId;
  source: SourceLocation;
  title: string;
  route: DocRoute;
  absoluteRoute: DocRoute;
  breadcrumbs: string[];
  parentId?: EntryId;
  order?: number;
  hidden?: boolean;
  /** Original import preserves providers, demos, route functions and non-JSON data at runtime. */
  runtimeImport: RuntimeImport;
  dependencies: Dependency[];
}

export interface CategoryDescriptor extends BaseEntryDescriptor {
  kind: 'category';
  expandable?: boolean;
  expanded?: boolean;
}

export interface GuideDescriptor extends BaseEntryDescriptor {
  kind: 'guide';
  /** Ordered markdown paths; front matter is owned by the content compiler. */
  markdown: FilePath[];
  hasImports: boolean;
}

export interface ApiScopeDescriptor {
  id: string;
  name: string;
  route: DocRoute;
  order?: number;
  include: string[];
  exclude: string[];
}

export interface ApiDescriptor extends BaseEntryDescriptor {
  kind: 'api';
  keyword?: string;
  /** Raw API route used by legacy list assets; empty when route was omitted. */
  assetRoute?: DocRoute;
  scopes: ApiScopeDescriptor[];
}

export type EntryDescriptor = CategoryDescriptor | GuideDescriptor | ApiDescriptor;

/**
 * A page, category or API page that `onlyForTags` leaves out of this build. It has no descriptor
 * and produces nothing; this record only lets diagnostics and acceptance checks name it.
 */
export interface FilteredEntry {
  kind: EntryDescriptor['kind'];
  title: string;
  source: FilePath;
  /** The route it would have had. */
  absoluteRoute: DocRoute;
  /** Its own trimmed `onlyForTags`, when it declares them. */
  onlyForTags?: string[];
  /** The entry whose `onlyForTags` excluded it: itself or an ancestor category. */
  filteredBy: { title: string; source: FilePath; onlyForTags: string[] };
  /** Guide keywords (`*Key`) from its markdown front matter. */
  keywords?: string[];
}

export interface DiscoverySnapshot {
  configuration: GeneratorConfiguration;
  entries: EntryDescriptor[];
  globalKeywords: KeywordExport[];
  remoteKeywords: RemoteKeywordSnapshot[];
  /** Entries left out by `onlyForTags`, sorted by source; absent when there are none. */
  filtered?: FilteredEntry[];
}

export interface DiscoveryRequest {
  generation: Generation;
  projectId: ProjectId;
  workspaceRoot: FilePath;
  configFile?: FilePath;
  /** Adapter supplies explicit fallbacks formerly derived from Architect target options. */
  defaults: { docsRoot: FilePath; tsConfig: FilePath; outputRoot: FilePath; cacheRoot: FilePath };
  changes: FileChange[];
  /**
   * Last results of keyword loaders. A loader whose `loaderId` has one here is not invoked, and
   * that result is used as its own; any other loader is invoked.
   */
  pinnedRemoteKeywords?: RemoteKeywordSnapshot[];
}

/** Owns configuration/evaluator lifetime and all transitive bundler inputs. */
export interface DiscoveryService {
  discover(
    request: DiscoveryRequest,
    signal: AbortSignal,
  ): Promise<ServiceResult<DiscoverySnapshot>>;
  /** Ends the current executable scope. A later discover creates a fresh scope. */
  dispose(): Promise<void>;
}

export interface DeclarationDescriptor {
  /**
   * Discriminates a declaration from an entry descriptor, whose `kind` is a closed union while a
   * declaration's `kind` is free text. Optional until the next schema version: enumeration does not
   * emit it yet, because declaration descriptors are digested into artifact revisions. Read it
   * through {@link isDeclarationDescriptor}.
   */
  descriptorKind?: 'declaration';
  id: string;
  apiEntryId: EntryId;
  scopeId: string;
  source: SourceLocation;
  name: string;
  kind: string;
  /** Public API list type, including Angular Component/Directive/Pipe distinctions. */
  apiListType?: string;
  /** The declaration header as written (`semantic/api-summary.ts`). */
  signature?: string;
  /** The first paragraph of the doc comment as one line of plain text. */
  description?: string;
  route: DocRoute;
  breadcrumbs: string[];
  /** Declaration/selector/pipe exports available without rendering anchors. */
  exportedKeywords: KeywordExport[];
}

export interface DemoAsset {
  title: string;
  language: string;
  source: FilePath;
  /** Existing snippet/code-tab presentation metadata. */
  icon?: string;
  opened?: boolean;
  /** Unhighlighted source; the content pipeline handles code/keywords consistently. */
  code: string;
}

export interface PlaygroundDescriptor {
  id: string;
  target: RuntimeImport;
  standalone: boolean;
  selector?: string;
  pipeName?: string;
  template: string;
  templatesBySelector: Record<string, string>;
  /** Existing NgDocPlaygroundProperties shape with JSON-safe values, aliases and model inputs. */
  properties: Record<string, JsonValue>;
  content: Record<string, string>;
}

export interface GuideSemantics {
  demos: Record<string, DemoAsset[]>;
  playgrounds: PlaygroundDescriptor[];
}

/**
 * Whether a header's entry is a declaration descriptor rather than a guide or API entry. The one
 * place that tells them apart while enumeration does not emit `descriptorKind` yet.
 */
export function isDeclarationDescriptor(
  entry: EntryDescriptor | DeclarationDescriptor,
): entry is DeclarationDescriptor {
  return (entry as DeclarationDescriptor).descriptorKind === 'declaration' || 'apiEntryId' in entry;
}

/**
 * A fragment request names its target explicitly: `declaration` for an enumerated declaration id,
 * `entry` (the default) for an entry and, where given, a declaration path relative to it.
 */
export type SemanticFragmentRequest =
  | { kind: 'api-page' | 'api-header'; target: 'declaration'; declarationId: string }
  | { kind: 'entry-doc'; target?: 'entry'; entryId: EntryId }
  | { kind: 'api' | 'api-details'; target?: 'entry'; entryId: EntryId; declarationPath: string }
  | {
      kind: 'js-doc' | 'js-doc-tag' | 'js-doc-tags' | 'js-doc-has-tag';
      target?: 'entry';
      entryId: EntryId;
      declarationPath: string;
      tag?: string;
    };

export interface SemanticFragment {
  /** HTML for API, Markdown/string/boolean/string[] for JSDoc actions;
   * entry-doc returns the existing { description, tags } JSDocMetadata JSON shape. */
  format: 'html' | 'markdown' | 'value';
  value: JsonValue;
}

/** Owns all ts-morph Nodes AND existing Node-dependent API templates/filters. */
export interface SemanticService {
  /** With `retention`, the program is built so it can be retained, and may reuse `previous`. */
  synchronize(
    request: {
      generation: Generation;
      discovery: DiscoverySnapshot;
      changes: FileChange[];
      retention?: SemanticRetentionRequest;
    },
    signal: AbortSignal,
  ): Promise<ServiceResult<null>>;
  enumerateApi(entryId: EntryId): ServiceResult<DeclarationDescriptor[]>;
  describeGuide(entryId: EntryId): ServiceResult<GuideSemantics>;
  /** Synchronous after synchronize, so existing synchronous Nunjucks actions remain valid. */
  renderFragment(request: SemanticFragmentRequest): ServiceResult<SemanticFragment>;
  dispose(): Promise<void>;
}

/** An opaque retained program. Only the service that made it can use it. */
export interface RetainedSemanticState {
  readonly retained: true;
}

/**
 * The retention part of a `synchronize` request. `synchronize` takes `previous` off the request
 * unless it keeps the program, so a discarded program can be collected while its replacement is
 * built. The changes it checks are the request's own `changes`.
 */
export interface SemanticRetentionRequest {
  previous?: RetainedSemanticState;
}

/**
 * How one `synchronize` treated the retained program:
 * - `reused`: kept as it was;
 * - `patched`: kept, with the changed files applied to it;
 * - `patched-failed`: kept with the changes applied, but the synchronization failed (for example
 *   a syntax error); the taken program is handed back so the next edit patches it again;
 * - `full`: not kept (consumed or absent); a new program was built.
 */
export type ProgramRetentionOutcome = 'reused' | 'patched' | 'patched-failed' | 'full';

/** The outcome of the last `synchronize`, for the caller that keeps retained programs. */
export interface SemanticProgramSynchronization {
  outcome: ProgramRetentionOutcome;
  /** `full` only: why no retained program was kept. */
  reason?: string;
  /** `patched-failed` only: the taken program, handed back as the same object. */
  handedBack?: RetainedSemanticState;
}

/** The optional port of a semantic service that can retain its program between generations. */
export interface SemanticProgramRetention {
  /** How the last `synchronize` treated the retained program; undefined before it decided. */
  programSynchronization(): SemanticProgramSynchronization | undefined;
  /** The program to retain for the next generation, or undefined when it must not be retained. */
  retain(): RetainedSemanticState | undefined;
}

export interface TemplateRequest {
  entryId: EntryId;
  source: SourceLocation;
  text: string;
  scope: FilePath;
  kind: 'guide' | 'header';
  /** Serializable front matter/JSDoc context; original NgDocPage stays inside evaluator. */
  values: Record<string, JsonValue>;
}

/** Process-local callbacks, never cached or transported. No callback accepts or returns a Node. */
export interface TemplateActions {
  invoke(
    namespace: 'NgDocActions' | 'NgDocApi' | 'JSDoc',
    name: string,
    args: JsonValue[],
  ): JsonValue;
}

/** Renders with live user values and the content compiler's actions, with Nunjucks parity. */
export interface TemplateEvaluationService {
  render(request: TemplateRequest, actions: TemplateActions): ServiceResult<string>;
}

export interface ContentAnchor {
  /** DOM id can differ from the user-facing keyword anchor. */
  anchorId: string;
  anchor: string;
  title: string;
  type: 'heading' | 'member';
  scope?: { key: string; title: string };
}

export interface ContentIR {
  schemaVersion: typeof GENERATOR_SCHEMA_VERSION;
  id: string;
  entryId: EntryId;
  role: 'guide-tab' | 'api-tab' | 'header' | 'demo-assets';
  title: string;
  /** Search navigation, preserving explicitly titled Markdown tabs. */
  searchBreadcrumbs?: string[];
  icon?: string;
  /** Local child route from front matter, used by the shared wrapper. */
  route: DocRoute;
  absoluteRoute: DocRoute;
  /** Highlighted/processed HTML retaining keyword placeholders until the linking stage. */
  html: string;
  anchors: ContentAnchor[];
  exportedKeywords: KeywordExport[];
  /** Includes unresolved uses. Resolve against exports after all required exports are available. */
  usedKeywords: string[];
  dependencies: Dependency[];
  diagnostics: Diagnostic[];
}

export type ContentRequest =
  | { kind: 'guide-tab'; id: string; entry: GuideDescriptor; markdown: FilePath }
  | { kind: 'header'; id: string; entry: GuideDescriptor | ApiDescriptor | DeclarationDescriptor }
  | { kind: 'api-tab'; id: string; declaration: DeclarationDescriptor }
  | { kind: 'demo-assets'; id: string; entry: GuideDescriptor; semantics: GuideSemantics };

/** The described content roles; demo-assets are compiled with their guide, never described. */
export type DeferredContentRole = 'guide-tab' | 'api-tab' | 'header';
export type DeferredContentRequest = Exclude<ContentRequest, { kind: 'demo-assets' }>;

/** Scalar locator resolved only against the current owning artifact/discovery tables. */
export type ContentLocator =
  | { kind: 'guide-tab'; markdown: FilePath }
  | { kind: 'api-tab'; declarationId: string }
  | { kind: 'header' };

/** One descriptor per content slot of a page. Never embeds ContentRequest. */
export interface ContentDescriptor {
  schemaVersion: typeof GENERATOR_SCHEMA_VERSION;
  id: string;
  ownerId: ArtifactId;
  /** Contiguous current request order within the owner; identity is never derived from this. */
  ordinal: number;
  role: DeferredContentRole;
  locator: ContentLocator;
  title: string;
  route: DocRoute;
  absoluteRoute: DocRoute;
  searchBreadcrumbs: string[];
  icon?: string;
  /** Raw guide front-matter keyword; content-derived anchor exports remain deferred. */
  keyword?: string;
  /** Compact physical/existence inputs only; owner retains semantic/config provenance once. */
  dependencies: Dependency[];
  inputDigest: string;
  requestDigest: string;
  /** Sorted unique additional slots required by this slot, within the same owner; no self-edge. */
  closureIds: string[];
}

/** Process-local inputs to cheap metadata derivation, not repeated inside cached descriptors. */
export interface ContentDescriptorProvenance {
  ownerId: ArtifactId;
  ordinal: number;
  ownerInputDigest: string;
  compilerVersion: string;
  toolchainDigest: string;
  configurationDigest: string;
  closureIds: string[];
}

export interface SearchRecord {
  breadcrumbs: string[];
  pageType: 'guide' | 'api';
  title: string;
  section: string;
  route: DocRoute;
  fragment?: string;
  content: string;
  /**
   * The summary of an API declaration, on the records of its page that belong to no section:
   * the API list type, the signature and the one-line description (when it has one).
   */
  kind?: string;
  signature?: string;
  description?: string;
}

export interface LinkedContent {
  ir: ContentIR;
  html: string;
  searchRecords: SearchRecord[];
  /** Digest of keyword bindings, including missing uses, used in this linked output. */
  keywordDigest: string;
}

/** Owns a per-document Marked instance and explicit HTML processor configuration. */
export interface ContentCompiler {
  describe(
    request: DeferredContentRequest,
    provenance: ContentDescriptorProvenance,
    signal: AbortSignal,
  ): Promise<ServiceResult<ContentDescriptor>>;
  /** Two-argument callers retain eager behavior; others pass the current validated descriptor. */
  compile(
    request: ContentRequest,
    signal: AbortSignal,
    descriptor?: ContentDescriptor,
  ): Promise<ServiceResult<ContentIR>>;
  link(
    request: {
      ir: ContentIR;
      keywords: KeywordExport[];
      breadcrumbs: string[];
      pageType: 'guide' | 'api';
    },
    signal: AbortSignal,
  ): Promise<ServiceResult<LinkedContent>>;
}

/** One configuration/synchronized semantic snapshot per compilation runtime. */
export interface ContentCompilerServices {
  configuration: GeneratorConfiguration;
  templates: TemplateEvaluationService;
  semantic: SemanticService;
}

export interface FileOutput {
  /** Relative to the configured output root; traversal/absolute paths are rejected. */
  path: string;
  role: 'angular' | 'content' | 'asset' | 'routes' | 'context' | 'search' | 'api-list';
  encoding: 'utf8' | 'base64';
  content: string;
  digest: string;
}

export interface RouteRecord {
  id: string;
  parentId?: string;
  path: DocRoute;
  title: string;
  order?: number;
  hidden?: boolean;
  icon?: string;
  /** Current navigation JSDoc metadata must survive a warm artifact restore. */
  metadata?: { description: string; tags: Record<string, string[]> };
  category?: { runtimeImport: RuntimeImport; expandable?: boolean; expanded?: boolean };
  /** Relative Angular output to import, absent for categories with children. */
  modulePath?: string;
  /**
   * The segment of an API entry's list data (`<asset directory>/<segment>/api-list.json`, empty
   * for the root list), which its route carries as `ngDocApiListSegment` data.
   */
  apiListSegment?: string;
  /**
   * The guide's demo routes module (relative to the output root), when the guide has demo pages.
   * The aggregate lists it in `demo-app.ts`. Optional and only written for such guides, so a cache
   * written without it stays valid: every other route record is unchanged.
   */
  demoModulePath?: string;
  /** The names of the guide's demo pages, in the order of `demos`, with `demoModulePath`. */
  demoNames?: string[];
}

export interface ApiListRecord {
  apiEntryId: EntryId;
  scopeId: string;
  scopeTitle: string;
  name: string;
  type: string;
  route: DocRoute;
  /** The declaration's one-line description, when its doc comment has one. */
  description?: string;
  /** The declaration header as written (`semantic/api-summary.ts`). */
  signature?: string;
}

export interface ArtifactIdentity {
  projectId: ProjectId;
  entryId: EntryId;
  /** Stable semantic ID for API declarations, omitted for guides. */
  declarationId?: string;
  role:
    | 'page-shell'
    | 'content'
    | 'demo-assets'
    | 'playgrounds'
    | 'category'
    | 'api-list'
    | 'aggregate';
  /** Stable source-derived tab/content identity, never array position or title alone. */
  part?: string;
}

export interface ArtifactFingerprint {
  schemaVersion: typeof GENERATOR_SCHEMA_VERSION;
  compilerVersion: string;
  toolchainDigest: string;
  configurationDigest: string;
  inputDigest: string;
  keywordDigest: string;
}

/** Full replaceable unit: fresh compile and cache restore use exactly this representation. */
export interface PageArtifact {
  id: ArtifactId;
  identity: ArtifactIdentity;
  revision: string;
  fingerprint: ArtifactFingerprint;
  dependencies: Dependency[];
  content: LinkedContent[];
  /**
   * The content slots of a page artifact, each with its linked content in `content`. Absent on
   * category and aggregate artifacts.
   */
  contentDescriptors?: ContentDescriptor[];
  exportedKeywords: KeywordExport[];
  usedKeywords: string[];
  searchRecords: SearchRecord[];
  routes: RouteRecord[];
  apiList: ApiListRecord[];
  outputs: FileOutput[];
  diagnostics: Diagnostic[];
}

/** JSON-only configuration used by the candidate, without executable user values. */
export interface PublishedGeneratorConfiguration {
  outputRoot: FilePath;
  cacheRoot: FilePath;
  assetDirectory: string;
  themes: { light: string; dark: string };
  digest: string;
}

export interface ArtifactSnapshot {
  /** Required from current compilers; optional for legacy schema-1 snapshots. */
  configuration?: PublishedGeneratorConfiguration;
  projectId: ProjectId;
  revision: string;
  artifacts: PageArtifact[];
  globalKeywords: KeywordExport[];
  remoteKeywords: RemoteKeywordSnapshot[];
}

export interface RebuildReason {
  ownerId: ArtifactId;
  reason:
    | 'initial'
    | 'input'
    | 'existence'
    | 'membership'
    | 'semantic'
    | 'keyword'
    | 'cache-miss'
    | 'output-missing'
    /** The owner's entry evaluated to another value, with no recorded path changed. */
    | 'evaluated';
  detail: string;
}

export interface FileChange {
  kind: 'create' | 'update' | 'delete';
  path: FilePath;
}

/**
 * Why a watch generation runs. The session sends `filesystem` for a batch with changes and
 * `reconcile` for one without (the first watch generation, or a rescan that found no difference).
 */
export type ContentRequestOrigin = 'filesystem' | 'reconcile';

export interface CompilationRequest {
  generation: Generation;
  mode: 'development' | 'production';
  changes: FileChange[];
  previous?: ArtifactSnapshot;
  /** Why a watch generation runs; a `buildOnce` generation sends none. */
  contentRequest?: { origin: ContentRequestOrigin };
}

export interface CompilationResult {
  /** Complete candidate, including retained and restored artifacts; never a partial mutation. */
  candidate?: ArtifactSnapshot;
  dependencies: Dependency[];
  diagnostics: Diagnostic[];
  whyRebuilt: RebuildReason[];
}

/**
 * Compiler phases in execution order (`compiler/index.ts`). Hosts group them into the user-facing
 * steps of the progress output (`progress/model.ts`).
 */
export type CompilationPhase =
  | 'discovery'
  /** The fast start's check of a start's recorded inputs (`compiler/fast-start.ts`). */
  | 'restore'
  | 'semantic'
  | 'plan'
  | 'describe'
  | 'render'
  | 'keywords'
  | 'link'
  | 'assemble'
  | 'aggregate'
  | 'persist';

/**
 * One progress update of a compilation. Advisory only: it never influences results, commits,
 * retention, watch inputs or caching. `boot` (a worker runtime starting) and `transfer` (the result
 * travelling back and becoming the candidate) are reported by a worker-backed service, the other
 * phases by the compiler.
 */
export interface CompilationProgressUpdate {
  phase: CompilationPhase | 'boot' | 'transfer';
  state: 'start' | 'advance' | 'end';
  /** Units done so far; non-decreasing within `(pass, phase)`, never above `total`. */
  completed?: number;
  /** Fixed at `start`. */
  total?: number;
  /** Render: units whose content was reused from the previous generation. */
  reused?: number;
  /**
   * `targeted` while the generation compiles only what its changes reach; a fall back to `full`
   * may restart the phases once per generation. `restored`: the end of the `restore` phase of a
   * start that published its recorded candidate without compiling (the fast start).
   */
  pass?: 'targeted' | 'full' | 'restored';
  /** With the first update of a `full` pass: a short, user-safe reason. */
  reason?: string;
}

/**
 * How long the compiler runtime serving a generation may live, and what it retains between
 * generations.
 */
export interface CompilationContext {
  /**
   * `watch`: a development generation of an active watch; a worker-backed service may serve it
   * from one long-lived runtime per watch session. `generation` (buildOnce, production, and any
   * caller that passes no context) runs in a fresh one-shot runtime; a worker-backed service may
   * serve a development one from the long-lived runtime before the first watch, so that the watch
   * finds its program there.
   */
  lifetime: 'generation' | 'watch';
  /**
   * Delta transport. Set only by a caller that uses a service implementing `acknowledge`, and
   * only for `watch` generations. The caller then:
   *
   * - passes its own committed snapshot as `request.previous` without a copy and does not change
   *   it while the compile runs (the service must not change it either);
   * - owns the returned result, whose candidate may share unchanged artifact objects with
   *   `request.previous` (so the caller adopts it without another copy);
   * - reports the outcome of every returned candidate through `acknowledge`.
   */
  delta?: boolean;
  /**
   * The retention slot of the long-lived runtime serving this `watch` generation. A compiler
   * without it keeps its own in-process slot. It is a process-local capability, not data: a
   * worker runtime attaches it as a non-enumerable property, so it never serialises or clones
   * with the context.
   */
  retention?: CompilationRetention;
  /**
   * Process-local progress sink, attached as a non-enumerable property like `retention`, so it
   * never serialises or clones with the context. Without it the compiler does no progress work.
   * A worker-backed service forwards the updates of its runtime (a JSON message each, throttled)
   * and adds `boot` and `transfer`. The caller contains its own exceptions.
   */
  progress?: (update: CompilationProgressUpdate) => void;
}

/**
 * What one development generation hands to the next through a {@link CompilationRetention}: an
 * entry valid for exactly one base revision. The rest of the entry is the compiler's own.
 */
export interface RetainedCompilation {
  /** The compiler-options key it was built under; another configuration never reuses it. */
  readonly key: string;
  /** The candidate revision it describes: the next generation may use it only on that base. */
  readonly base: string;
}

/**
 * A retention slot: a **committed** entry, valid for the base the caller committed, and a
 * copy-on-write **working** entry for the last returned candidate.
 *
 * A generation takes the committed entry for its whole run (no other generation can share it),
 * offers the entry of its candidate, and restores the committed entry only when its program is
 * still intact (reused and not mutated). A consumed program (a full rebuild replaced it) or a
 * mutated one (a query added source files) is never restored, so the next generation rebuilds.
 * Where the offer goes is the slot's promotion policy: the in-process slot commits it at once;
 * a long-lived runtime serving delta generations keeps it as the working entry until the caller's
 * commit is acknowledged (the `promote` message), and drops it otherwise.
 */
export interface CompilationRetention {
  /** Empties the committed entry and returns it. */
  take(): RetainedCompilation | undefined;
  /** The entry of a returned candidate (its `base` is the candidate revision). */
  offer(entry: RetainedCompilation): void;
  /** Returns an intact taken entry; `false` (and nothing kept) when a committed entry is held. */
  restore(entry: RetainedCompilation): boolean;
  /**
   * The taken entry is invalid and is not restored, for `reason` (for example `consumed`: a full
   * rebuild replaced its program; `mutated`: a query added source files to it). The slot keeps
   * the reason until it holds a committed entry again, so the next generation can say why it
   * found none instead of looking like a cold start. Optional for slots that do not report it.
   */
  invalidate?(reason: string): void;
  /**
   * The revisions held: the committed entry's base, and the working entry's while unacknowledged;
   * while no committed entry is held, why the last one was invalidated (if the slot knows).
   */
  held(): { committed?: string; working?: string; invalidated?: string };
}

/** What the caller did with a candidate returned for a `delta` compile. */
export interface CompilationAcknowledgement {
  generation: Generation;
  /** The candidate's revision. */
  revision: string;
  /** `committed`: published and now the caller's `previous`. `discarded`: failed, stale or rejected. */
  status: 'committed' | 'discarded';
}

/** Integrates discovery, templates, content, semantics and the cache; a fake can replace it. */
export interface CompilationService {
  compile(
    request: CompilationRequest,
    signal: AbortSignal,
    context?: CompilationContext,
  ): Promise<CompilationResult>;
  /**
   * The session's watch started (`true`) or stopped (`false`). A worker-backed service may start
   * its long-lived runtime ahead of the first watch generation, and ends it when the watch stops.
   * Optional; in-process compilers ignore it.
   */
  watching?(active: boolean): void | Promise<void>;
  /**
   * Optional. Its presence means the service supports `CompilationContext.delta`.
   * The caller reports each delta candidate's commit outcome before its next compile. A
   * long-lived runtime promotes its retained working state to "committed" only on `committed`;
   * on `discarded` (or without any report) it keeps the previous committed state, and a request
   * for any other base is served after a full resync.
   */
  acknowledge?(acknowledgement: CompilationAcknowledgement): void;
  /**
   * Optional. Whether `result` (as this service returned it) came from a targeted generation
   * (the targeted rebuild compiled only what its content changes reach). Only such a result may be
   * committed as a delta against the committed snapshot; the commit of any other generation of a
   * service that implements this is the full commit, which re-verifies every output.
   */
  targetedResult?(result: CompilationResult): boolean;
  dispose(): Promise<void>;
}

export interface CacheKey {
  identity: ArtifactIdentity;
  fingerprint: ArtifactFingerprint;
}

/** Validates schema, identity, digest and JSON shape before returning a hit. */
export interface ArtifactCache {
  read(
    key: CacheKey,
  ): Promise<
    | { status: 'hit'; artifact: PageArtifact }
    | { status: 'miss'; reason: 'absent' | 'invalid' | 'fingerprint'; diagnostics: Diagnostic[] }
  >;
  write(artifact: PageArtifact): Promise<void>;
}

export interface OutputManifest {
  schemaVersion: typeof OUTPUT_SCHEMA_VERSION;
  projectId: ProjectId;
  generation: Generation;
  revision: string;
  files: Array<{ path: string; ownerId: ArtifactId; digest: string; role: FileOutput['role'] }>;
}

/** The session owns this authority. Checks must remain live; do not pass a captured boolean. */
export interface CommitGuard {
  isCurrent(generation: Generation): boolean;
}

export interface CommitRequest {
  generation: Generation;
  candidate: ArtifactSnapshot;
  previous?: OutputManifest;
  /**
   * The caller's committed snapshot and manifest, which one acknowledgement made its state. With
   * it a committer may commit only the artifacts that changed against it. A committer checks that
   * this is the manifest it last published itself and otherwise commits in full, as it does
   * without a base. Omit it to ask for a full commit.
   */
  base?: { snapshot: ArtifactSnapshot; manifest: OutputManifest };
}

export type CommitResult =
  | {
      status: 'committed';
      manifest: OutputManifest;
      written: string[];
      removed: string[];
      diagnostics: Diagnostic[];
    }
  | { status: 'stale'; diagnostics: Diagnostic[] }
  | { status: 'failed'; diagnostics: Diagnostic[] };

/** Stages, validates ownership/collisions, rechecks guard and commits manifest last. */
export interface OutputCommitter {
  commit(request: CommitRequest, guard: CommitGuard, signal: AbortSignal): Promise<CommitResult>;
  dispose(): Promise<void>;
}

/** Ephemeral filesystem observation from one current compilation attempt; never cached. */
export interface WatchInputs {
  /** Sorted unique absolute normalized paths, including missing inputs. */
  files: FilePath[];
  /** Sorted unique membership obligations; empty membership still needs watching. */
  globs: Array<{ root: FilePath; include: string[]; exclude: string[] }>;
}

export type BuildResult =
  | {
      status: 'success';
      generation: Generation;
      /**
       * Read-only. A watch generation served by the delta transport returns the session's
       * committed snapshot itself, deep-frozen and shared by every consumer; any other result
       * carries each consumer's own copy.
       */
      snapshot: ArtifactSnapshot;
      manifest: OutputManifest;
      diagnostics: Diagnostic[];
      whyRebuilt: RebuildReason[];
      /** Complete successful observation. Omission means no observation, not clear watches. */
      watchInputs?: WatchInputs;
      /**
       * The generation was superseded (or its watch stopped) after its commit had completed on
       * disk. The session adopted it anyway: its snapshot and manifest are the base of the next
       * commit. Hosts treat it as any committed generation (manifest, expected outputs, watch
       * inputs) and may skip publishing it, since a newer result follows.
       */
      superseded?: true;
    }
  | {
      status: 'failure';
      generation: Generation;
      diagnostics: Diagnostic[];
      whyRebuilt: RebuildReason[];
      lastGoodRevision?: string;
      /** Partial attempt observation; hosts retain last-success inputs plus this failure. */
      watchInputs?: WatchInputs;
    }
  | {
      status: 'cancelled';
      generation: Generation;
      diagnostics: Diagnostic[];
      whyRebuilt: RebuildReason[];
      lastGoodRevision?: string;
      /** Superseded/disposed work must not change host watch registrations. */
      watchInputs?: never;
    };

export type BuildEvent =
  | { kind: 'started'; generation: Generation; changes: FileChange[] }
  | { kind: 'result'; result: BuildResult }
  | { kind: 'diagnostic'; diagnostic: Diagnostic }
  /**
   * Watched `update` events the session discarded as unchanged saves: each file's bytes equal the
   * content the last committed generation observed and no active or queued generation had the
   * path in its changes. No generation starts for them; hosts release per-change waits instead.
   */
  | { kind: 'unchanged'; changes: FileChange[] }
  | { kind: 'disposed' };

/** subscribe is asynchronous: session must close a late-resolving subscription after dispose. */
export interface FileEventSource {
  subscribe(
    /**
     * Returns `false` when the session discarded every delivered change as an unchanged save, so
     * no generation will run for them (see the `unchanged` BuildEvent). Any other value means the
     * changes were admitted or are still pending a decision.
     */
    listener: (events: FileChange[]) => unknown,
    onError: (diagnostic: Diagnostic) => void,
  ): Promise<{ dispose(): Promise<void> }>;
}

export interface WatchHandle {
  /** Resolves to the first completed attempt; callers must inspect success before starting a host. */
  initial: Promise<BuildResult>;
  dispose(): Promise<void>;
}

/** Owns queue, committed state, resource lifetime, bounded concurrency and generation guards. */
export interface BuildSession {
  buildOnce(options?: { mode?: 'development' | 'production' }): Promise<BuildResult>;
  watch(source: FileEventSource, onEvent: (event: BuildEvent) => void): Promise<WatchHandle>;
  /**
   * Re-observes the given paths of the active watch (inputs a host has only just begun watching)
   * against what the newest settled generation observed. Each difference is admitted as an
   * ordinary watched change; when nothing differs no generation runs. Resolves once any change
   * is admitted, never waiting for a generation. Without an active watch it does nothing.
   */
  reconcileInputs(paths: readonly string[]): Promise<void>;
  /**
   * Asks the active watch to re-observe every committed input before its next generation, as
   * after a lossy watcher: for a host that may have missed changes it cannot name. Every
   * difference becomes an ordinary change; the generation runs even when nothing differs, and it
   * always takes the full commit. Resolves once scheduled, never waiting for a generation.
   * Without an active watch it does nothing.
   */
  rescan(): Promise<void>;
  dispose(): Promise<void>;
}

export interface BuildSessionServices {
  compiler: CompilationService;
  committer: OutputCommitter;
}

/** Adapts readiness/events, assets, compiler diagnostics and shutdown to a host. */
export interface HostAdapter {
  start(initial: Extract<BuildResult, { status: 'success' }>, signal: AbortSignal): Promise<void>;
  update(result: BuildResult): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * The runtime and generator share one JSON content schema without app → builder imports. Imported
 * from the package root: `@ng-doc/core` has no `exports`, so a subpath is a directory import,
 * which TypeScript's `NodeNext` resolution refuses in these ESM declarations.
 */
export type { NgDocContentModule as ContentModule } from '@ng-doc/core';

export interface HostAssetMapping {
  generatedDirectory: FilePath;
  /** URL prefix resolved against document base href by the host/runtime. */
  publicPath: string;
}
