import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type LoaderSource, Environment, Loader } from 'nunjucks';

import { compareNavigationTitles } from '../../helpers/navigation-title-order';
import { createContentModule } from '../content-module-ids';
import type {
  ApiDescriptor,
  ApiListRecord,
  ContentDescriptor,
  DeclarationDescriptor,
  Dependency,
  Diagnostic,
  EntryDescriptor,
  FileOutput,
  GeneratorConfiguration,
  GuideDescriptor,
  GuideSemantics,
  KeywordExport,
  LinkedContent,
  PageArtifact,
  RouteRecord,
  ServiceResult,
} from '../contracts';
import { GENERATOR_SCHEMA_VERSION } from '../contracts';
import { canonicalJsonStrict, sha256Hex as sha256 } from '../kernel/canonical';
import { readTextFile } from '../kernel/observations';
import { hostPath } from '../kernel/paths';

const STRUCTURAL_TEMPLATES = [
  'page.ts.nunj',
  'page-wrapper.ts.nunj',
  'demo-assets.ts.nunj',
  'playgrounds.ts.nunj',
  'api-list.ts.nunj',
  'routes.ts.nunj',
  'context.ts.nunj',
  'index.ts.nunj',
] as const;

export interface PageAssemblyRequest {
  /** Authoritative compiler artifact ID, required when a descriptor plan is supplied. */
  ownerId?: string;
  configuration: GeneratorConfiguration;
  entry: GuideDescriptor | ApiDescriptor;
  declaration?: DeclarationDescriptor;
  content: LinkedContent[];
  /**
   * The compiler's descriptor plan; assembly without a plan may omit it. Every descriptor must
   * have its linked content in `content`.
   */
  contentDescriptors?: ContentDescriptor[];
  semantics?: GuideSemantics;
  metadata?: RouteRecord['metadata'];
}

/**
 * A digest of every page-assembly input except the linked content, which callers compare
 * directly, plus the structural template observations. `assemblePage` is a pure function of
 * its request and the template files, so equal keys and equal content assemble identically.
 * Returns undefined when an input has no exact JSON identity; callers must then assemble.
 */
export function pageAssemblyKey(
  request: Omit<PageAssemblyRequest, 'content'>,
  templates: Dependency[],
): string | undefined {
  const text = canonicalJsonStrict({
    schema: 'page-assembly-key-v1',
    ownerId: request.ownerId,
    configuration: request.configuration,
    entry: request.entry,
    declaration: request.declaration,
    contentDescriptors: request.contentDescriptors,
    semantics: request.semantics,
    metadata: request.metadata,
    templates,
  });
  return text === undefined ? undefined : sha256(text);
}

export interface PageAssembly {
  outputs: FileOutput[];
  routes: RouteRecord[];
  apiList: ApiListRecord[];
  diagnostics: Diagnostic[];
}

export interface AggregateRequest {
  configuration: GeneratorConfiguration;
  artifacts: PageArtifact[];
  entries: EntryDescriptor[];
  keywords: KeywordExport[];
}

export interface AggregateAssembly {
  outputs: FileOutput[];
  diagnostics: Diagnostic[];
}

export interface OutputAssembler {
  templateDependencies(): Promise<ServiceResult<null>>;
  assemblePage(request: PageAssemblyRequest): PageAssembly;
  aggregate(request: AggregateRequest): AggregateAssembly;
}

interface TreeNode<T> {
  item: T;
  children: Array<TreeNode<T>>;
}

interface RoutedItem {
  id: string;
  route: string;
  isCategory: boolean;
}

interface DemoTemplateAsset {
  title: string;
  code: string;
  isEmpty: boolean;
  icon?: string;
  opened?: boolean;
}

/** A descriptor can drive shells before its linked payload has been materialized. */
interface ContentSlot {
  id: string;
  role: ContentDescriptor['role'];
  title: string;
  route: string;
  absoluteRoute: string;
  icon?: string;
  linked?: LinkedContent;
  descriptor?: ContentDescriptor;
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/');
}

function trimExtension(value: string): string {
  return value.replace(/\.ts$/, '');
}

function relativeImport(fromDirectory: string, target: string): string {
  return trimExtension(normalize(relative(fromDirectory, target)));
}

function moduleSpecifier(fromDirectory: string, target: string): string {
  const specifier = relativeImport(fromDirectory, target);
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

function templateString(value: unknown): string {
  return String(value ?? '')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function singleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/[\r\n]/g, ' ');
}

function stableId(project: string, entity: string, role: string): string {
  return sha256(JSON.stringify([project, entity, role])).slice(0, 24);
}

function categoryIdentifier(project: string, id: string): string {
  return `NgDocCategory_${stableId(project, id, 'category-import')}`;
}

function diagnostic(code: string, message: string, ownerId?: string): Diagnostic {
  return {
    code,
    severity: 'error',
    stage: 'aggregate',
    message,
    ...(ownerId ? { ownerId } : {}),
  };
}

function safeRelative(value: string): string | undefined {
  if (!value || isAbsolute(value)) return undefined;
  const normalized = posix.normalize(normalize(value)).replace(/^\.\//, '');
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized === '.'
  )
    return undefined;
  return normalized;
}

function joinOutput(...parts: string[]): string | undefined {
  return safeRelative(posix.join(...parts.map(normalize)));
}

function output(path: string, role: FileOutput['role'], content: string): FileOutput {
  return { path, role, encoding: 'utf8', content, digest: sha256(content) };
}

function addOutput(
  outputs: Map<string, FileOutput>,
  candidate: FileOutput,
  diagnostics: Diagnostic[],
  ownerId?: string,
): void {
  const path = safeRelative(candidate.path);
  if (!path) {
    diagnostics.push(
      diagnostic('OUTPUT_PATH_INVALID', `Unsafe generated output path: ${candidate.path}`, ownerId),
    );
    return;
  }
  if (outputs.has(path)) {
    diagnostics.push(
      diagnostic('OUTPUT_COLLISION', `Generated output collision: ${path}`, ownerId),
    );
    return;
  }
  outputs.set(path, { ...candidate, path });
}

