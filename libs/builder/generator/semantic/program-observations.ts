import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type Project, ts } from 'ts-morph';

import type { Dependency } from '../contracts';
import { digestOf } from '../kernel/canonical';
import { readText } from '../kernel/observations';
import { normalize, SemanticFailure, TrackedFiles } from './dependencies';
import type { OwnedRoots } from './owned-roots';
import type { ResolutionProbes, SemanticDefinition } from './program-state';

/**
 * Per-importer program tracking.
 *
 * A synchronization observes the program in two parts:
 * - **global** observations: the tsconfig reads, the entries, the API scope globs, the tsconfig
 *   membership, the formatter configuration probes, and the private probes of the `types`
 *   directives;
 * - **per importer**: for every program file, its own existence and content, and every probe the
 *   resolution of its imports, type references and referenced files made, with what each resolved
 *   to.
 *
 * The published dependency set is their aggregate, built exactly as one flat set would be (the
 * same additions in the same order into one {@link TrackedFiles}). The attribution is an ordered
 * log beside it, so one importer can be re-tracked after a patch and the aggregate re-derived from
 * the log, and the resolved edges give the importers of a file (the reverse graph).
 */

/** Resolution facts reported by a tracking host (see `ProgramWatch`). */
export interface ProbeSink {
  missing(directory: string): void;
  realpath(from: string, to: string): void;
}

/** One reference of a program file and the file it resolved to (normalized), if any. */
export interface ImportResolution {
  readonly kind: 'module' | 'type-reference' | 'reference';
  readonly specifier: string;
  readonly resolved?: string;
}

/** What tracking one program file observed, in observation order. */
export interface ImporterObservations {
  readonly path: string;
  readonly dependencies: readonly Dependency[];
  readonly missing: readonly string[];
  readonly realpaths: ReadonlyArray<readonly [string, string]>;
  readonly imports: readonly ImportResolution[];
}

interface Segment {
  /** The importer, or undefined for global observations. */
  readonly owner?: string;
  dependencies: Dependency[];
  missing: string[];
  realpaths: Array<[string, string]>;
  imports: ImportResolution[];
}

/** What the aggregate `semantic` definition is derived from, besides the observations. */
export interface SemanticConfiguration {
  readonly projectId: string;
  readonly digest: string;
}

/** `ts.sys.realpath` (what module resolution uses), or undefined when the path cannot be resolved. */
export function realpathOf(path: string): string | undefined {
  try {
    return ts.sys.realpath ? ts.sys.realpath(path) : path;
  } catch {
    return undefined;
  }
}

/**
 * A module resolution host that records every file probe and read in `files` and, when given,
 * every directory reported missing and every symlinked path resolved in `probes`. The same
 * owned-root view as the program: owned probes are neither followed nor recorded.
 */
export function trackingHost(
  files: TrackedFiles,
  owned: OwnedRoots,
  probes?: ProbeSink,
): ts.ModuleResolutionHost {
  return owned.resolutionHost({
    ...ts.sys,
    fileExists: (file) => {
      const path = normalize(file);
      const exists = existsSync(path);
      files.add({ kind: 'existence', path, exists });
      return exists;
    },
    readFile: (file) => {
      try {
        return files.read(file);
      } catch {
        return undefined;
      }
    },
    directoryExists: (directory) => {
      const exists = ts.sys.directoryExists(directory);
      if (!exists) probes?.missing(normalize(directory));
      return exists;
    },
    realpath: (path) => {
      const real = realpathOf(path) ?? path;
      const from = normalize(path);
      const to = normalize(real);
      if (probes && from !== to) probes.realpath(from, to);
      return real;
    },
  });
}

/**
 * Tracks one program file: its existence and content, and all failed candidate paths and package
 * manifests of its imports and type references, not only the successfully loaded files. A newly
 * created missing module or a changed exports/types field must invalidate consumers.
 */
export function trackSourceFile(
  source: ts.SourceFile,
  options: ts.CompilerOptions,
  host: ts.ModuleResolutionHost,
  files: TrackedFiles,
  owned: OwnedRoots,
  imports?: ImportResolution[],
): void {
  const path = normalize(source.fileName);
  files.add({ kind: 'existence', path, exists: true });
  files.add({ kind: 'content', path, digest: owned.contentDigest(path, source.text) });
  const references = ts.preProcessFile(source.text);
  for (const item of references.importedFiles) {
    const resolved = ts.resolveModuleName(item.fileName, path, options, host).resolvedModule;
    imports?.push(resolution('module', item.fileName, resolved?.resolvedFileName));
  }
  for (const item of references.typeReferenceDirectives) {
    const resolved = ts.resolveTypeReferenceDirective(
      item.fileName,
      path,
      options,
      host,
    ).resolvedTypeReferenceDirective;
    imports?.push(resolution('type-reference', item.fileName, resolved?.resolvedFileName));
  }
  for (const item of references.referencedFiles) {
    const path = normalize(resolve(dirname(source.fileName), item.fileName));
    if (owned.has(path)) continue;
    const exists = existsSync(path);
    files.add({ kind: 'existence', path, exists });
    imports?.push(resolution('reference', item.fileName, exists ? path : undefined));
  }
}

