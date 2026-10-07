import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createArtifactCache, JsonArtifactCache, retryingRename } from '../artifacts';
import { GeneratorContentCompiler } from '../content/content-compiler';
import { type FormatSession, createFormatSession } from '../content/format-cache';
import {
  type HighlightSession,
  createHighlightSession,
  grammarsSwitch,
} from '../content/highlight-cache';
import { type RenderBack, createRenderBack } from '../content/html-pool';
import type {
  CompilationRequest,
  Dependency,
  Diagnostic,
  DiscoverySnapshot,
  PageArtifact,
  RebuildReason,
} from '../contracts';
import { GENERATOR_SCHEMA_VERSION } from '../contracts';
import type { createDiscoveryServices } from '../discovery';
import { type DependencyRefresher, createDependencyIndex, validateSemanticScopes } from '../graph';
import type { OutputAssembler } from '../outputs';
import { useFormatCache } from '../semantic/formatting';
import { programDigestOf } from '../semantic/semantic-closure';
import type { SemanticServiceImpl } from '../semantic/semantic-service';
import { type Unit, dependencyKey, diagnostic, hash, uniqueDependencies } from './common';
import { intact, restoredReuse } from './fast-start';
import type { GenerationRecords } from './fold';
import type { CompilationOptions } from './index';
import { type MemoState, createMemoState } from './memo';
import type { ScopedSemanticMode } from './semantic-closure';

/** The services one compile runs its phases with. */
export interface CompilationServices {
  options: CompilationOptions;
  discovery: ReturnType<typeof createDiscoveryServices>;
  semantic: SemanticServiceImpl;
  assembler: OutputAssembler;
}

/**
 * Everything the unit phases of one generation share: the request and its services, the discovered
 * site, and the previous artifacts and what may be reused from them. Built once by
 * `planGeneration`.
 */
export interface GenerationPlan extends CompilationServices {
  request: CompilationRequest;
  signal: AbortSignal;
  records: GenerationRecords;
  refresher: DependencyRefresher;
  found: DiscoverySnapshot;
  configuration: DiscoverySnapshot['configuration'];
  /**
   * Turns semantic scopes into references and, unless semantic invalidation is scoped, drops the
   * program inputs the aggregate owns (a scoped unit keeps the program files it read).
   */
  compact(values: Dependency[]): Dependency[];
  /** The global `semantic-reference` every unit records; empty when semantic invalidation is scoped. */
  semanticReferences: Dependency[];
  /** Scoped semantic invalidation in this generation (`./semantic-closure`). */
  scopedSemantic: ScopedSemanticMode;
  outputDependencies: Dependency[];
  /** The program's own dependencies, owned once by the aggregate artifact. */
  programDependencies: Dependency[];
  cache: JsonArtifactCache;
  hadCacheIndex: boolean;
  previous: PageArtifact[];
  previousById: Map<string, PageArtifact>;
  /** Index-derived `whyRebuilt` reasons of these (removed or rebuilt) owners. */
  affectedFor(ownerIds: string[]): RebuildReason[];
  /**
   * The previous artifacts are reused beyond their IRs (links, assemblies, revisions): the
   * session's snapshot, or the cache index of a start (`restoredReuse`).
   */
  sessionPrevious: boolean;
  memo: MemoState;
  compiler: GeneratorContentCompiler;
  /** The cache of highlighted code blocks, when this generation uses one (`content/highlight-cache`). */
  highlight?: HighlightSession;
  /** The cache of formatted signatures and snippets, when this generation uses one (`content/format-cache`). */
  format?: FormatSession;
  /** Where the content's HTML pipeline runs, when it may run on threads (`content/html-pool`). */
  back?: RenderBack;
}

/**
 * Setup phase: previous artifacts (session snapshot or cache index), reuse switches and the output
 * templates. Its diagnostics are recorded as the `setup` phase.
 * @param services
 * @param input
 * @param input.request
 * @param input.signal
 * @param input.records
 * @param input.refresher
 * @param input.found
 * @param input.programDependencies
 * @param input.scopedSemantic
 * @param input.scratch
 */