function isWithin(parent: string, child: string): boolean {
  const value = relative(resolve(parent), resolve(child));
  return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

function guideDirectory(
  configuration: GeneratorConfiguration,
  entry: GuideDescriptor,
): string | undefined {
  const root = [...configuration.docsRoots]
    .filter((candidate) => isWithin(candidate, entry.source.path))
    .sort((left, right) => right.length - left.length)[0];
  if (!root) return undefined;
  const directory = relative(root, dirname(entry.source.path));
  return joinOutput(configuration.guideDirectory, directory === '' ? '.' : directory);
}

function stripRoutePrefix(route: string, prefix: string): string {
  const normalizedRoute = normalize(route).replace(/^\/+|\/+$/g, '');
  const normalizedPrefix = normalize(prefix).replace(/^\/+|\/+$/g, '');
  if (!normalizedPrefix) return normalizedRoute;
  return normalizedRoute === normalizedPrefix
    ? ''
    : normalizedRoute.startsWith(`${normalizedPrefix}/`)
      ? normalizedRoute.slice(normalizedPrefix.length + 1)
      : normalizedRoute;
}

function sourceLinks(
  configuration: GeneratorConfiguration,
  source: { path: string; line?: number },
  scope: string,
): { editSourceFileUrl?: string; viewSourceFileUrl?: string } {
  const repo = configuration.repo;
  if (!repo) return {};
  const url = repo.url.replace(/\/$/, '');
  const file = normalize(relative(configuration.workspaceRoot, source.path)).replace(/^\//, '');
  const line = source.line ? `#L${source.line}` : '';
  const message = `?message=docs(${scope}): describe your changes here...${line}`;
  const edit = repo.mainBranch
    ? repo.platform === 'gitlab'
      ? `${url}/-/edit/${repo.mainBranch}/${file}${message}`
      : `${url}/edit/${repo.mainBranch}/${file}${message}`
    : file;
  const view = repo.releaseBranch
    ? repo.platform === 'gitlab'
      ? `${url}/-/blob/${repo.releaseBranch}/${file}${line}`
      : `${url}/blob/${repo.releaseBranch}/${file}${line}`
    : file;
  return {
    ...(edit ? { editSourceFileUrl: edit } : {}),
    ...(view ? { viewSourceFileUrl: view } : {}),
  };
}

function contentSource(entry: GuideDescriptor, slot: ContentSlot): { path: string } {
  if (slot.descriptor?.locator.kind === 'guide-tab')
    return { path: slot.descriptor.locator.markdown };
  const dependency = slot.linked?.ir.dependencies.find(
    (item): item is Extract<Dependency, { kind: 'content' }> =>
      item.kind === 'content' && entry.markdown.includes(item.path),
  );
  return { path: dependency?.path ?? entry.source.path };
}

/**
 * The folder of an API entry's list data under the asset directory: its explicit asset route, or
 * its route unless that is the API directory itself (the root list).
 * @param entry - The API entry.
 * @param configuration - The configuration that names the API directory.
 */
function apiAssetRoute(
  entry: ApiDescriptor,
  configuration: Pick<GeneratorConfiguration, 'apiDirectory'>,
): string {
  return entry.assetRoute ?? (entry.route === configuration.apiDirectory ? '' : entry.route);
}

/**
 * The kind the API list and the search palette show for a declaration, such as `Component`.
 * @param declaration - The declaration.
 */
export function apiListType(declaration: DeclarationDescriptor): string {
  if (declaration.apiListType) return declaration.apiListType;
  const kind = declaration.kind.replace(/-declaration$/, '');
  return kind ? `${kind[0].toUpperCase()}${kind.slice(1)}` : '';
}

function strictJson(value: unknown): string {
  const active = new Set<object>();
  const visit = (item: unknown): void => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item) && !Object.is(item, -0)) return;
    if (typeof item !== 'object' || item === null || active.has(item)) {
      throw new TypeError('Aggregate JSON must be a finite, acyclic JSON tree.');
    }
    active.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.keys(item).length !== item.length)
          throw new TypeError('Aggregate JSON arrays cannot be sparse.');
        item.forEach(visit);
      } else {
        if (Object.prototype.toString.call(item) !== '[object Object]')
          throw new TypeError('Aggregate JSON contains an unsupported object.');
        for (const child of Object.values(item)) visit(child);
      }
    } finally {
      active.delete(item);
    }
  };
  visit(value);
  return JSON.stringify(value);
}

function tree<T extends { id: string; parentId?: string }>(
  values: T[],
  diagnostics: Diagnostic[],
): Array<TreeNode<T>> {
  const byId = new Map<string, TreeNode<T>>();
  for (const value of values) {
    if (byId.has(value.id)) {
      diagnostics.push(diagnostic('OUTPUT_ROUTE_COLLISION', `Duplicate route id: ${value.id}`));
      continue;
    }
    byId.set(value.id, { item: value, children: [] });
  }
  const roots: Array<TreeNode<T>> = [];
  for (const node of byId.values()) {
    if (!node.item.parentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.item.parentId);
    if (!parent) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_ROUTE_PARENT_MISSING',
          `Missing route parent ${node.item.parentId} for ${node.item.id}`,
          node.item.id,
        ),
      );
      continue;
    }
    parent.children.push(node);
  }
  const reached = new Set<string>();
  const mark = (node: TreeNode<T>): void => {
    if (reached.has(node.item.id)) return;
    reached.add(node.item.id);
    node.children.forEach(mark);
  };
  roots.forEach(mark);
  for (const id of byId.keys()) {
    if (!reached.has(id)) {
      diagnostics.push(
        diagnostic('OUTPUT_ROUTE_CYCLE', `Route ${id} is part of a parent cycle.`, id),
      );
    }
  }
  return roots;
}

function pruneEmptyCategories<T extends { isCategory: boolean }>(
  nodes: Array<TreeNode<T>>,
): Array<TreeNode<T>> {
  return nodes.flatMap((node) => {
    const candidate = { item: node.item, children: pruneEmptyCategories(node.children) };
    return candidate.item.isCategory && candidate.children.length === 0 ? [] : [candidate];
  });
}

