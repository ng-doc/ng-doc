import { existsSync } from 'node:fs';
import path from 'node:path';

import type {
  ArtifactSnapshot,
  DeclarationDescriptor,
  Diagnostic,
  DiscoverySnapshot,
  EntryDescriptor,
  LinkedContent,
  PageArtifact,
  RebuildReason,
  RouteRecord,
  SearchRecord,
} from '../contracts';
import { GENERATOR_SCHEMA_VERSION } from '../contracts';
import { validateSemanticScopes } from '../graph';
import { apiListType, pageAssemblyKey } from '../outputs';
import { closureStorePath, saveClosureStore } from './closure-store';
import { type Unit, hash, sameStrings, uniqueDependencies, unitExports } from './common';
import type { KeywordPlan, LinkOutcome } from './link';
import { type GenerationPlan, saveIndex } from './plan';
import { closureRebuildReason } from './semantic-closure';
import type { ReplayScope } from './targeted';

/**
 * The `evaluated` reason of a rebuilt unit none of whose recorded paths changed: an entry it
 * recorded evaluated to another value. Its detail is the entry, never a path.
 */
function evaluatedReason(unit: Unit, previous: PageArtifact): RebuildReason | undefined {
  const before = new Map(
    previous.dependencies.flatMap((item) =>
      item.kind === 'evaluated' ? [[item.entryId, item.digest] as const] : [],
    ),
  );
  const changed = unit.dependencies
    .flatMap((item) =>
      item.kind === 'evaluated' &&
      before.has(item.entryId) &&
      before.get(item.entryId) !== item.digest
        ? [item.entryId]
        : [],
    )
    .sort();
  return changed.length
    ? { ownerId: unit.id, reason: 'evaluated', detail: [...new Set(changed)].join(', ') }
    : undefined;
}

/** `whyRebuilt` of previous owners that discovery no longer produces. */
export function recordRemovedOwners(plan: GenerationPlan, units: Unit[]): void {
  const currentIds = new Set(units.map((unit) => unit.id));
  const removedOwners = plan.previous.filter(
    (old) => old.identity.role !== 'aggregate' && !currentIds.has(old.id),
  );
  const removedAffected = plan.affectedFor(removedOwners.map((old) => old.id));
  for (const old of removedOwners) {
    const removedReasons = removedAffected.filter((reason) => reason.ownerId === old.id);
    plan.records.reason(
      ...(removedReasons.length
        ? removedReasons
        : [
            {
              ownerId: old.id,
              reason: 'input' as const,
              detail: 'Owner removed from discovery.',
            },
          ]),
    );
  }
}

/**
 * Assembly phase: per unit its outputs, routes and API list (from the assembly memo when it
 * provably holds), then the artifact with its revision (the previous one when value-equal) and
 * its `whyRebuilt` reasons.
 *
 * On the targeted path (`scope`), a replayed unit outside the link set is not assembled again:
 * its assembly inputs (entry, declaration, descriptors, semantics, metadata, linked content and
 * the output templates) are those of its previous page, so the assembler would return that page's
 * outputs, routes and API list, and its retained record holds what assembling emitted. A settled
 * unit (its previous artifact was already built from the reuse projection) keeps that artifact;
 * any other still gets its artifact and revision computed here, exactly as below.
 */
