import type {
  ClassDeclaration,
  EnumDeclaration,
  FunctionDeclaration,
  InterfaceDeclaration,
  Project,
  ts,
  TypeAliasDeclaration,
  VariableDeclaration,
} from 'ts-morph';

import type {
  ApiScopeDescriptor,
  DeclarationDescriptor,
  Dependency,
  DiscoverySnapshot,
  EntryDescriptor,
  RetainedSemanticState,
  SemanticRetentionRequest,
} from '../contracts';
import type { DirectoryListings, ObservationStamps } from '../graph';
import { type TrackedFiles, SemanticFailure } from './dependencies';
import type { OwnedRoots } from './owned-roots';
import type { ProgramObservations } from './program-observations';
import type { ClosureStore } from './semantic-closure';

/**
 * The typed program state of the semantic service.
 *
 * - {@link Snapshot}: the state one synchronization publishes to its queries.
 * - {@link ProgramMirror}: the mutable description of a retained Project, shared by every retained
 *   state made from it (the committed and the working entry of the retention slot).
 * - {@link RetainedProgram}: the concrete retained program behind the opaque
 *   {@link RetainedSemanticState}. Its published observations, semantic definition and stat stamps
 *   are read from the mirror, never copied.
 */

/** The aggregate `semantic` definition of one synchronized program. */
export type SemanticDefinition = Extract<Dependency, { kind: 'semantic' }>;

/**
 * The declaration kinds an API page documents: the same union as the legacy
 * `NgDocSupportedDeclaration` (`libs/builder/types`), spelled here so the generator's emitted
 * declarations never reference a module outside the generator.
 */
export type SupportedDeclaration =
  | ClassDeclaration
  | InterfaceDeclaration
  | EnumDeclaration
  | FunctionDeclaration
  | VariableDeclaration
  | TypeAliasDeclaration;

export interface DeclarationState {
  node: SupportedDeclaration;
  descriptor: DeclarationDescriptor;
  scope: ApiScopeDescriptor;
}

/**
 * The program state of one successful synchronization, handed from one semantic service to the
 * next development generation's service. Opaque to callers (the contract's
 * `RetainedSemanticState`). It holds the TypeScript Project and the generator's own observations
 * only; no evaluated user module.
 */
export type { RetainedSemanticState };

/**
 * What a retained program is re-verified against beyond its published observations (`files`):
 * - `stamps`: stat stamps of every content observation (published and private);
 * - `hidden`, `missingDirectories` and `realpaths`: private observations that are not part of the
 *   published dependency set, the semantic digest or any revision (so cold and incremental
 *   results, and the session's watch inputs, stay exactly as before): the file probes and reads of
 *   the `types` directives (explicit and automatic), the directories module resolution found
 *   missing (TypeScript probes no file inside a missing directory, so nothing else records an
 *   install into it), and the symlinked paths resolution went through;
 * - `listings`: the listing of every effective type root (automatic type directives enumerate its
 *   packages) and of the directories on the way to each observed glob's members.
 */
export interface ProgramWatch {
  stamps: ObservationStamps;
  hidden: TrackedFiles;
  /**
   * Directories module resolution was told do not exist (`directoryExists` false; the path may
   * be a file, which is not a directory). Verified with the same predicate, never by existence.
   */
  missingDirectories: string[];
  /**
   * Symlinked paths resolution went through, with the real path it got: a retarget
   * between byte-identical files is otherwise invisible, because program files are observed under
   * their real paths and the old target still exists unchanged.
   */
  realpaths: Array<[string, string]>;
  listings: DirectoryListings;
}

/** Resolution facts a tracking host collects privately (see {@link ProgramWatch}). */
export interface ResolutionProbes {
  missing: Set<string>;
  realpaths: Map<string, string>;
}

/**
 * The mutable state of one retained Project, shared by reference by every {@link RetainedProgram}
 * made from it: a reused or patched program's next retained state carries the same mirror, a FULL
 * synchronization makes a new one. It always describes the Project as it is, not the base a
 * retained entry names: a patch re-tracks and re-stamps what it applied.
 */