function validateRoutePaths(
  nodes: Array<TreeNode<RoutedItem>>,
  diagnostics: Diagnostic[],
  parentPath: string = '',
  seen: Map<string, string> = new Map<string, string>(),
): void {
  for (const node of nodes) {
    const path = posix.join(parentPath, normalize(node.item.route)).replace(/^\/+|\/+$/g, '');
    const owner = seen.get(path);
    if (owner && owner !== node.item.id) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_ROUTE_PATH_COLLISION',
          `Routes ${owner} and ${node.item.id} resolve to the same public path: ${path}`,
          node.item.id,
        ),
      );
    } else {
      seen.set(path, node.item.id);
    }
    validateRoutePaths(node.children, diagnostics, path, seen);
  }
}

function validateOutputOwnership(
  artifacts: PageArtifact[],
  aggregate: Map<string, FileOutput>,
  diagnostics: Diagnostic[],
): void {
  const owners = new Map<string, string>();
  const observe = (candidate: FileOutput, ownerId: string): void => {
    const path = safeRelative(candidate.path);
    if (!path) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_PATH_INVALID',
          `Unsafe generated output path: ${candidate.path}`,
          ownerId,
        ),
      );
      return;
    }
    const previous = owners.get(path);
    if (previous) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_CANDIDATE_COLLISION',
          `Artifacts ${previous} and ${ownerId} both own generated output ${path}.`,
          ownerId,
        ),
      );
      return;
    }
    owners.set(path, ownerId);
  };
  for (const artifact of artifacts) {
    for (const candidate of artifact.outputs) observe(candidate, artifact.id);
  }
  for (const candidate of aggregate.values()) observe(candidate, 'aggregate');
}

function keywordMap(keywords: KeywordExport[]): Record<string, Omit<KeywordExport, 'key'>> {
  return Object.fromEntries(
    keywords.map(({ key, title, path, type, languages, description }) => [
      key,
      {
        title,
        path,
        ...(type === undefined ? {} : { type }),
        ...(languages === undefined ? {} : { languages }),
        ...(description === undefined ? {} : { description }),
      },
    ]),
  );
}

class StructuralLoader extends Loader {
  constructor(private readonly root: string) {
    super();
  }

  getSource(name: string): LoaderSource {
    const source = resolve(this.root, name);
    if (!isWithin(this.root, source) || !existsSync(source)) {
      throw new Error(`Structural template not found: ${source}`);
    }
    return { src: readFileSync(source, 'utf8'), path: source, noCache: true };
  }
}

function render(root: string, name: string, context: object): string {
  const environment = new Environment(new StructuralLoader(root), {
    autoescape: false,
    throwOnUndefined: false,
  });
  environment.addFilter('toTemplateString', templateString);
  environment.addFilter('createImportPath', (current: string, target: string) =>
    relativeImport(current, target),
  );
  environment.addFilter('dump', (value: unknown) => strictJson(value));
  environment.addFilter('sortNavigationEntries', (values: Array<TreeNode<NavigationItem>>) =>
    [...values].sort((left, right) => {
      const leftOrder = left.item.order;
      const rightOrder = right.item.order;
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      // A fixed collator, shared with the legacy builders: the order never depends on the locale.
      return compareNavigationTitles(left.item.title, right.item.title);
    }),
  );
  return environment.render(name, context);
}

interface NavigationItem {
  id: string;
  parentId?: string;
  title: string;
  order?: number;
  hidden?: boolean;
  isCategory: boolean;
  entry: {
    title: string;
    hidden?: boolean;
    expandable?: boolean;
    expanded?: boolean;
  };
  absoluteRoute(): string;
  jsDocMetadata(): NonNullable<RouteRecord['metadata']>;
}

function routeTemplateTree(
  configuration: GeneratorConfiguration,
  records: RouteRecord[],
  diagnostics: Diagnostic[],
): Array<
  TreeNode<{
    id: string;
    parentId?: string;
    route: string;
    title: string;
    isCategory: boolean;
    path?: string;
    outDir?: string;
    apiListSegment?: string;
  }>
> {
  const outputRoot = resolve(configuration.outputRoot);
  return tree(
    records.map((record) => ({
      id: record.id,
      ...(record.parentId ? { parentId: record.parentId } : {}),
      route: record.path,
      title: record.title,
      isCategory: !!record.category,
      ...(record.category ? { path: record.category.runtimeImport.source } : {}),
      ...(record.modulePath ? { outDir: dirname(resolve(outputRoot, record.modulePath)) } : {}),
      ...(record.apiListSegment === undefined ? {} : { apiListSegment: record.apiListSegment }),
    })),
    diagnostics,
  );
}

function navigationTree(
  entries: EntryDescriptor[],
  records: RouteRecord[],
  diagnostics: Diagnostic[],
): Array<TreeNode<NavigationItem>> {
  const metadata = new Map(records.map((record) => [record.id, record.metadata]));
  return tree(
    entries.map((entry) => ({
      id: entry.id,
      ...(entry.parentId ? { parentId: entry.parentId } : {}),
      title: entry.title,
      isCategory: entry.kind === 'category',
      ...(entry.order === undefined ? {} : { order: entry.order }),
      ...(entry.hidden === undefined ? {} : { hidden: entry.hidden }),
      entry: {
        title: entry.title,
        ...(entry.hidden === undefined ? {} : { hidden: entry.hidden }),
        ...(entry.kind === 'category' && entry.expandable !== undefined
          ? { expandable: entry.expandable }
          : {}),
        ...(entry.kind === 'category' && entry.expanded !== undefined
          ? { expanded: entry.expanded }
          : {}),
      },
      absoluteRoute: () => entry.absoluteRoute,
      jsDocMetadata: () => metadata.get(entry.id) ?? { description: '', tags: {} },
    })),
    diagnostics,
  );
}

