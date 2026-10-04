import { dirname, resolve } from 'node:path';
import { setImmediate } from 'node:timers';
import { fileURLToPath } from 'node:url';

import type {
  DeclarationDescriptor,
  Dependency,
  Diagnostic,
  JsonValue,
  SemanticClosureDependency,
  SemanticFragment,
  SemanticFragmentRequest,
  SemanticProgramRetention,
  SemanticProgramSynchronization,
  SemanticService,
  ServiceResult,
} from '../contracts';
import { observationClockNs } from '../graph';
import {
  flagOff,
  INCREMENTAL_PROGRAM_FLAG,
  readFlag,
  SHAPE_CLOSURE_FLAG,
  TRACKED_PROGRAM_REUSE_FLAG,
} from '../kernel/flags';
import {
  type Footprint,
  type FootprintScopeKind,
  type RecorderMode,
  attachFootprint,
  recorderMode,
} from '../kernel/footprint';
import { guideSemantics } from './angular';
import { enumerateApi } from './api-enumeration';
import { diagnostic, SemanticFailure, TrackedFiles } from './dependencies';
import { type FragmentContext, fragmentScope, renderFragment } from './fragments';
import { buildProgram } from './program-builder';
import { ProgramObservations } from './program-observations';
import {
  type PatchResult,
  type ProgramWatchFacts,
  assess,
  patchProgram,
  programKey,
  watchFacts,
  watchProgram,
} from './program-retention';
import {
  type RetainedSemanticState,
  type SemanticRetention,
  type Snapshot,
  type SynchronizationPath,
  createProgramMirror,
  entryOf,
  RetainedProgram,
} from './program-state';
import { firstFactDifference, programFacts } from './program-verify';
import { recordLookup, resetRecording, SemanticRecorder } from './recorder';
import { type MarkdownRenderer, createJsDoc, renderMarkdown } from './rendering';
import {
  type ClosureRecord,
  type ClosureStore,
  type ShapeClosureMode,
  programOrder,
  SemanticClosures,
} from './semantic-closure';
import { canonicalTypeText } from './type-text';

/**
 * The semantic service: one TypeScript program per generation, and the queries over it.
 *
 * Module map:
 * - `program-builder.ts`: builds the Project of a discovery snapshot (program lifecycle);
 * - `program-observations.ts`: per-importer and global program tracking, and their aggregate;
 * - `program-retention.ts`: the retention key, the re-verification state and the reuse check;
 * - `program-state.ts`: the typed state (snapshot, `ProgramMirror`, `RetainedProgram`);
 * - `api-enumeration.ts`: the declarations of an API entry (queries);
 * - `fragments.ts`: JSDoc fragments and API templates (rendering).
 * This facade orchestrates `synchronize`, runs every query in its recorder scope, and hands the
 * retained program to the next generation.
 */

export { declarationIdentity } from './api-enumeration';
export type {
  RetainedSemanticState,
  SemanticRetention,
  SynchronizationPath,
} from './program-state';