export async function planGeneration(
  services: CompilationServices,
  input: {
    request: CompilationRequest;
    signal: AbortSignal;
    records: GenerationRecords;
    refresher: DependencyRefresher;
    found: DiscoverySnapshot;
    programDependencies: Dependency[];
    scopedSemantic?: ScopedSemanticMode;
    /**
     * No previous artifacts at all, not even the cache index's: with the reference path's options
     * (`incrementalReuse: false`), a compile from scratch (the fast start's `verify`).
     */
    scratch?: boolean;
  },
): Promise<GenerationPlan> {
  const { options, discovery, semantic, assembler } = services;
  const { request, records, found, programDependencies } = input;
  const setup = (diagnostics: Diagnostic[], dependencies: Dependency[] = []): void =>
    records.global('setup', { diagnostics, dependencies });
  // The complete program provenance is owned once by the aggregate artifact.
  // Per-page cache keys retain its semantic digest plus query-specific dependencies.
  const scopedSemantic = input.scopedSemantic ?? 'off';
  const programKeys = new Set(programDependencies.map(dependencyKey));
  const compact = (values: Dependency[]): Dependency[] =>
    uniqueDependencies(
      values
        .filter(
          (value) =>
            scopedSemantic !== 'off' ||
            value.kind === 'semantic' ||
            value.kind === 'semantic-reference' ||
            !programKeys.has(dependencyKey(value)),
        )
        .map(
          (value): Dependency =>
            value.kind === 'semantic'
              ? {
                  kind: 'semantic-reference',
                  scopeId: value.scopeId,
                  digest: value.digest,
                  reason: value.reason,
                }
              : value,
        ),
    );
  // Only the aggregate `semantic` definition, as a reference (never the program's other inputs).
  const semanticReferences =
    scopedSemantic === 'off'
      ? compact(programDependencies.filter((value) => value.kind === 'semantic'))
      : [];
  const configuration = found.configuration;
  const cache = new JsonArtifactCache({ root: configuration.cacheRoot });
  const hadCacheIndex =
    configuration.cacheEnabled && existsSync(indexPath(configuration.cacheRoot, options.projectId));
  const restored: Diagnostic[] = [];
  let previous = input.scratch
    ? []
    : request.previous?.projectId === options.projectId
      ? request.previous.artifacts
      : configuration.cacheEnabled
        ? await restoreIndex(configuration.cacheRoot, options.projectId, restored)
        : [];
  setup(restored);
  const expandedLegacyScopes = previous.some(
    (artifact) =>
      artifact.identity.role !== 'aggregate' &&
      [...artifact.dependencies, ...artifact.content.flatMap((item) => item.ir.dependencies)].some(
        (item) => item.kind === 'semantic',
      ),
  );
  if (expandedLegacyScopes) {
    setup([
      diagnostic(
        'COMPILATION_CACHE_FORMAT',
        'Expanded semantic cache format is being rebuilt with shared scope references.',
        'warning',
      ),
    ]);
    previous = [];
  }
  const invalidPreviousScopes = validateSemanticScopes(previous);
  if (invalidPreviousScopes.length) {
    setup([
      diagnostic(
        'COMPILATION_CACHE_SCOPE',
        `Previous semantic provenance is incomplete; rebuilding cached pages: ${invalidPreviousScopes.map((item) => item.message).join('; ')}`,
        'warning',
      ),
    ]);
    previous = [];
  }
  const previousById = new Map(previous.map((item) => [item.id, item]));
  // A closure recorded against this previous candidate holds without its record when the program
  // is still that candidate's.
  semantic.closureBase(programDigestOf(previous));
  // Production and one-shot builds stay cold and fully recomputed (ADR 0004): only a
  // development generation uses the incremental reuse, the memo and cache-write skips.
  const reuse = options.incrementalReuse !== false && request.mode === 'development';
  // `whyRebuilt` reports index reasons only for removed or rebuilt owners, so the index is
  // built for exactly those owners once they are known. The reference path keeps the
  // unrestricted index at its original point.
  const unrestrictedAffected = reuse
    ? undefined
    : createDependencyIndex(previous).affected(request.changes);
  const affectedFor = (ownerIds: string[]): RebuildReason[] => {
    if (!ownerIds.length) return [];
    if (unrestrictedAffected) {
      const selected = new Set(ownerIds);
      return unrestrictedAffected.filter((reason) => selected.has(reason.ownerId));
    }
    return createDependencyIndex(previous, { owners: ownerIds }).affected(request.changes);
  };
  // The previous artifacts' links, assemblies and revisions are reused only from the session's
  // snapshot, or (`NGDOC_FAST_START`) from the cache index of a start: they are the artifacts of
  // the generation that wrote the cache, each checked to be the artifact its revision names (an
  // entry damaged in place would otherwise publish its outputs).
  const sessionPrevious =
    reuse &&
    (request.previous?.projectId === options.projectId ||
      (!request.previous &&
        previous.length > 0 &&
        restoredReuse(options) &&
        previous.every(intact)));
  const memo = createMemoState(
    reuse && configuration.cacheEnabled,
    configuration.cacheRoot,
    options,
  );
  const outputDependencyResult = await assembler.templateDependencies();
  setup(outputDependencyResult.diagnostics, outputDependencyResult.dependencies);
  const outputDependencies = outputDependencyResult.dependencies;
  const highlight = createHighlightSession(options, request, configuration);
  // The semantic service formats through it until the compile ends (`compiler/index.ts`).
  const format = createFormatSession(options, request, configuration);
  useFormatCache(format);
  const grammars = grammarsSwitch(options);
  const back = createRenderBack(options, highlight, {
    themes: configuration.themes,
    ...(configuration.shikiLangs ? { langs: configuration.shikiLangs } : {}),
    ...(grammars === 'all' ? { grammars } : {}),
    cache: highlight !== undefined,
  });
  const compiler = new GeneratorContentCompiler(
    { configuration, semantic, templates: discovery.templates },
    highlight,
    back,
    grammars,
  );
  return {
    ...services,
    request,
    signal: input.signal,
    records,
    refresher: input.refresher,
    found,
    configuration,
    compact,
    semanticReferences,
    outputDependencies,
    programDependencies,
    cache,
    hadCacheIndex,
    previous,
    previousById,
    affectedFor,
    sessionPrevious,
    memo,
    compiler,
    ...(highlight ? { highlight } : {}),
    ...(format ? { format } : {}),
    ...(back ? { back } : {}),
    scopedSemantic,
  };
}