function contentArtifactPaths(componentPath: string):
  | {
      contentPath: string;
      sourcePath: string;
      contentDeclarationPath: string;
      sourceDeclarationPath: string;
    }
  | undefined {
  const base = componentPath.replace(/\.ts$/, '');
  const contentPath = safeRelative(`${base}.content.mjs`);
  const sourcePath = safeRelative(`${base}.source.mjs`);
  const contentDeclarationPath = safeRelative(`${base}.content.d.mts`);
  const sourceDeclarationPath = safeRelative(`${base}.source.d.mts`);
  return contentPath && sourcePath && contentDeclarationPath && sourceDeclarationPath
    ? { contentPath, sourcePath, contentDeclarationPath, sourceDeclarationPath }
    : undefined;
}

function contentSourceImport(
  configuration: GeneratorConfiguration,
  componentPath: string,
): string | undefined {
  const paths = contentArtifactPaths(componentPath);
  return paths
    ? moduleSpecifier(
        dirname(resolve(configuration.outputRoot, componentPath)),
        resolve(configuration.outputRoot, paths.sourcePath),
      )
    : undefined;
}

function contentPayload(
  configuration: GeneratorConfiguration,
  linked: LinkedContent,
): { id: string; revision: string; html: string; schemaVersion: 1 } {
  return createContentModule(configuration.projectId, linked);
}

function demoAssets(
  linked: LinkedContent | undefined,
  semantics: GuideSemantics,
  diagnostics: Diagnostic[],
  ownerId: string,
): Record<string, DemoTemplateAsset[]> {
  const matches = linked
    ? [
        ...linked.html.matchAll(
          /<ng-doc-demo-assets name="([^"]*)">([\s\S]*?)<\/ng-doc-demo-assets>/g,
        ),
      ]
    : [];
  const expected = Object.values(semantics.demos).reduce(
    (count, assets) => count + assets.length,
    0,
  );
  if (matches.length !== expected) {
    diagnostics.push(
      diagnostic(
        'OUTPUT_DEMO_ASSET_MISMATCH',
        `Expected ${expected} linked demo assets but found ${matches.length}.`,
        ownerId,
      ),
    );
  }
  let index = 0;
  return Object.fromEntries(
    Object.entries(semantics.demos).map(([name, assets]) => [
      JSON.stringify(name),
      assets.map((asset) => {
        const match = matches[index++];
        if (match && match[1] !== escapeAttribute(name)) {
          diagnostics.push(
            diagnostic(
              'OUTPUT_DEMO_ASSET_OWNER',
              `Linked demo asset ${match[1]} does not belong to ${name}.`,
              ownerId,
            ),
          );
        }
        return {
          title: singleQuoted(asset.title),
          code: match?.[2] ?? '',
          isEmpty: !asset.code,
          ...(asset.icon === undefined ? {} : { icon: singleQuoted(asset.icon) }),
          ...(asset.opened === undefined ? {} : { opened: asset.opened }),
        };
      }),
    ]),
  );
}

function validateDescriptorPartition(
  request: PageAssemblyRequest,
  diagnostics: Diagnostic[],
): void {
  const descriptors = request.contentDescriptors;
  if (!descriptors) return;
  const ownerId = request.ownerId;
  if (!ownerId) {
    diagnostics.push(
      diagnostic(
        'OUTPUT_DESCRIPTOR_OWNER',
        'Descriptor assembly requires the compiler artifact owner ID.',
        request.entry.id,
      ),
    );
    return;
  }
  const ids = new Set<string>();
  const ready = new Set(
    request.content.filter((item) => item.ir.role !== 'demo-assets').map((item) => item.ir.id),
  );
  if (ready.size !== request.content.filter((item) => item.ir.role !== 'demo-assets').length) {
    diagnostics.push(
      diagnostic('OUTPUT_DESCRIPTOR_PARTITION', 'Ready content IDs must be unique.', ownerId),
    );
  }
  for (const [ordinal, descriptor] of descriptors.entries()) {
    if (
      descriptor.schemaVersion !== GENERATOR_SCHEMA_VERSION ||
      descriptor.ownerId !== ownerId ||
      descriptor.ordinal !== ordinal ||
      !descriptor.id ||
      typeof descriptor.title !== 'string' ||
      typeof descriptor.absoluteRoute !== 'string' ||
      descriptor.locator.kind !== descriptor.role ||
      ids.has(descriptor.id) ||
      descriptor.closureIds.includes(descriptor.id) ||
      new Set(descriptor.closureIds).size !== descriptor.closureIds.length ||
      [...descriptor.closureIds].some((id, index, values) => index && values[index - 1] >= id) ||
      descriptor.dependencies.some(
        (dependency) => dependency.kind !== 'content' && dependency.kind !== 'existence',
      ) ||
      (descriptor.role === 'guide-tab' &&
        (request.entry.kind !== 'guide' ||
          descriptor.locator.kind !== 'guide-tab' ||
          !request.entry.markdown.includes(descriptor.locator.markdown))) ||
      (descriptor.role === 'api-tab' &&
        (!request.declaration ||
          descriptor.locator.kind !== 'api-tab' ||
          descriptor.locator.declarationId !== request.declaration.id)) ||
      (descriptor.role === 'header' && descriptor.locator.kind !== 'header')
    )
      diagnostics.push(
        diagnostic(
          'OUTPUT_DESCRIPTOR_INVALID',
          `Invalid descriptor ${descriptor.id}.`,
          request.entry.id,
        ),
      );
    ids.add(descriptor.id);
  }
  for (const id of ready)
    if (!ids.has(id))
      diagnostics.push(
        diagnostic(
          'OUTPUT_DESCRIPTOR_PARTITION',
          `Unknown ready descriptor ${id}.`,
          request.entry.id,
        ),
      );
  for (const item of request.content.filter((candidate) => candidate.ir.role !== 'demo-assets')) {
    const descriptor = descriptors.find((candidate) => candidate.id === item.ir.id);
    if (
      !descriptor ||
      descriptor.role !== item.ir.role ||
      descriptor.title !== item.ir.title ||
      descriptor.route !== item.ir.route ||
      descriptor.absoluteRoute !== item.ir.absoluteRoute ||
      descriptor.icon !== item.ir.icon ||
      JSON.stringify(descriptor.searchBreadcrumbs) !==
        JSON.stringify(item.ir.searchBreadcrumbs ?? [])
    ) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_DESCRIPTOR_CURRENT',
          `Descriptor does not match current content ${item.ir.id}.`,
          ownerId,
        ),
      );
    }
  }
  const headerCount = descriptors.filter((descriptor) => descriptor.role === 'header').length;
  if (headerCount !== 1)
    diagnostics.push(
      diagnostic(
        'OUTPUT_DESCRIPTOR_MEMBERSHIP',
        'Current owner must have exactly one header descriptor.',
        ownerId,
      ),
    );
  if (request.declaration) {
    if (
      descriptors.filter((descriptor) => descriptor.role === 'api-tab').length !== 1 ||
      descriptors.some((descriptor) => descriptor.role === 'guide-tab')
    )
      diagnostics.push(
        diagnostic(
          'OUTPUT_DESCRIPTOR_MEMBERSHIP',
          'API declaration descriptors must contain one API tab and no guide tabs.',
          ownerId,
        ),
      );
  } else if (!request.declaration && request.entry.kind === 'guide') {
    const guide = request.entry;
    const markdown = descriptors
      .filter((descriptor) => descriptor.role === 'guide-tab')
      .map((descriptor) =>
        descriptor.locator.kind === 'guide-tab' ? descriptor.locator.markdown : '',
      );
    if (
      markdown.length !== guide.markdown.length ||
      new Set(markdown).size !== markdown.length ||
      markdown.some((path, index) => path !== guide.markdown[index]) ||
      descriptors.some((descriptor) => descriptor.role === 'api-tab')
    )
      diagnostics.push(
        diagnostic(
          'OUTPUT_DESCRIPTOR_MEMBERSHIP',
          'Guide descriptors do not match current markdown membership.',
          ownerId,
        ),
      );
  }
  const closures = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor.closureIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    const ok = (closures.get(id) ?? []).every(
      (dependency) => ids.has(dependency) && visit(dependency),
    );
    visiting.delete(id);
    visited.add(id);
    return ok;
  };
  if (![...ids].every(visit))
    diagnostics.push(
      diagnostic(
        'OUTPUT_DESCRIPTOR_CLOSURE',
        'Descriptor closure must reference same-owner descriptors and be acyclic.',
        ownerId,
      ),
    );
  // A descriptor without linked content would leave its generated file without a body.
  const missing = [...ids].filter((id) => !ready.has(id));
  if (missing.length)
    diagnostics.push(
      diagnostic(
        'OUTPUT_DESCRIPTOR_FILE_DEFERRED',
        `Generated files cannot omit content: ${missing.join(', ')}.`,
        request.entry.id,
      ),
    );
}