export interface SemanticServiceOptions {
  /** Caller retains synchronize provenance and resolves query references through it. */
  dependencyMode?: 'full' | 'scope-reference';
  templateRoot?: string;
  markdown?: MarkdownRenderer;
  /** Discovery-local evaluated JSON hook; never exposes live values, Nodes, or functions. */
  readGuideValues?: (entryId: string) => ServiceResult<JsonValue>;
  /**
   * The footprint recorder: `on` attaches each query's recorded footprint to its result out of
   * band (`footprintOf`), `verify` also fails a query that reads a node outside it.
   * Defaults to `NGDOC_SEMANTIC_RECORDER` (on unless `0`). Results are identical in every mode.
   */
  recorder?: RecorderMode;
  /**
   * The incremental program: `on` patches the content edits of program files into a
   * retained program instead of synchronizing a new one; `verify` also synchronizes a cold program
   * after every patch, keeps the patched one only when the two are equal, and otherwise uses the
   * cold one and warns `SEMANTIC_PATCH_MISMATCH`. Defaults to `NGDOC_INCREMENTAL_PROGRAM` (on unless
   * `0`). Only a synchronization that is handed a retained program can patch it.
   */
  incrementalProgram?: IncrementalProgramMode;
  /**
   * Shape closures (`semantic-closure.ts`): `on` follows the files of a closure by
   * their content and declaration-shape closures; `verify` also reports every closure that
   * holds only by its shapes as narrowed (`closureNarrowed`). Defaults to `NGDOC_SHAPE_CLOSURE` (on
   * unless `0`). Only scoped generations record closures.
   */
  shapeClosure?: ShapeClosureMode;
  /**
   * Whether the queries of one synchronization that depend on the whole program share one
   * tracking of it (`fragments.ts`, `trackWholeProgram`). Defaults to `NGDOC_TRACKED_PROGRAM_REUSE`
   * (on unless `0`); off, every such query tracks the program again. Results are identical.
   */
  trackedProgramReuse?: boolean;
}

export type IncrementalProgramMode = 'off' | 'on' | 'verify';

/** Warns that a patched program differed from a cold synchronization (`verify` only). */
export const SEMANTIC_PATCH_MISMATCH = 'SEMANTIC_PATCH_MISMATCH';

export class SemanticServiceImpl implements SemanticService, SemanticProgramRetention {
  private snapshot?: Snapshot;
  private revision = 0;
  private disposed = false;
  private readonly recorder: SemanticRecorder;
  /** The rendering helpers every query uses, bound to this service's options. */
  private readonly context: FragmentContext;
  /** Recorded semantic closures; on only for scoped development generations. */
  private readonly closures: SemanticClosures;
  private scoped = false;
  private readonly incremental: IncrementalProgramMode;
  /** The taken program a failed patch hands back (the port's `patched-failed`). */
  private handedBack?: RetainedProgram;
  /**
   * Queries started and not yet returned. A query that never returns was terminated: a template
   * action runs a query inside the template's `vm` render, whose watchdog terminates the render
   * without running any `finally` block. The TypeScript checker, the recorder and the Project may
   * then hold the state of a half-done query.
   */
  private running = 0;
  /** A query of this program was terminated: it is never retained, and answers no more queries. */
  private interrupted = false;
  constructor(private readonly options: SemanticServiceOptions = {}) {
    this.recorder = new SemanticRecorder(options.recorder ?? recorderMode());
    this.incremental = options.incrementalProgram ?? readFlag(INCREMENTAL_PROGRAM_FLAG).value;
    this.closures = new SemanticClosures(
      options.shapeClosure ?? readFlag(SHAPE_CLOSURE_FLAG).value,
    );
    this.context = {
      recorder: this.recorder,
      scoped: () => this.closures.enabled,
      trackedProgramReuse: options.trackedProgramReuse ?? !flagOff(TRACKED_PROGRAM_REUSE_FLAG),
      docs: (source, files) => createJsDoc((text) => this.markdown(text, source, files)),
      markdown: (text, source, files) => this.markdown(text, source, files),
      templateRoot: () =>
        this.options.templateRoot ??
        resolve(dirname(fileURLToPath(import.meta.url)), '../../templates'),
    };
  }

  /** The recorder's mode and, when it asked for recording but the probe failed, why it is off. */
  recording(): { mode: RecorderMode; unavailable?: string } {
    return {
      mode: this.recorder.mode,
      ...(this.recorder.unavailable ? { unavailable: this.recorder.unavailable } : {}),
    };
  }

  private lastSynchronization?: SynchronizationPath;

  /**
   * Whether the next synchronization's queries record `semantic-closure` dependencies instead of
   * the global `semantic-reference` (a scoped development generation). Only the `scope-reference`
   * dependency mode records closures.
   */
  scopeClosures(enabled: boolean): void {
    this.scoped = enabled && this.options.dependencyMode === 'scope-reference';
  }