function resolution(
  kind: ImportResolution['kind'],
  specifier: string,
  resolved: string | undefined,
): ImportResolution {
  return resolved === undefined
    ? { kind, specifier }
    : { kind, specifier, resolved: normalize(resolved) };
}

/**
 * Tracks every non-owned file of the project's program into one flat set (a query that added a
 * source file tracks the re-created program into its own dependencies this way).
 */
export function trackProgram(project: Project, files: TrackedFiles, owned: OwnedRoots): void {
  const options = project.getCompilerOptions();
  const host = trackingHost(files, owned);
  for (const source of project.getProgram().compilerObject.getSourceFiles()) {
    if (owned.has(normalize(source.fileName))) continue;
    trackSourceFile(source, options, host, files, owned);
  }
}

/**
 * The aggregate `semantic` definition: the whole program, its configuration, resolution libraries
 * and source membership, over the observations made so far.
 */
export function semanticDefinition(
  configuration: SemanticConfiguration,
  files: TrackedFiles,
  project: Project,
): SemanticDefinition {
  return {
    kind: 'semantic',
    scopeId: configuration.projectId,
    digest: digestOf([configuration.digest, ts.version, files.all()]),
    files: project
      .getSourceFiles()
      .map((file) => file.getFilePath())
      .sort(),
    reason:
      'Whole TypeScript program, configuration, resolution libraries and source membership conservatively invalidate semantic consumers',
  };
}

/** The digest of a file's bytes, as a global read of it records it. */
function rawDigest(path: string): string {
  try {
    return readText(path).digest;
  } catch (error) {
    throw new SemanticFailure(
      'SEMANTIC_RETRACK',
      `${path} cannot be read again: ${error instanceof Error ? error.message : String(error)}`,
      { path },
    );
  }
}

/** The per-importer and global observations of one program, and their aggregate. */
export class ProgramObservations {
  private readonly segments: Segment[] = [];
  private readonly importerSegments = new Map<string, Segment>();
  private current?: Segment;
  private logging = true;
  private aggregate: TrackedFiles;
  private resolutionProbes: ResolutionProbes = { missing: new Set(), realpaths: new Map() };
  private definition?: { configuration: SemanticConfiguration; semantic: SemanticDefinition };
  private reverse?: Map<string, string[]>;

  constructor() {
    this.aggregate = this.createAggregate();
  }

  /** The published observations: every global and per-importer one, and the definition. */
  get files(): TrackedFiles {
    return this.aggregate;
  }

  /** Every directory reported missing and symlinked path resolved (global and per importer). */
  get probes(): ResolutionProbes {
    return this.resolutionProbes;
  }

  /** The aggregate `semantic` definition, once {@link define} ran. */
  get semantic(): SemanticDefinition | undefined {
    return this.definition?.semantic;
  }

  /** Reports resolution facts to the aggregate and to the current owner. */
  readonly probeSink: ProbeSink = {
    missing: (directory) => {
      this.resolutionProbes.missing.add(directory);
      this.segment().missing.push(directory);
    },
    realpath: (from, to) => {
      this.resolutionProbes.realpaths.set(from, to);
      this.segment().realpaths.push([from, to]);
    },
  };

  /** Tracks every non-owned program file, each attributed to itself as importer. */
  track(project: Project, owned: OwnedRoots): void {
    const options = project.getCompilerOptions();
    const host = trackingHost(this.aggregate, owned, this.probeSink);
    for (const source of project.getProgram().compilerObject.getSourceFiles()) {
      const path = normalize(source.fileName);
      if (owned.has(path)) continue;
      const segment = this.open(path);
      try {
        trackSourceFile(source, options, host, this.aggregate, owned, segment.imports);
      } finally {
        this.current = undefined;
      }
    }
  }

  /** Derives the aggregate `semantic` definition from the observations and publishes it. */
  define(configuration: SemanticConfiguration, project: Project): SemanticDefinition {
    const semantic = semanticDefinition(configuration, this.aggregate, project);
    this.definition = {
      configuration: { projectId: configuration.projectId, digest: configuration.digest },
      semantic,
    };
    this.aggregate.add(semantic);
    return semantic;
  }

  /** The observations not attributed to a program file, in observation order. */
  global(): Dependency[] {
    return this.segments
      .filter((segment) => segment.owner === undefined)
      .flatMap((segment) => segment.dependencies);
  }