export function assembleUnits(
  plan: GenerationPlan,
  units: Unit[],
  linked: LinkOutcome,
  scope?: ReplayScope,
): PageArtifact[] {
  const { options, configuration, assembler, memo, records, signal } = plan;
  const artifacts: PageArtifact[] = [];
  // Index-derived reasons are resolved for the rebuilt owners together, including when
  // the loop is interrupted, so `whyRebuilt` holds what the per-unit pushes produced.
  const pendingReasons: Array<{
    ownerId: string;
    always?: RebuildReason;
    fallback?: RebuildReason;
  }> = [];
  const flushPendingReasons = (): void => {
    const pending = pendingReasons.splice(0);
    const reasons = plan.affectedFor([...new Set(pending.map((item) => item.ownerId))]);
    for (const item of pending) {
      const owned = reasons.filter((reason) => reason.ownerId === item.ownerId);
      if (item.always) records.reason(...owned, item.always);
      else records.reason(...(owned.length ? owned : [item.fallback!]));
    }
  };
  try {
    for (const unit of units) {
      signal.throwIfAborted();
      const content = linked.linkedByUnit.get(unit) ?? [];
      const keywordDigest = hash(content.map((item) => item.keywordDigest));
      const semantics = unit.semantics;
      let assemblyKey: string | undefined;
      let fromMemo = false;
      let assembled: {
        outputs: PageArtifact['outputs'];
        routes: PageArtifact['routes'];
        apiList: PageArtifact['apiList'];
        diagnostics: Diagnostic[];
      };
      const retained = scope?.keepsLink(unit) ? scope.retained(unit) : undefined;
      if (retained) {
        const previous = unit.previous!;
        unit.record.assemble.push(...retained.unit.record.assemble);
        if (retained.unit.record.assembly) unit.record.assembly = retained.unit.record.assembly;
        memo.carry(
          unit.id,
          previous.content.map((item) => item.ir.id),
        );
        if (retained.settled && previous.fingerprint.inputDigest === unit.inputDigest) {
          artifacts.push(previous);
          continue;
        }
        assembled = {
          outputs: previous.outputs,
          routes: previous.routes,
          apiList: previous.apiList,
          diagnostics: [],
        };
      } else if (unit.entry.kind === 'category') {
        assembled = {
          outputs: [],
          routes: [categoryRoute(unit.entry, unit.metadata)],
          apiList: [],
          diagnostics: [],
        };
      } else {
        const assemblyRequest = {
          ownerId: unit.id,
          configuration,
          entry: unit.entry,
          ...(unit.declaration ? { declaration: unit.declaration } : {}),
          contentDescriptors: unit.descriptors,
          ...(semantics ? { semantics } : {}),
          ...(unit.metadata ? { metadata: unit.metadata } : {}),
        };
        assemblyKey = memo.enabled
          ? pageAssemblyKey(assemblyRequest, plan.outputDependencies)
          : undefined;
        // An equal key and equal linked content assemble the previous page exactly: the
        // memo binds the key to the revision whose outputs/routes/API list were assembled.
        const previousAssembly = plan.sessionPrevious ? unit.previous : undefined;
        const recorded = assemblyKey && previousAssembly ? memo.assembly(unit.id) : undefined;
        fromMemo = Boolean(
          recorded &&
            recorded.key === assemblyKey &&
            recorded.revision === previousAssembly!.revision &&
            sameContentList(content, previousAssembly!.content),
        );
        assembled = fromMemo
          ? {
              outputs: previousAssembly!.outputs,
              routes: previousAssembly!.routes,
              apiList: previousAssembly!.apiList,
              diagnostics: [],
            }
          : assembler.assemblePage({ ...assemblyRequest, content });
      }
      if (!retained)
        records.assemble(
          unit.record,
          { diagnostics: assembled.diagnostics, dependencies: [] },
          fromMemo ? 'memo' : 'fresh',
        );
      const usedKeywords = [...new Set(unit.ir.flatMap((ir) => ir.usedKeywords))].sort();
      const keywordDependencies = linked.keywordDependenciesByUnit.get(unit) ?? [];
      const artifact: PageArtifact = {
        id: unit.id,
        identity: unit.identity,
        revision: '',
        fingerprint: {
          schemaVersion: GENERATOR_SCHEMA_VERSION,
          compilerVersion: options.compilerVersion,
          toolchainDigest: options.toolchainDigest,
          configurationDigest: configuration.digest,
          inputDigest: unit.inputDigest,
          keywordDigest,
        },
        dependencies: uniqueDependencies([...unit.dependencies, ...keywordDependencies]),
        content,
        ...(unit.entry.kind === 'category' ? {} : { contentDescriptors: unit.descriptors }),
        exportedKeywords: [...unitExports(unit), ...unit.ir.flatMap((ir) => ir.exportedKeywords)],
        usedKeywords,
        searchRecords: withApiSummary(
          content
            .filter((item) => ['guide-tab', 'api-tab', 'header'].includes(item.ir.role))
            .flatMap((item) => item.searchRecords),
          unit.declaration,
        ),
        routes: assembled.routes,
        apiList: assembled.apiList,
        outputs: assembled.outputs,
        diagnostics: unit.ir.flatMap((ir) => ir.diagnostics),
      };
      // A value-equal artifact has the previous artifact's revision (its hash).
      artifact.revision =
        plan.sessionPrevious && unit.previous && sameArtifactBody(artifact, unit.previous)
          ? unit.previous.revision
          : hash(artifact);
      if (assemblyKey && !assembled.diagnostics.length)
        memo.recordAssembly(unit.id, { key: assemblyKey, revision: artifact.revision });
      if (!unit.previous) {
        pendingReasons.push({
          ownerId: unit.id,
          always: {
            ownerId: unit.id,
            reason: plan.previous.length || plan.hadCacheIndex ? 'cache-miss' : 'initial',
            detail: unit.declaration?.source.path ?? unit.entry.source.path,
          },
        });
      } else if (unit.previous.revision !== artifact.revision) {
        pendingReasons.push({
          ownerId: unit.id,
          fallback: evaluatedReason(unit, unit.previous) ??
            closureRebuildReason(unit.previous, artifact) ?? {
              ownerId: unit.id,
              reason: 'input' as const,
              detail: unit.declaration?.source.path ?? unit.entry.source.path,
            },
        });
      }
      if (unit.previous && unit.previous.fingerprint.keywordDigest !== keywordDigest)
        records.reason({
          ownerId: unit.id,
          reason: 'keyword',
          detail: 'Used keyword bindings changed.',
        });
      artifacts.push(artifact);
    }
  } finally {
    flushPendingReasons();
  }
  return artifacts;
}