export interface ProgramMirror {
  /**
   * Paths patched into the Project that no successful synchronization has confirmed yet, with the
   * digest of the bytes applied. Written before the Project is changed and cleared when a patched
   * synchronization succeeds (the Project then equals its candidate's tree). It stays set only
   * behind a failed patch, whose Project is handed back for its old base: the next synchronization
   * of that Project re-reads and re-checks these paths and never reuses it as it is.
   */
  readonly appliedSinceBase: Map<string, string>;
  /** Per-importer and global observations of the Project; the published set is their aggregate. */
  readonly observations: ProgramObservations;
  /** The re-verification state; a patch re-stamps the files it applied. */
  readonly watch: ProgramWatch;
  /**
   * The root names of the program the FULL synchronization built. ts-morph re-creates a changed
   * program from every file in its cache, which after `resolveSourceFileDependencies` holds the
   * resolved dependencies too: a patch passes these roots instead, so the patched program keeps
   * the cold file set and order (and TypeScript can reuse its structure). A root change
   * (`restructureProgram`) replaces them with the root names a FULL synchronization of the new root
   * membership has.
   */
  roots: readonly string[];
  /** Bumped by every patch applied to the Project. */
  version: number;
}

/** A new mirror for a program synchronized for retention. */
export function createProgramMirror(
  observations: ProgramObservations,
  watch: ProgramWatch,
  roots: readonly string[],
): ProgramMirror {
  return { appliedSinceBase: new Map(), observations, watch, roots: [...roots], version: 0 };
}

/** The state one synchronization publishes to the queries of its generation. */
export interface Snapshot {
  project: Project;
  discovery: DiscoverySnapshot;
  /** The program's observations; `observations.files` is the published dependency set. */
  observations: ProgramObservations;
  declarations: Map<string, DeclarationState>;
  scopes: Map<string, string[]>;
  owned: OwnedRoots;
  /** Present only for a synchronization made to be retained. */
  retention?: { key: string; mirror: ProgramMirror };
  /** Set when a query added source files to the Project; such a Project is never retained. */
  mutated?: boolean;
  /**
   * The whole-program dependencies of `program`, tracked once for this synchronization and added
   * to every query that depends on the whole program (`fragments.ts`, `trackWholeProgram`).
   */
  tracked?: { program: ts.Program; dependencies: readonly Dependency[] };
}

/** The entry of the snapshot's discovery with this id. */
export function entryOf(state: Snapshot, id: string): EntryDescriptor {
  const entry = state.discovery.entries.find((item) => item.id === id);
  if (!entry) throw new SemanticFailure('SEMANTIC_ENTRY_MISSING', `Unknown entry ${id}`);
  return entry;
}

interface RetainedProgramFields {
  key: string;
  project: Project;
  scopes: Map<string, string[]>;
  owned: OwnedRoots;
  mirror: ProgramMirror;
  closures?: ClosureStore;
}

/**
 * The concrete retained program behind the opaque {@link RetainedSemanticState}: a class, so a
 * state handed back to `synchronize` is checked with `instanceof` instead of being cast. A state
 * this module did not make is never reused.
 */
export class RetainedProgram implements RetainedSemanticState {
  readonly retained = true;
  readonly key: string;
  readonly project: Project;
  readonly scopes: Map<string, string[]>;
  readonly owned: OwnedRoots;
  readonly mirror: ProgramMirror;
  /**
   * The closure records of the generation that retained this program, by digest. They describe
   * digests, not this Project, so the next generation uses them whether it reuses the program or
   * synchronizes a new one.
   */
  readonly closures?: ClosureStore;
  constructor(fields: RetainedProgramFields) {
    this.key = fields.key;
    this.project = fields.project;
    this.scopes = fields.scopes;
    this.owned = fields.owned;
    this.mirror = fields.mirror;
    if (fields.closures) this.closures = fields.closures;
  }

  /** The published observations (derived from the mirror on read). */
  get files(): TrackedFiles {
    return this.mirror.observations.files;
  }

  /** The re-verification state (derived from the mirror on read). */
  get watch(): ProgramWatch {
    return this.mirror.watch;
  }
}

/** The sweep counters of a synchronization that kept its retained Project. */
export interface SweepCounters {
  stamped: number;
  rehashed: number;
  probed: number;
  /** Directory listings verified by stat alone / read again. */
  listed: number;
  relisted: number;
}

/** How the last `synchronize` obtained its Project (instrumentation and tests). */
export type SynchronizationPath =
  | ({ path: 'reused' } & SweepCounters)
  /**
   * The retained Project with the content of `files` applied to it. `failed`: the patched program
   * failed the cold synchronization's syntax check; the Project is handed back as it is.
   */
  | ({ path: 'patched'; files: string[]; failed?: true } & SweepCounters)
  | { path: 'full'; reason: string };

/**
 * Retention request of a development generation: build the Project so it can be retained and,
 * when `previous` is given, reuse it instead of rebuilding if the request's changes and a stat
 * sweep prove every observation of that program still holds. `previous` is consumed: removed from
 * this object when the program is not kept.
 */
export type SemanticRetention = SemanticRetentionRequest;