  /** The previous candidate's whole-program digest, which confirms closures without a record. */
  closureBase(digest: string | undefined): void {
    this.closures.setBase(digest);
  }

  /**
   * After `synchronize`: seeds a generation whose runtime carries no closure records with the
   * records of the persistent store (`compiler/closure-store.ts`); `load` runs only then.
   */
  seedClosures(load: () => ClosureStore): void {
    this.closures.seed(load);
  }

  /**
   * The record of a closure digest this generation holds, for the persistent store, with the file
   * order of this generation's program: without it a restored record confirms no closure after an
   * edit (`SemanticClosures`).
   */
  closureRecord(digest: string): ClosureRecord | undefined {
    const record = this.closures.enabled ? this.closures.recorded(digest) : undefined;
    return record && this.snapshot ? { ...record, order: programOrder(this.snapshot) } : record;
  }

  /**
   * The current digest of a recorded closure (the refresher's source), or undefined when it cannot
   * be recomputed, which refreshes it as changed.
   */
  refreshClosure(dependency: SemanticClosureDependency): string | undefined {
    if (!this.closures.enabled || !this.snapshot || this.disposed) return undefined;
    try {
      return this.closures.refresh(this.snapshot, dependency);
    } catch {
      return undefined;
    }
  }

  /**
   * The current digest of the whole program a `semantic-reference` names, for a scoped generation,
   * whose descriptors do not carry the reference (a query whose footprint could not state its
   * closure records it instead). Undefined when closures are off or the scope is another.
   */
  refreshReference(dependency: { scopeId: string }): string | undefined {
    const program = this.snapshot?.observations.semantic;
    if (!this.closures.enabled || !program || dependency.scopeId !== program.scopeId)
      return undefined;
    return program.digest;
  }

  /**
   * Shape closures in `verify` mode: whether the closure held in this generation only by its
   * declaration shapes, so the content reused on it must be rendered again and compared.
   */
  closureNarrowed(dependency: SemanticClosureDependency): boolean {
    return this.closures.enabled && this.closures.narrowed(dependency);
  }

  /**
   * Whether every closure recorded against the previous candidate still holds without a refresh:
   * the program equals that candidate's (always true when closures are off).
   */
  closuresHold(): boolean {
    return !this.closures.enabled || this.closures.holds(this.snapshot);
  }

  /** How the last `synchronize` obtained its Project (instrumentation and tests). */
  synchronization(): SynchronizationPath | undefined {
    return this.lastSynchronization;
  }

  /** The retention port's view of the last `synchronize`. */
  programSynchronization(): SemanticProgramSynchronization | undefined {
    const last = this.lastSynchronization;
    if (!last) return undefined;
    if (last.path === 'reused') return { outcome: 'reused' };
    if (last.path === 'patched')
      return last.failed
        ? { outcome: 'patched-failed', handedBack: this.handedBack! }
        : { outcome: 'patched' };
    return { outcome: 'full', reason: last.reason };
  }