function contentSlots(request: PageAssemblyRequest): ContentSlot[] {
  const linked = new Map(request.content.map((item) => [item.ir.id, item]));
  if (!request.contentDescriptors) {
    return request.content
      .filter(
        (
          item,
        ): item is LinkedContent & {
          ir: LinkedContent['ir'] & { role: ContentDescriptor['role'] };
        } => item.ir.role !== 'demo-assets',
      )
      .map((item) => ({
        id: item.ir.id,
        role: item.ir.role,
        title: item.ir.title,
        route: item.ir.route,
        absoluteRoute: item.ir.absoluteRoute,
        ...(item.ir.icon === undefined ? {} : { icon: item.ir.icon }),
        linked: item,
      }));
  }
  return request.contentDescriptors.map((descriptor) => {
    const item = linked.get(descriptor.id);
    return {
      id: descriptor.id,
      role: descriptor.role,
      title: descriptor.title,
      route: descriptor.route,
      absoluteRoute: descriptor.absoluteRoute,
      ...(descriptor.icon === undefined ? {} : { icon: descriptor.icon }),
      ...(item ? { linked: item } : {}),
      descriptor,
    };
  });
}

export class OutputAssemblerImpl implements OutputAssembler {
  private readonly templateRoot: string;

  constructor(options: { templateRoot?: string } = {}) {
    this.templateRoot =
      options.templateRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../templates');
  }

  async templateDependencies(): Promise<ServiceResult<null>> {
    const dependencies: Dependency[] = [];
    const diagnostics: Diagnostic[] = [];
    for (const name of STRUCTURAL_TEMPLATES) {
      // Recorded as a host path with forward slashes: on Windows `resolve` gives backslashes,
      // which no dependency may carry.
      const path = hostPath(resolve(this.templateRoot, name));
      try {
        dependencies.push({ kind: 'content', path, digest: (await readTextFile(path)).digest });
      } catch (error) {
        dependencies.push({ kind: 'existence', path, exists: false });
        diagnostics.push(
          diagnostic(
            'OUTPUT_TEMPLATE_READ',
            `Cannot read structural template ${path}: ${String(error)}`,
          ),
        );
      }
    }
    return diagnostics.length
      ? { dependencies, diagnostics }
      : { value: null, dependencies, diagnostics };
  }

