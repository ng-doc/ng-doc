import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Project, type SourceFile, ts } from 'ts-morph';

import type { Dependency, DiscoverySnapshot, FileChange } from '../contracts';
import {
  type DirectoryFact,
  changedObservation,
  directoryListed,
  DirectoryListings,
  observationClockNs,
  ObservationStamps,
} from '../graph';
import { readText } from '../kernel/footprint';
import { type SemanticFailure, normalize, TrackedFiles } from './dependencies';
import { installDocumentationFreshness } from './documentation-cache';
import type { OwnedRoots } from './owned-roots';
import { type ProgramMembers, programMembers, syntaxFailure } from './program-builder';
import {
  type ImporterObservations,
  ProgramObservations,
  realpathOf,
  trackingHost,
} from './program-observations';
import type { ProgramWatch, RetainedProgram, SweepCounters } from './program-state';

/**
 * Program retention: the key a retained program is valid for, the re-verification state recorded
 * when it is retained, the check that decides whether it may be reused as it is or patched, and
 * the patch itself: the content of edited program files applied to the retained Project, whose
 * program TypeScript then re-creates from the old one.
 */

/** A tsconfig/jsconfig or package manifest change always rebuilds (resolution and options). */
export const PROGRAM_CONFIGURATION = /(^|\/)(package\.json|[tj]sconfig[^/]*\.json)$/;

/**
 * Everything of a discovery snapshot that `synchronize` reads. Queries read the live snapshot of
 * their own generation, so the rest may differ between the retaining and the reusing generation.
 */
export function programKey(discovery: DiscoverySnapshot): string {
  return JSON.stringify([
    discovery.configuration,
    discovery.entries.map((entry) => [
      entry.id,
      entry.kind,
      entry.source.path,
      entry.kind === 'api' ? entry.scopes : null,
    ]),
  ]);
}

/**
 * The re-verification state of a program synchronized for retention (see {@link ProgramWatch}).
 * Recording the `types` directives' probes re-resolves them with a tracking host into the private
 * observations only.
 */
export function watchProgram(
  project: Project,
  observations: ProgramObservations,
  owned: OwnedRoots,
  tsConfig: string,
  observedAtNs: bigint,
): ProgramWatch {
  const options = project.getCompilerOptions();
  const hidden = new TrackedFiles();
  const listings = new DirectoryListings();
  const configDirectory = dirname(tsConfig);
  const host = trackingHost(hidden, owned, observations.probeSink);
  const containing = join(configDirectory, '__inferred type names__.ts');
  // Every `types` entry the program resolves as a directive: the explicit names always (a named
  // package that is not installed yet leaves only a missing directory behind), and the automatic
  // ones when `types` is unset or contains "*".
  const directives = new Set((options.types ?? []).filter((name) => name !== '*'));
  if (!options.types || options.types.includes('*')) {
    const roots =
      ts.getEffectiveTypeRoots(options, { getCurrentDirectory: () => configDirectory }) ?? [];
    for (const root of roots) if (!owned.has(normalize(root))) listings.record(root, observedAtNs);
    for (const name of ts.getAutomaticTypeDirectiveNames(options, host)) directives.add(name);
  }
  for (const name of directives) ts.resolveTypeReferenceDirective(name, containing, options, host);
  const published = observations.files.all();
  for (const dependency of published)
    if (dependency.kind === 'glob')
      listings.recordGlob(dependency, observedAtNs, (path) => owned.has(path));
  const stamps = new ObservationStamps((file) => readText(file).digest);
  stamps.record([...published, ...hidden.all()], observedAtNs);
  const probes = observations.probes;
  return {
    stamps,
    hidden,
    missingDirectories: [...probes.missing].sort(),
    realpaths: [...probes.realpaths].sort(([left], [right]) => (left < right ? -1 : 1)),
    listings,
  };
}

/**
 * A program's private observations (see {@link ProgramWatch}) as JSON, so that another process
 * can check that a program synchronized now would be this one without building it: the published
 * dependencies and these facts are everything the program read. Glob listings are left out: such
 * a check observes each published glob again in full.
 */
export interface ProgramWatchFacts {
  /** The `types` directives' probes and reads (content and existence observations). */
  hidden: Dependency[];
  missingDirectories: string[];
  realpaths: Array<[string, string]>;
  directories: DirectoryFact[];
}

/**
 * The facts of `watch`, or undefined when a listing cannot vouch for its directory.
 */
export function watchFacts(watch: ProgramWatch): ProgramWatchFacts | undefined {
  const directories = watch.listings.directories();
  if (!directories) return undefined;
  return {
    hidden: watch.hidden.all(),
    missingDirectories: [...watch.missingDirectories],
    realpaths: watch.realpaths.map(([path, real]): [string, string] => [path, real]),
    directories,
  };
}

/**
 * Why the facts no longer hold, or undefined: the predicates of a retained program's sweep
 * (`holds`), by reading, never by stat stamps. The caller checks the hidden observations with the
 * published ones.
 */