  async synchronize(
    request: Parameters<SemanticService['synchronize']>[0],
    signal: AbortSignal,
  ): Promise<ServiceResult<null>> {
    const revision = ++this.revision;
    this.noteInterruption();
    // A terminated query's program was never retained, so this synchronization builds a new one
    // or reuses another.
    this.interrupted = false;
    this.snapshot = undefined;
    this.lastSynchronization = undefined;
    this.handedBack = undefined;
    const retention: SemanticRetention | undefined = request.retention;
    // The previous generation's closure records describe digests, not its Project: they are kept
    // whether the program is reused, patched or rebuilt.
    this.closures.start(
      this.scoped,
      retention?.previous instanceof RetainedProgram ? retention.previous.closures : undefined,
    );
    const key = retention ? programKey(request.discovery) : '';
    let warnings: Diagnostic[] = [];
    if (retention?.previous instanceof RetainedProgram) {
      const previous = retention.previous;
      const assessment = assess(
        previous,
        key,
        request.changes,
        this.incremental !== 'off',
        request.discovery,
      );
      if (assessment.kind !== 'full') {
        await new Promise<void>((done) => setImmediate(done));
        try {
          this.check(signal);
          if (revision !== this.revision)
            throw new SemanticFailure(
              'SEMANTIC_SUPERSEDED',
              'A newer synchronization superseded this Project',
            );
        } catch (error) {
          return { dependencies: previous.files.all(), diagnostics: [diagnostic(error)] };
        }
        if (assessment.kind === 'reuse') {
          this.keep(previous, request, key);
          this.lastSynchronization = { path: 'reused', ...assessment.counters };
          return { value: null, dependencies: previous.files.all(), diagnostics: [] };
        }
        const patched = await this.patch(previous, assessment, request, signal);
        if (patched.kind === 'patched') {
          this.keep(previous, request, key);
          this.lastSynchronization = {
            path: 'patched',
            files: [...assessment.files],
            ...assessment.counters,
          };
          return { value: null, dependencies: previous.files.all(), diagnostics: [] };
        }
        if (patched.kind === 'failed') {
          // The patch stays applied and is handed back for the old base; the next edit patches it
          // again.
          this.handedBack = previous;
          this.lastSynchronization = {
            path: 'patched',
            files: [...assessment.files],
            failed: true,
            ...assessment.counters,
          };
          return { dependencies: patched.dependencies, diagnostics: [diagnostic(patched.failure)] };
        }
        this.lastSynchronization = { path: 'full', reason: `patch refused: ${patched.reason}` };
        if ('mismatch' in patched)
          warnings = [
            {
              code: SEMANTIC_PATCH_MISMATCH,
              severity: 'warning',
              stage: 'semantic',
              message: `The patched TypeScript program differs from a cold synchronization (${patched.mismatch}); the program was synchronized again.`,
            },
          ];
      } else this.lastSynchronization = { path: 'full', reason: assessment.reason };
      // Consumed: the stale (or partly patched) program is released before its replacement is
      // built (peak memory), and never restored.
      delete retention.previous;
    } else {
      // A state this module did not make is never reused, nor kept alive by the request.
      const foreign = retention?.previous !== undefined;
      if (foreign) delete retention.previous;
      this.lastSynchronization = {
        path: 'full',
        reason: foreign
          ? 'the retained state is not a program of this service'
          : retention
            ? 'no retained program'
            : 'retention off',
      };
    }
    const built = await this.build(request, signal, revision, retention ? key : undefined);
    return warnings.length ? { ...built, diagnostics: [...warnings, ...built.diagnostics] } : built;
  }

  /** Publishes a kept (reused or patched) retained program to this generation's queries. */
  private keep(
    previous: RetainedProgram,
    request: { discovery: Snapshot['discovery'] },
    key: string,
  ) {
    // The kept program keeps its mirror: every retained state made from it shares it.
    this.snapshot = {
      project: previous.project,
      discovery: request.discovery,
      observations: previous.mirror.observations,
      declarations: new Map(),
      scopes: previous.scopes,
      owned: previous.owned,
      retention: { key, mirror: previous.mirror },
    };
  }

