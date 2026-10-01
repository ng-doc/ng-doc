import fg from 'fast-glob';
import { minimatch } from 'minimatch';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Dependency,
  Diagnostic,
  FileChange,
  KeywordExport,
  PageArtifact,
  RebuildReason,
  SemanticClosureDependency,
} from '../contracts';
import {
  bytesDigest,
  canonicalJson,
  compareCodeUnits,
  dependencyIdentity,
  digestOf,
} from '../kernel/canonical';
import { CONFLICTING_CONTENT_DIGEST } from '../kernel/observations';

export { CONFLICTING_CONTENT_DIGEST };

export interface DependencyIndex {
  affected(changes: FileChange[]): RebuildReason[];
  affectedKeywords(changedKeys: Iterable<string>): RebuildReason[];
}

export interface DependencyIndexOptions {
  /**
   * Reports reasons only for these owner IDs. The semantic closure of every artifact is still
   * validated, and each answer equals the unrestricted index's answer filtered to these owners;
   * physical edges are indexed only for the selected owners.
   */
  owners?: Iterable<string>;
}

export interface RefreshedDependencies {
  dependencies: Dependency[];
  digest: string;
  diagnostics: Diagnostic[];
}

export interface DependencyRefresher {
  refresh(dependencies: Dependency[], keywords: KeywordExport[]): Promise<RefreshedDependencies>;
}

export interface DependencyRefresherOptions {
  /** Reports a real filesystem observation. Intended for performance instrumentation. */
  onObserve?: (
    kind: Extract<Dependency['kind'], 'content' | 'existence' | 'glob'>,
    identity: string,
  ) => void;
  /**
   * The refresh source of `evaluated` dependencies: each entry's digest in the generation's fresh
   * discovery snapshot (`evaluatedDigests`). An entry it does not name refreshes as changed.
   * Without it, every `evaluated` dependency refreshes as changed.
   */
  evaluated?: ReadonlyMap<string, string>;
  /**
   * The refresh source of `semantic-closure` dependencies: the digest recomputed over the current
   * program, or undefined when it cannot be, which refreshes as changed. Without it, every
   * `semantic-closure` dependency refreshes as changed.
   */
  semanticClosure?: (dependency: SemanticClosureDependency) => string | undefined;
  /**
   * The refresh source of `semantic-reference` dependencies where a unit's own semantic closures
   * stand in for the global reference, so that no descriptor carries it: the current digest of the
   * referenced scope. Without it, a reference refreshes as itself (its owner's descriptor carries
   * the current reference).
   */
  semanticReference?: (dependency: SemanticReference) => string | undefined;
}

interface DependencyObservation {
  dependency: Dependency;
  diagnostics: Diagnostic[];
}

interface Owner {
  id: string;
  artifact: PageArtifact;
  dependencies: Dependency[];
  exports: string[];
  uses: string[];
}

interface Edge {
  owner: Owner;
  dependency: Dependency;
}

type SemanticDefinition = Extract<Dependency, { kind: 'semantic' }>;
type SemanticReference = Extract<Dependency, { kind: 'semantic-reference' }>;
type PhysicalDependency = Extract<Dependency, { kind: 'content' | 'existence' | 'glob' }>;

interface SemanticScope {
  key: string;
  projectId: string;
  scopeId: string;
  definition: SemanticDefinition;
  aggregate: PageArtifact;
  consumers: Array<{ artifact: PageArtifact; references: SemanticReference[] }>;
}

interface ScopeEdge {
  scope: SemanticScope;
  dependency: PhysicalDependency | SemanticDefinition;
}

interface SemanticAnalysis {
  diagnostics: Diagnostic[];
  scopes: SemanticScope[];
}

type FileReason = Extract<RebuildReason['reason'], 'input' | 'existence' | 'semantic'>;

/** Validates the compact semantic definition/reference closure of a complete candidate. */
export function validateSemanticScopes(artifacts: PageArtifact[]): Diagnostic[] {
  return analyzeSemanticScopes(artifacts).diagnostics;
}