export function watchFactsChange(facts: ProgramWatchFacts): string | undefined {
  for (const directory of facts.missingDirectories)
    if (ts.sys.directoryExists(directory)) return `directory appeared: ${directory}`;
  for (const [path, real] of facts.realpaths) {
    const current = realpathOf(path);
    if (current === undefined || normalize(current) !== real) return `symlink retargeted: ${path}`;
  }
  for (const directory of facts.directories)
    if (!directoryListed(directory)) return `directory listing changed: ${directory.path}`;
  return undefined;
}

/**
 * Why a retained program may no longer describe the workspace, or the sweep counters when it
 * provably still does: the discovery inputs of `synchronize` are equal, no change touches a
 * program configuration, an observed path or an observed glob's membership, and every content
 * and existence observation still holds (stat, re-hash on a stat change).
 */
export function stale(
  previous: RetainedProgram,
  key: string,
  changes: FileChange[],
): string | SweepCounters {
  if (previous.key !== key) return 'discovery inputs of the program changed';
  const configuration = configurationChange(changes);
  if (configuration) return configuration;
  return holds(previous.watch, [...previous.files.all(), ...previous.watch.hidden.all()], changes);
}

/** At most this many program files are patched into a retained program at once. */
export const MAX_PATCHED_FILES = 50;

/** What a synchronization may do with a retained program (see {@link assess}). */
export type ProgramAssessment =
  | { kind: 'full'; reason: string }
  | { kind: 'reuse'; counters: SweepCounters }
  /**
   * Patch `files` (program files, in program order), then check the program as a cold one.
   * `restructure`: the program's root membership or file set may change as well (entries added or
   * removed, an API scope or tsconfig glob that gained or lost a file, a program file deleted), so
   * the patch observes the root membership again (`restructureProgram`).
   */
  | { kind: 'patch'; files: string[]; counters: SweepCounters; restructure?: true };

/**
 * Decides how a synchronization treats a retained program. Without `patching` this is
 * {@link stale}: any change rebuilds. With it, the content observations of program files are
 * verified one by one; the files whose bytes changed, and the paths a failed patch left applied
 * (`ProgramMirror.appliedSinceBase`), are to be patched, and everything else the program observed
 * must hold exactly as for a reuse. A change event of a program file that still exists is
 * explained by that file's content, so it is taken off the events the remaining checks see.
 *
 * With `discovery` (the generation's snapshot), a change that moves the root membership (the
 * discovery inputs of the program, an observed glob's membership, a deleted program file) may
 * still be applied to the retained Project: {@link assessRestructure} checks everything but the
 * root membership itself, which the patch observes again.
 */
export function assess(
  previous: RetainedProgram,
  key: string,
  changes: FileChange[],
  patching: boolean,
  discovery?: DiscoverySnapshot,
): ProgramAssessment {
  // Patches applied since the base (a failed patch handed back) make the Project differ from every
  // tree a reuse could vouch for: re-check them as a patch, or rebuild when patching is off.
  if (!patching && previous.mirror.appliedSinceBase.size)
    return { kind: 'full', reason: 'the program has patches applied since its base' };
  if (!patching) {
    const reason = stale(previous, key, changes);
    return typeof reason === 'string'
      ? { kind: 'full', reason }
      : { kind: 'reuse', counters: reason };
  }
  const configuration = configurationChange(changes);
  if (configuration) return { kind: 'full', reason: configuration };
  if (previous.key !== key) {
    if (!discovery || keyConfiguration(previous.key) !== JSON.stringify(discovery.configuration))
      return { kind: 'full', reason: 'discovery inputs of the program changed' };
    const restructured = assessRestructure(previous, changes, discovery);
    return restructured.kind === 'full'
      ? {
          kind: 'full',
          reason: `discovery inputs of the program changed (${restructured.reason})`,
        }
      : restructured;
  }
  const plain = assessPatch(previous, changes);
  if (plain.kind !== 'full' || !discovery) return plain;
  const restructured = assessRestructure(previous, changes, discovery);
  return restructured.kind === 'full' ? plain : restructured;
}

/** The content patch of a program whose root membership holds. */
function assessPatch(previous: RetainedProgram, changes: FileChange[]): ProgramAssessment {
  const watch = previous.watch;
  const order = previous.mirror.observations.importers();
  const importers = new Set(order);
  const edited = new Set(previous.mirror.appliedSinceBase.keys());
  const observations = [...previous.files.all(), ...watch.hidden.all()];
  let stamped = 0;
  let rehashed = 0;
  for (const dependency of observations) {
    if (dependency.kind !== 'content' || !importers.has(dependency.path)) continue;
    const sweep = watch.stamps.sweep([dependency]);
    stamped += sweep.stamped;
    rehashed += sweep.rehashed;
    if (sweep.changed) edited.add(dependency.path);
  }
  for (const path of edited)
    if (!importers.has(path))
      return { kind: 'full', reason: `patched path is not a program file: ${path}` };
  if (edited.size > MAX_PATCHED_FILES)
    return {
      kind: 'full',
      reason: `${edited.size} program files changed (at most ${MAX_PATCHED_FILES} are patched)`,
    };
  const rest = observations.filter(
    (dependency) => !(dependency.kind === 'content' && importers.has(dependency.path)),
  );
  const unexplained = changes.filter((change) => {
    const path = normalize(change.path);
    return !importers.has(path) || !existsSync(path);
  });
  const verified = holds(watch, rest, unexplained);
  if (typeof verified === 'string') return { kind: 'full', reason: verified };
  const counters = {
    ...verified,
    stamped: verified.stamped + stamped,
    rehashed: verified.rehashed + rehashed,
  };
  return edited.size
    ? { kind: 'patch', files: order.filter((path) => edited.has(path)), counters }
    : { kind: 'reuse', counters };
}