  /** The tracked program files, in program order. */
  importers(): string[] {
    return [...this.importerSegments.keys()];
  }

  /** What tracking one program file observed, or undefined when it is not a tracked importer. */
  importer(path: string): ImporterObservations | undefined {
    const segment = this.importerSegments.get(normalize(path));
    return segment
      ? {
          path: segment.owner!,
          dependencies: segment.dependencies,
          missing: segment.missing,
          realpaths: segment.realpaths,
          imports: segment.imports,
        }
      : undefined;
  }

  /** The tracked program files with a reference that resolved to this file, in program order. */
  importersOf(path: string): string[] {
    if (!this.reverse) {
      this.reverse = new Map();
      for (const [importer, segment] of this.importerSegments)
        for (const item of new Set(segment.imports.map((entry) => entry.resolved))) {
          if (item === undefined) continue;
          const list = this.reverse.get(item) ?? [];
          list.push(importer);
          this.reverse.set(item, list);
        }
    }
    return [...(this.reverse.get(normalize(path)) ?? [])];
  }

  /**
   * The aggregate replayed from the attribution log: every observation (without the definition),
   * probe and symlink in observation order. It equals what the aggregate recorded directly.
   */
  replay(): { files: TrackedFiles; probes: ResolutionProbes } {
    const files = new TrackedFiles();
    const probes: ResolutionProbes = { missing: new Set(), realpaths: new Map() };
    for (const segment of this.segments) {
      for (const dependency of segment.dependencies) files.add(dependency);
      for (const directory of segment.missing) probes.missing.add(directory);
      for (const [from, to] of segment.realpaths) probes.realpaths.set(from, to);
    }
    return { files, probes };
  }

  /**
   * The aggregate as a synchronization that failed right after tracking the program files had it:
   * every observation logged up to the last program file (the configuration, entries, scopes,
   * membership and the files), without the later global ones (the formatter probes) and without a
   * definition. A patched synchronization that fails its syntax check reports exactly these, as the
   * cold one does.
   */
  throughImporters(): Dependency[] {
    let last = this.segments.length - 1;
    while (last >= 0 && this.segments[last]!.owner === undefined) last -= 1;
    const files = new TrackedFiles();
    for (const segment of this.segments.slice(0, last + 1))
      for (const dependency of segment.dependencies) files.add(dependency);
    return files.all();
  }

  /**
   * Re-tracks program files against the project's current program: each file's observations are
   * replaced in its place in the log, the aggregate and the probes are re-derived from the log,
   * and so is the `semantic` definition when one was defined. Returns the
   * re-tracked observations (the ones a patch re-stamps). The retained entries see the result,
   * because they read the observations through the mirror.
   *
   * A program file can also be read as a global observation: an entry file is read before the
   * program is tracked. A cold synchronization of the edited tree reads it again, so its global
   * content observation takes the file's current digest too; otherwise the log would hold the old
   * and the new digest of one path, and the aggregate would record them as conflicting. `reads`
   * holds the digest of the bytes the caller applied (a global read digests the raw bytes, as
   * `TrackedFiles.read` does); without it the file is read again.
   */
  retrack(
    project: Project,
    paths: Iterable<string>,
    owned: OwnedRoots,
    reads?: ReadonlyMap<string, string>,
  ): Dependency[] {
    const program = project.getProgram().compilerObject;
    const options = project.getCompilerOptions();
    const retracked: Dependency[] = [];
    const targets = new Set([...paths].map(normalize));
    for (const path of targets) {
      const segment = this.importerSegments.get(path);
      const source = segment ? program.getSourceFile(path) : undefined;
      if (!segment || !source)
        throw new SemanticFailure(
          'SEMANTIC_RETRACK',
          `${path} is not a tracked file of the current program`,
          { path },
        );
      segment.dependencies = [];
      segment.missing = [];
      segment.realpaths = [];
      segment.imports = [];
      const files = new TrackedFiles([], (dependency) => segment.dependencies.push(dependency));
      const host = trackingHost(files, owned, {
        missing: (directory) => segment.missing.push(directory),
        realpath: (from, to) => segment.realpaths.push([from, to]),
      });
      trackSourceFile(source, options, host, files, owned, segment.imports);
      retracked.push(...segment.dependencies);
    }
    for (const segment of this.segments) {
      if (segment.owner !== undefined) continue;
      segment.dependencies = segment.dependencies.map((dependency) =>
        dependency.kind === 'content' && targets.has(dependency.path)
          ? { ...dependency, digest: reads?.get(dependency.path) ?? rawDigest(dependency.path) }
          : dependency,
      );
    }
    const { files, probes } = this.replay();
    this.logging = false;
    const aggregate = this.createAggregate();
    for (const dependency of files.all()) aggregate.add(dependency);
    this.logging = true;
    this.aggregate = aggregate;
    this.resolutionProbes = probes;
    this.reverse = undefined;
    if (this.definition) this.define(this.definition.configuration, project);
    return retracked;
  }

