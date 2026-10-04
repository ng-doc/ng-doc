import { highlightCacheSwitch } from '../content/highlight-cache';
import {
  disposeHtmlPool,
  holdHtmlPool,
  htmlPoolKept,
  prestartRenderThreads,
} from '../content/html-pool';
import type {
  ArtifactSnapshot,
  CompilationContext,
  CompilationRequest,
  CompilationResult,
  CompilationService,
  Dependency,
  DiscoveryRequest,
  DiscoverySnapshot,
  JsonValue,
  KeywordExport,
  ServiceResult,
} from '../contracts';
import { type DiscoveryOptions, createDiscoveryServices, evaluatedDigests } from '../discovery';
import { createDependencyRefresher } from '../graph';
import type { UnitIndex } from '../graph/unit-index';
import { recorderMode } from '../kernel/footprint';
import { createOutputAssembler } from '../outputs';
import { createSemanticService } from '../semantic/semantic-service';
import {
  aggregateUnits,
  assembleUnits,
  candidateSnapshot,
  recordRemovedOwners,
  writeCache,
} from './assemble';
import { closureStorePath, loadClosureStore } from './closure-store';
import { type Unit, diagnostic } from './common';
import { describeEntry } from './describe';
import { firstDifference, reportGeneration } from './dry-run';
import {
  engineSwitches,
  FAST_START_MISMATCH,
  fastStartMode,
  fastStartPath,
  restoreFastStart,
  saveFastStart,
} from './fast-start';
import { type GlobalPhase, fold, GenerationRecords } from './fold';
import { combineUnitKeywords, linkUnits } from './link';
import { type CompilationServices, type GenerationPlan, planContent, planGeneration } from './plan';
import { CompilationProgress } from './progress';
import { renderUnits } from './render';
import { GenerationRetention, incrementalProgramMode } from './retention';
import { scopedSemanticMode, scopedSemanticSwitch } from './semantic-closure';
import { type RetainedBuild, TargetedFallback, TargetedGeneration } from './targeted';

export {
  disposeHtmlPool as disposeRenderThreads,
  keepHtmlPool as keepRenderThreads,
} from '../content/html-pool';
export {
  type DryRunRecord,
  type DryRunReport,
  resetTargetedDryRun,
  TARGETED_MISMATCH,
  TARGETED_REBUILD_TRACE_ENV,
  targetedDryRun,
} from './dry-run';
export {
  type IncrementalRetentionReport,
  INCREMENTAL_PROGRAM_ENV,
  INCREMENTAL_SKIP_ENV,
  incrementalRetention,
  resetIncrementalRetention,
} from './retention';