/**
 * Whether a retained program can take a change of its root membership: its program configuration
 * still holds (the tsconfig reads and existence checks of the root membership, entry modules
 * aside), and so does everything each program file that stays observed:
 * a program file that still exists and was not edited keeps its observations, so its resolution
 * cannot change, and every file that is deleted, edited or new is tracked again after the patch.
 * The formatter probes and the private observations (types directives, missing directories,
 * symlinks, type root listings) must hold as for a reuse. The glob memberships are observed again.
 */
function assessRestructure(
  previous: RetainedProgram,
  changes: FileChange[],
  discovery: DiscoverySnapshot,
): ProgramAssessment {
  const { watch, mirror } = previous;
  const observations = mirror.observations;
  const layout = observations.layout();
  const importers = new Set(layout.importers);
  const entries = new Set([
    ...entryPaths(previous.key),
    ...discovery.entries.map((entry) => normalize(entry.source.path)),
  ]);
  const edited = new Set(mirror.appliedSinceBase.keys());
  const deleted = new Set<string>();
  let stamped = 0;
  let rehashed = 0;
  for (const path of layout.importers) {
    const own = observations
      .importer(path)!
      .dependencies.filter(
        (dependency) => dependency.kind === 'content' && dependency.path === path,
      );
    const sweep = watch.stamps.sweep(own);
    stamped += sweep.stamped;
    rehashed += sweep.rehashed;
    if (!sweep.changed) continue;
    if (existsSync(path)) edited.add(path);
    else deleted.add(path);
  }
  for (const path of edited)
    if (!importers.has(path))
      return { kind: 'full', reason: `patched path is not a program file: ${path}` };
  if (edited.size + deleted.size > MAX_PATCHED_FILES)
    return {
      kind: 'full',
      reason: `${edited.size + deleted.size} program files changed (at most ${MAX_PATCHED_FILES} are patched)`,
    };
  // Tracked again after the patch: their own observations need not hold.
  const retracked = new Set([...edited, ...deleted]);
  const kept = layout.importers.filter((path) => !retracked.has(path));
  const rest = [
    // The program configuration (entry modules are read again with the membership).
    ...layout.membership.filter(
      (dependency) =>
        (dependency.kind === 'content' || dependency.kind === 'existence') &&
        !entries.has(normalize(dependency.path)),
    ),
    ...kept.flatMap((path) => observations.importer(path)!.dependencies),
    ...layout.tail,
    ...watch.hidden.all(),
  ];
  const missing = [
    ...kept.flatMap((path) => observations.importer(path)!.missing),
    ...layout.tailMissing,
  ];
  const realpaths = [
    ...kept.flatMap((path) => observations.importer(path)!.realpaths),
    ...layout.tailRealpaths,
  ];
  const unexplained = changes.filter((change) => !edited.has(normalize(change.path)));
  const verified = holds(watch, rest, unexplained, {
    missing: [...new Set(missing)].sort(),
    realpaths,
    listings: watch.listings.withoutGlobs(),
  });
  if (typeof verified === 'string') return { kind: 'full', reason: verified };
  return {
    kind: 'patch',
    files: layout.importers.filter((path) => edited.has(path)),
    counters: {
      ...verified,
      stamped: verified.stamped + stamped,
      rehashed: verified.rehashed + rehashed,
    },
    restructure: true,
  };
}

/** The configuration a program key names, as JSON (see {@link programKey}). */
function keyConfiguration(key: string): string | undefined {
  try {
    return JSON.stringify((JSON.parse(key) as [unknown])[0]);
  } catch {
    return undefined;
  }
}

/** The entry module paths a program key names (see {@link programKey}). */
function entryPaths(key: string): string[] {
  try {
    const [, entries] = JSON.parse(key) as [unknown, Array<[string, string, string, unknown]>];
    return entries.map(([, , path]) => normalize(path));
  } catch {
    return [];
  }
}

function configurationChange(changes: FileChange[]): string | undefined {
  const change = changes.find((item) => PROGRAM_CONFIGURATION.test(normalize(item.path)));
  return change ? `program configuration ${change.kind}: ${change.path}` : undefined;
}

/** What a program's private observations are verified against (see {@link ProgramWatch}). */
interface WatchedProbes {
  missing: readonly string[];
  realpaths: ReadonlyArray<readonly [string, string]>;
  listings: DirectoryListings;
}