  assemblePage(request: PageAssemblyRequest): PageAssembly {
    const diagnostics: Diagnostic[] = [];
    const outputs = new Map<string, FileOutput>();
    const routes: RouteRecord[] = [];
    const apiList: ApiListRecord[] = [];
    try {
      validateDescriptorPartition(request, diagnostics);
      if (diagnostics.length) return { outputs: [], routes, apiList, diagnostics };
      if (request.declaration) {
        this.apiDeclaration(request, outputs, routes, apiList, diagnostics);
      } else if (request.entry.kind === 'api') {
        this.apiEntry({ ...request, entry: request.entry }, outputs, routes, diagnostics);
      } else {
        this.guide({ ...request, entry: request.entry }, outputs, routes, diagnostics);
      }
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_ASSEMBLY',
          error instanceof Error ? error.message : String(error),
          request.entry.id,
        ),
      );
    }
    return { outputs: [...outputs.values()], routes, apiList, diagnostics };
  }

  aggregate(request: AggregateRequest): AggregateAssembly {
    const diagnostics: Diagnostic[] = [];
    const outputs = new Map<string, FileOutput>();
    try {
      const records = request.artifacts.flatMap((artifact) => artifact.routes);
      for (const entry of request.entries) {
        if (entry.kind !== 'category' || records.some((record) => record.id === entry.id)) continue;
        records.push({
          id: entry.id,
          ...(entry.parentId ? { parentId: entry.parentId } : {}),
          path: entry.route,
          title: entry.title,
          ...(entry.order === undefined ? {} : { order: entry.order }),
          ...(entry.hidden === undefined ? {} : { hidden: entry.hidden }),
          category: {
            runtimeImport: entry.runtimeImport,
            ...(entry.expandable === undefined ? {} : { expandable: entry.expandable }),
            ...(entry.expanded === undefined ? {} : { expanded: entry.expanded }),
          },
        });
      }
      const routeTrees = pruneEmptyCategories(
        routeTemplateTree(request.configuration, records, diagnostics),
      );
      validateRoutePaths(routeTrees, diagnostics);
      const renderableRoutes = (nodes: typeof routeTrees): typeof routeTrees =>
        nodes.map((node) => ({
          item: {
            ...node.item,
            id: node.item.isCategory
              ? categoryIdentifier(request.configuration.projectId, node.item.id)
              : node.item.id,
          },
          children: renderableRoutes(node.children),
        }));
      this.renderOutput(outputs, diagnostics, 'routes.ts', 'routes', 'routes.ts.nunj', {
        entries: renderableRoutes(routeTrees),
        curDir: resolve(request.configuration.outputRoot),
      });
      this.renderOutput(outputs, diagnostics, 'context.ts', 'context', 'context.ts.nunj', {
        entries: pruneEmptyCategories(navigationTree(request.entries, records, diagnostics)),
        routePrefix: request.configuration.routePrefix,
        shikiThemeLight: request.configuration.themes.light,
        shikiThemeDark: request.configuration.themes.dark,
        // Every API list the site has, so the search palette requests no other one.
        apiLists: request.entries
          .filter((entry): entry is ApiDescriptor => entry.kind === 'api')
          .map((entry) => apiAssetRoute(entry, request.configuration)),
      });
      this.renderOutput(outputs, diagnostics, 'index.ts', 'angular', 'index.ts.nunj', {});

      const searchPath = joinOutput(request.configuration.assetDirectory, 'indexes.json');
      const keywordPath = joinOutput(request.configuration.assetDirectory, 'keywords.json');
      if (!searchPath || !keywordPath) {
        diagnostics.push(
          diagnostic('OUTPUT_PATH_INVALID', 'Asset directory produces an unsafe aggregate path.'),
        );
      } else {
        addOutput(
          outputs,
          output(
            searchPath,
            'search',
            strictJson(request.artifacts.flatMap((artifact) => artifact.searchRecords)),
          ),
          diagnostics,
        );
        addOutput(
          outputs,
          output(keywordPath, 'asset', strictJson(keywordMap(request.keywords))),
          diagnostics,
        );
      }
      this.apiLists(request, outputs, diagnostics);
    } catch (error) {
      diagnostics.push(
        diagnostic('OUTPUT_AGGREGATE', error instanceof Error ? error.message : String(error)),
      );
    }
    validateOutputOwnership(request.artifacts, outputs, diagnostics);
    return { outputs: [...outputs.values()], diagnostics };
  }

  private guide(
    request: PageAssemblyRequest & { entry: GuideDescriptor },
    outputs: Map<string, FileOutput>,
    routes: RouteRecord[],
    diagnostics: Diagnostic[],
  ): void {
    const directory = guideDirectory(request.configuration, request.entry);
    if (!directory) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_GUIDE_ROOT',
          `Guide ${request.entry.source.path} is outside configured docs roots.`,
          request.entry.id,
        ),
      );
      return;
    }
    const slots = contentSlots(request);
    const header = slots.find((item) => item.role === 'header');
    const tabs = slots.filter((item) => item.role === 'guide-tab');
    const linkedAssets = request.content.find((item) => item.ir.role === 'demo-assets');
    if (!header)
      diagnostics.push(
        diagnostic('OUTPUT_HEADER_MISSING', 'Guide header is missing.', request.entry.id),
      );
    if (!tabs.length)
      diagnostics.push(
        diagnostic('OUTPUT_TABS_MISSING', 'Guide has no content tabs.', request.entry.id),
      );
    if (!request.semantics)
      diagnostics.push(
        diagnostic('OUTPUT_SEMANTICS_MISSING', 'Guide semantics are missing.', request.entry.id),
      );
    if (diagnostics.some((item) => item.severity === 'error')) return;

    const wrapperPath = joinOutput(directory, 'page.ts')!;
    const demoPath = joinOutput(directory, 'demo-assets.ts')!;
    const playgroundPath = joinOutput(directory, 'playgrounds.ts')!;
    const tabEntries: Record<string, { route: string; title: string; entry: { icon?: string } }> =
      {};
    for (const tab of tabs) {
      const tabPath = joinOutput(directory, tab.route || 'index', 'page.ts');
      if (!tabPath) {
        diagnostics.push(diagnostic('OUTPUT_PATH_INVALID', `Unsafe guide tab route: ${tab.route}`));
        continue;
      }
      const absoluteTab = resolve(request.configuration.outputRoot, tabPath);
      const links = sourceLinks(
        request.configuration,
        contentSource(request.entry, tab),
        tab.route,
      );
      const tabContentSourceImport = contentSourceImport(request.configuration, tabPath);
      this.renderOutput(
        outputs,
        diagnostics,
        tabPath,
        'content',
        'page.ts.nunj',
        {
          id: stableId(request.configuration.projectId, tab.id, 'page-component'),
          content: tab.linked?.html,
          contentSourceImport: tabContentSourceImport,
          metadata: { title: tab.title, outDir: dirname(absoluteTab) },
          ...links,
          pageType: 'guide',
          entryPath: request.entry.runtimeImport.source,
          entryHasImports: request.entry.hasImports,
          demoAssetsPath: resolve(request.configuration.outputRoot, demoPath),
          playgroundsPath: resolve(request.configuration.outputRoot, playgroundPath),
        },
        request.entry.id,
      );
      if (outputs.has(tabPath))
        this.addContentSource(
          outputs,
          diagnostics,
          tabPath,
          tab,
          request.configuration,
          request.entry.id,
        );
      tabEntries[
        relativeImport(dirname(resolve(request.configuration.outputRoot, wrapperPath)), absoluteTab)
      ] = {
        route: tab.route,
        title: tab.title,
        entry: { ...(tab.icon === undefined ? {} : { icon: tab.icon }) },
      };
    }
    const headerContentSourceImport = contentSourceImport(request.configuration, wrapperPath);
    this.renderOutput(
      outputs,
      diagnostics,
      wrapperPath,
      'angular',
      'page-wrapper.ts.nunj',
      {
        id: stableId(request.configuration.projectId, request.entry.id, 'page-wrapper'),
        metadata: { title: request.entry.title },
        entries: tabEntries,
        headerContent: header!.linked?.html,
        headerContentSourceImport,
        hasBreadcrumb: !!request.entry.breadcrumbs.length,
        pageType: 'guide',
      },
      request.entry.id,
    );
    if (outputs.has(wrapperPath))
      this.addContentSource(
        outputs,
        diagnostics,
        wrapperPath,
        header!,
        request.configuration,
        request.entry.id,
      );
    const renderedAssets = demoAssets(
      linkedAssets,
      request.semantics!,
      diagnostics,
      request.entry.id,
    );
    this.renderOutput(
      outputs,
      diagnostics,
      demoPath,
      'angular',
      'demo-assets.ts.nunj',
      { demoAssets: renderedAssets },
      request.entry.id,
    );
    this.renderOutput(
      outputs,
      diagnostics,
      playgroundPath,
      'angular',
      'playgrounds.ts.nunj',
      {
        playgroundMetadata: Object.fromEntries(
          request.semantics!.playgrounds.map((item) => [
            item.id,
            {
              standalone: item.standalone,
              templateForComponents: item.templatesBySelector,
            },
          ]),
        ),
        hasImports: request.entry.hasImports,
        pageRoute: request.entry.absoluteRoute,
        entryImportPath: moduleSpecifier(
          dirname(resolve(request.configuration.outputRoot, playgroundPath)),
          request.entry.runtimeImport.source,
        ),
      },
      request.entry.id,
    );
    routes.push({
      id: request.entry.id,
      ...(request.entry.parentId ? { parentId: request.entry.parentId } : {}),
      path: request.entry.route,
      title: request.entry.title,
      ...(request.entry.order === undefined ? {} : { order: request.entry.order }),
      ...(request.entry.hidden === undefined ? {} : { hidden: request.entry.hidden }),
      ...(request.metadata ? { metadata: request.metadata } : {}),
      modulePath: wrapperPath,
    });
  }

  private apiEntry(
    request: PageAssemblyRequest & { entry: ApiDescriptor },
    outputs: Map<string, FileOutput>,
    routes: RouteRecord[],
    diagnostics: Diagnostic[],
  ): void {
    const assetRoute = apiAssetRoute(request.entry, request.configuration);
    const pagePath = joinOutput(request.configuration.apiDirectory, assetRoute, 'page.ts');
    if (!pagePath) {
      diagnostics.push(
        diagnostic('OUTPUT_PATH_INVALID', `Unsafe API route: ${request.entry.route}`),
      );
      return;
    }
    this.renderOutput(
      outputs,
      diagnostics,
      pagePath,
      'angular',
      'api-list.ts.nunj',
      {
        id: stableId(request.configuration.projectId, request.entry.id, 'api-list'),
        segment: assetRoute,
        title: request.entry.title,
      },
      request.entry.id,
    );
    routes.push({
      id: request.entry.id,
      ...(request.entry.parentId ? { parentId: request.entry.parentId } : {}),
      path: request.entry.route,
      title: request.entry.title,
      ...(request.entry.order === undefined ? {} : { order: request.entry.order }),
      ...(request.entry.hidden === undefined ? {} : { hidden: request.entry.hidden }),
      ...(request.metadata ? { metadata: request.metadata } : {}),
      modulePath: pagePath,
      apiListSegment: assetRoute,
    });
  }

  private apiDeclaration(
    request: PageAssemblyRequest,
    outputs: Map<string, FileOutput>,
    routes: RouteRecord[],
    apiList: ApiListRecord[],
    diagnostics: Diagnostic[],
  ): void {
    const declaration = request.declaration!;
    if (request.entry.kind !== 'api' || declaration.apiEntryId !== request.entry.id) {
      diagnostics.push(
        diagnostic('OUTPUT_DECLARATION_OWNER', 'API declaration does not belong to the API entry.'),
      );
      return;
    }
    const publicRoute = stripRoutePrefix(declaration.route, request.configuration.routePrefix);
    const directory = joinOutput(request.configuration.apiDirectory, publicRoute);
    if (!directory) {
      diagnostics.push(
        diagnostic('OUTPUT_PATH_INVALID', `Unsafe API declaration route: ${publicRoute}`),
      );
      return;
    }
    const wrapperPath = joinOutput(directory, 'page.ts')!;
    const tabPath = joinOutput(directory, 'api', 'page.ts')!;
    const slots = contentSlots(request);
    const header = slots.find((item) => item.role === 'header');
    const tab = slots.find((item) => item.role === 'api-tab');
    if (!header || !tab) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_API_CONTENT_MISSING',
          `API declaration ${declaration.name} requires header and API tab content.`,
          declaration.id,
        ),
      );
      return;
    }
    const absoluteTab = resolve(request.configuration.outputRoot, tabPath);
    const tabContentSourceImport = contentSourceImport(request.configuration, tabPath);
    this.renderOutput(
      outputs,
      diagnostics,
      tabPath,
      'content',
      'page.ts.nunj',
      {
        id: stableId(request.configuration.projectId, declaration.id, 'page-component'),
        content: tab.linked?.html,
        contentSourceImport: tabContentSourceImport,
        metadata: { title: declaration.name, outDir: dirname(absoluteTab) },
        ...sourceLinks(request.configuration, declaration.source, tab.route),
        pageType: 'api',
      },
      declaration.id,
    );
    if (outputs.has(tabPath))
      this.addContentSource(
        outputs,
        diagnostics,
        tabPath,
        tab,
        request.configuration,
        declaration.id,
      );
    const headerContentSourceImport = contentSourceImport(request.configuration, wrapperPath);
    this.renderOutput(
      outputs,
      diagnostics,
      wrapperPath,
      'angular',
      'page-wrapper.ts.nunj',
      {
        id: stableId(request.configuration.projectId, declaration.id, 'page-wrapper'),
        metadata: { title: declaration.name },
        headerContentSourceImport,
        entries: {
          [relativeImport(
            dirname(resolve(request.configuration.outputRoot, wrapperPath)),
            absoluteTab,
          )]: {
            route: '',
            title: declaration.name,
            entry: {},
          },
        },
        headerContent: header.linked?.html,
        hasBreadcrumb: false,
        pageType: 'api',
      },
      declaration.id,
    );
    if (outputs.has(wrapperPath))
      this.addContentSource(
        outputs,
        diagnostics,
        wrapperPath,
        header,
        request.configuration,
        declaration.id,
      );
    routes.push({
      id: declaration.id,
      path: publicRoute,
      title: declaration.name,
      hidden: true,
      modulePath: wrapperPath,
    });
    apiList.push({
      apiEntryId: request.entry.id,
      scopeId: declaration.scopeId,
      scopeTitle:
        request.entry.scopes.find((scope) => scope.id === declaration.scopeId)?.name ??
        declaration.scopeId,
      name: declaration.name,
      type: apiListType(declaration),
      route: declaration.route,
      ...(declaration.description ? { description: declaration.description } : {}),
      ...(declaration.signature ? { signature: declaration.signature } : {}),
    });
  }

  private apiLists(
    request: AggregateRequest,
    outputs: Map<string, FileOutput>,
    diagnostics: Diagnostic[],
  ): void {
    const records = request.artifacts.flatMap((artifact) => artifact.apiList);
    for (const entry of request.entries) {
      if (entry.kind !== 'api') continue;
      const byScope = new Map<string, ApiListRecord[]>();
      records
        .filter((record) => record.apiEntryId === entry.id)
        .forEach((record) =>
          byScope.set(record.scopeId, [...(byScope.get(record.scopeId) ?? []), record]),
        );
      const lists = entry.scopes
        .filter((scope) => byScope.has(scope.id))
        .map((scope) => ({
          title: scope.name,
          items: byScope.get(scope.id)!.map((record) => ({
            route: `/${record.route.replace(/^\//, '')}`,
            type: record.type,
            name: record.name,
            ...(record.description ? { description: record.description } : {}),
            ...(record.signature ? { signature: record.signature } : {}),
          })),
        }));
      const path = joinOutput(
        request.configuration.assetDirectory,
        apiAssetRoute(entry, request.configuration),
        'api-list.json',
      );
      if (!path) {
        diagnostics.push(
          diagnostic('OUTPUT_PATH_INVALID', `Unsafe API asset route: ${entry.route}`),
        );
        continue;
      }
      addOutput(outputs, output(path, 'api-list', strictJson(lists)), diagnostics, entry.id);
    }
  }

  private addContentSource(
    outputs: Map<string, FileOutput>,
    diagnostics: Diagnostic[],
    componentPath: string,
    slot: ContentSlot,
    configuration: GeneratorConfiguration,
    ownerId: string,
  ): void {
    const paths = contentArtifactPaths(componentPath);
    if (!paths) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_PATH_INVALID',
          `Unsafe generated content path: ${componentPath}`,
          ownerId,
        ),
      );
      return;
    }
    const payload = slot.linked ? contentPayload(configuration, slot.linked) : undefined;
    const payloadImport = moduleSpecifier(
      dirname(resolve(configuration.outputRoot, paths.sourcePath)),
      resolve(configuration.outputRoot, paths.contentPath),
    );
    if (payload)
      addOutput(
        outputs,
        output(paths.contentPath, 'content', `export default ${strictJson(payload)};\n`),
        diagnostics,
        ownerId,
      );
    const source = `const source = Object.freeze({ id: ${strictJson(payload!.id)}, load: async (_signal) => (await import(${strictJson(payloadImport)})).default });\nexport default source;\n`;
    addOutput(outputs, output(paths.sourcePath, 'content', source), diagnostics, ownerId);
    // The declarations import the package root: `@ng-doc/core` has no `exports`, so a subpath is
    // a directory import, which TypeScript's `NodeNext` resolution refuses in an ESM project.
    addOutput(
      outputs,
      output(
        paths.contentDeclarationPath,
        'content',
        "import type {NgDocContentModule} from '@ng-doc/core';\ndeclare const payload: NgDocContentModule;\nexport default payload;\n",
      ),
      diagnostics,
      ownerId,
    );
    addOutput(
      outputs,
      output(
        paths.sourceDeclarationPath,
        'content',
        "import type {NgDocContentSource} from '@ng-doc/core';\ndeclare const source: NgDocContentSource;\nexport default source;\n",
      ),
      diagnostics,
      ownerId,
    );
  }

  private renderOutput(
    outputs: Map<string, FileOutput>,
    diagnostics: Diagnostic[],
    path: string,
    role: FileOutput['role'],
    template: string,
    context: object,
    ownerId?: string,
  ): void {
    const safe = safeRelative(path);
    if (!safe) {
      diagnostics.push(
        diagnostic('OUTPUT_PATH_INVALID', `Unsafe generated output path: ${path}`, ownerId),
      );
      return;
    }
    try {
      addOutput(
        outputs,
        output(safe, role, render(this.templateRoot, template, context)),
        diagnostics,
        ownerId,
      );
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'OUTPUT_TEMPLATE_RENDER',
          `Cannot render ${template}: ${error instanceof Error ? error.message : String(error)}`,
          ownerId,
        ),
      );
    }
  }
}

export function createOutputAssembler(options: { templateRoot?: string } = {}): OutputAssembler {
  return new OutputAssemblerImpl(options);
}