/** JSON factory options can cross the disposable compilation worker boundary. */
export interface CompilationOptions {
  projectId: string;
  workspaceRoot: string;
  configFile?: string;
  defaults: DiscoveryRequest['defaults'];
  discovery?: DiscoveryOptions;
  /** Explicit template location for bundled hosts; defaults to packaged sibling templates. */
  templateRoot?: string;
  /** Host/package supplies its exact version and toolchain provenance. */
  compilerVersion: string;
  toolchainDigest: string;
  /**
   * Exact incremental reuse (restricted `whyRebuilt` index, link/assembly/revision reuse and
   * unchanged cache-entry skips) for development generations. Production generations never
   * use it. Defaults to on; `false` is the reference path that recomputes everything, kept for
   * differential verification.
   *
   * It also governs the retained-program skip: a development generation that is not a one-shot
   * build (`context.lifetime !== 'generation'`) keeps its TypeScript Project for the next
   * generation of the same runtime, which skips `synchronize` when nothing the program observed
   * changed. `false` turns both off; {@link INCREMENTAL_SKIP_ENV} turns off only the skip.
   */
  incrementalReuse?: boolean;
  /**
   * The targeted rebuild (`compiler/targeted.ts`): a development watch generation whose changes
   * are content, page or program edits compiles only the units they reach and replays the others
   * from the retained build of its base; its result is byte-identical to the full generation's.
   * On by default (`true`); `false` is the full path exactly, with nothing retained for it.
   * `verify` also compiles every targeted generation in full and compares the two results byte
   * for byte; on a difference it publishes the full one and reports
   * `COMPILATION_TARGETED_MISMATCH` (the report of `targetedDryRun()`, the trace and stderr).
   * It also reports, per generation, the units the full generation changed outside the targeted
   * closure (misses).
   * Resolved by bootstrap from `NGDOC_TARGETED_REBUILD` (`bootstrap/index.ts`). Only generations
   * that retain a program (development, not one-shot, `incrementalReuse` on) can be targeted.
   */
  targetedRebuild?: boolean | 'verify';
  /**
   * Scoped semantic invalidation (`compiler/semantic-closure.ts`): development generations of a
   * long-lived runtime record one `semantic-closure` per semantic query instead of the global
   * `semantic-reference`, so an API edit re-renders only the IRs whose closure changed. On by
   * default; `false`, like `NGDOC_SCOPED_SEMANTIC=0`, records the global reference. `verify` (or
   * the environment's `verify`) also renders every IR reused on its closure and reports
   * `COMPILATION_SCOPED_SEMANTIC_MISMATCH` on a difference.
   */
  scopedSemantic?: boolean | 'verify';
  /**
   * The incremental program (`semantic/program-retention.ts`): a development generation that
   * reuses the retained program patches the content edits of its program files into it instead of
   * synchronizing a new one. On by default; `false`, like `NGDOC_INCREMENTAL_PROGRAM=0`,
   * synchronizes anew after any program-file edit. `verify` (or the environment's `verify`) also
   * synchronizes a cold program after every patch and uses it, with a `SEMANTIC_PATCH_MISMATCH`
   * warning, when the two differ.
   */
  incrementalProgram?: boolean | 'verify';
  /**
   * The fast start (`compiler/fast-start.ts`): a development start whose recorded inputs all
   * re-read identically publishes the recorded candidate without compiling, and a start after
   * edits reuses the cache index's links and assemblies. On by default; `false`, like
   * `NGDOC_FAST_START=0`, compiles every start. `verify` (or the environment's `verify`) also
   * compiles a restored start in full, publishes that result and reports
   * `COMPILATION_FAST_START_MISMATCH` when the candidates differ.
   */
  fastStart?: boolean | 'verify';
  /**
   * The cache of highlighted code blocks (`content/highlight-cache.ts`): code is highlighted by one
   * Shiki highlighter per runtime, and a block whose text, language, meta, themes and Shiki release
   * were highlighted before reuses that result. Development generations with the artifact cache
   * keep it beside the cache; production, `cache: false` and the reference path
   * (`incrementalReuse: false`, which highlights every block) keep none. On by default; `false`,
   * like `NGDOC_HIGHLIGHT_CACHE=0`, highlights every block with the plain plugin. `verify` (or the
   * environment's `verify`) also highlights every hit again, uses that result and reports
   * `CONTENT_HIGHLIGHT_CACHE_MISMATCH` when it differs.
   */
  highlightCache?: boolean | 'verify';
  /**
   * Parallel rendering (`content/html-pool.ts`): a large generation runs the HTML pipeline of its
   * content (highlighting, anchors, keyword links, search records) on render threads, while the
   * main thread runs every front (files, templates, semantic queries) in plan order and settles
   * every result in plan order; the output is the same. Never on the targeted path or the
   * reference path (`incrementalReuse: false`). On by default; `false`, like
   * `NGDOC_PARALLEL_RENDER=0`, runs everything in the main thread. `verify` (or the environment's
   * `verify`) also runs every thread task in the main thread, uses that result and reports
   * `CONTENT_PARALLEL_MISMATCH` when it differs.
   */
  parallelRender?: boolean | 'verify';
  /**
   * The number of render threads (`parallelRender`). Defaults to the available parallelism less
   * two (the main thread and Prettier's), at most 4; `0` uses none.
   */
  renderThreads?: number;
}

/** A compiler service that can say which of its results came from a targeted generation. */
export interface TargetedCompilationService extends CompilationService {
  targetedResult(result: CompilationResult): boolean;
}

/**
 * Each attempt constructs a complete immutable candidate; publication belongs to the session
 * and the committer.
 *
 * A compile runs its phases in order (discovery, semantic, setup, describe, plan, render, keywords,
 * link, assembly, aggregate, validation): each phase records what it emits per unit or globally,
 * and every exit folds those records into its result (`./fold`).
 */