/** Every observation, resolution fact and listing still holds (see {@link stale}). */
function holds(
  watch: ProgramWatch,
  observations: Dependency[],
  changes: FileChange[],
  probes: WatchedProbes = {
    missing: watch.missingDirectories,
    realpaths: watch.realpaths,
    listings: watch.listings,
  },
): string | SweepCounters {
  const changed = changedObservation(observations, changes);
  if (changed) return changed;
  const sweep = watch.stamps.sweep(observations);
  if (sweep.changed) return `${sweep.changed.kind} observation changed: ${sweep.changed.path}`;
  for (const directory of probes.missing)
    if (ts.sys.directoryExists(directory)) return `directory appeared: ${directory}`;
  for (const [path, real] of probes.realpaths) {
    const current = realpathOf(path);
    if (current === undefined || normalize(current) !== real) return `symlink retargeted: ${path}`;
  }
  const directories = probes.listings.sweep();
  if (directories.changed) return `directory listing changed: ${directories.changed}`;
  return {
    stamped: sweep.stamped,
    rehashed: sweep.rehashed,
    probed: sweep.probed + probes.missing.length + probes.realpaths.length,
    listed: directories.stamped,
    relisted: directories.relisted,
  };
}

/** The outcome of {@link patchProgram}. */
export type PatchResult =
  /** The Project now equals a cold synchronization of the tree; its mirror says so. */
  | { kind: 'patched' }
  /**
   * The patch is applied and tracked, but the program has syntax errors: the cold failure, with
   * the observations a cold synchronization reports when it fails there.
   */
  | { kind: 'failed'; failure: SemanticFailure; dependencies: Dependency[] }
  /** The files cannot be patched; the Project may be changed and must not be kept. */
  | { kind: 'refused'; reason: string };

interface PatchPlan {
  path: string;
  source: SourceFile;
  /** The file as read: its UTF-8 text (with a byte order mark, if any) and its bytes' digest. */
  raw: { text: string; digest: string };
  /** The text TypeScript compiles (without the byte order mark). */
  text: string;
  before: string;
}

/**
 * Applies the current content of `files` (program files of the retained Project, in program order)
 * to the Project and re-creates its program from the old one:
 *
 * 1. Each file must be a TypeScript module before and after the edit (no declaration, JSON,
 *    library or script file, no global or ambient module augmentation, no UMD global) whose
 *    import, reference, type-reference and lib directives are unchanged; otherwise nothing is
 *    changed and the patch is refused. A file whose directives changed, and an assessment that
 *    moves the root membership (`restructure`), are applied by {@link restructureProgram}
 *    instead, which needs the generation's `discovery`.
 * 2. Write-ahead: each path is recorded as applied (`appliedSinceBase`) before the Project changes.
 * 3. The texts are applied with the program's root names pinned to the FULL synchronization's.
 * 4. The patched program must have the same root names and the same files in the same order, and
 *    each re-tracked file must resolve exactly what it resolved before; otherwise it is refused.
 * 5. The re-tracked files are re-stamped, as observed when their bytes were read.
 * 6. The syntax check of a cold synchronization: errors fail the synchronization with the cold
 *    diagnostic, and the paths stay applied.
 *
 * Throws only on a programmer error of ts-morph or TypeScript (or a pinned-version assumption that
 * no longer holds), which the caller treats as refused.
 */