  /**
   * The log's three parts: the global observations logged before the first program file (the
   * program's root membership: the tsconfig reads, the entries, the API scope globs and the
   * tsconfig membership), the tracked program files, and every later global observation (the
   * formatter configuration probes).
   */
  layout(): {
    membership: Dependency[];
    importers: string[];
    tail: Dependency[];
    tailMissing: string[];
    tailRealpaths: Array<[string, string]>;
  } {
    const first = this.segments.findIndex((segment) => segment.owner !== undefined);
    const leading = first < 0 ? this.segments.length : first;
    const tail = this.segments.slice(leading).filter((segment) => segment.owner === undefined);
    return {
      membership: this.segments.slice(0, leading).flatMap((segment) => segment.dependencies),
      importers: this.importers(),
      tail: tail.flatMap((segment) => segment.dependencies),
      tailMissing: tail.flatMap((segment) => segment.missing),
      tailRealpaths: tail.flatMap((segment) => segment.realpaths),
    };
  }

  /**
   * Rebuilds the log for the project's current program after its root set or file set changed
   * (`program-retention.ts` `restructureProgram`), as a cold synchronization of the same tree logs
   * it: `membership`'s global observations (recorded again for the new root membership), then every
   * non-owned program file in program order, then the later global observations as they are. A
   * program file `keep` accepts keeps its segment (its observations were verified to hold); every
   * other one is tracked again. The aggregate, the probes and the definition are re-derived from
   * the log. Returns the observations of the files tracked again (the ones to stamp).
   */
  restructure(
    project: Project,
    owned: OwnedRoots,
    membership: ProgramObservations,
    keep: (path: string) => boolean,
  ): Dependency[] {
    const program = project.getProgram().compilerObject;
    const options = project.getCompilerOptions();
    const first = this.segments.findIndex((segment) => segment.owner !== undefined);
    const tail = this.segments
      .slice(first < 0 ? this.segments.length : first)
      .filter((segment) => segment.owner === undefined);
    const previous = new Map(this.importerSegments);
    const segments: Segment[] = membership.segments.filter(
      (segment) => segment.owner === undefined,
    );
    this.importerSegments.clear();
    const tracked: Dependency[] = [];
    for (const source of program.getSourceFiles()) {
      const path = normalize(source.fileName);
      if (owned.has(path)) continue;
      const kept = previous.get(path);
      if (kept && keep(path)) {
        segments.push(kept);
        this.importerSegments.set(path, kept);
        continue;
      }
      const segment: Segment = {
        owner: path,
        dependencies: [],
        missing: [],
        realpaths: [],
        imports: [],
      };
      const files = new TrackedFiles([], (dependency) => segment.dependencies.push(dependency));
      const host = trackingHost(files, owned, {
        missing: (directory) => segment.missing.push(directory),
        realpath: (from, to) => segment.realpaths.push([from, to]),
      });
      trackSourceFile(source, options, host, files, owned, segment.imports);
      tracked.push(...segment.dependencies);
      segments.push(segment);
      this.importerSegments.set(path, segment);
    }
    segments.push(...tail);
    this.segments.splice(0, this.segments.length, ...segments);
    const { files, probes } = this.replay();
    this.logging = false;
    const aggregate = this.createAggregate();
    for (const dependency of files.all()) aggregate.add(dependency);
    this.logging = true;
    this.aggregate = aggregate;
    this.resolutionProbes = probes;
    this.reverse = undefined;
    if (this.definition) this.define(this.definition.configuration, project);
    return [...membership.files.all(), ...tracked];
  }

  private createAggregate(): TrackedFiles {
    // The definition is derived, never logged: re-deriving it replaces it.
    return new TrackedFiles([], (dependency) => {
      if (this.logging && dependency.kind !== 'semantic')
        this.segment().dependencies.push(dependency);
    });
  }

  private open(path: string): Segment {
    const segment: Segment = {
      owner: path,
      dependencies: [],
      missing: [],
      realpaths: [],
      imports: [],
    };
    this.segments.push(segment);
    this.importerSegments.set(path, segment);
    this.current = segment;
    return segment;
  }

  private segment(): Segment {
    if (this.current) return this.current;
    const last = this.segments.at(-1);
    if (last && last.owner === undefined) return last;
    const global: Segment = { dependencies: [], missing: [], realpaths: [], imports: [] };
    this.segments.push(global);
    return global;
  }
}