/**
 * Plan phase, after describe: the current descriptor plan, in which a duplicate descriptor fails
 * the generation. Every descriptor of the plan is rendered.
 * @param plan
 * @param units
 */
export function planContent(plan: GenerationPlan, units: Unit[]): void {
  const diagnostics: Diagnostic[] = [];
  const currentIds = new Set<string>();
  for (const descriptor of units.flatMap((unit) => unit.descriptors)) {
    if (currentIds.has(descriptor.id)) {
      diagnostics.push(
        diagnostic(
          'COMPILATION_CONTENT_DESCRIPTOR_DUPLICATE',
          `Duplicate current content descriptor ${descriptor.id}.`,
        ),
      );
    }
    currentIds.add(descriptor.id);
  }
  plan.records.global('plan', { diagnostics, dependencies: [] });
}

/** Cache entries read at once when the index is restored. */
const RESTORE_CONCURRENCY = 32;

const indexPath = (root: string, projectId: string) =>
  path.join(root, `${hash(projectId)}.compilation-index.json`);

/**
 * The artifacts the cache index names, in its order. An entry that cannot be read is left out
 * with its diagnostics; an index of another schema version restores nothing.
 * @param root
 * @param projectId
 * @param diagnostics
 */
export async function restoreIndex(
  root: string,
  projectId: string,
  diagnostics: Diagnostic[],
): Promise<PageArtifact[]> {
  try {
    const keys: unknown = JSON.parse(await readFile(indexPath(root, projectId), 'utf8'));
    if (!Array.isArray(keys)) throw new Error('Expected cache key array.');
    // An index written by another schema version names entries this version cannot read: the
    // cache is rebuilt, with one warning instead of one per entry.
    const versions = keys.map((key) => key?.fingerprint?.schemaVersion);
    if (versions.some((value) => typeof value === 'number' && value !== GENERATOR_SCHEMA_VERSION)) {
      diagnostics.push(
        diagnostic(
          'COMPILATION_CACHE_FORMAT',
          'The artifact cache was written by another generator schema version and is being rebuilt.',
          'warning',
        ),
      );
      return [];
    }
    for (const key of keys) {
      if (
        !key ||
        typeof key !== 'object' ||
        key.identity?.projectId !== projectId ||
        !key.fingerprint
      )
        throw new Error('Invalid cache index key.');
    }
    // The entries are read concurrently (a large site has hundreds) and taken in index order, so
    // the artifacts and their diagnostics are those of reading them one by one.
    const cache = createArtifactCache(root);
    const restored: Array<Awaited<ReturnType<typeof cache.read>>> = new Array(keys.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      for (let index = next++; index < keys.length; index = next++)
        restored[index] = await cache.read(keys[index]);
    };
    await Promise.all(Array.from({ length: Math.min(RESTORE_CONCURRENCY, keys.length) }, worker));
    const result: PageArtifact[] = [];
    for (const entry of restored) {
      if (entry.status === 'hit') result.push(entry.artifact);
      else diagnostics.push(...entry.diagnostics);
    }
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      diagnostics.push(
        diagnostic('COMPILATION_CACHE_INDEX', `Cache index ignored: ${String(error)}`, 'warning'),
      );
    return [];
  }
}
/**
 *
 * @param root
 * @param projectId
 * @param artifacts
 */
export async function saveIndex(
  root: string,
  projectId: string,
  artifacts: PageArtifact[],
): Promise<void> {
  await mkdir(root, { recursive: true });
  const file = indexPath(root, projectId);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      JSON.stringify(artifacts.map(({ identity, fingerprint }) => ({ identity, fingerprint }))),
      { flag: 'wx' },
    );
    await retryingRename(rename)(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