export async function patchProgram(
  previous: RetainedProgram,
  assessment: { files: readonly string[]; restructure?: true },
  discovery?: DiscoverySnapshot,
): Promise<PatchResult> {
  const files = assessment.files;
  if (assessment.restructure)
    return discovery
      ? restructureProgram(previous, files, discovery)
      : { kind: 'refused', reason: 'a root change needs the discovery snapshot' };
  const { project, owned, mirror } = previous;
  // Reused symbols of unchanged files must not answer with documentation cached for the old
  // program (inherited from a patched base).
  installDocumentationFreshness();
  const wrapper = project.getProgram() as unknown as Partial<ResettableProgram>;
  if (typeof wrapper._reset !== 'function')
    return { kind: 'refused', reason: 'this ts-morph program cannot pin its root names' };
  const factory = sourceFactory(project);
  if (!factory)
    return { kind: 'refused', reason: 'this ts-morph project cannot replace a source file' };
  const before = project.getProgram().compilerObject;
  const order = before.getSourceFiles().map((source) => source.fileName);
  // Taken before the files are read: a file written after this instant is never stamped as
  // verified, so the next sweep reads it again.
  const observedAtNs = observationClockNs();
  const plans: PatchPlan[] = [];
  for (const path of files) {
    const source = project.getSourceFile(path);
    const importer = mirror.observations.importer(path);
    if (!source || !importer)
      return { kind: 'refused', reason: `${path} is not a file of the retained program` };
    const compiled = source.compilerNode;
    if (
      compiled.isDeclarationFile ||
      before.isSourceFileDefaultLibrary(compiled) ||
      before.isSourceFileFromExternalLibrary(compiled)
    )
      return { kind: 'refused', reason: `${path} is a declaration or library file` };
    let raw: { text: string; digest: string };
    try {
      raw = readText(path);
    } catch (error) {
      return {
        kind: 'refused',
        reason: `${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    // TypeScript compiles a file without its byte order mark (a cold program's text omits it).
    const text = raw.text.charCodeAt(0) === 0xfeff ? raw.text.slice(1) : raw.text;
    const reason = patchable(path, compiled.text, 'before') ?? patchable(path, text, 'after');
    if (reason) return { kind: 'refused', reason: `${path}: ${reason}` };
    // Changed references may change the program's file set: the patch then tracks the files anew.
    if (references(path, compiled.text) !== references(path, text))
      return discovery
        ? restructureProgram(previous, files, discovery)
        : { kind: 'refused', reason: `${path}: its imports, directives or pragmas changed` };
    plans.push({ path, source, raw, text, before: comparable(importer) });
  }
  // Write-ahead: from here the Project may differ from every base, and the paths say where.
  for (const plan of plans) mirror.appliedSinceBase.set(plan.path, plan.raw.digest);
  mirror.version += 1;
  withPinnedRoots(wrapper as ResettableProgram, mirror.roots, () => {
    for (const plan of plans) {
      owned.recordRead(plan.path, plan.raw.text);
      if (plan.source.getFullText() !== plan.text) replaceSource(factory, plan.source, plan.text);
    }
  });
  const after = project.getProgram().compilerObject;
  if (!sameList(after.getRootFileNames(), mirror.roots))
    return { kind: 'refused', reason: 'the patched program has other root files' };
  if (
    !sameList(
      after.getSourceFiles().map((source) => source.fileName),
      order,
    )
  )
    return { kind: 'refused', reason: 'the patched program has other files or another file order' };
  const retracked = mirror.observations.retrack(
    project,
    files,
    owned,
    new Map(plans.map((plan) => [plan.path, plan.raw.digest])),
  );
  for (const plan of plans)
    if (comparable(mirror.observations.importer(plan.path)!) !== plan.before)
      return { kind: 'refused', reason: `${plan.path}: what its references resolve to changed` };
  mirror.watch.stamps.record(retracked, observedAtNs);
  const failure = syntaxFailure(after);
  if (failure)
    return { kind: 'failed', failure, dependencies: mirror.observations.throughImporters() };
  mirror.appliedSinceBase.clear();
  return { kind: 'patched' };
}

/**
 * Applies a change of the retained program's root membership or file set (entries added or
 * removed, a glob that gained or lost a member, a deleted program file, an edit whose imports
 * changed) together with the content of `edited`. {@link assessRestructure} verified that every
 * program file that stays and was not edited still resolves what it resolved, and that the
 * program configuration holds.
 *
 * 1. The root membership is observed again exactly as a FULL synchronization observes it
 *    (`programMembers`), and the root names are the ones ts-morph gives a FULL synchronization of
 *    that membership: its own glob of the members, in the order it lists them. The roots the
 *    retained program keeps must keep their relative order.
 * 2. Each edited, new or deleted file must be a TypeScript module (as for a patch). Write-ahead,
 *    as for a patch.
 * 3. With the new root names pinned: the edited texts are applied, deleted files are dropped from
 *    the Project's cache (ts-morph's resolution host would otherwise still find them), the new
 *    roots are added as members and the dependencies resolved as a FULL synchronization resolves
 *    them, and every cached file the new program does not contain is dropped, so the Project holds
 *    the cold file set. The members' parent-most folders (which ts-morph marks as in the project)
 *    must be the base's. TypeScript re-creates the program without reusing its structure (the
 *    roots changed): the imports of a file that keeps its observations take the base program's
 *    resolutions (they cannot differ), every other file's are resolved against the tree as it is.
 * 4. The cold syntax check; a failure is refused (the Project is not kept).
 * 5. The observations are rebuilt as a cold synchronization logs them: the new root membership,
 *    the kept files' observations and the new or edited files' tracked again, in program order.
 *    The re-verification state follows: new stamps, the missing directories and symlinks of the
 *    new log, the glob listings of the new membership.
 */
async function restructureProgram(
  previous: RetainedProgram,
  edited: readonly string[],
  discovery: DiscoverySnapshot,
): Promise<PatchResult> {
  const { project, owned, mirror } = previous;
  installDocumentationFreshness();
  const wrapper = project.getProgram() as unknown as Partial<ResettableProgram>;
  if (typeof wrapper._reset !== 'function')
    return { kind: 'refused', reason: 'this ts-morph program cannot pin its root names' };
  const factory = sourceFactory(project);
  const cache = sourceCache(project);
  if (!factory || !cache)
    return { kind: 'refused', reason: 'this ts-morph project cannot replace a source file' };
  const observedAtNs = observationClockNs();
  const membership = new ProgramObservations();
  let members: ProgramMembers;
  try {
    members = await programMembers(discovery, membership.files);
  } catch (error) {
    return {
      kind: 'refused',
      reason: `the root membership cannot be observed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const roots = [...cache.fileSystem.globSync(members.members)].map(String);
  const kept = new Set(roots);
  const before = new Set(mirror.roots);
  if (
    !sameList(
      roots.filter((root) => before.has(root)),
      mirror.roots.filter((root) => kept.has(root)),
    )
  )
    return { kind: 'refused', reason: 'the kept root names changed their order' };
  // ts-morph marks the members' parent-most folders (and everything below) as in the project,
  // which decides whether a resolved `node_modules` file is: they must be the base's.
  if (!sameList(parentMost(roots), parentMost(mirror.roots)))
    return { kind: 'refused', reason: "the members' parent-most folders changed" };
  const importers = new Set(mirror.observations.importers());
  const deleted = [...importers].filter((path) => !existsSync(path));
  const added = roots.filter((root) => !importers.has(normalize(root)));
  if (edited.length + deleted.length + added.length > MAX_PATCHED_FILES)
    return {
      kind: 'refused',
      reason: `${edited.length + deleted.length + added.length} program files changed (at most ${MAX_PATCHED_FILES} are patched)`,
    };
  const compiled = project.getProgram().compilerObject;
  const plans: PatchPlan[] = [];
  for (const path of edited) {
    const source = project.getSourceFile(path);
    const importer = mirror.observations.importer(path);
    if (!source || !importer)
      return { kind: 'refused', reason: `${path} is not a file of the retained program` };
    if (
      source.compilerNode.isDeclarationFile ||
      compiled.isSourceFileDefaultLibrary(source.compilerNode) ||
      compiled.isSourceFileFromExternalLibrary(source.compilerNode)
    )
      return { kind: 'refused', reason: `${path} is a declaration or library file` };
    let raw: { text: string; digest: string };
    try {
      raw = readText(path);
    } catch (error) {
      return {
        kind: 'refused',
        reason: `${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const text = raw.text.charCodeAt(0) === 0xfeff ? raw.text.slice(1) : raw.text;
    const reason =
      patchable(path, source.compilerNode.text, 'before') ?? patchable(path, text, 'after');
    if (reason) return { kind: 'refused', reason: `${path}: ${reason}` };
    plans.push({ path, source, raw, text, before: comparable(importer) });
  }
  for (const path of deleted) {
    const source = project.getSourceFile(path);
    const reason = source ? patchable(path, source.compilerNode.text, 'before') : undefined;
    if (reason) return { kind: 'refused', reason: `deleted ${path}: ${reason}` };
  }
  for (const path of added) {
    let text: string;
    try {
      text = readText(path).text;
    } catch (error) {
      return {
        kind: 'refused',
        reason: `${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const reason = patchable(path, text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, 'after');
    if (reason) return { kind: 'refused', reason: `new ${path}: ${reason}` };
  }
  // Write-ahead: from here the Project may differ from every base, and the paths say where.
  for (const plan of plans) mirror.appliedSinceBase.set(plan.path, plan.raw.digest);
  mirror.version += 1;
  let after!: ts.Program;
  // The files that keep their observations resolve exactly what they resolved.
  const unchanged = new Set(
    [...importers].filter((path) => !plans.some((plan) => plan.path === path) && existsSync(path)),
  );
  withPinnedRoots(
    wrapper as ResettableProgram,
    roots,
    () => {
      for (const plan of plans) {
        owned.recordRead(plan.path, plan.raw.text);
        if (plan.source.getFullText() !== plan.text) replaceSource(factory, plan.source, plan.text);
      }
      for (const path of deleted) cache.get(path)?.forget();
      // Each new root is added as ts-morph adds a member (in the project). Not through
      // `addSourceFilesAtPaths`: it walks the cached folders under the members' parent-most folders,
      // which still hold deleted ones; those folders are the base's (checked above), so their
      // in-project marks are the cold ones.
      for (const root of added) project.addSourceFileAtPath(root);
      project.resolveSourceFileDependencies();
      const files = new Set(
        project
          .getProgram()
          .compilerObject.getSourceFiles()
          .map((source) => source.fileName),
      );
      for (const path of [...cache.paths()]) if (!files.has(path)) cache.get(path)?.forget();
      after = project.getProgram().compilerObject;
    },
    (host) => reusingResolutions(host, compiled, unchanged, project.getCompilerOptions()),
  );
  if (!sameList(after.getRootFileNames(), roots))
    return { kind: 'refused', reason: 'the restructured program has other root files' };
  const files = new Set(after.getSourceFiles().map((source) => normalize(source.fileName)));
  const gone = deleted.find((path) => files.has(path));
  if (gone) return { kind: 'refused', reason: `the deleted ${gone} is still a program file` };
  // A cold synchronization fails there; the Project is not kept, so the next one is cold as well.
  const failure = syntaxFailure(after);
  if (failure) return { kind: 'refused', reason: `syntax errors: ${failure.message}` };
  const retracked = new Set(plans.map((plan) => plan.path));
  const tracked = mirror.observations.restructure(
    project,
    owned,
    membership,
    (path) => !retracked.has(path) && existsSync(path),
  );
  const watch = mirror.watch;
  watch.stamps.record(tracked, observedAtNs);
  const probes = mirror.observations.probes;
  watch.missingDirectories = [...probes.missing].sort();
  watch.realpaths = [...probes.realpaths].sort(([left], [right]) => (left < right ? -1 : 1));
  const listings = watch.listings.withoutGlobs();
  for (const dependency of mirror.observations.files.all())
    if (dependency.kind === 'glob')
      listings.recordGlob(dependency, observedAtNs, (path) => owned.has(path));
  watch.listings = listings;
  mirror.roots = roots;
  previous.scopes.clear();
  for (const [scope, matches] of members.scopes) previous.scopes.set(scope, matches);
  mirror.appliedSinceBase.clear();
  return { kind: 'patched' };
}

/**
 * A compiler host that resolves the imports of a file that keeps its observations (`kept`) as the
 * base program did, and every other file's as TypeScript's default loader does. TypeScript
 * re-resolves every import once the root names change; a kept file's resolution cannot differ
 * (every probe and read its resolution made still holds), so its recorded results are the fresh
 * ones.
 */
function reusingResolutions(
  host: ts.CompilerHost,
  base: ts.Program,
  kept: ReadonlySet<string>,
  options: ts.CompilerOptions,
): ts.CompilerHost {
  const cache = ts.createModuleResolutionCache(
    host.getCurrentDirectory(),
    (file) => host.getCanonicalFileName(file),
    options,
  );
  const internal = ts as unknown as Partial<ResolutionInternals>;
  const program = base as unknown as Partial<ResolvedModules>;
  const load = internal.loadWithModeAwareCache;
  const loader = internal.createModuleResolutionLoader;
  if (
    typeof load !== 'function' ||
    typeof loader !== 'function' ||
    typeof program.getResolvedModule !== 'function'
  )
    return host;
  const wrapped = Object.create(host) as ts.CompilerHost;
  wrapped.getModuleResolutionCache = () => cache;
  wrapped.resolveModuleNameLiterals = (
    literals,
    containingFile,
    redirectedReference,
    compilerOptions,
    containingSourceFile,
  ) => {
    const fresh = () =>
      load(
        literals,
        containingFile,
        redirectedReference,
        compilerOptions,
        containingSourceFile,
        host,
        cache,
        loader,
      );
    const previous = kept.has(normalize(containingFile))
      ? base.getSourceFile(containingFile)
      : undefined;
    if (!previous || previous.text !== containingSourceFile.text) return fresh();
    const reused = literals.map((literal) =>
      program.getResolvedModule!(
        previous,
        literal.text,
        ts.getModeForUsageLocation(containingSourceFile, literal, compilerOptions),
      ),
    );
    return reused.every((item) => item !== undefined)
      ? (reused as ts.ResolvedModuleWithFailedLookupLocations[])
      : fresh();
  };
  return wrapped;
}

/** TypeScript's default module resolution loader (internal; checked before use). */
interface ResolutionInternals {
  loadWithModeAwareCache(
    entries: readonly ts.StringLiteralLike[],
    containingFile: string,
    redirectedReference: ts.ResolvedProjectReference | undefined,
    options: ts.CompilerOptions,
    containingSourceFile: ts.SourceFile,
    host: ts.ModuleResolutionHost,
    cache: ts.ModuleResolutionCache,
    createLoader: unknown,
  ): readonly ts.ResolvedModuleWithFailedLookupLocations[];
  createModuleResolutionLoader: unknown;
}

/** A program's recorded resolutions (internal; checked before use). */
interface ResolvedModules {
  getResolvedModule(
    file: ts.SourceFile,
    name: string,
    mode: ts.ResolutionMode,
  ): ts.ResolvedModuleWithFailedLookupLocations | undefined;
}

/** The parent-most folders of `files` (none below another), sorted. */
function parentMost(files: readonly string[]): string[] {
  const folders = [...new Set(files.map((file) => dirname(file)))].sort();
  return folders.filter(
    (folder) =>
      !folders.some(
        (other) => other !== folder && (other === '/' || folder.startsWith(`${other}/`)),
      ),
  );
}

/** ts-morph's source file cache and file system (private API, checked like the factory's). */
interface SourceCache {
  paths(): Iterable<string>;
  get(path: string): SourceFile | undefined;
  fileSystem: { globSync(patterns: readonly string[]): Iterable<string> };
}

function sourceCache(project: Project): SourceCache | undefined {
  const context = (
    project as unknown as {
      _context?: {
        compilerFactory?: {
          getSourceFilePaths?: () => Iterable<string>;
          getSourceFileFromCacheFromFilePath?: (path: string) => SourceFile | undefined;
        };
        fileSystemWrapper?: {
          globSync?: (patterns: readonly string[]) => Iterable<string>;
          getStandardizedAbsolutePath?: (path: string) => string;
        };
      };
    }
  )._context;
  const factory = context?.compilerFactory;
  const fileSystem = context?.fileSystemWrapper;
  if (
    typeof factory?.getSourceFilePaths !== 'function' ||
    typeof factory.getSourceFileFromCacheFromFilePath !== 'function' ||
    typeof fileSystem?.globSync !== 'function' ||
    typeof fileSystem.getStandardizedAbsolutePath !== 'function'
  )
    return undefined;
  return {
    paths: () => [...factory.getSourceFilePaths!()],
    get: (path) =>
      factory.getSourceFileFromCacheFromFilePath!(fileSystem.getStandardizedAbsolutePath!(path)),
    fileSystem: { globSync: (patterns) => fileSystem.globSync!(patterns) },
  };
}

/** The part of ts-morph's compiler factory that loads and replaces source files. */
interface SourceFactory {
  createCompilerSourceFileFromText(
    path: string,
    text: string,
    scriptKind?: ts.ScriptKind,
  ): ts.SourceFile;
  replaceCompilerNode(old: SourceFile, node: ts.SourceFile): void;
}

function sourceFactory(project: Project): SourceFactory | undefined {
  const factory = (
    project as unknown as { _context?: { compilerFactory?: Partial<SourceFactory> } }
  )._context?.compilerFactory;
  return typeof factory?.createCompilerSourceFileFromText === 'function' &&
    typeof factory.replaceCompilerNode === 'function'
    ? (factory as SourceFactory)
    : undefined;
}

/**
 * Replaces a source file's compiler node with one parsed from `text` exactly as ts-morph parses a
 * file it loads (the same document registry call, no script kind), so the text keeps its line
 * endings: ts-morph's text manipulation (`replaceWithText`) writes through its code writer, which
 * normalizes CRLF to its own newline. The file's node wrappers are forgotten first; the source file
 * wrapper itself stays, and the replacement re-creates the program (with the pinned roots).
 */
function replaceSource(factory: SourceFactory, source: SourceFile, text: string): void {
  source.forgetDescendants();
  factory.replaceCompilerNode(
    source,
    factory.createCompilerSourceFileFromText(source.getFilePath(), text),
  );
}

/** ts-morph's program wrapper; `_reset` is how its language service re-creates the program. */
export interface ResettableProgram {
  _reset(rootNames: readonly string[], host: unknown): void;
}

/**
 * Runs `action` with the program's re-creation pinned to `roots`: ts-morph re-creates a changed
 * program from every file in its cache (resolved dependencies included), which would change the
 * root set, the file order and TypeScript's structure reuse.
 */
export function withPinnedRoots(
  program: ResettableProgram,
  roots: readonly string[],
  action: () => void,
  hostFor: (host: ts.CompilerHost) => ts.CompilerHost = (host) => host,
) {
  const own = Object.getOwnPropertyDescriptor(program, '_reset');
  const reset = program._reset;
  program._reset = function (
    this: ResettableProgram,
    _rootNames: readonly string[],
    host: unknown,
  ) {
    reset.call(this, roots, hostFor(host as ts.CompilerHost));
  };
  try {
    action();
  } finally {
    if (own) Object.defineProperty(program, '_reset', own);
    else delete (program as Partial<ResettableProgram>)._reset;
  }
}

const TYPESCRIPT_SOURCE = /\.(?:[cm]?ts|tsx)$/;
const DECLARATION = /\.d\.(?:[^/]*\.)?[cm]?ts$/;

/**
 * Why a file with this text cannot be patched: only a TypeScript module whose edits cannot reach
 * the global scope or another module's declarations by themselves.
 */
function patchable(path: string, text: string, when: 'before' | 'after'): string | undefined {
  if (!TYPESCRIPT_SOURCE.test(path) || DECLARATION.test(path))
    return 'not a TypeScript source file';
  if (path.includes('/node_modules/')) return 'a library file';
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  if (!ts.isExternalModule(source)) return `a script ${when} the edit`;
  for (const statement of source.statements) {
    if (
      ts.isModuleDeclaration(statement) &&
      (ts.isStringLiteral(statement.name) ||
        (statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0)
    )
      return `a global or ambient module declaration ${when} the edit`;
    if (ts.isNamespaceExportDeclaration(statement)) return `a UMD global ${when} the edit`;
  }
  return undefined;
}

/**
 * A file's import, reference, type-reference and lib directives (what resolution starts from), and
 * its pragmas: `@jsxImportSource` (and the other JSX pragmas) add an implicit import that
 * `preProcessFile` does not report.
 */
function references(path: string, text: string): string {
  const info = ts.preProcessFile(text, true, true);
  const pragmas = (
    ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false) as unknown as {
      pragmas?: ReadonlyMap<string, unknown>;
    }
  ).pragmas;
  const argumentsOf = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(argumentsOf)
      : (value as { arguments?: unknown } | undefined)?.arguments ?? null;
  return JSON.stringify([
    [...(pragmas ?? new Map<string, unknown>())].map(([name, value]) => [name, argumentsOf(value)]),
    info.importedFiles.map((item) => item.fileName),
    info.referencedFiles.map((item) => item.fileName),
    info.typeReferenceDirectives.map((item) => [item.fileName, item.resolutionMode ?? null]),
    info.libReferenceDirectives.map((item) => item.fileName),
    info.ambientExternalModules ?? [],
    info.isLibFile,
  ]);
}

/** What tracking a file observed, apart from its own content digest. */
function comparable(importer: ImporterObservations): string {
  return JSON.stringify([
    importer.dependencies.map((dependency) =>
      dependency.kind === 'content' && dependency.path === importer.path
        ? { ...dependency, digest: '' }
        : dependency,
    ),
    importer.missing,
    importer.realpaths,
    importer.imports,
  ]);
}

const sameList = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);