function analyzeSemanticScopes(artifacts: PageArtifact[]): SemanticAnalysis {
  const definitions = new Map<
    string,
    Array<{ artifact: PageArtifact; dependency: SemanticDefinition }>
  >();
  const definitionsByAggregate = new Map<PageArtifact, SemanticDefinition[]>();
  const references = new Map<
    string,
    Array<{ artifact: PageArtifact; dependency: SemanticReference }>
  >();

  for (const artifact of artifacts) {
    if (artifact.identity.role === 'aggregate') {
      const ownedDefinitions = artifact.dependencies
        .filter((dependency): dependency is SemanticDefinition => dependency.kind === 'semantic')
        .map((dependency) => normalizeDependency(dependency) as SemanticDefinition);
      definitionsByAggregate.set(artifact, ownedDefinitions);
      for (const dependency of ownedDefinitions) {
        addMapValue(
          definitions,
          semanticScopeKey(artifact.identity.projectId, dependency.scopeId),
          { artifact, dependency },
        );
      }
    }

    for (const dependency of semanticReferences(artifact)) {
      addMapValue(references, semanticScopeKey(artifact.identity.projectId, dependency.scopeId), {
        artifact,
        dependency: normalizeDependency(dependency) as SemanticReference,
      });
    }
  }

  const diagnostics: Diagnostic[] = [];
  const invalidAggregates = new Set<PageArtifact>();
  for (const [aggregate, ownedDefinitions] of definitionsByAggregate) {
    const referencedScopes = new Set(
      ownedDefinitions
        .map((dependency) => semanticScopeKey(aggregate.identity.projectId, dependency.scopeId))
        .filter((key) => references.has(key)),
    );
    const distinctScopes = uniqueSorted(ownedDefinitions.map((dependency) => dependency.scopeId));
    if (referencedScopes.size && distinctScopes.length > 1) {
      invalidAggregates.add(aggregate);
      diagnostics.push(
        semanticDiagnostic(
          'GRAPH_SEMANTIC_SCOPE_MULTIPLE_SCOPES',
          `Aggregate ${aggregate.id} defines multiple referenced semantic provenance scopes: ${distinctScopes.join(', ')}.`,
          aggregate.id,
        ),
      );
    }
  }

  const scopes: SemanticScope[] = [];
  for (const key of [...references.keys()].sort()) {
    const occurrences = uniqueReferenceOccurrences(references.get(key) ?? []);
    const candidates = definitions.get(key) ?? [];
    const [{ dependency: firstReference }] = occurrences;
    const projectId = occurrences[0]?.artifact.identity.projectId ?? '';
    const scopeId = firstReference?.scopeId ?? '';

    if (!candidates.length) {
      for (const occurrence of occurrences) {
        diagnostics.push(
          semanticDiagnostic(
            'GRAPH_SEMANTIC_SCOPE_MISSING',
            `Semantic reference ${occurrence.dependency.scopeId} in ${occurrence.artifact.id} has no aggregate definition for project ${projectId}.`,
            occurrence.artifact.id,
          ),
        );
      }
      continue;
    }

    if (candidates.length > 1) {
      const distinctDefinitions = new Set(
        candidates.map(({ dependency }) => canonicalJson(dependency)),
      );
      const code =
        distinctDefinitions.size === 1
          ? 'GRAPH_SEMANTIC_SCOPE_AMBIGUOUS'
          : 'GRAPH_SEMANTIC_SCOPE_CONFLICT';
      const owners = uniqueSorted(candidates.map(({ artifact }) => artifact.id));
      diagnostics.push(
        semanticDiagnostic(
          code,
          `Semantic scope ${scopeId} in project ${projectId} has ${
            code.endsWith('AMBIGUOUS') ? 'multiple aggregate owners' : 'conflicting definitions'
          }: ${owners.join(', ')}.`,
          occurrences[0]?.artifact.id,
        ),
      );
      continue;
    }

    const [{ artifact: aggregate, dependency: definition }] = candidates;
    let stale = false;
    for (const occurrence of occurrences) {
      if (occurrence.dependency.digest === definition.digest) continue;
      stale = true;
      diagnostics.push(
        semanticDiagnostic(
          'GRAPH_SEMANTIC_SCOPE_STALE',
          `Semantic reference ${scopeId} in ${occurrence.artifact.id} has digest ${occurrence.dependency.digest}; aggregate ${aggregate.id} defines ${definition.digest}.`,
          occurrence.artifact.id,
        ),
      );
    }
    if (stale || invalidAggregates.has(aggregate)) continue;

    const referencesByArtifact = new Map<PageArtifact, SemanticReference[]>();
    for (const occurrence of occurrences) {
      addMapValue(referencesByArtifact, occurrence.artifact, occurrence.dependency);
    }
    scopes.push({
      key,
      projectId,
      scopeId,
      definition,
      aggregate,
      consumers: [...referencesByArtifact]
        .map(([artifact, values]) => ({
          artifact,
          references: uniqueCanonical(values),
        }))
        .sort((left, right) => compareCodeUnits(left.artifact.id, right.artifact.id)),
    });
  }

  return {
    diagnostics: diagnostics.sort(compareDiagnostics),
    scopes: scopes.sort((left, right) => compareCodeUnits(left.key, right.key)),
  };
}

function semanticReferences(artifact: PageArtifact): SemanticReference[] {
  return [
    ...artifact.dependencies,
    ...artifact.content.flatMap((content) => content.ir.dependencies),
  ].filter(
    (dependency): dependency is SemanticReference => dependency.kind === 'semantic-reference',
  );
}