/** The site-wide outputs of the assembled pages. */
export interface SiteAggregate {
  outputs: PageArtifact['outputs'];
}

/** Aggregate phase: the global outputs (routes, context, indexes, keywords). */
export function aggregateUnits(
  plan: GenerationPlan,
  artifacts: PageArtifact[],
  keywordPlan: KeywordPlan,
): SiteAggregate {
  const aggregated = plan.assembler.aggregate({
    configuration: plan.configuration,
    artifacts,
    entries: plan.found.entries,
    keywords: keywordPlan.keywords,
  });
  plan.records.global('aggregate', { diagnostics: aggregated.diagnostics, dependencies: [] });
  return { outputs: aggregated.outputs };
}

/**
 * The candidate snapshot: appends the aggregate artifact to `artifacts`, reports outputs of
 * unchanged owners that are missing on disk, and validates the semantic scope references.
 */
export function candidateSnapshot(
  plan: GenerationPlan,
  artifacts: PageArtifact[],
  keywordPlan: KeywordPlan,
  site: SiteAggregate,
): ArtifactSnapshot {
  const { options, configuration, request, records } = plan;
  const aggregateArtifact: PageArtifact = {
    id: hash({ project: options.projectId, role: 'aggregate' }),
    identity: { projectId: options.projectId, entryId: options.projectId, role: 'aggregate' },
    revision: '',
    fingerprint: {
      schemaVersion: GENERATOR_SCHEMA_VERSION,
      compilerVersion: options.compilerVersion,
      toolchainDigest: options.toolchainDigest,
      configurationDigest: configuration.digest,
      inputDigest: hash(artifacts.map((item) => item.revision)),
      keywordDigest: keywordPlan.keywordSetDigest,
    },
    dependencies: uniqueDependencies(plan.programDependencies),
    content: [],
    exportedKeywords: [],
    usedKeywords: [],
    searchRecords: [],
    routes: [],
    apiList: [],
    outputs: site.outputs,
    diagnostics: [],
  };
  aggregateArtifact.revision = hash(aggregateArtifact);
  artifacts.push(aggregateArtifact);
  if (request.previous?.projectId === options.projectId) {
    for (const artifact of artifacts) {
      for (const output of artifact.outputs) {
        if (
          plan.previousById
            .get(artifact.id)
            ?.outputs.some(
              (previousOutput) =>
                previousOutput.path === output.path && previousOutput.role === output.role,
            ) &&
          !existsSync(path.resolve(configuration.outputRoot, output.path))
        ) {
          records.reason({
            ownerId: artifact.id,
            reason: 'output-missing',
            detail: output.path,
          });
        }
      }
    }
  }
  const candidate = snapshotOf(options.projectId, plan.found, artifacts);
  records.global('validate', { diagnostics: validateSemanticScopes(artifacts), dependencies: [] });
  return candidate;
}

/**
 * The snapshot of a generation's artifacts (the aggregate last) and its discovery: what a
 * generation publishes, and what the fast start restores from the cache (`./fast-start`).
 */
export function snapshotOf(
  projectId: string,
  found: DiscoverySnapshot,
  artifacts: PageArtifact[],
): ArtifactSnapshot {
  const configuration = found.configuration;
  const publishedConfiguration = {
    outputRoot: configuration.outputRoot,
    cacheRoot: configuration.cacheRoot,
    assetDirectory: configuration.assetDirectory,
    themes: configuration.themes,
    digest: configuration.digest,
  };
  return {
    configuration: publishedConfiguration,
    projectId,
    revision: hash({
      configuration: publishedConfiguration,
      artifacts: artifacts.map((item) => item.revision),
    }),
    artifacts,
    globalKeywords: found.globalKeywords,
    remoteKeywords: found.remoteKeywords,
  };
}

/**
 * Writes the artifact cache (skipping entries the memo proves current) and its index. `unchanged`:
 * the targeted path's unchanged artifacts, whose cache facts the memo already carries.
 */