export function createCompilationService(options: CompilationOptions): TargetedCompilationService {
  const discovery = createDiscoveryServices(options.discovery);
  // Read with the services below: a fast start record names the switches they were made with.
  const switches = engineSwitches();
  // Every guide's live values, as the describe phase read them in the current generation (the
  // targeted rebuild compares them with the next generation's).
  let guideValues = new Map<string, string>();
  const readGuideValues = (entryId: string): ServiceResult<JsonValue> => {
    const values = discovery.values.readGuideValues(entryId);
    guideValues.set(entryId, JSON.stringify(values));
    return values;
  };
  const semantic = createSemanticService({
    dependencyMode: 'scope-reference',
    ...(scopedSemanticSwitch(options) === 'verify' && recorderMode() !== 'off'
      ? { recorder: 'verify' as const }
      : {}),
    ...(options.templateRoot ? { templateRoot: options.templateRoot } : {}),
    incrementalProgram: incrementalProgramMode(options),
    readGuideValues,
  });
  const assembler = createOutputAssembler(
    options.templateRoot ? { templateRoot: options.templateRoot } : {},
  );
  const services: CompilationServices = { options, discovery, semantic, assembler };
  /** The reference path's services: the fast start's `verify` compiles with them. */
  const scratchServices: CompilationServices = {
    ...services,
    options: { ...options, incrementalReuse: false, fastStart: false },
  };
  const targetedResults = new WeakSet<CompilationResult>();
  let disposed = false;
  let active = false;
  let activeController: AbortController | undefined;
  let activeSettlement: Promise<void> | undefined;
  return {
    targetedResult: (result) => targetedResults.has(result),
    async compile(request: CompilationRequest, signal: AbortSignal, context?: CompilationContext) {
      let records = new GenerationRecords();
      const result = (candidate?: ArtifactSnapshot): CompilationResult => fold(records, candidate);
      if (disposed || signal.aborted || active) {
        records.global('failure', {
          diagnostics: [
            diagnostic(
              'COMPILATION_UNAVAILABLE',
              disposed
                ? 'Compilation service disposed.'
                : signal.aborted
                  ? 'Compilation cancelled.'
                  : 'Concurrent compilation is not supported.',
            ),
          ],
          dependencies: [],
        });
        return result();
      }
      active = true;
      // The render threads stay for this compile's render, however long its semantic phase is.
      const releaseThreads = holdHtmlPool();
      guideValues = new Map();
      const startedNs = BigInt(Date.now()) * 1_000_000n;
      const retention = new GenerationRetention(options, request, context);
      const scopedSemantic = scopedSemanticMode(options, request);
      semantic.scopeClosures(scopedSemantic !== 'off');
      // The targeted rebuild classifies the changes before discovery (undefined when it is off or
      // the generation retains nothing).
      const targeted = TargetedGeneration.start(options, request, context, retention, startedNs);
      // Progress (advisory): `reporting` is unset while the `verify` oracle compiles, which the
      // user never waits for as such.
      const progress = CompilationProgress.of(context);
      if (targeted?.eligible) progress?.begin('targeted');
      // A generation without watched changes (a startup buildOnce that a long-lived runtime
      // serves) is a build, not an edit: like one in a one-shot runtime, it reports no pass.
      else if (targeted?.facts.reason && request.contentRequest?.origin !== undefined)
        progress?.begin('full', targeted.facts.reason);
      let reporting = progress;
      let next: { index?: UnitIndex; build?: RetainedBuild } = {};
      let promotedRevision: string | undefined;
      let published: 'targeted' | 'full' = 'full';
      let publishedResult: CompilationResult | undefined;
      let fullCandidate: ArtifactSnapshot | undefined;
      let mismatch: string | undefined;
      /** `NGDOC_FAST_START=verify`: the candidate the fast start restored, compared after compiling. */
      let restoredCandidate: ArtifactSnapshot | undefined;
      /** The generation compiles from scratch: the `verify` comparison of a restored start. */
      let scratch = false;
      let reportError: string | undefined;
      const timings = { targetedMs: 0, fullMs: 0, retainMs: 0 };
      let settle!: () => void;
      activeSettlement = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const controller = new AbortController();
      activeController = controller;
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      const accept = <T>(phase: GlobalPhase, value: ServiceResult<T>): T | undefined => {
        records.global(phase, value);
        return value.value;
      };
      // The keyword loaders' last results, when the path pass allows a targeted attempt: its
      // discovery does not invoke them. Anything but a targeted result is published only after
      // discovery ran again without them (`refresh`), so FULL generations evaluate the loaders.
      let pin = targeted?.pin();
      const discover = () => {
        reporting?.phase('discovery');
        return discovery.discovery.discover(
          {
            generation: request.generation,
            projectId: options.projectId,
            workspaceRoot: options.workspaceRoot,
            defaults: options.defaults,
            ...(options.configFile ? { configFile: options.configFile } : {}),
            changes: request.changes,
            ...(pin ? { pinnedRemoteKeywords: pin } : {}),
          },
          controller.signal,
        );
      };
      let found: DiscoverySnapshot | undefined;
      let programDependencies: Dependency[] = [];
      const synchronize = async (retain: boolean) => {
        const semanticRetention = retain
          ? retention.semanticRetention(request, options.projectId)
          : undefined;
        reporting?.phase('semantic');
        const synchronized = await semantic.synchronize(
          {
            generation: request.generation,
            discovery: found!,
            changes: request.changes,
            ...(semanticRetention ? { retention: semanticRetention } : {}),
          },
          controller.signal,
        );
        retention.synchronized(semantic.synchronization(), semantic.programSynchronization());
        // A runtime without closure records of its own (the startup generation's one-shot runtime,
        // a fresh or recycled long-lived one) takes them from the persistent store, so that its
        // first program edit refreshes the closures instead of rebuilding every semantic unit.
        const store = scratch
          ? undefined
          : closureStorePath(options, request, found!.configuration, scopedSemantic);
        if (store)
          semantic.seedClosures(() =>
            loadClosureStore(store, {
              ...options,
              configurationDigest: found!.configuration.digest,
            }),
          );
        accept('semantic', synchronized);
        programDependencies = synchronized.dependencies;
      };
      /**
       * Runs discovery again without the pin, in fresh records. The program is kept when the
       * configuration and entries are the ones it was synchronized for (the pin changes only
       * `remoteKeywords`, which it does not read); otherwise it is synchronized again. False when
       * the generation ends with the records as they are.
       */
      const refresh = async (): Promise<boolean> => {
        if (!pin) return !records.failed();
        pin = undefined;
        targeted!.facts.loaders = 'refreshed';
        const synchronized = records.globalContributions('semantic');
        const pinned = found && programInputs(found);
        records = new GenerationRecords();
        found = accept('discovery', await discover());
        if (!found || records.failed()) return false;
        if (!synchronized.length) return true;
        if (pinned === programInputs(found))
          for (const contribution of synchronized) records.global('semantic', contribution);
        else await synchronize(false);
        return !records.failed();
      };
      /**
       * Preparation repeated without the pinned keywords while the targeted pass still stands (the
       * targeted attempt may follow): not reported, so the phases never go backwards in the pass.
       */
      const repeating = async <T>(work: () => Promise<T>): Promise<T> => {
        if (!progress?.targeted) return work();
        reporting = undefined;
        try {
          return await work();
        } finally {
          reporting = progress;
        }
      };
      try {
        found = accept('discovery', await discover());
        if ((!found || records.failed()) && !(await repeating(refresh)))
          return (publishedResult = result());
        // The fast start (`./fast-start`): a start whose recorded inputs all re-read identically
        // publishes the recorded candidate; the long-lived runtime builds the program afterwards.
        const fastStart = fastStartMode(options, request);
        const recordFile = fastStartPath(options, request, found!.configuration);
        if (fastStart && recordFile) {
          reporting?.phase('restore');
          const restored = await restoreFastStart({
            file: recordFile,
            options,
            switches,
            found: found!,
            discovery: records.globalContributions('discovery'),
            signal: controller.signal,
          });
          if ('reason' in restored) progress?.begin('full', `fast start: ${restored.reason}`);
          else if (fastStart === 'on') {
            progress?.restored();
            return (publishedResult = restored.result);
          } else {
            // `verify` compares with a compile from scratch: nothing from the cache (its IRs,
            // links, assemblies, memo and closure store) may vouch for an input the record lacks.
            restoredCandidate = restored.result.candidate;
            scratch = true;
          }
        }
        // A large generation starts its render threads now: they get ready during the semantic phase.
        if (!scratch)
          prestartRenderThreads(options, request, found!.entries.length, {
            themes: found!.configuration.themes,
            ...(found!.configuration.shikiLangs ? { langs: found!.configuration.shikiLangs } : {}),
            cache: highlightCacheSwitch(options) !== 'off',
          });
        await synchronize(true);
        if (records.failed() && !(await repeating(refresh))) return (publishedResult = result());
        const setup = (into: GenerationRecords) => {
          reporting?.phase('plan');
          return planGeneration(scratch ? scratchServices : services, {
            ...(scratch ? { scratch } : {}),
            request,
            signal: controller.signal,
            found: found!,
            programDependencies,
            records: into,
            scopedSemantic,
            refresher: createDependencyRefresher({
              evaluated: evaluatedDigests(found!.entries),
              ...(scopedSemantic !== 'off'
                ? {
                    semanticClosure: (dependency) => semantic.refreshClosure(dependency),
                    semanticReference: (dependency) => semantic.refreshReference(dependency),
                  }
                : {}),
            }),
          });
        };
        let plan = await setup(records);
        if (records.failed() && pin && (await repeating(refresh)))
          plan = await repeating(() => setup(records));
        if (records.failed()) return (publishedResult = result());
        /** A fresh attempt of the full path, with this generation's discovery and program. */
        const fullAttempt = async (): Promise<Attempt> => {
          const fresh = new GenerationRecords();
          for (const phase of ['discovery', 'semantic'] as const)
            for (const contribution of records.globalContributions(phase))
              fresh.global(phase, contribution);
          records = fresh;
          plan = await setup(fresh);
          if (fresh.failed()) return { result: result(), units: [], plan };
          semantic.forgetDeclarations();
          return runPhases(plan, found!, undefined, true, reporting);
        };
        let attempt: Attempt | undefined;
        let triedTargeted = false;
        if (
          targeted?.eligible &&
          (await targeted.admit({
            found: found!,
            synchronization: semantic.synchronization(),
            plan,
            readGuideValues: discovery.values.readGuideValues.bind(discovery.values),
            refresher: plan.refresher,
          }))
        ) {
          triedTargeted = true;
          const started = performance.now();
          try {
            // `verify` writes the cache from the full compilation only.
            const tried = await runPhases(
              plan,
              found!,
              targeted,
              targeted.mode !== 'verify',
              progress,
            );
            if (controller.signal.aborted) return (publishedResult = tried.result);
            const errors = tried.result.diagnostics.filter((item) => item.severity === 'error');
            // Any failure of the targeted attempt is decided by the full path.
            if (errors.length || !tried.candidate)
              targeted.full(
                `targeted attempt failed: ${[...new Set(errors.map((item) => item.code))].join(', ') || 'no candidate'}`,
              );
            else {
              targeted.facts.path = 'content';
              attempt = tried;
            }
          } catch (error) {
            // An abort ends the generation as on the full path; anything else the targeted attempt
            // throws is a doubt, which the full path decides.
            if (controller.signal.aborted) throw error;
            targeted.full(
              error instanceof TargetedFallback
                ? error.message
                : `targeted attempt threw: ${error instanceof Error ? error.message : String(error)}`,
            );
          } finally {
            timings.targetedMs = performance.now() - started;
          }
          if (attempt && targeted.mode === 'verify') {
            const targetedRecords = records;
            const started = performance.now();
            reporting = undefined;
            const full = await fullAttempt().finally(() => (reporting = progress));
            timings.fullMs = performance.now() - started;
            if (controller.signal.aborted) return (publishedResult = full.result);
            fullCandidate = full.candidate;
            // Byte for byte: the candidate with every revision, diagnostics, `whyRebuilt` and
            // dependencies. The manifest and the output tree are functions of the candidate.
            const left = JSON.stringify(attempt.result);
            const right = JSON.stringify(full.result);
            if (left !== right) {
              mismatch = firstDifference(JSON.parse(left), JSON.parse(right)) ?? '$';
              attempt = full;
            } else {
              // Equal bytes: the targeted result is published, so the next generation replays the
              // targeted chain (its records), which is what `verify` exists to check.
              records = targetedRecords;
              published = 'targeted';
            }
          } else if (attempt) published = 'targeted';
        }
        if (!attempt) {
          const started = performance.now();
          progress?.full(targeted?.facts.reason);
          // After a targeted attempt or a refresh the full path starts again from setup, with
          // fresh records.
          if (pin && !(await refresh())) return (publishedResult = result());
          // An admission that did not admit may have enumerated the API entries already.
          semantic.forgetDeclarations();
          attempt =
            triedTargeted || targeted?.facts.loaders === 'refreshed'
              ? await fullAttempt()
              : await runPhases(plan, found!, undefined, true, progress);
          timings.fullMs = performance.now() - started;
          if (targeted?.mode === 'verify') fullCandidate = attempt.candidate;
        }
        publishedResult = attempt.result;
        if (attempt.candidate && restoredCandidate) {
          // `verify`: the restored candidate must be the one compiling it gives, byte for byte.
          const difference =
            JSON.stringify(restoredCandidate) === JSON.stringify(attempt.candidate)
              ? undefined
              : firstDifference(
                  JSON.parse(JSON.stringify(restoredCandidate)),
                  JSON.parse(JSON.stringify(attempt.candidate)),
                ) ?? '$';
          if (difference !== undefined)
            publishedResult = {
              ...publishedResult,
              diagnostics: [
                ...publishedResult.diagnostics,
                diagnostic(
                  FAST_START_MISMATCH,
                  `The fast start restored a candidate that differs from compiling it at ${difference}; the compiled one is published.`,
                  'warning',
                ),
              ],
            };
        }
        // The start record of the published result (the cache now holds its artifacts). Not for a
        // generation whose setup reported something (a cache it could not restore): that
        // describes this generation's cache, not its inputs, and a start would repeat it.
        const record = fastStartPath(options, request, found!.configuration);
        const program = record && attempt.candidate ? semantic.programWatchFacts() : undefined;
        const setupReported = records
          .globalContributions('setup')
          .some((contribution) => contribution.diagnostics.length > 0);
        if (record && program && !setupReported && publishedResult === attempt.result)
          await saveFastStart(record, {
            options,
            switches,
            found: found!,
            discovery: records.globalContributions('discovery'),
            result: publishedResult,
            program,
          });
        if (attempt.candidate) {
          promotedRevision = attempt.candidate.revision;
          if (targeted && attempt.keywords) {
            const started = performance.now();
            try {
              next = targeted.retain({
                targeted: published === 'targeted',
                units: attempt.units,
                candidate: attempt.candidate,
                found: found!,
                plan: attempt.plan,
                keywords: attempt.keywords,
                discovery: records
                  .globalContributions('discovery')
                  .flatMap((item) => item.dependencies),
                guideValues: new Map([...targeted.guideValues, ...guideValues]),
              });
            } catch (error) {
              // Nothing is retained: the next generation runs FULL.
              reportError = error instanceof Error ? error.message : String(error);
            }
            timings.retainMs = performance.now() - started;
          }
        }
        if (published === 'targeted') targetedResults.add(publishedResult);
        return publishedResult;
      } catch (error) {
        records.global('failure', {
          diagnostics: [
            diagnostic(
              'COMPILATION_FAILED',
              error instanceof Error ? error.message : String(error),
            ),
          ],
          dependencies: [],
        });
        promotedRevision = undefined;
        next = {};
        published = 'full';
        return (publishedResult = result());
      } finally {
        retention.finish(() => semantic.retain(), promotedRevision, next, request.changes);
        if (targeted)
          reportGeneration({
            request,
            targeted,
            published,
            candidate: publishedResult?.candidate,
            ...(targeted.mode === 'verify' && fullCandidate ? { full: fullCandidate } : {}),
            ...(mismatch !== undefined ? { mismatch } : {}),
            timings,
            ...(reportError !== undefined ? { error: reportError } : {}),
          });
        signal.removeEventListener('abort', abort);
        releaseThreads();
        active = false;
        activeController = undefined;
        settle();
        activeSettlement = undefined;
      }
    },
    async dispose() {
      disposed = true;
      activeController?.abort();
      const settling = activeSettlement;
      await Promise.all([semantic.dispose(), discovery.runtime.dispose()]);
      await settling;
      // A one-shot or in-process compile leaves no render thread behind; a long-lived runtime keeps
      // its pool for the next generation's service (`keepRenderThreads`).
      if (!htmlPoolKept()) await disposeHtmlPool();
    },
  };
}