function uniqueReferenceOccurrences(
  values: Array<{ artifact: PageArtifact; dependency: SemanticReference }>,
): Array<{ artifact: PageArtifact; dependency: SemanticReference }> {
  const unique = new Map<string, { artifact: PageArtifact; dependency: SemanticReference }>();
  for (const value of values) {
    const key = `${value.artifact.id}\0${canonicalJson(value.dependency)}`;
    if (!unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()].sort((left, right) =>
    compareCodeUnits(
      `${left.artifact.id}\0${canonicalJson(left.dependency)}`,
      `${right.artifact.id}\0${canonicalJson(right.dependency)}`,
    ),
  );
}

function uniqueCanonical<T>(values: T[]): T[] {
  const unique = new Map(values.map((value) => [canonicalJson(value), value] as const));
  return [...unique.values()].sort(compareCanonical);
}

function semanticScopeKey(projectId: string, scopeId: string): string {
  return `${projectId}\0${scopeId}`;
}

function semanticDiagnostic(code: string, message: string, ownerId?: string): Diagnostic {
  return {
    code,
    severity: 'error',
    stage: 'aggregate',
    message,
    ...(ownerId === undefined ? {} : { ownerId }),
  };
}

/**
 * Creates an immutable reverse index for one complete artifact candidate.
 *
 * With `options.owners`, only those owners' physical edges are indexed (and semantic scopes
 * without a selected consumer are skipped); every answer equals the unrestricted answer
 * filtered to the selected owners.
 */
export function createDependencyIndex(
  artifacts: PageArtifact[],
  options: DependencyIndexOptions = {},
): DependencyIndex {
  const semantic = analyzeSemanticScopes(artifacts);
  if (semantic.diagnostics.length) {
    throw new TypeError(
      `Invalid semantic dependency closure: ${semantic.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join('; ')}`,
    );
  }
  const selected = options.owners === undefined ? undefined : new Set(options.owners);
  const reported = (ownerId: string): boolean => !selected || selected.has(ownerId);
  const aliases = createPathAliases();
  const owners = artifacts
    .map<Owner>((artifact) => ({
      id: artifact.id,
      artifact,
      // Keyword closure spans every owner; physical edges are only needed for reported owners.
      dependencies: reported(artifact.id)
        ? collapseDependencies([
            ...artifact.dependencies,
            ...(artifact.contentDescriptors?.flatMap((descriptor) => descriptor.dependencies) ??
              []),
          ])
        : [],
      exports: uniqueSorted(artifact.exportedKeywords.map((keyword) => keyword.key)),
      uses: uniqueSorted([
        ...artifact.usedKeywords,
        ...artifact.dependencies.flatMap((dependency) =>
          dependency.kind === 'keyword' ? [dependency.key] : [],
        ),
      ]),
    }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  const files = new Map<string, Edge[]>();
  const globs: Edge[] = [];
  const scopeFiles = new Map<string, ScopeEdge[]>();
  const scopeGlobs: ScopeEdge[] = [];
  const keywordConsumers = new Map<string, Owner[]>();
  const scopesByAggregate = new Map(
    semantic.scopes.map((scope) => [scope.aggregate, scope] as const),
  );
  const addFileEdge = (file: string, edge: Edge): void =>
    aliases(file).forEach((alias) => addMapValue(files, alias, edge));
  const addScopeFileEdge = (file: string, edge: ScopeEdge): void =>
    aliases(file).forEach((alias) => addMapValue(scopeFiles, alias, edge));
  const reportedScopes = semantic.scopes.filter((scope) =>
    scope.consumers.some((consumer) => reported(consumer.artifact.id)),
  );

  for (const owner of owners) {
    const ownedScope = scopesByAggregate.get(owner.artifact);
    for (const dependency of owner.dependencies) {
      if (
        ownedScope &&
        (dependency.kind === 'content' ||
          dependency.kind === 'existence' ||
          dependency.kind === 'glob' ||
          dependency.kind === 'semantic')
      ) {
        continue;
      }
      const edge = { owner, dependency };
      if (dependency.kind === 'glob') {
        globs.push(edge);
      } else if (dependency.kind === 'semantic') {
        dependency.files.forEach((file) => addFileEdge(file, edge));
      } else if ('path' in dependency) {
        addFileEdge(dependency.path, edge);
      }
    }
    owner.uses.forEach((key) => addMapValue(keywordConsumers, key, owner));
  }

  for (const scope of reportedScopes) {
    const physicalPaths = new Set<string>();
    for (const dependency of scope.aggregate.dependencies) {
      if (dependency.kind === 'content' || dependency.kind === 'existence') {
        aliases(dependency.path).forEach((file) => physicalPaths.add(file));
        addScopeFileEdge(dependency.path, { scope, dependency });
      } else if (dependency.kind === 'glob') {
        scopeGlobs.push({ scope, dependency });
      }
    }
    for (const file of scope.definition.files) {
      if (aliases(file).some((alias) => physicalPaths.has(alias))) continue;
      addScopeFileEdge(file, { scope, dependency: scope.definition });
    }
  }

  return {
    affected(changes: FileChange[]) {
      const reasons = new ReasonCollector();
      const triggeredScopes = new Map<string, Set<string>>();
      const changedPaths = uniqueSorted(changes.map((change) => normalizePath(change.path)));
      for (const changedPath of changedPaths) {
        const edges = uniqueEdges(aliases(changedPath).flatMap((alias) => files.get(alias) ?? []));
        for (const edge of edges) {
          const dependency = edge.dependency;
          if (dependency.kind === 'content') {
            if (contentChanged(dependency)) reasons.add(edge.owner.id, 'input', dependency.path);
          } else if (dependency.kind === 'existence') {
            if (existsSync(dependency.path) !== dependency.exists) {
              reasons.add(edge.owner.id, 'existence', dependency.path);
            }
          } else if (dependency.kind === 'semantic') {
            reasons.add(edge.owner.id, 'semantic', `${dependency.reason}: ${changedPath}`);
          }
        }
        const semanticEdges = uniqueScopeEdges(
          aliases(changedPath).flatMap((alias) => scopeFiles.get(alias) ?? []),
        );
        for (const edge of semanticEdges) {
          const dependency = edge.dependency;
          if (
            dependency.kind === 'semantic' ||
            (dependency.kind === 'content' && contentChanged(dependency)) ||
            (dependency.kind === 'existence' && existsSync(dependency.path) !== dependency.exists)
          ) {
            addMapSetValue(triggeredScopes, edge.scope.key, changedPath);
          }
        }
        for (const edge of globs) {
          const dependency = edge.dependency as Extract<Dependency, { kind: 'glob' }>;
          if (globMembershipChanged(dependency, changedPath)) {
            reasons.add(edge.owner.id, 'membership', changedPath);
          }
        }
        for (const edge of scopeGlobs) {
          const dependency = edge.dependency as Extract<Dependency, { kind: 'glob' }>;
          if (globMembershipChanged(dependency, changedPath)) {
            addMapSetValue(triggeredScopes, edge.scope.key, changedPath);
          }
        }
      }
      for (const scope of reportedScopes) {
        const changed = triggeredScopes.get(scope.key);
        if (!changed) continue;
        for (const consumer of scope.consumers) {
          if (!reported(consumer.artifact.id)) continue;
          for (const reference of consumer.references) {
            for (const changedPath of changed) {
              reasons.add(consumer.artifact.id, 'semantic', `${reference.reason}: ${changedPath}`);
            }
          }
        }
      }
      return reasons.values();
    },

    affectedKeywords(changedKeys: Iterable<string>) {
      const reasons = new ReasonCollector();
      const pending = uniqueSorted([...changedKeys]);
      const visitedKeys = new Set<string>();
      const visitedOwners = new Set<string>();
      while (pending.length) {
        const key = pending.shift() as string;
        if (visitedKeys.has(key)) continue;
        visitedKeys.add(key);
        for (const owner of keywordConsumers.get(key) ?? []) {
          if (reported(owner.id)) reasons.add(owner.id, 'keyword', key);
          if (visitedOwners.has(owner.id)) continue;
          visitedOwners.add(owner.id);
          for (const exported of owner.exports) {
            if (!visitedKeys.has(exported)) pending.push(exported);
          }
          pending.sort();
        }
      }
      return reasons.values();
    },
  };
}

/**
 * The refreshed digest of a non-physical dependency while nothing can recompute it. It is not a
 * sha256 hex digest, so it never equals a recorded one.
 */
export const UNREFRESHED_DIGEST = 'unrefreshed';

/**
 * Creates one dependency refresher for a compile generation.
 *
 * Its physical observations are promises so concurrent and subsequent units see
 * one consistent filesystem snapshot. Semantic digests and keyword bindings stay
 * call-local because their producers can change within the same generation.
 */
export function createDependencyRefresher(
  options: DependencyRefresherOptions = {},
): DependencyRefresher {
  const physicalObservations = new Map<string, Promise<DependencyObservation>>();
  const keywordSets = new Map<string, ReadonlyMap<string, string>>();

  return {
    async refresh(dependencies: Dependency[], keywords: KeywordExport[]) {
      const normalized = collapseDependencies(dependencies);
      const keywordDigests = digestKeywordBindings(keywords, keywordSets);
      const observations = await Promise.all(
        normalized.map((dependency) => {
          if (dependency.kind === 'semantic-reference' && options.semanticReference) {
            return Promise.resolve({
              dependency: {
                ...dependency,
                digest: options.semanticReference(dependency) ?? UNREFRESHED_DIGEST,
              },
              diagnostics: [],
            });
          }
          if (dependency.kind === 'semantic' || dependency.kind === 'semantic-reference') {
            return Promise.resolve({ dependency, diagnostics: [] });
          }
          if (dependency.kind === 'evaluated' && options.evaluated) {
            return Promise.resolve({
              dependency: {
                ...dependency,
                digest: options.evaluated.get(dependency.entryId) ?? UNREFRESHED_DIGEST,
              },
              diagnostics: [],
            });
          }
          if (dependency.kind === 'semantic-closure' && options.semanticClosure) {
            return Promise.resolve({
              dependency: {
                ...dependency,
                digest: options.semanticClosure(dependency) ?? UNREFRESHED_DIGEST,
              },
              diagnostics: [],
            });
          }
          if (dependency.kind === 'semantic-closure' || dependency.kind === 'evaluated') {
            // No refresh source: report them as changed, so a unit that records one is always
            // recomputed and never reused on trust.
            return Promise.resolve({
              dependency: { ...dependency, digest: UNREFRESHED_DIGEST },
              diagnostics: [],
            });
          }
          if (dependency.kind === 'keyword') {
            return Promise.resolve({
              dependency: {
                ...dependency,
                digest:
                  keywordDigests.get(dependency.key) ??
                  digestOf([{ key: dependency.key, missing: true }]),
              },
              diagnostics: [],
            });
          }

          const identity = dependencyIdentity(dependency);
          let observation = physicalObservations.get(identity);
          if (!observation) {
            options.onObserve?.(dependency.kind, identity);
            observation = observePhysicalDependency(dependency);
            physicalObservations.set(identity, observation);
          }
          return observation;
        }),
      );
      const collapsed = collapseDependencies(
        observations.map((observation) => observation.dependency),
      );
      return {
        dependencies: collapsed,
        digest: digestOf(collapsed),
        diagnostics: observations
          .flatMap((observation) => observation.diagnostics.map(cloneDiagnostic))
          .sort(compareDiagnostics),
      };
    },
  };
}

/** Refreshes against a new filesystem observation set. */
export function refreshDependencies(
  dependencies: Dependency[],
  keywords: KeywordExport[],
): Promise<RefreshedDependencies> {
  return createDependencyRefresher().refresh(dependencies, keywords);
}

/**
 * A file identity as `stat` (following links) reports it. Any rewrite, rename, retarget or chmod
 * changes `ino`, `size`, `mtimeNs` or `ctimeNs`.
 */
export interface ObservationStamp {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

export interface ObservationSweep {
  /** The first observation that no longer holds, or undefined when every observation holds. */
  changed?: { path: string; kind: 'content' | 'existence' };
  /** Content observations checked by stat alone. */
  stamped: number;
  /** Content observations whose bytes were read again (no stamp, a racy stamp or a stat change). */
  rehashed: number;
  /** Existence observations probed. */
  probed: number;
}

/**
 * A file whose mtime or ctime is not at least this far before an observation began may have been
 * written while it was observed: its recorded digest cannot be trusted to describe the bytes the
 * observer used. Coarse (whole-second) timestamps get the wider margin.
 */
const FINE_MARGIN_NS = 50_000_000n;
const COARSE_MARGIN_NS = 2_000_000_000n;
const SECOND_NS = 1_000_000_000n;
const wallClockNs = (): bigint => BigInt(Date.now()) * 1_000_000n;

/** The stat identity of a regular file, or undefined when it is not one (or is gone). */
export function stampOf(file: string): ObservationStamp | undefined {
  try {
    const stat = statSync(file, { bigint: true });
    if (!stat.isFile()) return undefined;
    return {
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtimeNs: stat.mtimeNs,
      ctimeNs: stat.ctimeNs,
    };
  } catch {
    return undefined;
  }
}

export function sameStamp(left: ObservationStamp, right: ObservationStamp): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

/** True when the stamp proves the file was last written well before `sinceNs` (exported for tests). */
export function stampSettledBefore(stamp: ObservationStamp, sinceNs: bigint): boolean {
  const coarse = stamp.mtimeNs % SECOND_NS === 0n && stamp.ctimeNs % SECOND_NS === 0n;
  const limit = sinceNs - (coarse ? COARSE_MARGIN_NS : FINE_MARGIN_NS);
  return stamp.mtimeNs < limit && stamp.ctimeNs < limit;
}

/**
 * Stat-validated physical observations.
 *
 * - `record` runs right after an observation that began at `observedAtNs`. A content observation
 *   whose file was written at or after that time (within a timestamp-granularity margin), whose
 *   file is gone, or whose digest is {@link CONFLICTING_CONTENT_DIGEST} is *unverifiable*: the
 *   observer may have used other bytes than the recorded digest describes (an A→B→A write during
 *   the observation), so every later sweep reports it as changed. Every other one is stamped.
 * - `sweep` re-verifies: a content observation whose file keeps its stamp holds by `stat` alone;
 *   otherwise its bytes are read again and compared with the recorded digest by the caller's
 *   digest function (the one that produced the observation), and the new stamp is trusted only
 *   if the file was settled before the sweep began. Existence observations are always probed.
 *   Glob observations are not swept (see {@link changedObservation}).
 */
export class ObservationStamps {
  private readonly stamps = new Map<string, ObservationStamp>();
  private readonly unverifiable = new Set<string>();

  constructor(private readonly digestOf: (file: string) => string) {}

  record(dependencies: Iterable<Dependency>, observedAtNs: bigint): void {
    for (const dependency of dependencies) {
      if (dependency.kind !== 'content') continue;
      const stamp =
        dependency.digest === CONFLICTING_CONTENT_DIGEST ? undefined : stampOf(dependency.path);
      if (stamp && stampSettledBefore(stamp, observedAtNs)) {
        this.stamps.set(dependency.path, stamp);
        this.unverifiable.delete(dependency.path);
      } else {
        this.stamps.delete(dependency.path);
        this.unverifiable.add(dependency.path);
      }
    }
  }

  /** Re-verifies content and existence observations; stops at the first one that changed. */
  sweep(dependencies: Iterable<Dependency>): ObservationSweep {
    const startedNs = wallClockNs();
    const result: ObservationSweep = { stamped: 0, rehashed: 0, probed: 0 };
    for (const dependency of dependencies) {
      if (dependency.kind === 'existence') {
        result.probed += 1;
        if (existsSync(dependency.path) !== dependency.exists) {
          result.changed = { path: dependency.path, kind: 'existence' };
          return result;
        }
        continue;
      }
      if (dependency.kind !== 'content') continue;
      if (this.unverifiable.has(dependency.path)) {
        result.changed = { path: dependency.path, kind: 'content' };
        return result;
      }
      const current = stampOf(dependency.path);
      const recorded = this.stamps.get(dependency.path);
      if (current && recorded && sameStamp(current, recorded)) {
        result.stamped += 1;
        continue;
      }
      result.rehashed += 1;
      this.stamps.delete(dependency.path);
      let digest: string | undefined;
      try {
        digest = current ? this.digestOf(dependency.path) : undefined;
      } catch {
        digest = undefined;
      }
      if (digest !== dependency.digest) {
        result.changed = { path: dependency.path, kind: 'content' };
        return result;
      }
      // Same bytes as recorded. The new stamp vouches for them only if nothing changed between
      // the two stats around the read and the file had settled before this sweep began.
      const after = stampOf(dependency.path);
      if (current && after && sameStamp(current, after) && stampSettledBefore(after, startedNs)) {
        this.stamps.set(dependency.path, after);
      }
    }
    return result;
  }

  /** Trusted stamps and unverifiable paths (instrumentation and tests). */
  get counts(): { stamped: number; unverifiable: number } {
    return { stamped: this.stamps.size, unverifiable: this.unverifiable.size };
  }
}

/** One observed directory listing (see {@link DirectoryListings}). */
/** A directory's entry names as recorded (`null`: it did not exist), as JSON. */
export interface DirectoryFact {
  path: string;
  entries: string[] | null;
}

/**
 * Whether the directory still lists exactly the recorded entries (read, never stat alone).
 */
export function directoryListed(fact: DirectoryFact): boolean {
  return sameNames(listDirectory({ path: fact.path }), fact.entries);
}

interface DirectoryListing {
  path: string;
  /** Which entries count; `undefined` means every entry. */
  select?: (entry: string, directory: boolean) => boolean;
  /** Selected entry names as observed, sorted; `null` when the directory did not exist. */
  entries: string[] | null;
  stamp?: ObservationStamp;
  unverifiable?: boolean;
}

export interface DirectorySweep {
  changed?: string;
  /** Listings verified by the directory's stat alone. */
  stamped: number;
  /** Listings read again (no trusted stamp, or the directory's stat changed). */
  relisted: number;
}

function directoryStamp(directory: string): ObservationStamp | undefined {
  try {
    const stat = statSync(directory, { bigint: true });
    if (!stat.isDirectory()) return undefined;
    return {
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtimeNs: stat.mtimeNs,
      ctimeNs: stat.ctimeNs,
    };
  } catch {
    return undefined;
  }
}

/** Selected entries of a directory with their kind (a symlink counts as its target), or null. */
function readEntries(
  directory: string,
  select?: (entry: string, directory: boolean) => boolean,
): Array<{ name: string; directory: boolean }> | null {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  const selected: Array<{ name: string; directory: boolean }> = [];
  for (const entry of entries) {
    let isDirectory = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        isDirectory = statSync(path.join(directory, entry.name)).isDirectory();
      } catch {
        isDirectory = false;
      }
    }
    if (!select || select(entry.name, isDirectory))
      selected.push({ name: entry.name, directory: isDirectory });
  }
  return selected.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

function listDirectory(listing: Pick<DirectoryListing, 'path' | 'select'>): string[] | null {
  return readEntries(listing.path, listing.select)?.map((entry) => entry.name) ?? null;
}

const sameNames = (left: string[] | null, right: string[] | null): boolean =>
  left === right ||
  (!!left &&
    !!right &&
    left.length === right.length &&
    left.every((name, index) => name === right[index]));

/**
 * Directory facts a program depended on without reading any file in them: the packages under a type
 * root that automatic type directives enumerate, and the directories that hold (or lead to) the
 * members of an observed glob, where a create that no watcher reported would otherwise stay unseen.
 *
 * A listing is re-verified by the directory's stat while it keeps a stamp recorded when the
 * directory had settled before the observation began; otherwise the directory is read again and
 * its selected entries are compared with the recorded ones (so an atomic save in the directory,
 * which only renames a temporary file, costs one re-read and keeps the program). A strict listing
 * written during the observation is unverifiable, like a content observation.
 */
export class DirectoryListings {
  private readonly listings = new Map<string, DirectoryListing>();

  /**
   * Records a directory's current listing (every entry). `strict`: a directory written during the
   * observation never verifies (the observer may have listed other entries).
   */
  record(directory: string, observedAtNs: bigint, strict: boolean = true): void {
    const normalized = normalizePath(directory);
    const listing: DirectoryListing = {
      path: normalized,
      entries: listDirectory({ path: normalized }),
    };
    this.stamp(listing, observedAtNs, strict);
    this.listings.set(`all:${normalized}`, listing);
  }

  /**
   * Records, for an observed glob, its root and every directory on the way from the root to a
   * member: the member files the glob matched in that directory plus its subdirectories. A
   * directory whose matching files differ from the glob's members already (the tree changed while
   * it was observed) is unverifiable.
   */
  recordGlob(
    dependency: Extract<Dependency, { kind: 'glob' }>,
    observedAtNs: bigint,
    ignore: (path: string) => boolean = () => false,
  ): void {
    const glob = normalizeDependency(dependency) as Extract<Dependency, { kind: 'glob' }>;
    const directories = new Map<string, Set<string>>([[glob.root, new Set()]]);
    for (const member of glob.members) {
      let directory = path.posix.dirname(member);
      const names = directories.get(directory) ?? new Set<string>();
      names.add(path.posix.basename(member));
      directories.set(directory, names);
      while (directory !== glob.root && directory.startsWith(`${glob.root}/`)) {
        directory = path.posix.dirname(directory);
        if (!directories.has(directory)) directories.set(directory, new Set());
      }
    }
    const identity = dependencyIdentity(glob);
    for (const [directory, members] of directories) {
      // Files: those the glob matches. Subdirectories: those that can hold a match (a create in
      // one that no watcher reported adds it here), never an ignored (generator-owned) one.
      const select = (entry: string, isDirectory: boolean): boolean => {
        const child = `${directory}/${entry}`;
        return isDirectory
          ? !ignore(child) && mayHoldMatches(glob, child)
          : matchesGlob(glob, child);
      };
      const entries = readEntries(directory, select);
      const listing: DirectoryListing = {
        path: directory,
        select,
        entries: entries?.map((entry) => entry.name) ?? null,
      };
      // The selected files must be exactly the members the glob observed in this directory;
      // otherwise the tree changed while it was observed (or the matchers disagree).
      const files = (entries ?? []).filter((entry) => !entry.directory).map((entry) => entry.name);
      if (!sameNames(files, [...members].sort())) listing.unverifiable = true;
      this.stamp(listing, observedAtNs, false);
      this.listings.set(`${identity}:${directory}`, listing);
    }
  }

  /**
   * A new set with this one's whole-directory listings ({@link record}) and none of its glob
   * listings: a program whose root membership is observed again records its globs anew. The
   * listings are shared, so a sweep of either set re-stamps them for both.
   */
  withoutGlobs(): DirectoryListings {
    const result = new DirectoryListings();
    for (const [key, listing] of this.listings)
      if (key.startsWith('all:')) result.listings.set(key, listing);
    return result;
  }

  /**
   * The whole-directory listings ({@link record}) as JSON facts, sorted by path, for a check in
   * another process ({@link directoryListed}); the glob listings are left out, since such a check
   * observes each glob again in full. Undefined when any listing cannot vouch for its directory
   * (the tree changed while it was observed).
   */
  directories(): DirectoryFact[] | undefined {
    const facts: DirectoryFact[] = [];
    for (const [key, listing] of this.listings) {
      if (listing.unverifiable) return undefined;
      if (key.startsWith('all:'))
        facts.push({ path: listing.path, entries: listing.entries && [...listing.entries] });
    }
    return facts.sort((left, right) => compareCodeUnits(left.path, right.path));
  }

  sweep(): DirectorySweep {
    const startedNs = wallClockNs();
    const result: DirectorySweep = { stamped: 0, relisted: 0 };
    for (const listing of this.listings.values()) {
      if (listing.unverifiable) {
        result.changed = listing.path;
        return result;
      }
      const current = directoryStamp(listing.path);
      if (current && listing.stamp && sameStamp(current, listing.stamp)) {
        result.stamped += 1;
        continue;
      }
      result.relisted += 1;
      listing.stamp = undefined;
      if (!sameNames(listDirectory(listing), listing.entries)) {
        result.changed = listing.path;
        return result;
      }
      const after = directoryStamp(listing.path);
      if (current && after && sameStamp(current, after) && stampSettledBefore(after, startedNs)) {
        listing.stamp = after;
      }
    }
    return result;
  }

  get size(): number {
    return this.listings.size;
  }

  private stamp(listing: DirectoryListing, observedAtNs: bigint, strict: boolean): void {
    const stamp = directoryStamp(listing.path);
    if (stamp && stampSettledBefore(stamp, observedAtNs)) listing.stamp = stamp;
    else if (stamp && strict) listing.unverifiable = true;
  }
}

/** Wall clock in nanoseconds, the time base of {@link ObservationStamps.record}. */
export function observationClockNs(): bigint {
  return wallClockNs();
}

/**
 * Returns why a watcher change set may invalidate these observations, or undefined when it
 * provably cannot, judged by paths alone:
 * - a changed path (or its real path) is an observed content or existence path;
 * - a change alters the membership of an observed glob (a matching file appeared or a member
 *   disappeared);
 * - a delete of a directory that held glob members;
 * - a create of a directory under a glob root (its files may not have been reported).
 * A create of a path that no longer exists (a temporary file of an atomic save) or of a
 * non-matching file, and a delete of a path that held no member, cannot change membership.
 *
 * Paths are compared under every alias (as reported, and resolved through symlinks, for example
 * `/var` and `/private/var`), for globs on both sides. Content and existence observations are
 * re-verified by {@link ObservationStamps} and directory listings by {@link DirectoryListings}
 * regardless; this check makes an event-reported change rebuild at once.
 */
export function changedObservation(
  dependencies: Dependency[],
  changes: FileChange[],
): string | undefined {
  if (!changes.length) return undefined;
  const paths = new Set<string>();
  const globs: Array<{
    glob: Extract<Dependency, { kind: 'glob' }>;
    roots: string[];
    members: Set<string>;
  }> = [];
  for (const dependency of dependencies) {
    if (dependency.kind === 'content' || dependency.kind === 'existence') {
      paths.add(normalizePath(dependency.path));
    } else if (dependency.kind === 'glob') {
      const glob = normalizeDependency(dependency) as Extract<Dependency, { kind: 'glob' }>;
      globs.push({ glob, roots: physicalAliases(glob.root), members: new Set(glob.members) });
    }
  }
  for (const change of changes) {
    const aliases = physicalAliases(normalizePath(change.path));
    const tracked = aliases.find((alias) => paths.has(alias));
    if (tracked) return `${change.kind} of observed input ${tracked}`;
    let kind: 'file' | 'directory' | 'missing' = 'missing';
    try {
      const stat = statSync(aliases[0]!);
      kind = stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'missing';
    } catch {
      kind = 'missing';
    }
    const file = kind === 'file';
    for (const { glob, roots, members } of globs) {
      const member = aliases.some((alias) => members.has(alias));
      const matches = roots.some((root) =>
        aliases.some((alias) => matchesGlob({ ...glob, root }, alias)),
      );
      if ((matches && member !== file) || (!matches && member && !file)) {
        return `${change.kind} of ${aliases[0]} changes membership of glob ${glob.root}`;
      }
      if (change.kind === 'delete') {
        const held = aliases.some((alias) =>
          glob.members.some((item) => item.startsWith(`${alias}/`)),
        );
        if (held) return `delete of ${aliases[0]} removes members of glob ${glob.root}`;
        continue;
      }
      if (change.kind !== 'create' || kind !== 'directory') continue;
      const inside = roots.some((root) =>
        aliases.some((alias) => {
          const relative = path.posix.relative(root, alias);
          return (
            relative !== '..' && !relative.startsWith('../') && !path.posix.isAbsolute(relative)
          );
        }),
      );
      if (inside) return `create of directory ${aliases[0]} under glob ${glob.root}`;
    }
  }
  return undefined;
}

/**
 * A path as given and resolved through symlinks. A path that no longer exists (a delete) is
 * resolved through its nearest existing ancestor.
 */
function physicalAliases(file: string): string[] {
  const normalized = normalizePath(file);
  const aliases = [normalized];
  let existing = normalized;
  const rest: string[] = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return aliases;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  try {
    const resolved = normalizePath(path.join(realpathSync.native(existing), ...rest));
    if (resolved !== normalized) aliases.push(resolved);
  } catch {
    /* An unreadable ancestor keeps only the reported path. */
  }
  return aliases;
}

async function observePhysicalDependency(
  dependency: PhysicalDependency,
): Promise<DependencyObservation> {
  if (dependency.kind === 'content') {
    try {
      const content = await readFile(dependency.path);
      return {
        dependency: { kind: 'content', path: dependency.path, digest: bytesDigest(content) },
        diagnostics: [],
      };
    } catch (error) {
      return {
        dependency: { kind: 'existence', path: dependency.path, exists: false },
        diagnostics: [
          {
            code: 'GRAPH_CONTENT_READ',
            severity: 'error',
            stage: 'aggregate',
            message: error instanceof Error ? error.message : String(error),
            source: { path: dependency.path },
          },
        ],
      };
    }
  }
  if (dependency.kind === 'existence') {
    return {
      dependency: { ...dependency, exists: existsSync(dependency.path) },
      diagnostics: [],
    };
  }
  if (dependency.kind === 'glob') {
    try {
      const members = await fg(dependency.include, {
        cwd: dependency.root,
        ignore: dependency.exclude,
        absolute: true,
        dot: true,
        onlyFiles: true,
        unique: true,
      });
      return {
        dependency: { ...dependency, members: uniqueSorted(members.map(normalizePath)) },
        diagnostics: [],
      };
    } catch (error) {
      return {
        dependency,
        diagnostics: [
          {
            code: 'GRAPH_GLOB_SCAN',
            severity: 'error',
            stage: 'aggregate',
            message: error instanceof Error ? error.message : String(error),
            source: { path: dependency.root },
          },
        ],
      };
    }
  }
  return { dependency, diagnostics: [] };
}

function collapseDependencies(dependencies: Dependency[]): Dependency[] {
  // Sort once by precomputed canonical keys: the same comparator outcome as
  // `sort(compareCanonical)` without re-serialising both operands on every comparison.
  const values = sortByCanonical(dependencies.map(normalizeDependency));
  const byIdentity = new Map<string, { key: string; value: Dependency }>();
  for (const entry of values) {
    const identity = dependencyIdentity(entry.value);
    if (!byIdentity.has(identity)) byIdentity.set(identity, entry);
  }
  // First occurrences of an already sorted sequence remain sorted.
  return [...byIdentity.values()].map((entry) => entry.value);
}

function sortByCanonical<T>(values: T[]): Array<{ key: string; value: T }> {
  return values
    .map((value) => ({ key: canonicalJson(value), value }))
    .sort((left, right) => compareCodeUnits(left.key, right.key));
}

function normalizeDependency(dependency: Dependency): Dependency {
  if (dependency.kind === 'content') {
    return { ...dependency, path: normalizePath(dependency.path) };
  }
  if (dependency.kind === 'existence') {
    return { ...dependency, path: normalizePath(dependency.path) };
  }
  if (dependency.kind === 'glob') {
    return {
      ...dependency,
      root: normalizePath(dependency.root),
      include: uniqueSorted(dependency.include.map(normalizePattern)),
      exclude: uniqueSorted(dependency.exclude.map(normalizePattern)),
      members: uniqueSorted(dependency.members.map(normalizePath)),
    };
  }
  if (dependency.kind === 'semantic') {
    return { ...dependency, files: uniqueSorted(dependency.files.map(normalizePath)) };
  }
  return { ...dependency };
}

function digestKeywordBindings(
  keywords: KeywordExport[],
  sets: Map<string, ReadonlyMap<string, string>>,
): ReadonlyMap<string, string> {
  const setIdentity = canonicalJson(keywords);
  const cached = sets.get(setIdentity);
  if (cached) return cached;

  const bindings = new Map<string, KeywordExport[]>();
  for (const keyword of keywords) {
    bindings.set(keyword.key, [...(bindings.get(keyword.key) ?? []), normalizeKeyword(keyword)]);
  }
  const digests = new Map(
    [...bindings].map(([key, values]) => [key, digestOf(values.sort(compareCanonical))]),
  );
  sets.set(setIdentity, digests);
  return digests;
}

function normalizeKeyword(keyword: KeywordExport): KeywordExport {
  return {
    key: keyword.key,
    title: keyword.title,
    path: keyword.path,
    ...(keyword.type === undefined ? {} : { type: keyword.type }),
    ...(keyword.languages === undefined ? {} : { languages: uniqueSorted(keyword.languages) }),
    ...(keyword.description === undefined ? {} : { description: keyword.description }),
  };
}

function contentChanged(dependency: Extract<Dependency, { kind: 'content' }>): boolean {
  try {
    return bytesDigest(readFileSync(dependency.path)) !== dependency.digest;
  } catch {
    return true;
  }
}

function globMembershipChanged(
  dependency: Extract<Dependency, { kind: 'glob' }>,
  changedPath: string,
): boolean {
  if (!matchesGlob(dependency, changedPath)) {
    return dependency.members.includes(changedPath) && !existsSync(changedPath);
  }
  const wasMember = dependency.members.includes(changedPath);
  let isMember = false;
  try {
    isMember = statSync(changedPath).isFile();
  } catch {
    isMember = false;
  }
  return wasMember !== isMember;
}

/** Whether a directory under the glob's root can contain a file the glob matches. */
function mayHoldMatches(
  dependency: Extract<Dependency, { kind: 'glob' }>,
  directory: string,
): boolean {
  const relative = path.posix.relative(dependency.root, directory);
  if (relative.startsWith('../') || path.posix.isAbsolute(relative)) return false;
  const candidate = (pattern: string, value: string): string =>
    path.posix.isAbsolute(pattern) || /^[A-Za-z]:\//.test(pattern)
      ? `${directory}${value}`
      : `${relative}${value}`;
  const included = dependency.include.some((pattern) => {
    const normalized = normalizePattern(pattern);
    return minimatch(candidate(normalized, ''), normalized, { dot: true, partial: true });
  });
  // A directory whose every descendant is excluded (for example `**/node_modules/**`).
  const excluded = dependency.exclude.some((pattern) => {
    const normalized = normalizePattern(pattern);
    return minimatch(candidate(normalized, '/\u0000'), normalized, { dot: true });
  });
  return included && !excluded;
}

function matchesGlob(dependency: Extract<Dependency, { kind: 'glob' }>, file: string): boolean {
  const relative = path.posix.relative(dependency.root, file);
  if (relative.startsWith('../') || path.posix.isAbsolute(relative)) return false;
  const included = dependency.include.some((pattern) => matchesPattern(pattern, file, relative));
  const excluded = dependency.exclude.some((pattern) => matchesPattern(pattern, file, relative));
  return included && !excluded;
}

function matchesPattern(pattern: string, file: string, relative: string): boolean {
  const normalized = normalizePattern(pattern);
  const candidate =
    path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized) ? file : relative;
  return minimatch(candidate, normalized, { dot: true });
}

/**
 * One index observes each path's aliases once. A path that `existsSync` cannot reach cannot be
 * resolved by `realpath` either, so it skips the throwing realpath call with the same result.
 */
function createPathAliases(): (file: string) => string[] {
  const cache = new Map<string, string[]>();
  return (file) => {
    const normalized = normalizePath(file);
    let aliases = cache.get(normalized);
    if (!aliases) {
      aliases = existsSync(normalized) ? pathAliases(normalized) : [normalized];
      cache.set(normalized, aliases);
    }
    return aliases;
  };
}

function pathAliases(file: string): string[] {
  const normalized = normalizePath(file);
  try {
    return uniqueSorted([normalized, normalizePath(realpathSync.native(normalized))]);
  } catch {
    return [normalized];
  }
}

function uniqueEdges(edges: Edge[]): Edge[] {
  const values = new Map<string, Edge>();
  for (const edge of edges) {
    const key = `${edge.owner.id}:${dependencyIdentity(edge.dependency)}`;
    if (!values.has(key)) values.set(key, edge);
  }
  return [...values.values()].sort((left, right) =>
    compareCodeUnits(
      `${left.owner.id}:${dependencyIdentity(left.dependency)}`,
      `${right.owner.id}:${dependencyIdentity(right.dependency)}`,
    ),
  );
}

function uniqueScopeEdges(edges: ScopeEdge[]): ScopeEdge[] {
  const values = new Map<string, ScopeEdge>();
  for (const edge of edges) {
    const key = `${edge.scope.key}:${dependencyIdentity(edge.dependency)}`;
    if (!values.has(key)) values.set(key, edge);
  }
  return [...values.values()].sort((left, right) =>
    compareCodeUnits(
      `${left.scope.key}:${dependencyIdentity(left.dependency)}`,
      `${right.scope.key}:${dependencyIdentity(right.dependency)}`,
    ),
  );
}

class ReasonCollector {
  private readonly reasons = new Map<
    string,
    { ownerId: string; reason: RebuildReason['reason']; details: Set<string> }
  >();

  add(ownerId: string, reason: RebuildReason['reason'], detail: string): void {
    const key = `${ownerId}\0${reason}`;
    const current = this.reasons.get(key) ?? { ownerId, reason, details: new Set<string>() };
    current.details.add(detail);
    this.reasons.set(key, current);
  }

  values(): RebuildReason[] {
    return [...this.reasons.values()]
      .map(({ ownerId, reason, details }) => ({
        ownerId,
        reason,
        detail: uniqueSorted([...details]).join(', '),
      }))
      .sort((left, right) =>
        compareCodeUnits(
          `${left.ownerId}\0${left.reason}\0${left.detail}`,
          `${right.ownerId}\0${right.reason}\0${right.detail}`,
        ),
      );
  }
}

function addMapValue<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function addMapSetValue<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const values = map.get(key) ?? new Set<V>();
  values.add(value);
  map.set(key, values);
}

function normalizePath(file: string): string {
  return path.resolve(file).replace(/\\/g, '/');
}

function normalizePattern(pattern: string): string {
  return pattern.replace(/\\/g, '/').replace(/^\.\//, '');
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function compareCanonical(left: unknown, right: unknown): number {
  return compareCodeUnits(canonicalJson(left), canonicalJson(right));
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return compareCodeUnits(canonicalJson(left), canonicalJson(right));
}

function cloneDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return {
    ...diagnostic,
    ...(diagnostic.source ? { source: { ...diagnostic.source } } : {}),
    ...(diagnostic.related
      ? {
          related: diagnostic.related.map((related) => ({
            ...related,
            source: { ...related.source },
          })),
        }
      : {}),
  };
}