export async function writeCache(
  plan: GenerationPlan,
  artifacts: PageArtifact[],
  unchanged?: (artifact: PageArtifact) => boolean,
): Promise<void> {
  const { options, configuration, cache, memo, signal } = plan;
  if (!configuration.cacheEnabled) return;
  for (const artifact of artifacts) {
    signal.throwIfAborted();
    if (
      memo.enabled &&
      unchanged?.(artifact) &&
      memo.cacheEntry(artifact.id)?.revision === artifact.revision
    )
      continue;
    if (!memo.enabled) {
      await cache.write(artifact);
      continue;
    }
    // An entry file that is still the one written for this revision holds these bytes
    // (a racy stamp is confirmed by comparing them).
    const recorded = memo.cacheEntry(artifact.id);
    const kept =
      recorded?.revision === artifact.revision
        ? await cache.confirm(artifact, recorded.stamp)
        : undefined;
    const stamp = kept ?? (await cache.writeStamped(artifact));
    if (stamp) memo.recordCache(artifact.id, { revision: artifact.revision, stamp });
  }
  signal.throwIfAborted();
  await saveIndex(configuration.cacheRoot, options.projectId, artifacts);
  await memo.save(options.projectId);
  const store = closureStorePath(options, plan.request, configuration, plan.scopedSemantic);
  if (store)
    await saveClosureStore(
      store,
      { ...options, configurationDigest: configuration.digest },
      artifacts,
      (digest) => plan.semantic.closureRecord(digest),
    );
}

function categoryRoute(
  entry: Extract<EntryDescriptor, { kind: 'category' }>,
  metadata?: RouteRecord['metadata'],
): RouteRecord {
  return {
    id: entry.id,
    path: entry.route,
    title: entry.title,
    ...(entry.parentId ? { parentId: entry.parentId } : {}),
    ...(entry.order !== undefined ? { order: entry.order } : {}),
    ...(entry.hidden !== undefined ? { hidden: entry.hidden } : {}),
    ...(metadata ? { metadata } : {}),
    category: {
      runtimeImport: entry.runtimeImport,
      ...(entry.expandable !== undefined ? { expandable: entry.expandable } : {}),
      ...(entry.expanded !== undefined ? { expanded: entry.expanded } : {}),
    },
  };
}

/**
 * The first search record of an API page that belongs to no section (the start of its
 * description) carries the declaration's kind, signature and description, which the search
 * palette previews; the palette prefers that record among a page's hits. One record per page keeps
 * the index small. The summary is part of the declaration descriptor, so it changes the unit's
 * input digest like the page.
 * @param records - The search records of a page.
 * @param declaration - The declaration the page documents, if it is an API page.
 */
function withApiSummary(
  records: SearchRecord[],
  declaration: DeclarationDescriptor | undefined,
): SearchRecord[] {
  if (!declaration) return records;
  const summary = {
    kind: apiListType(declaration),
    ...(declaration.signature ? { signature: declaration.signature } : {}),
    ...(declaration.description ? { description: declaration.description } : {}),
  };
  const primary = records.findIndex((record) => record.pageType === 'api' && !record.section);
  return records.map((record, index) => (index === primary ? { ...record, ...summary } : record));
}

/** Sound JSON equality: equal serialisations are equal JSON values (a false result may be a key-order difference). */
function sameJson(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function sameKeys(left: object, right: object): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return sameStrings(leftKeys, rightKeys);
}

function sameArray<T>(
  left: T[],
  right: T[],
  same: (left: T, right: T) => boolean = sameJson,
): boolean {
  return (
    left === right ||
    (left.length === right.length && left.every((value, index) => same(value, right[index])))
  );
}

function sameLinked(left: LinkedContent, right: LinkedContent): boolean {
  return (
    left === right ||
    (left.html === right.html &&
      left.keywordDigest === right.keywordDigest &&
      sameKeys(left, right) &&
      sameArray(left.searchRecords, right.searchRecords) &&
      (left.ir === right.ir || (left.ir.html === right.ir.html && sameJson(left.ir, right.ir))))
  );
}

function sameContentList(left: LinkedContent[], right: LinkedContent[]): boolean {
  return sameArray(left, right, sameLinked);
}

/** Whether two artifacts are equal apart from `revision`, so their revisions are equal. */
function sameArtifactBody(next: PageArtifact, previous: PageArtifact): boolean {
  if (
    !sameJson(next.fingerprint, previous.fingerprint) ||
    next.id !== previous.id ||
    !sameJson(next.identity, previous.identity)
  )
    return false;
  const keys = Object.keys(next)
    .filter((key) => key !== 'revision')
    .sort();
  if (
    !sameStrings(
      keys,
      Object.keys(previous)
        .filter((key) => key !== 'revision')
        .sort(),
    )
  )
    return false;
  const left = next as unknown as Record<string, unknown>;
  const right = previous as unknown as Record<string, unknown>;
  return keys.every((key) =>
    key === 'content'
      ? sameContentList(next.content, previous.content)
      : Array.isArray(left[key]) && Array.isArray(right[key])
        ? sameArray(left[key] as unknown[], right[key] as unknown[])
        : sameJson(left[key], right[key]),
  );
}