/** What a synchronized program depends on in a discovery snapshot (everything but keywords). */
const programInputs = (found: DiscoverySnapshot): string =>
  JSON.stringify([found.configuration, found.entries, found.filtered ?? null]);

/** One attempt of the phases after setup, and what the targeted rebuild retains from it. */
interface Attempt {
  result: CompilationResult;
  candidate?: ArtifactSnapshot;
  units: Unit[];
  plan: GenerationPlan;
  keywords?: KeywordExport[];
}

/**
 * Describe, plan, render, keywords, link, assembly, aggregate and validation: each
 * phase records what it emits per unit or globally, and every exit folds those records into its
 * result (`./fold`). With `scope`, the targeted path: entries without a candidate are replayed,
 * and only candidates and one-hop consumers are linked and assembled again (`./targeted`).
 */
async function runPhases(
  plan: GenerationPlan,
  found: DiscoverySnapshot,
  scope?: TargetedGeneration,
  cache: boolean = true,
  progress?: CompilationProgress,
): Promise<Attempt> {
  const { records, signal } = plan;
  const units: Unit[] = [];
  // The targeted path renders a few units: it never waits for a thread.
  if (!scope) plan.back?.admit();
  const done = (candidate?: ArtifactSnapshot, keywords?: KeywordExport[]): Attempt => ({
    result: fold(records, candidate),
    ...(candidate ? { candidate } : {}),
    units,
    plan,
    ...(keywords ? { keywords } : {}),
  });
  progress?.phase('describe', found.entries.length);
  for (const entry of found.entries) {
    signal.throwIfAborted();
    if (!scope?.replay(plan, entry, units))
      await describeEntry(plan, entry, units, scope?.describing(plan, entry, units));
    progress?.unit();
  }
  if (signal.aborted || records.failed()) return done();
  planContent(plan, units);
  if (records.failed()) return done();

  progress?.phase('render', units.length);
  await renderUnits(plan, units, scope, progress && ((reused) => progress.unit(1, reused)));
  if (signal.aborted || records.failed()) return done();
  const conflict = scope?.conflict(units);
  if (conflict !== undefined) throw new TargetedFallback(conflict);
  recordRemovedOwners(plan, units);
  progress?.phase('keywords');
  const keywordPlan = combineUnitKeywords(plan, units);
  if (!keywordPlan) return done();
  scope?.closure(units, keywordPlan.keywords);

  progress?.phase('link', units.length);
  const linked = await linkUnits(
    plan,
    units,
    keywordPlan,
    scope,
    progress && ((count) => progress.unit(count)),
  );
  if (signal.aborted || records.failed()) return done();

  progress?.phase('assemble');
  const artifacts = assembleUnits(plan, units, linked, scope);
  scope?.explain(artifacts, units);
  progress?.phase('aggregate');
  const site = aggregateUnits(plan, artifacts, keywordPlan);
  if (signal.aborted || records.failed()) return done();
  const candidate = candidateSnapshot(plan, artifacts, keywordPlan, site);
  if (records.failed()) return done();
  progress?.phase('persist');
  if (cache) {
    await writeCache(
      plan,
      artifacts,
      scope ? (artifact) => artifact === plan.previousById.get(artifact.id) : undefined,
    );
    // The highlighted code blocks, beside the cache. A generation that rendered every content
    // keeps exactly the blocks it used; one that reused or replayed some keeps the earlier ones too.
    await plan.highlight?.save(
      !scope &&
        units.every((unit) => unit.record.render.every((step) => step.projection !== 'reuse')),
    );
  }
  progress?.end();
  if (signal.aborted) return done();
  return done(candidate, keywordPlan.keywords);
}