  /**
   * Patches the retained program (`patchProgram`). A refused or throwing patch leaves a Project
   * that must not be kept; in `verify` mode a patch that differs from a cold synchronization of the
   * same tree is refused as a mismatch.
   */
  private async patch(
    previous: RetainedProgram,
    assessment: Parameters<typeof patchProgram>[1],
    request: Parameters<SemanticService['synchronize']>[0],
    signal: AbortSignal,
  ): Promise<PatchResult | { kind: 'refused'; reason: string; mismatch: string }> {
    let result: PatchResult;
    try {
      result = await patchProgram(previous, assessment, request.discovery);
    } catch (error) {
      return {
        kind: 'refused',
        reason: `the patch failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (result.kind === 'refused' || this.incremental !== 'verify') return result;
    const mismatch = await patchMismatch(previous, result, request.discovery, signal);
    return mismatch === undefined
      ? result
      : { kind: 'refused', reason: `verification: ${mismatch}`, mismatch };
  }

  /** A FULL synchronization: a new Project, made retainable when `key` is given. */
  private async build(
    request: Parameters<SemanticService['synchronize']>[0],
    signal: AbortSignal,
    revision: number,
    key: string | undefined,
  ): Promise<ServiceResult<null>> {
    const observedAtNs = observationClockNs();
    const observations = new ProgramObservations();
    try {
      this.check(signal);
      const { project, scopes, owned, roots } = await buildProgram(request.discovery, observations);
      await new Promise<void>((done) => setImmediate(done));
      this.check(signal);
      if (revision !== this.revision)
        throw new SemanticFailure(
          'SEMANTIC_SUPERSEDED',
          'A newer synchronization superseded this Project',
        );
      this.snapshot = {
        project,
        discovery: request.discovery,
        observations,
        declarations: new Map(),
        scopes,
        owned,
      };
      if (key !== undefined) {
        // Stamp what was just observed, so the next generation can verify it by stat.
        const watch = watchProgram(
          project,
          observations,
          owned,
          request.discovery.configuration.tsConfig,
          observedAtNs,
        );
        this.snapshot.retention = { key, mirror: createProgramMirror(observations, watch, roots) };
      }
      return { value: null, dependencies: observations.files.all(), diagnostics: [] };
    } catch (error) {
      return { dependencies: observations.files.all(), diagnostics: [diagnostic(error)] };
    }
  }

  enumerateApi(entryId: string): ServiceResult<DeclarationDescriptor[]> {
    return this.run('enumerateApi', entryId, (state, files, diagnostics) =>
      enumerateApi(state, entryId, files, diagnostics, this.context),
    );
  }

  describeGuide(entryId: string) {
    return this.run('describeGuide', entryId, (state, files, diagnostics) => {
      const entry = entryOf(state, entryId);
      if (entry.kind !== 'guide')
        throw new SemanticFailure('SEMANTIC_ENTRY_KIND', `${entryId} is not a guide entry`);
      const evaluated = this.options.readGuideValues?.(entryId);
      evaluated?.dependencies.forEach((dependency) => files.add(dependency));
      diagnostics.push(
        ...(evaluated?.diagnostics.filter((item) => item.severity !== 'error') ?? []),
      );
      if (evaluated?.diagnostics.some((item) => item.severity === 'error'))
        throw new SemanticFailure(
          'SEMANTIC_GUIDE_VALUES',
          evaluated.diagnostics.map((item) => item.message).join('\n'),
          entry.source,
        );
      recordLookup(entry.source.path);
      return guideSemantics(
        state.project.getSourceFileOrThrow(entry.source.path),
        files,
        state.discovery.configuration,
        this.context.docs(entry.source.path, files),
        evaluated?.value,
      );
    });
  }

  renderFragment(request: SemanticFragmentRequest): ServiceResult<SemanticFragment> {
    const [kind, key] = fragmentScope(request);
    return this.run(kind, key, (state, files) =>
      renderFragment(state, request, files, this.context),
    );
  }

  /**
   * Forgets the declarations this generation enumerated so far. A full attempt enumerates every
   * API entry again, in entry order, and each entry's routes are disambiguated only against the
   * declarations of earlier entries: the targeted path's admission enumerated all of them first.
   */
  forgetDeclarations(): void {
    this.snapshot?.declarations.clear();
  }

  /**
   * The current Project for the next development generation, or undefined when this service did
   * not synchronize for retention, has no successful synchronization, or a query changed the
   * Project's source files (the next generation's cold Project would not contain them).
   */
  retain(): RetainedSemanticState | undefined {
    this.noteInterruption();
    const state = this.snapshot;
    if (!state?.retention || state.mutated || this.disposed || this.interrupted) return undefined;
    return new RetainedProgram({
      key: state.retention.key,
      project: state.project,
      scopes: state.scopes,
      owned: state.owned,
      mirror: state.retention.mirror,
      ...(this.closures.enabled ? { closures: this.closures.retained(state) } : {}),
    });
  }

  /**
   * The current program's private observations as JSON (`watchFacts`), which a later process
   * checks before it trusts a candidate built on this program without building it again (the fast
   * start). Undefined when {@link retain} would retain nothing, or a listing cannot vouch for its
   * directory.
   */
  programWatchFacts(): ProgramWatchFacts | undefined {
    this.noteInterruption();
    const state = this.snapshot;
    if (!state?.retention || state.mutated || this.disposed || this.interrupted) return undefined;
    return watchFacts(state.retention.mirror.watch);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.revision++;
    this.snapshot = undefined;
  }
  /** Resource counters for host diagnostics/tests; no compiler objects escape. */
  inspect(): { projects: number; declarations: number } {
    return { projects: this.snapshot ? 1 : 0, declarations: this.snapshot?.declarations.size ?? 0 };
  }

  private check(signal: AbortSignal): void {
    if (this.disposed || signal.aborted)
      throw new SemanticFailure(
        'SEMANTIC_CANCELLED',
        this.disposed ? 'Semantic service is disposed' : 'Semantic synchronization aborted',
      );
  }
  private markdown(text: string, source: string, files: TrackedFiles): string {
    return (this.options.markdown ?? renderMarkdown)(text, {
      source,
      read: (file) => files.read(file),
    });
  }
  /**
   * Runs one query in its own recorder scope. The recorded footprint is attached to the returned
   * result out of band; the result itself is exactly what it was without the recorder.
   */
  private run<T>(
    kind: FootprintScopeKind,
    key: string,
    callback: (state: Snapshot, files: TrackedFiles, diagnostics: Diagnostic[]) => T,
  ): ServiceResult<T> {
    this.noteInterruption();
    if (this.interrupted)
      return {
        dependencies: [],
        diagnostics: [
          diagnostic(
            new SemanticFailure(
              'SEMANTIC_QUERY_INTERRUPTED',
              'An earlier semantic query of this program was terminated (a template render ' +
                'reached its wall-clock cap); the program answers no more queries until the next ' +
                'synchronization builds it again',
            ),
          ),
        ],
      };
    const recording = this.disposed
      ? undefined
      : this.recorder.open(kind, key, this.snapshot?.project);
    // Not decremented when V8 terminates the query: `finally` does not run then.
    this.running++;
    try {
      return this.query(callback, recording, `${kind}:${key}`);
    } finally {
      this.running--;
      recording?.dispose();
    }
  }

  /** Marks the program interrupted when a query never returned, and resets the recorder. */
  private noteInterruption(): void {
    if (this.running === 0) return;
    this.running = 0;
    this.interrupted = true;
    resetRecording();
  }

  private query<T>(
    callback: (state: Snapshot, files: TrackedFiles, diagnostics: Diagnostic[]) => T,
    recording: ReturnType<SemanticRecorder['open']>,
    closureKey: string,
  ): ServiceResult<T> {
    const scope = this.snapshot?.observations.semantic;
    const reference: Dependency[] = scope
      ? [
          {
            kind: 'semantic-reference',
            scopeId: scope.scopeId,
            digest: scope.digest,
            reason: scope.reason,
          },
        ]
      : [];
    const closures = this.closures.enabled;
    const files = new TrackedFiles(
      this.options.dependencyMode === 'scope-reference'
        ? closures
          ? []
          : reference
        : this.snapshot?.observations.files.all(),
      recording?.observe,
    );
    const mutated = this.snapshot?.mutated;
    /**
     * A scoped query records its closure, or the global reference when its footprint cannot state
     * one: recording off or unavailable, an incomplete footprint, a query that added a source file
     * to the Project, or a failure.
     */
    const semantic = (footprint: Footprint | undefined, failed: boolean): void => {
      if (!closures) return;
      const state = this.snapshot;
      let closure: Dependency | undefined;
      if (state && footprint?.complete && !failed && state.mutated === mutated) {
        try {
          closure = this.closures.record(state, closureKey, footprint);
        } catch {
          closure = undefined;
        }
      }
      (closure ? [closure] : reference).forEach((dependency) => files.add(dependency));
    };
    const diagnostics: Diagnostic[] = [];
    try {
      if (this.disposed)
        throw new SemanticFailure('SEMANTIC_CANCELLED', 'Semantic service is disposed');
      if (!this.snapshot)
        throw new SemanticFailure(
          'SEMANTIC_NOT_READY',
          'Synchronize must succeed before semantic queries',
        );
      // Union members that tie on every key of the stable type order print in a canonical order.
      canonicalTypeText(this.snapshot.project.getProgram().compilerObject.getTypeChecker());
      const value = JSON.parse(JSON.stringify(callback(this.snapshot, files, diagnostics))) as T;
      const footprint = recording?.close();
      semantic(footprint, false);
      const result: ServiceResult<T> = { value, dependencies: files.all(), diagnostics };
      return footprint ? attachFootprint(result, footprint) : result;
    } catch (error) {
      const footprint = recording?.close(false);
      semantic(footprint, true);
      const result = {
        dependencies: files.all(),
        diagnostics: [...diagnostics, diagnostic(error)],
      };
      return footprint ? attachFootprint(result, footprint) : result;
    }
  }
}

export function createSemanticService(options: SemanticServiceOptions = {}): SemanticServiceImpl {
  return new SemanticServiceImpl(options);
}

/**
 * The first difference between a patched program and a cold synchronization of the same tree, or
 * undefined when they agree: the published observations (the aggregate `semantic` digest
 * included), the root names, the files in order with their texts, the semantic facts
 * (`programFacts`: index facts, documentation, derived lists), and a failed syntax check's
 * diagnostic and observations.
 */
async function patchMismatch(
  patched: RetainedProgram,
  result: Exclude<PatchResult, { kind: 'refused' }>,
  discovery: Parameters<SemanticService['synchronize']>[0]['discovery'],
  signal: AbortSignal,
): Promise<string | undefined> {
  if (signal.aborted) return undefined;
  const observations = new ProgramObservations();
  let cold: Awaited<ReturnType<typeof buildProgram>> | undefined;
  let failure: Diagnostic | undefined;
  try {
    cold = await buildProgram(discovery, observations);
  } catch (error) {
    failure = diagnostic(error);
  }
  if (result.kind === 'failed' || failure) {
    if (result.kind !== 'failed') return `the cold synchronization failed: ${failure!.message}`;
    if (!failure) return 'the patched program failed its syntax check, the cold one did not';
    if (JSON.stringify(diagnostic(result.failure)) !== JSON.stringify(failure))
      return 'the syntax diagnostics differ';
    return JSON.stringify(result.dependencies) === JSON.stringify(observations.files.all())
      ? undefined
      : 'the observations of the failed synchronization differ';
  }
  if (JSON.stringify(patched.files.all()) !== JSON.stringify(observations.files.all()))
    return 'the published observations differ';
  const left = patched.project.getProgram().compilerObject;
  const right = cold!.project.getProgram().compilerObject;
  if (JSON.stringify(left.getRootFileNames()) !== JSON.stringify(right.getRootFileNames()))
    return 'the root names differ';
  const files = left.getSourceFiles();
  const coldFiles = right.getSourceFiles();
  if (files.length !== coldFiles.length) return 'the number of program files differs';
  for (const [index, source] of files.entries()) {
    const other = coldFiles[index]!;
    if (source.fileName !== other.fileName)
      return `file ${index} is ${source.fileName}, cold ${other.fileName}`;
    if (source.text !== other.text) return `the text of ${source.fileName} differs`;
  }
  return firstFactDifference(programFacts(patched.project), programFacts(cold!.project));
}
