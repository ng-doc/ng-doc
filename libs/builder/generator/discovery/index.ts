import { NG_DOC_SYNTAX_THEME_NAME } from '@ng-doc/core';
import * as esbuild from 'esbuild';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { types as nodeTypes } from 'node:util';
import vm from 'node:vm';
import nunjucks from 'nunjucks';
import ts from 'typescript';

import { compareText } from '../../helpers/text-order';
import {
  ApiDescriptor,
  CategoryDescriptor,
  Dependency,
  Diagnostic,
  DiscoveryRequest,
  DiscoveryService,
  DiscoverySnapshot,
  EntryDescriptor,
  EvaluatedDependency,
  ExecutableProvenance,
  FilteredEntry,
  GeneratorConfiguration,
  GuideDescriptor,
  JsonValue,
  KeywordExport,
  RemoteKeywordSnapshot,
  RuntimeImport,
  ServiceResult,
  ShikiLanguage,
  TemplateActions,
  TemplateEvaluationService,
  TemplateRequest,
} from '../contracts';
import {
  compareCodeUnits,
  dependencyIdentity,
  digestOf,
  sha256Hex as hash,
} from '../kernel/canonical';
import { ObservationRecorder } from '../kernel/observations';

type EntryKind = EntryDescriptor['kind'];
type LiveRecord = Record<string, unknown>;

interface EvaluatedModule {
  source: string;
  kind: EntryKind | 'config';
  value: LiveRecord;
  exportName: 'default';
}

/** One evaluated bundle: its modules' values, each entry module's closure and the bundle's digest. */
interface EvaluatedBundle {
  modules: EvaluatedModule[];
  /**
   * Entry module → the files its evaluation read: the module, every bundle input it reaches in
   * the import graph and the resolution probes of those modules. Sorted.
   */
  closures: Map<string, string[]>;
  /** The digest of the evaluated code (the whole shared bundle). */
  bundleDigest: string;
  scope?: EvaluationScope;
}

interface RawConfiguration extends LiveRecord {
  cache?: boolean;
  docsPath?: string | string[];
  outDir?: string;
  routePrefix?: string;
  tsConfig?: string;
  guide?: { anchorHeadings?: GeneratorConfiguration['anchorHeadings']; headerTemplate?: string };
  api?: { protectedMembers?: boolean };
  shiki?: { themes?: { light?: string; dark?: string }; langs?: unknown };
  repoConfig?: GeneratorConfiguration['repo'];
  keywords?: {
    keywords?: Record<string, RawKeyword>;
    loaders?: Array<() => Promise<Record<string, RawKeyword>>>;
  };
}

interface RawKeyword {
  title?: string;
  url: string;
  type?: 'link';
  languages?: string[];
  description?: string;
}

export interface DiscoveryOptions {
  inlineStyleLanguage?: GeneratorConfiguration['inlineStyleLanguage'];
  defaultAnchorHeadings?: GeneratorConfiguration['anchorHeadings'];
  defaultThemes?: GeneratorConfiguration['themes'];
  moduleTimeoutMs?: number;
  /**
   * The time budget of the user code of one markdown template render (default 2 000 ms): the
   * template and the functions of the page it calls. The time spent in the engine's template
   * actions (`NgDocActions`, `NgDocApi`, `JSDoc`) is not counted. It is checked at every action
   * call and when the render ends; a render with no action calls stops at
   * `templateWallTimeoutMs` at the latest (see `TemplateActionMeter`).
   */
  templateTimeoutMs?: number;
  /**
   * The wall-clock cap of one markdown template render, its template actions included (default
   * 30 000 ms, never below `templateTimeoutMs`). V8 terminates the render when it is reached: this
   * is the bound for user code that never calls an action, or that swallows the failure of one.
   */
  templateWallTimeoutMs?: number;
  /** The most template action calls one markdown template render may make (default 10 000). */
  templateActionLimit?: number;
  loaderTimeoutMs?: number;
  /**
   * Build tags of this build or dev server, matched against `onlyForTags` of pages and categories.
   * An entry that declares `onlyForTags` is kept only when it shares at least one tag with this
   * list; otherwise it and everything under it (child categories, pages, API pages) is left out of
   * the discovery snapshot, so it has no route, navigation item, search record, keyword or output.
   * Entries without `onlyForTags` (or with `null` or `''`) are always kept; `[]` is never kept.
   * Absent or empty means no tags.
   *
   * The tags name the build configuration, as the legacy engine's `onlyForTags` check did, so
   * that the usual `development`/`production` configurations work without extra options. The
   * hosts default them accordingly: the Vite plugin (and the Vite builders) to the Vite mode, and
   * the CLI to `development` for `dev`/`watch` and `production` for `generate`.
   */
  tags?: readonly string[];
}

/** Narrow JSON-only bridge used by the semantic composition for playground controls. */
export interface GuideValueReader {
  readGuideValues(entryId: string): ServiceResult<JsonValue>;
}

const DESCRIPTION_FILES = ['**/ng-doc.page.ts', '**/ng-doc.category.ts', '**/ng-doc.api.ts'];
const ENTRY_KIND = new Map([
  ['ng-doc.page.ts', 'guide'],
  ['ng-doc.category.ts', 'category'],
  ['ng-doc.api.ts', 'api'],
] as const);

/**
 * Discovery's recorder: one per discovery or template render, reading each file once, so every
 * consumer uses, and the recorded digest describes, exactly the bytes it read. Reads of one path by
 * different recorders of a generation are reconciled by the compiler, which records a conflicting
 * digest when they differ. A child (for example the configuration's inputs) shares its parent's
 * bytes and also records into it.
 */
function discoveryRecorder(parent?: ObservationRecorder): ObservationRecorder {
  return new ObservationRecorder([], { parent, cacheBytes: true, normalize: normalizePath });
}

/** Discovery and template evaluation share one replaceable, process-local live scope. */
export class DiscoveryServiceImpl
  implements DiscoveryService, TemplateEvaluationService, GuideValueReader
{
  private readonly options: Required<Omit<DiscoveryOptions, 'tags'>>;
  /** Normalized build tags, or the reason the configured value is invalid. */
  private readonly tags: string[] | { invalid: string };
  private liveEntries = new Map<string, LiveRecord>();
  private liveDependencies = new Map<string, Dependency[]>();
  /** The `evaluated` dependency of every described entry of the current snapshot. */
  private liveEvaluated = new Map<string, EvaluatedDependency>();
  private executableScope?: EvaluationScope;
  private activeDiscovery?: AbortController;
  private generation?: number;

  constructor(options: DiscoveryOptions = {}) {
    this.options = {
      inlineStyleLanguage: options.inlineStyleLanguage ?? 'CSS',
      defaultAnchorHeadings: options.defaultAnchorHeadings ?? ['h1', 'h2', 'h3', 'h4'],
      // NgDoc's own theme: its colours are CSS variables, so code follows the site theme.
      defaultThemes: options.defaultThemes ?? {
        light: NG_DOC_SYNTAX_THEME_NAME,
        dark: NG_DOC_SYNTAX_THEME_NAME,
      },
      moduleTimeoutMs: options.moduleTimeoutMs ?? 5_000,
      templateTimeoutMs: options.templateTimeoutMs ?? 2_000,
      templateWallTimeoutMs: Math.max(
        options.templateWallTimeoutMs ?? 30_000,
        options.templateTimeoutMs ?? 2_000,
      ),
      templateActionLimit: options.templateActionLimit ?? 10_000,
      loaderTimeoutMs: options.loaderTimeoutMs ?? 10_000,
    };
    this.tags = normalizeBuildTags(options.tags);
  }

  async discover(
    request: DiscoveryRequest,
    signal: AbortSignal,
  ): Promise<ServiceResult<DiscoverySnapshot>> {
    this.resetRuntime();
    const dependencies = discoveryRecorder();
    // The configuration's own inputs (its module closure and probes, the loaders it value-imports
    // and the header template): exactly what its digest covers. Each entry's inputs are its own
    // closure (`describeEntries`), so editing one description leaves the configuration, and every
    // other entry, unchanged. The description scan's membership is a discovery input but not the
    // configuration's: an entry added or removed changes the entry set (which the targeted path
    // diffs), never the configuration, so every other artifact keeps its fingerprint.
    const configInputs = discoveryRecorder(dependencies);
    const diagnostics: Diagnostic[] = [];
    let configScope: EvaluationScope | undefined;
    let entryScope: EvaluationScope | undefined;
    const ownedAbort = new AbortController();
    this.activeDiscovery = ownedAbort;
    const operationSignal = AbortSignal.any([signal, ownedAbort.signal]);

    try {
      throwIfAborted(operationSignal);
      if (!Array.isArray(this.tags)) {
        diagnostics.push({
          code: 'DISCOVERY_TAGS_INVALID',
          severity: 'error',
          stage: 'discovery',
          message: this.tags.invalid,
        });
        return failure(dependencies, diagnostics);
      }
      const tags = this.tags;
      const workspaceRoot = normalizeAbsolute(request.workspaceRoot);
      const configFile = locateConfig(request, workspaceRoot, configInputs);
      if (request.configFile && !configFile) {
        diagnostics.push({
          code: 'DISCOVERY_CONFIG_MISSING',
          severity: 'error',
          stage: 'discovery',
          message: `Configuration file does not exist: ${normalizeAbsolute(request.configFile, workspaceRoot)}.`,
          source: { path: normalizeAbsolute(request.configFile, workspaceRoot) },
        });
        return failure(dependencies, diagnostics);
      }
      const configEvaluation = await evaluateModules(
        workspaceRoot,
        request.defaults.tsConfig,
        configFile,
        [],
        configInputs,
        diagnostics,
        operationSignal,
        this.options.moduleTimeoutMs,
      );
      if (!configEvaluation) return failure(dependencies, diagnostics);
      configScope = configEvaluation.scope;
      const rawConfig =
        configEvaluation.modules.find((item) => item.kind === 'config')?.value ?? {};
      const configuredRoots = asArray(rawConfig.docsPath ?? request.defaults.docsRoot).map((root) =>
        normalizeAbsolute(String(root), workspaceRoot),
      );
      const descriptions = scanDescriptions(configuredRoots, dependencies);
      const entryEvaluation = await evaluateModules(
        workspaceRoot,
        String(rawConfig.tsConfig ?? request.defaults.tsConfig),
        undefined,
        descriptions,
        dependencies,
        diagnostics,
        operationSignal,
        this.options.moduleTimeoutMs,
      );
      entryScope = entryEvaluation?.scope;
      throwIfAborted(operationSignal);
      if (!entryEvaluation || diagnostics.some((item) => item.severity === 'error')) {
        configScope?.dispose();
        entryScope?.dispose();
        return failure(dependencies, diagnostics);
      }

      const configModule = configEvaluation.modules.find((item) => item.kind === 'config');
      const configValue = (configModule?.value ?? rawConfig) as RawConfiguration;
      const entryModules = entryEvaluation.modules.filter(
        (item): item is EvaluatedModule & { kind: EntryKind } => item.kind !== 'config',
      );
      const normalized = await normalizeConfiguration(
        request,
        workspaceRoot,
        configFile,
        configValue,
        configInputs,
        this.options,
        operationSignal,
        configScope,
        { tags, active: activeBuildTags(tags, entryModules) },
      );
      configScope?.dispose();
      configScope = undefined;
      diagnostics.push(...normalized.diagnostics);
      if (!normalized.configuration || diagnostics.some((item) => item.severity === 'error')) {
        entryScope?.dispose();
        return failure(dependencies, diagnostics);
      }

      const described = describeEntries(
        request.projectId,
        workspaceRoot,
        normalized.configuration.routePrefix,
        entryModules,
        entryEvaluation.closures,
        dependencies,
        diagnostics,
        new Set(tags),
      );
      if (diagnostics.some((item) => item.severity === 'error')) {
        entryScope?.dispose();
        return failure(dependencies, diagnostics);
      }
      const evaluated = new Map<string, EvaluatedDependency>();
      for (const entry of described.entries) {
        const dependency: EvaluatedDependency = {
          kind: 'evaluated',
          entryId: entry.id,
          digest: evaluatedDigest(
            described.liveEntries.get(entry.id),
            entry.kind === 'guide'
              ? guideValuesOf(described.liveEntries.get(entry.id), entry.id, [])
              : undefined,
            entryEvaluation.bundleDigest,
          ),
        };
        evaluated.set(entry.id, dependency);
        entry.dependencies = sortDependencies([...entry.dependencies, dependency]);
      }
      throwIfAborted(operationSignal);
      if (this.activeDiscovery !== ownedAbort) {
        throw new DOMException('Discovery operation was superseded.', 'AbortError');
      }
      const snapshot = jsonData({
        configuration: normalized.configuration,
        entries: described.entries,
        globalKeywords: normalized.globalKeywords,
        remoteKeywords: normalized.remoteKeywords,
        ...(described.filtered.length ? { filtered: described.filtered } : {}),
      });
      this.liveEntries = described.liveEntries;
      this.liveDependencies = new Map(
        described.entries.map((entry) => [entry.id, entry.dependencies]),
      );
      this.liveEvaluated = evaluated;
      this.executableScope = entryScope;
      entryScope = undefined;
      this.generation = request.generation;
      return {
        value: snapshot,
        dependencies: dependencies.all(),
        diagnostics,
      };
    } catch (error) {
      diagnostics.push(toDiagnostic(error, 'discovery'));
      return failure(dependencies, diagnostics);
    } finally {
      configScope?.dispose();
      entryScope?.dispose();
      if (this.activeDiscovery === ownedAbort) this.activeDiscovery = undefined;
    }
  }

  render(request: TemplateRequest, actions: TemplateActions): ServiceResult<string> {
    const dependencies = discoveryRecorder();
    const diagnostics: Diagnostic[] = [];
    const entry = this.liveEntries.get(request.entryId);
    if (!entry || this.generation === undefined) {
      diagnostics.push({
        code: 'TEMPLATE_ENTRY_SCOPE_MISSING',
        severity: 'error',
        stage: 'evaluation',
        message: `No live entry is available for ${request.entryId}.`,
        source: request.source,
        ownerId: request.entryId,
      });
      return failure(dependencies, diagnostics);
    }

    try {
      const loader = new TrackingLoader(request.scope, dependencies, () => environment);
      const environment: nunjucks.Environment = new nunjucks.Environment(loader, {
        autoescape: false,
        throwOnUndefined: false,
      });
      environment.addExtension('NgDocIndexExtension', new NgDocIndexExtension());
      // The template reads the entry's live value (`NgDocPage`): the rendered text depends on it.
      const evaluated = this.liveEvaluated.get(request.entryId);
      if (evaluated) dependencies.add(evaluated);
      const meter = new TemplateActionMeter(
        actions,
        this.options.templateTimeoutMs,
        this.options.templateWallTimeoutMs,
        this.options.templateActionLimit,
      );
      const context: Record<string, unknown> = { ...request.values, NgDocPage: entry };
      for (const namespace of ['NgDocActions', 'NgDocApi', 'JSDoc'] as const) {
        context[namespace] = createActionProxy(namespace, meter);
      }
      const value = meter.measure(() =>
        this.executableScope
          ? this.executableScope.invoke(
              () => environment.renderString(request.text, context),
              this.options.templateWallTimeoutMs,
            )
          : environment.renderString(request.text, context),
      );
      return { value, dependencies: dependencies.all(), diagnostics };
    } catch (error) {
      diagnostics.push({
        ...toDiagnostic(error, 'evaluation'),
        source: request.source,
        ownerId: request.entryId,
      });
      return failure(dependencies, diagnostics);
    }
  }

  readGuideValues(entryId: string): ServiceResult<JsonValue> {
    return guideValuesOf(
      this.liveEntries.get(entryId),
      entryId,
      this.liveDependencies.get(entryId) ?? [],
    );
  }

  async dispose(): Promise<void> {
    this.resetRuntime();
  }

  private resetRuntime(): void {
    this.activeDiscovery?.abort(new DOMException('Discovery disposed.', 'AbortError'));
    this.activeDiscovery = undefined;
    this.executableScope?.dispose();
    this.executableScope = undefined;
    this.liveEntries.clear();
    this.liveDependencies.clear();
    this.liveEvaluated.clear();
    this.generation = undefined;
  }
}

/**
 * Explicit composition point for the compiler without a dependency on a builder barrel.
 * @param options
 */
export function createDiscoveryServices(options: DiscoveryOptions = {}): {
  discovery: DiscoveryService;
  templates: TemplateEvaluationService;
  values: GuideValueReader;
  runtime: DiscoveryServiceImpl;
} {
  const runtime = new DiscoveryServiceImpl(options);
  return { discovery: runtime, templates: runtime, values: runtime, runtime };
}

/**
 * The live guide values (playground controls) of one evaluated guide page, as JSON.
 * @param entry The page's live default export.
 * @param entryId
 * @param dependencies What the values depend on (the entry's recorded inputs).
 */
function guideValuesOf(
  entry: LiveRecord | undefined,
  entryId: string,
  dependencies: Dependency[],
): ServiceResult<JsonValue> {
  if (!entry) {
    return {
      dependencies,
      diagnostics: [
        {
          code: 'DISCOVERY_GUIDE_VALUES_MISSING',
          severity: 'error',
          stage: 'evaluation',
          message: `No live guide values are available for ${entryId}.`,
          ownerId: entryId,
        },
      ],
    };
  }
  try {
    const playgrounds = Object.fromEntries(
      Object.entries(recordOrEmpty(entry.playgrounds)).map(([id, value]) => {
        const controls = recordOrEmpty(asRecord(value, `playground ${id}`)).controls;
        return [id, { controls: controls === undefined ? {} : assertJson(controls) }];
      }),
    );
    return { value: assertJson({ playgrounds }), dependencies, diagnostics: [] };
  } catch (error) {
    return {
      dependencies,
      diagnostics: [
        {
          code: 'DISCOVERY_GUIDE_VALUES_INVALID',
          severity: 'error',
          stage: 'evaluation',
          message: errorMessage(error),
          ownerId: entryId,
        },
      ],
    };
  }
}

/** Nunjucks internals used exactly as `Template#_compile` uses them (nunjucks 3.2.4). */
const { compiler: nunjucksCompiler, lib: nunjucksLib } = nunjucks as unknown as {
  compiler: {
    compile(
      source: string,
      asyncFilters: string[],
      extensions: unknown[],
      name: string,
      opts: object,
    ): string;
  };
  lib: { _prettifyError(path: string, withInternals: boolean | undefined, error: unknown): Error };
};

class TrackingLoader extends nunjucks.Loader {
  readonly async = false;

  constructor(
    private readonly scope: string,
    private readonly dependencies: ObservationRecorder,
    private readonly environment: () => nunjucks.Environment,
  ) {
    super();
  }

  getSource(name: string): nunjucks.LoaderSource {
    const source = normalizeAbsolute(name, this.scope);
    // One read: the recorded digest describes exactly the compiled bytes.
    const bytes = this.dependencies.readFile(source);
    if (!bytes) throw new Error(`Template include not found: ${source}`);
    const text = bytes.toString('utf8');
    // `@types/nunjucks` omits the precompiled `{ type: 'code' }` source form.
    return { src: this.compile(source, text) as unknown as string, path: source, noCache: true };
  }

  /**
   * Compiles an included, imported or extended template now, exactly as `Template#_compile`
   * would (with this environment's extensions), and returns it in nunjucks' precompiled form.
   * Nothing is cached: every use is read, recorded and compiled again, as before.
   *
   * A compile error is thrown from here with the error nunjucks itself builds
   * (`(path) [Line, Column]`). Left to nunjucks, the template compiles lazily inside a callback
   * render that reports the error through `asap`: the synchronous render returns `null` and the
   * error escapes later as an uncaught exception. Thrown from the loader, it fails this render
   * synchronously, and each including template prefixes its own path to the message.
   */
  private compile(path: string, text: string): { type: 'code'; obj: object } {
    const environment = this.environment() as unknown as {
      asyncFilters: string[];
      extensionsList: unknown[];
      opts: { dev?: boolean };
    };
    try {
      return {
        type: 'code',
        obj: new Function( // eslint-disable-line no-new-func
          nunjucksCompiler.compile(
            text,
            environment.asyncFilters,
            environment.extensionsList,
            path,
            environment.opts,
          ),
        )(),
      };
    } catch (error) {
      throw nunjucksLib._prettifyError(path, environment.opts.dev, error);
    }
  }
}

class NgDocIndexExtension implements nunjucks.Extension {
  readonly tags = ['index'];

  parse(parser: any, nodes: any): any {
    const token = parser.nextToken();
    const args = parser.parseSignature(null, true);
    parser.advanceAfterBlockEnd(token.value);
    const body = parser.parseUntilBlocks('endindex');
    parser.advanceAfterBlockEnd();
    return new nodes.CallExtension(this, 'run', args, [body]);
  }

  run(_context: unknown, index: boolean, body: () => string): nunjucks.runtime.SafeString {
    return new nunjucks.runtime.SafeString(`<div indexable="${index}">${body()}</div>`);
  }
}

type ActionNamespace = 'NgDocActions' | 'NgDocApi' | 'JSDoc';

/** The outcome of one template action: the value it returned or the error it threw. */
type ActionOutcome = { value: JsonValue } | { error: unknown };

/**
 * Runs the template actions of one markdown template render and keeps its time budgets.
 *
 * The template and the page functions it calls are evaluated exactly once, as in the legacy
 * engine. The actions are engine work (a semantic query of a real library can take a second), so
 * their time is not charged to the user code's budget (`templateTimeoutMs`): the user time is the
 * elapsed time minus the time spent in actions. The budget is checked at every action call and
 * when the render ends. V8's watchdog can only count wall time, and it cannot be paused while an
 * action runs, so the render runs under the wall-clock cap (`templateWallTimeoutMs`) instead: it is
 * what stops user code that never calls an action, or that catches the failure of one.
 *
 * Every failure is sticky: once the budget or the call limit is exceeded, every later call throws
 * again and the render fails, even when user code caught the error.
 *
 * Outcomes are memoized by action and arguments for the render: a repeated call returns the first
 * call's outcome without running the action again. The action recorded its dependencies and
 * diagnostics into the render the first time, and it reads the same generation's program and
 * files, so a repeat would record the same ones. The key keeps the arguments' key order, which the
 * output of some actions keeps too (the options of `NgDocActions.demo`).
 */
class TemplateActionMeter {
  private readonly started = performance.now();
  /** Milliseconds spent inside actions. */
  private actionTime = 0;
  private calls = 0;
  /** Set while an action runs; still set after V8 terminated the render inside the action. */
  private running: string | undefined;
  private failure: Error | undefined;
  private readonly outcomes = new Map<string, ActionOutcome>();

  constructor(
    private readonly actions: TemplateActions,
    private readonly budgetMs: number,
    private readonly wallMs: number,
    private readonly limit: number,
  ) {}

  /**
   * One template action call.
   * @param namespace The template global the call reads.
   * @param name The action's name.
   * @param args The call's arguments (JSON only).
   */
  call(namespace: ActionNamespace, name: string, args: unknown[]): JsonValue {
    this.check();
    if (++this.calls > this.limit)
      throw this.fail(
        new Error(
          `The template made more than ${this.limit} template action calls (NgDocActions, ` +
            'NgDocApi, JSDoc) in one render; it probably loops over them without end.',
        ),
      );
    const jsonArgs = args.map((arg) => assertJson(arg));
    const key = JSON.stringify([namespace, name, jsonArgs]);
    let outcome = this.outcomes.get(key);
    if (!outcome) {
      const start = performance.now();
      this.running = `${namespace}.${name}`;
      try {
        outcome = { value: this.actions.invoke(namespace, name, jsonArgs) };
      } catch (error) {
        outcome = { error };
      }
      this.running = undefined;
      this.actionTime += performance.now() - start;
      this.outcomes.set(key, outcome);
    }
    if ('error' in outcome) throw outcome.error;
    return outcome.value;
  }

  /**
   * Runs the render and settles its budgets: a sticky failure or an exceeded budget fails it. A
   * watchdog termination names the wall-clock cap that stopped the render, and also the user-time
   * budget when the template's own code had already used it up, so the message states the limit
   * that was actually reached rather than one the render never waited for.
   * @param render The render, under the wall-clock watchdog.
   */
  measure(render: () => string): string {
    let value: string;
    try {
      value = render();
    } catch (error) {
      if (this.failure) throw this.failure;
      if (!isWatchdogTermination(error)) throw error;
      if (this.running)
        throw new Error(
          `Template evaluation exceeded its ${this.wallMs}ms wall-clock cap inside the template ` +
            `action ${this.running}.`,
        );
      // Terminated in user code. The watchdog only counts wall time, so it fires at the cap even
      // when the user code ran past its budget long before: name both limits then.
      throw new Error(
        `Template evaluation was stopped at its ${this.wallMs}ms wall-clock cap` +
          (this.userTime() > this.budgetMs
            ? `; the template and page code had exceeded its ${this.budgetMs}ms time budget.`
            : ', template actions included.'),
      );
    }
    this.check();
    return value;
  }

  private check(): void {
    if (this.failure) throw this.failure;
    if (this.userTime() > this.budgetMs) throw this.fail(budgetExceeded(this.budgetMs));
  }

  private userTime(): number {
    return performance.now() - this.started - this.actionTime;
  }

  private fail(error: Error): Error {
    this.failure = error;
    return error;
  }
}

/**
 * The failure of user template code that used up its user-time budget, found at an action call
 * or when the render ends (before the wall-clock cap stopped it).
 * @param budgetMs The budget.
 */
function budgetExceeded(budgetMs: number): Error {
  return new Error(
    `Template evaluation exceeded its ${budgetMs}ms time budget for the template and page code ` +
      '(time spent in the template actions NgDocActions, NgDocApi and JSDoc is not counted).',
  );
}

/**
 * Whether `error` is V8's termination of a `vm` script that reached its timeout.
 * @param error What the render threw.
 */
function isWatchdogTermination(error: unknown): boolean {
  // Not `instanceof Error`: V8 creates it in the context's realm.
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
  );
}

/**
 * The template global of one action namespace: each property is an action the meter runs.
 * @param namespace The global's name.
 * @param meter The render's action meter.
 */
function createActionProxy(namespace: ActionNamespace, meter: TemplateActionMeter): object {
  return new Proxy(
    {},
    {
      get:
        (_target, property) =>
        (...args: unknown[]) =>
          meter.call(namespace, String(property), args),
    },
  );
}

function assertJson(value: unknown): JsonValue {
  try {
    return jsonData(value, false) as JsonValue;
  } catch (cause) {
    throw new TypeError('Template action argument is not JSON-safe.', { cause });
  }
}

function locateConfig(
  request: DiscoveryRequest,
  workspaceRoot: string,
  dependencies: ObservationRecorder,
): string | undefined {
  if (request.configFile) {
    const explicit = normalizeAbsolute(request.configFile, workspaceRoot);
    dependencies.observeFile(explicit);
    return existsSync(explicit) ? explicit : undefined;
  }
  let directory = path.dirname(normalizeAbsolute(request.defaults.docsRoot, workspaceRoot));
  const root = path.parse(directory).root;
  while (true) {
    for (const name of [
      'ng-doc.config.ts',
      'ng-doc.config.js',
      'ng-doc.config.mjs',
      'ng-doc.config.cjs',
    ]) {
      const candidate = path.join(directory, name);
      if (dependencies.observeFile(candidate)) return normalizePath(candidate);
    }
    if (directory === workspaceRoot || directory === root || !isWithin(workspaceRoot, directory))
      break;
    directory = path.dirname(directory);
  }
  return undefined;
}

/**
 * The description files under the docs roots. Their membership (the glob) is a configuration
 * input; each member's bytes are read into `members` only, and belong to that entry's closure.
 * @param roots
 * @param membership
 * @param members
 */
function scanDescriptions(roots: string[], dependencies: ObservationRecorder): string[] {
  const files = new Set<string>();
  for (const root of roots) {
    const found = fg
      .sync(DESCRIPTION_FILES, {
        cwd: root,
        absolute: true,
        dot: true,
        onlyFiles: true,
        unique: true,
      })
      .map((member) => normalizeAbsolute(member))
      .sort();
    dependencies.add({
      kind: 'glob',
      root,
      include: DESCRIPTION_FILES,
      exclude: [],
      members: found,
    });
    for (const member of found) {
      dependencies.observeFile(member);
      files.add(member);
    }
  }
  return [...files].sort();
}

async function evaluateModules(
  workspaceRoot: string,
  tsConfig: string,
  configFile: string | undefined,
  descriptions: string[],
  dependencies: ObservationRecorder,
  diagnostics: Diagnostic[],
  signal: AbortSignal,
  timeoutMs: number,
): Promise<EvaluatedBundle | undefined> {
  const modules = [
    ...(configFile ? [{ source: configFile, kind: 'config' as const }] : []),
    ...descriptions.map((source) => ({ source, kind: kindFor(source) })),
  ];
  for (const item of modules) {
    if (item.kind !== 'config')
      validateDescriptionSyntax(item.source, diagnostics, dependencies.readText(item.source));
  }
  if (diagnostics.some((item) => item.severity === 'error')) return undefined;
  if (modules.length === 0) return { modules: [], closures: new Map(), bundleDigest: hash('') };
  throwIfAborted(signal);

  const contents = modules
    .map((item, index) => `import value${index} from ${JSON.stringify(item.source)};`)
    .concat(`module.exports = [${modules.map((_item, index) => `value${index}`).join(',')}];`)
    .join('\n');
  let scope: EvaluationScope | undefined;
  const probes = new Map<string, Set<string>>();
  try {
    const result = await esbuild.build({
      stdin: {
        contents,
        loader: 'ts',
        resolveDir: workspaceRoot,
        sourcefile: '__ng_doc_discovery__.ts',
      },
      absWorkingDir: workspaceRoot,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node20',
      write: false,
      metafile: true,
      treeShaking: true,
      tsconfig: normalizeAbsolute(tsConfig, workspaceRoot),
      logLevel: 'silent',
      plugins: [descriptionSanitizer(modules, dependencies, probes)],
    });
    throwIfAborted(signal);
    // The module graph of the bundle: each input and the inputs it imports.
    const inputs = result.metafile?.inputs ?? {};
    const graph = new Map<string, string[]>();
    const inputPath = (input: string): string | undefined =>
      input.startsWith('<') || input === '__ng_doc_discovery__.ts'
        ? undefined
        : normalizeAbsolute(input, workspaceRoot);
    for (const [input, meta] of Object.entries(inputs)) {
      const file = inputPath(input);
      if (!file) continue;
      dependencies.observeFile(file);
      graph.set(
        file,
        meta.imports.flatMap((item) => {
          const target = item.external ? undefined : inputPath(item.path);
          return target ? [target] : [];
        }),
      );
    }
    const closures = new Map<string, string[]>();
    for (const item of modules) {
      if (item.kind === 'config') continue;
      closures.set(item.source, moduleClosure(item.source, graph, probes));
    }
    const output = result.outputFiles[0]?.text;
    if (!output) throw new Error('esbuild produced no discovery evaluator output.');
    scope = new EvaluationScope(workspaceRoot);
    const exported: unknown = scope.evaluate(output, timeoutMs);
    if (!Array.isArray(exported))
      throw new TypeError('Discovery evaluator output is not an array.');
    return {
      modules: modules.map((item, index) => ({
        ...item,
        value: asRecord(exported[index], item.source),
        exportName: 'default',
      })),
      closures,
      bundleDigest: hash(output),
      scope,
    };
  } catch (error) {
    scope?.dispose();
    if (isBuildFailure(error)) {
      for (const issue of error.errors) {
        diagnostics.push({
          code: 'DISCOVERY_MODULE_BUILD_FAILED',
          severity: 'error',
          stage: 'evaluation',
          message: issue.text,
          source: issue.location
            ? {
                path: normalizeAbsolute(issue.location.file, workspaceRoot),
                line: issue.location.line,
                column: issue.location.column + 1,
              }
            : undefined,
        });
      }
      return undefined;
    }
    throw error;
  }
}

function descriptionSanitizer(
  modules: Array<{ source: string; kind: EntryKind | 'config' }>,
  dependencies: ObservationRecorder,
  probes: Map<string, Set<string>>,
): esbuild.Plugin {
  const kinds = new Map(modules.map((item) => [normalizePath(item.source), item.kind]));
  const importers = new Map<string, string>();
  return {
    name: 'ng-doc-description-sanitizer',
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (!path.isAbsolute(args.path) && !/^\.{1,2}\//.test(args.path)) return undefined;
        const target = path.resolve(args.resolveDir, args.path);
        const candidates = observeResolutionCandidates(target, dependencies);
        // Probes belong to the module that imports: they join the closure of every entry that
        // reaches it. The evaluator's own imports of the entries (no file importer) are not
        // attributed: each entry records its own module anyway.
        if (path.isAbsolute(args.importer)) {
          let importer = importers.get(args.importer);
          if (importer === undefined) {
            importer = normalizeAbsolute(args.importer);
            importers.set(args.importer, importer);
          }
          const probed = probes.get(importer) ?? new Set<string>();
          for (const candidate of candidates) probed.add(candidate);
          probes.set(importer, probed);
        }
        return undefined;
      });
      build.onLoad({ filter: /ng-doc\.(page|category)\.ts$/ }, (args) => {
        const source = dependencies.readText(args.path);
        return {
          contents: sanitizeDescription(
            source,
            (kinds.get(normalizePath(args.path)) as EntryKind | undefined) ?? kindFor(args.path),
          ),
          loader: 'ts',
          resolveDir: path.dirname(args.path),
        };
      });
      // Every other script or JSON input is compiled from the bytes the collector recorded, so
      // the digest describes exactly what was evaluated. Other files load natively and are
      // observed after the build, as before.
      build.onLoad({ filter: /\.(?:[cm]?[jt]s|[jt]sx|json)$/, namespace: 'file' }, (args) => {
        if (/\.d\.[cm]?ts$/.test(args.path)) return undefined;
        const contents = dependencies.readFile(args.path);
        if (!contents) return undefined;
        return {
          contents,
          loader: BUNDLE_LOADERS[path.extname(args.path).toLowerCase()] ?? 'js',
          resolveDir: path.dirname(args.path),
        };
      });
    },
  };
}

const BUNDLE_LOADERS: Record<string, esbuild.Loader> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.jsx': 'jsx',
  '.json': 'json',
};

function sanitizeDescription(source: string, kind: EntryKind): string {
  const sourceFile = ts.createSourceFile(
    'description.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const exported = sourceFile.statements.find(ts.isExportAssignment);
  const exportName =
    exported && ts.isIdentifier(exported.expression) ? exported.expression.text : undefined;
  const root = exportName
    ? sourceFile.statements
        .filter(ts.isVariableStatement)
        .flatMap((statement) => [...statement.declarationList.declarations])
        .find(
          (declaration) =>
            ts.isIdentifier(declaration.name) && declaration.name.text === exportName,
        )?.initializer
    : undefined;
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (node === root && ts.isObjectLiteralExpression(node)) {
        const properties = node.properties.flatMap((property) => {
          const name = propertyName(property);
          if (
            (kind === 'guide' && ['imports', 'providers', 'demos'].includes(name ?? '')) ||
            (kind === 'category' && name === 'providers')
          )
            return [];
          if (
            kind === 'guide' &&
            name === 'playgrounds' &&
            ts.isPropertyAssignment(property) &&
            ts.isObjectLiteralExpression(property.initializer)
          ) {
            const playgrounds = property.initializer.properties.flatMap((playground) => {
              if (
                !ts.isPropertyAssignment(playground) ||
                !ts.isObjectLiteralExpression(playground.initializer)
              )
                return [];
              const controls = playground.initializer.properties.filter(
                (item) => propertyName(item) === 'controls',
              );
              return [
                context.factory.updatePropertyAssignment(
                  playground,
                  playground.name,
                  context.factory.updateObjectLiteralExpression(playground.initializer, controls),
                ),
              ];
            });
            return [
              context.factory.updatePropertyAssignment(
                property,
                property.name,
                context.factory.updateObjectLiteralExpression(property.initializer, playgrounds),
              ),
            ];
          }
          if (
            kind === 'guide' &&
            name === 'route' &&
            ts.isPropertyAssignment(property) &&
            ts.isObjectLiteralExpression(property.initializer)
          ) {
            const routeProperties = property.initializer.properties.filter(
              (item) => propertyName(item) === 'path',
            );
            return [
              context.factory.updatePropertyAssignment(
                property,
                property.name,
                context.factory.updateObjectLiteralExpression(
                  property.initializer,
                  routeProperties,
                ),
              ),
            ];
          }
          return [property];
        });
        return context.factory.updateObjectLiteralExpression(node, properties);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
  const transformed = ts.transform(sourceFile, [transformer]);
  try {
    return ts.createPrinter().printFile(transformed.transformed[0] as ts.SourceFile);
  } finally {
    transformed.dispose();
  }
}

function propertyName(property: ts.ObjectLiteralElementLike): string | undefined {
  if (!('name' in property) || !property.name) return undefined;
  return ts.isIdentifier(property.name) ||
    ts.isStringLiteral(property.name) ||
    ts.isNumericLiteral(property.name)
    ? property.name.text
    : undefined;
}

function validateDescriptionSyntax(file: string, diagnostics: Diagnostic[], source: string): void {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const exportAssignment = sourceFile.statements.find(ts.isExportAssignment);
  const identifier =
    exportAssignment && ts.isIdentifier(exportAssignment.expression)
      ? exportAssignment.expression.text
      : undefined;
  const declaration = identifier
    ? sourceFile.statements
        .filter(ts.isVariableStatement)
        .flatMap((statement) => [...statement.declarationList.declarations])
        .find((item) => ts.isIdentifier(item.name) && item.name.text === identifier)
    : undefined;
  if (declaration?.initializer && ts.isObjectLiteralExpression(declaration.initializer)) return;
  const position = sourceFile.getLineAndCharacterOfPosition(
    exportAssignment?.getStart(sourceFile) ?? 0,
  );
  diagnostics.push({
    code: 'DISCOVERY_UNSUPPORTED_DEFAULT_EXPORT',
    severity: 'error',
    stage: 'evaluation',
    message:
      'Descriptions must default-export a named variable initialized with an object literal.',
    source: { path: normalizePath(file), line: position.line + 1, column: position.character + 1 },
  });
}

class EvaluationScope {
  private readonly context: vm.Context;
  private readonly timers = new Set<NodeJS.Timeout | NodeJS.Immediate>();
  private disposed = false;
  private readonly networkAbort = new AbortController();

  constructor(private readonly workspaceRoot: string) {
    const filename = path.join(workspaceRoot, '.ng-doc-discovery-evaluator.cjs');
    const module = { exports: {} as unknown };
    const nativeRequire = createRequire(filename);
    const schedule = (
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      this.assertActive();
      const handle = setTimeout(() => {
        this.timers.delete(handle);
        if (!this.disposed) {
          try {
            this.invoke(() => callback(...args), 1_000);
          } catch {
            // Async user errors are isolated to this owned timer.
          }
        }
      }, delay);
      this.timers.add(handle);
      return handle;
    };
    const cancel = (handle: ReturnType<typeof setTimeout>) => {
      clearTimeout(handle);
      this.timers.delete(handle);
    };
    const scheduleInterval = (
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      this.assertActive();
      const handle = setInterval(() => {
        if (!this.disposed) {
          try {
            this.invoke(() => callback(...args), 1_000);
          } catch {
            // Async user errors are isolated to this owned timer.
          }
        }
      }, delay);
      this.timers.add(handle);
      return handle;
    };
    const scheduleImmediate = (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
      this.assertActive();
      const handle = setImmediate(() => {
        this.timers.delete(handle);
        if (!this.disposed) {
          try {
            this.invoke(() => callback(...args), 1_000);
          } catch {
            // Async user errors are isolated to this owned timer.
          }
        }
      });
      this.timers.add(handle);
      return handle;
    };
    this.context = vm.createContext({
      console,
      Buffer,
      process,
      URL,
      URLSearchParams,
      Headers,
      Request,
      Response,
      AbortController,
      AbortSignal,
      fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            this.networkAbort.signal,
            ...(init?.signal ? [init.signal] : input instanceof Request ? [input.signal] : []),
          ]),
        }),
      module,
      exports: module.exports,
      require: nativeRequire,
      __filename: filename,
      __dirname: workspaceRoot,
      setTimeout: schedule,
      clearTimeout: cancel,
      setInterval: scheduleInterval,
      clearInterval: cancel,
      setImmediate: scheduleImmediate,
      clearImmediate: cancel,
    });
    new vm.Script('globalThis.global = globalThis').runInContext(this.context);
  }

  evaluate(code: string, timeoutMs: number): unknown {
    this.assertActive();
    new vm.Script(code, {
      filename: path.join(this.workspaceRoot, '.ng-doc-discovery-evaluator.cjs'),
    }).runInContext(this.context, { timeout: timeoutMs });
    return (this.context.module as { exports: unknown }).exports;
  }

  invoke<T>(callback: () => T, timeoutMs: number): T {
    this.assertActive();
    this.context.__ngDocInvoke = callback;
    try {
      return new vm.Script('__ngDocInvoke()').runInContext(this.context, {
        timeout: timeoutMs,
      }) as T;
    } finally {
      delete this.context.__ngDocInvoke;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.networkAbort.abort();
    for (const handle of this.timers) {
      clearTimeout(handle as NodeJS.Timeout);
      clearImmediate(handle as NodeJS.Immediate);
    }
    this.timers.clear();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('The discovery evaluation scope has been disposed.');
  }
}

async function normalizeConfiguration(
  request: DiscoveryRequest,
  workspaceRoot: string,
  configFile: string | undefined,
  raw: RawConfiguration,
  dependencies: ObservationRecorder,
  options: Required<Omit<DiscoveryOptions, 'tags'>>,
  signal: AbortSignal,
  scope: EvaluationScope | undefined,
  buildTags: { tags: string[]; active: string[] },
): Promise<{
  configuration?: GeneratorConfiguration;
  globalKeywords: KeywordExport[];
  remoteKeywords: RemoteKeywordSnapshot[];
  diagnostics: Diagnostic[];
}> {
  const diagnostics: Diagnostic[] = [];
  const globalKeywords = normalizeKeywords(
    validGlobalKeywords(raw.keywords?.keywords ?? {}, configFile ?? workspaceRoot, diagnostics),
  );
  const shikiLangs = shikiLanguages(raw.shiki?.langs, configFile ?? workspaceRoot, diagnostics);
  const remoteKeywords: RemoteKeywordSnapshot[] = [];
  const executables: ExecutableProvenance[] = [];
  const loaders = raw.keywords?.loaders ?? [];
  const pinned = new Map(
    (request.pinnedRemoteKeywords ?? []).map((item) => [item.loaderId, item] as const),
  );
  for (const [index, loader] of loaders.entries()) {
    throwIfAborted(signal);
    const loaderId = `config-loader:${index}:${loader.name || 'anonymous'}`;
    try {
      // A pinned loader is not invoked: its last result stands in for it. Its provenance is
      // recorded as for an invoked one, so the configuration does not depend on the pin.
      const kept = pinned.get(loaderId);
      if (kept) remoteKeywords.push(kept);
      else {
        const pending = scope ? scope.invoke(() => loader(), options.moduleTimeoutMs) : loader();
        const keywords = normalizeKeywords(
          await awaitWithLimits(pending, signal, options.loaderTimeoutMs),
        );
        const digest = digestOf(keywords);
        remoteKeywords.push({ loaderId, digest, keywords });
      }
      executables.push({
        id: loaderId,
        source: { path: configFile ?? workspaceRoot },
        exportName: loader.name || 'anonymous',
        inputDigest: digestDependencies(dependencies.all()),
        policy: 'evaluate-each-generation',
      });
    } catch (error) {
      const aborted =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        String((error as { name: unknown }).name) === 'AbortError';
      diagnostics.push({
        code: aborted ? 'DISCOVERY_ABORTED' : 'DISCOVERY_KEYWORD_LOADER_FAILED',
        severity: 'error',
        stage: 'evaluation',
        message: aborted ? errorMessage(error) : `${loaderId} failed: ${errorMessage(error)}`,
        source: { path: configFile ?? workspaceRoot },
      });
    }
  }
  if (diagnostics.some((item) => item.severity === 'error')) {
    return { globalKeywords, remoteKeywords, diagnostics };
  }
  const docsRoots = asArray(raw.docsPath ?? request.defaults.docsRoot).map((value) =>
    normalizeAbsolute(String(value), workspaceRoot),
  );
  const headerTemplate = raw.guide?.headerTemplate
    ? normalizeAbsolute(raw.guide.headerTemplate, workspaceRoot)
    : undefined;
  if (headerTemplate) dependencies.observeFile(headerTemplate);
  const withoutDigest = {
    projectId: request.projectId,
    workspaceRoot,
    docsRoots,
    tsConfig: normalizeAbsolute(raw.tsConfig ?? request.defaults.tsConfig, workspaceRoot),
    outputRoot:
      raw.outDir === undefined
        ? normalizeAbsolute(request.defaults.outputRoot, workspaceRoot)
        : normalizeAbsolute(path.join(workspaceRoot, raw.outDir, 'ng-doc', request.projectId)),
    cacheRoot: normalizeAbsolute(request.defaults.cacheRoot, workspaceRoot),
    routePrefix: normalizeRoute(raw.routePrefix ?? ''),
    guideDirectory: 'guides',
    apiDirectory: 'api',
    assetDirectory: 'assets',
    inlineStyleLanguage: options.inlineStyleLanguage,
    anchorHeadings: raw.guide?.anchorHeadings ?? options.defaultAnchorHeadings,
    headerTemplate,
    ...(raw.api?.protectedMembers === false ? { apiProtectedMembers: false as const } : {}),
    themes: {
      light: raw.shiki?.themes?.light ?? options.defaultThemes.light,
      dark: raw.shiki?.themes?.dark ?? options.defaultThemes.dark,
    },
    ...(shikiLangs.length ? { shikiLangs } : {}),
    repo: raw.repoConfig
      ? {
          url: raw.repoConfig.url,
          platform: raw.repoConfig.platform ?? ('github' as const),
          mainBranch: raw.repoConfig.mainBranch,
          releaseBranch: raw.repoConfig.releaseBranch,
        }
      : undefined,
    cacheEnabled: raw.cache ?? true,
    tags: buildTags.tags,
    executables,
  };
  // Only the tags that some `onlyForTags` names select entries, so only they enter the digest: a
  // tag change that selects other entries changes it (a FULL generation), one that selects the
  // same entries keeps it (and the artifact cache). Without active tags the digest is exactly the
  // digest of a configuration without tags.
  const digestSettings = {
    ...withoutDigest,
    tags: buildTags.active.length ? buildTags.active : undefined,
  };
  const configuration: GeneratorConfiguration = {
    ...withoutDigest,
    digest: digestOf({ settings: digestSettings, inputs: digestDependencies(dependencies.all()) }),
  };
  return { configuration, globalKeywords, remoteKeywords, diagnostics };
}

function describeEntries(
  projectId: string,
  workspaceRoot: string,
  routePrefix: string,
  modules: Array<EvaluatedModule & { kind: EntryKind }>,
  closures: ReadonlyMap<string, string[]>,
  allDependencies: ObservationRecorder,
  diagnostics: Diagnostic[],
  tags: ReadonlySet<string>,
): { entries: EntryDescriptor[]; liveEntries: Map<string, LiveRecord>; filtered: FilteredEntry[] } {
  const moduleByObject = new Map<LiveRecord, EvaluatedModule & { kind: EntryKind }>();
  for (const item of modules) moduleByObject.set(item.value, item);
  const idBySource = new Map<string, string>();
  for (const item of modules) {
    const relative = path.relative(workspaceRoot, item.source);
    if (!isWithin(workspaceRoot, item.source)) {
      diagnostics.push({
        code: 'DISCOVERY_SOURCE_OUTSIDE_WORKSPACE',
        severity: 'error',
        stage: 'discovery',
        message: `Description resolves outside the workspace: ${item.source}.`,
        source: { path: item.source },
      });
    } else {
      idBySource.set(item.source, stableId(projectId, item.kind, normalizePath(relative)));
    }
  }
  if (diagnostics.some((item) => item.severity === 'error')) {
    return { entries: [], liveEntries: new Map(), filtered: [] };
  }
  const liveEntries = new Map<string, LiveRecord>();
  const entries: EntryDescriptor[] = [];
  const filtered = new Map<string, FilteredEntry>();
  // Records a left-out entry once (parents are described once per child). Its guide keywords are
  // read only so that a link to one can name it; the reads are recorded like any other input.
  const exclude = (
    module: EvaluatedModule & { kind: EntryKind },
    parentRoute: string,
    filteredBy: FilteredEntry['filteredBy'],
    onlyForTags: string[] | undefined,
  ): Excluded => {
    const entry = module.value;
    const absoluteRoute = joinRoute(parentRoute, entryRoute(module.kind, entry, module.source));
    if (!filtered.has(module.source)) {
      filtered.set(module.source, {
        kind: module.kind,
        title: typeof entry.title === 'string' ? entry.title : '',
        source: module.source,
        absoluteRoute,
        ...(onlyForTags ? { onlyForTags } : {}),
        filteredBy,
        ...(module.kind === 'guide'
          ? guideKeywords(entry.mdFile, module.source, allDependencies)
          : {}),
      });
    }
    return { excluded: true, absoluteRoute, filteredBy };
  };

  const describe = (
    module: EvaluatedModule & { kind: EntryKind },
    stack: Set<string>,
  ): EntryDescriptor | Excluded | undefined => {
    if (stack.has(module.source)) {
      diagnostics.push({
        code: 'DISCOVERY_CATEGORY_CYCLE',
        severity: 'error',
        stage: 'discovery',
        message: `Category cycle at ${module.source}.`,
        source: { path: module.source },
      });
      return undefined;
    }
    const entry = module.value;
    // `onlyForTags`: a filtered entry, and everything under a filtered category, is left out as if
    // it did not exist: no descriptor, live entry or validation. Only a `FilteredEntry` record
    // remains, so that diagnostics and acceptance checks can name it.
    const onlyForTags = entryOnlyForTags(module);
    if (typeof onlyForTags === 'string') {
      diagnostics.push({
        code: 'DISCOVERY_INVALID_ENTRY',
        severity: 'error',
        stage: 'discovery',
        message: onlyForTags,
        source: { path: module.source },
      });
      return undefined;
    }
    const ownFilter =
      onlyForTags && !onlyForTags.some((tag) => tags.has(tag))
        ? {
            title: typeof entry.title === 'string' ? entry.title : '',
            source: module.source,
            onlyForTags,
          }
        : undefined;
    const parentModule =
      entry.category && typeof entry.category === 'object'
        ? moduleByObject.get(entry.category as LiveRecord)
        : undefined;
    if (entry.category && !parentModule) {
      if (ownFilter) return exclude(module, routePrefix, ownFilter, onlyForTags);
      diagnostics.push({
        code: 'DISCOVERY_CATEGORY_SOURCE_MISSING',
        severity: 'error',
        stage: 'discovery',
        message: 'The imported category is outside the discovered docs roots.',
        source: { path: module.source },
      });
      return undefined;
    }
    const described = parentModule
      ? describe(parentModule, new Set([...stack, module.source]))
      : undefined;
    if (described && 'excluded' in described) {
      const filteredBy = ownFilter ?? described.filteredBy;
      return exclude(module, described.absoluteRoute, filteredBy, onlyForTags);
    }
    if (ownFilter) {
      return exclude(module, described?.absoluteRoute ?? routePrefix, ownFilter, onlyForTags);
    }
    const parent = described;
    if (typeof entry.title !== 'string' || entry.title.length === 0) {
      diagnostics.push({
        code: 'DISCOVERY_INVALID_ENTRY',
        severity: 'error',
        stage: 'discovery',
        message: 'Entry title must be a non-empty string.',
        source: { path: module.source },
      });
      return undefined;
    }
    const route = entryRoute(module.kind, entry, module.source);
    const id = idBySource.get(module.source) as string;
    const runtimeImport: RuntimeImport = { source: module.source, exportName: module.exportName };
    const common = {
      id,
      source: { path: module.source },
      title: entry.title,
      route,
      absoluteRoute: joinRoute(parent?.absoluteRoute ?? routePrefix, route),
      breadcrumbs: [...(parent?.breadcrumbs ?? []), entry.title],
      parentId: parent?.id,
      order: numberValue(entry.order),
      hidden: booleanValue(entry.hidden),
      runtimeImport,
      dependencies: [] as Dependency[],
    };
    liveEntries.set(id, entry);
    if (module.kind === 'guide') {
      const markdown = asArray(entry.mdFile).map((file) =>
        normalizeAbsolute(String(file), path.dirname(module.source)),
      );
      for (const file of markdown) allDependencies.observeFile(file);
      return {
        ...common,
        dependencies: dependenciesForEntry(allDependencies.all(), module.source, [
          ...(closures.get(module.source) ?? []),
          ...markdown,
        ]),
        kind: 'guide',
        markdown,
        hasImports: sourceHasProperty(
          allDependencies.readText(module.source),
          module.source,
          'imports',
        ),
      } satisfies GuideDescriptor;
    }
    if (module.kind === 'category') {
      return {
        ...common,
        dependencies: dependenciesForEntry(
          allDependencies.all(),
          module.source,
          closures.get(module.source),
        ),
        kind: 'category',
        expandable: booleanValue(entry.expandable),
        expanded: booleanValue(entry.expanded),
      } satisfies CategoryDescriptor;
    }
    const scopesValue = Array.isArray(entry.scopes) ? entry.scopes : [];
    const scopes = scopesValue.map((scope) => {
      const value = asRecord(scope, module.source);
      const scopeRoute = normalizeRoute(String(value.route ?? ''));
      return {
        id: `${id}:scope:${scopeRoute}`,
        name: String(value.name ?? ''),
        route: scopeRoute,
        order: numberValue(value.order),
        include: asArray(value.include).map(String),
        exclude: asArray(value.exclude).map(String),
      };
    });
    return {
      ...common,
      dependencies: dependenciesForEntry(
        allDependencies.all(),
        module.source,
        closures.get(module.source),
      ),
      kind: 'api',
      keyword: stringValue(entry.keyword),
      assetRoute: normalizeRoute(typeof entry.route === 'string' ? entry.route : ''),
      scopes,
    } satisfies ApiDescriptor;
  };

  for (const module of modules) {
    const descriptor = describe(module, new Set());
    if (
      descriptor &&
      !('excluded' in descriptor) &&
      !entries.some((item) => item.id === descriptor.id)
    )
      entries.push(descriptor);
  }
  entries.sort((left, right) => compareText(left.source.path, right.source.path));
  return {
    entries,
    liveEntries,
    filtered: [...filtered.values()].sort((left, right) => compareText(left.source, right.source)),
  };
}

/** An entry that `onlyForTags` leaves out, directly or through its category. */
interface Excluded {
  excluded: true;
  absoluteRoute: string;
  filteredBy: FilteredEntry['filteredBy'];
}

/**
 * The `*Key` guide keywords a left-out guide's markdown front matter declares (unreadable or
 * invalid files have none: this only improves a diagnostic).
 * @param mdFile
 * @param source
 * @param dependencies
 */
function guideKeywords(
  mdFile: unknown,
  source: string,
  dependencies: ObservationRecorder,
): { keywords?: string[] } {
  const keywords = new Set<string>();
  for (const file of asArray(mdFile)) {
    try {
      const text = dependencies.readFile(normalizeAbsolute(String(file), path.dirname(source)));
      const keyword = text ? matter(text.toString('utf8')).data.keyword : undefined;
      if (typeof keyword === 'string' && keyword) keywords.add(`*${keyword}`);
    } catch {
      // A broken front matter of an entry that does not exist in this build is not an error.
    }
  }
  return keywords.size ? { keywords: [...keywords].sort() } : {};
}

/**
 * The host build tags, trimmed, unique and sorted; the message when they are not strings.
 * @param value
 */
function normalizeBuildTags(value: unknown): string[] | { invalid: string } {
  if (value === undefined) return [];
  const tags = Array.isArray(value) ? value : undefined;
  if (!tags || tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.includes('\0'))) {
    return { invalid: 'Build tags must be an array of non-empty strings.' };
  }
  return [...new Set(tags.map((tag: string) => tag.trim()))].sort();
}

/**
 * The trimmed `onlyForTags` of a page or category (a single string counts as one tag, as in the
 * legacy engine); undefined when it declares none (or `null`/`''`); the message when the value
 * is invalid. API descriptions have no `onlyForTags`; they follow their category.
 * @param module
 */
function entryOnlyForTags(
  module: EvaluatedModule & { kind: EntryKind },
): string[] | string | undefined {
  const value = module.value.onlyForTags;
  // `null` and `''` mean "no filter", as the legacy engine's truthiness check did; `[]` hides.
  if (module.kind === 'api' || value === undefined || value === null || value === '')
    return undefined;
  const tags = Array.isArray(value) ? value : [value];
  if (tags.some((tag) => typeof tag !== 'string'))
    return 'onlyForTags must be a string or an array of strings.';
  return tags.map((tag: string) => tag.trim());
}

/**
 * The build tags that some page or category names in `onlyForTags`: exactly the tags that decide
 * which entries are kept.
 * @param tags
 * @param modules
 */
function activeBuildTags(
  tags: string[],
  modules: Array<EvaluatedModule & { kind: EntryKind }>,
): string[] {
  const named = new Set<string>();
  for (const module of modules) {
    const onlyForTags = entryOnlyForTags(module);
    if (Array.isArray(onlyForTags)) for (const tag of onlyForTags) named.add(tag);
  }
  return tags.filter((tag) => named.has(tag));
}

/**
 * The entries of `keywords.keywords` that have a url. A JavaScript configuration is not
 * type-checked, so an entry without one is reported and left out instead of failing later.
 */
function validGlobalKeywords(
  value: Record<string, RawKeyword>,
  source: string,
  diagnostics: Diagnostic[],
): Record<string, RawKeyword> {
  const valid: Record<string, RawKeyword> = {};
  for (const [key, keyword] of Object.entries(value).sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    const url: unknown = (keyword as Partial<RawKeyword> | null | undefined)?.url;
    if (typeof url === 'string' && url.trim()) valid[key] = keyword;
    else
      diagnostics.push({
        code: 'DISCOVERY_KEYWORD_INVALID',
        severity: 'warning',
        stage: 'evaluation',
        message: `Keyword ${key} of keywords.keywords has no url; it is left out.`,
        source: { path: source },
      });
  }
  return valid;
}

/**
 * The language registrations of `shiki.langs`, flattened one level (a module of `@shikijs/langs`
 * exports an array of them) and copied as plain JSON, which the highlight cache keys and render
 * threads receive. Anything else, such as a function or a promise, fails the configuration.
 */
function shikiLanguages(
  value: unknown,
  source: string,
  diagnostics: Diagnostic[],
): ShikiLanguage[] {
  if (value === undefined) return [];
  const invalid = (message: string): ShikiLanguage[] => {
    diagnostics.push({
      code: 'DISCOVERY_SHIKI_LANGUAGE_INVALID',
      severity: 'error',
      stage: 'evaluation',
      message,
      source: { path: source },
    });
    return [];
  };
  if (!Array.isArray(value))
    return invalid('shiki.langs must be an array of Shiki language registrations.');
  const languages: ShikiLanguage[] = [];
  for (const [index, entry] of value.entries()) {
    for (const item of Array.isArray(entry) ? (entry as unknown[]) : [entry]) {
      const json = plainJson(item, 0);
      if (
        !json ||
        typeof json !== 'object' ||
        Array.isArray(json) ||
        typeof json['name'] !== 'string' ||
        !json['name'] ||
        typeof json['scopeName'] !== 'string' ||
        !json['scopeName']
      )
        return invalid(
          `shiki.langs[${index}] is not a Shiki language registration: plain JSON data with a ` +
            'name and a scopeName. Import the grammar instead of passing a function or a promise.',
        );
      languages.push(json as ShikiLanguage);
    }
  }
  return languages;
}

/**
 * A copy of `value` when it is plain JSON data, or undefined. The configuration is evaluated in
 * its own realm, so a plain object is recognized by the shape of its prototype chain.
 */
function plainJson(value: unknown, depth: number): JsonValue | undefined {
  // Deeper than any grammar nests: a cycle.
  if (depth > 256) return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const copy: JsonValue[] = [];
    for (const item of value) {
      const json = plainJson(item, depth + 1);
      if (json === undefined) return undefined;
      copy.push(json);
    }
    return copy;
  }
  if (typeof value !== 'object') return undefined;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (
    (prototype !== null && Object.getPrototypeOf(prototype) !== null) ||
    Object.prototype.toString.call(value) !== '[object Object]'
  )
    return undefined;
  const copy: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const json = plainJson(item, depth + 1);
    if (json === undefined) return undefined;
    copy[key] = json;
  }
  return copy;
}

function normalizeKeywords(value: Record<string, RawKeyword>): KeywordExport[] {
  return Object.entries(value)
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([key, keyword]) => ({
      key,
      title: keyword.title ?? key,
      path: keyword.url,
      type: keyword.type,
      languages: keyword.languages,
      description: keyword.description,
    }));
}

function observeResolutionCandidates(target: string, dependencies: ObservationRecorder): string[] {
  const extension = path.extname(target);
  const candidates = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'].includes(extension)
    ? [target]
    : [
        target,
        ...['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'].map((suffix) => `${target}${suffix}`),
        ...['.ts', '.tsx', '.js', '.mjs', '.cjs'].map((suffix) =>
          path.join(target, `index${suffix}`),
        ),
      ];
  for (const candidate of candidates)
    dependencies.add({
      kind: 'existence',
      path: normalizePath(candidate),
      exists: existsSync(candidate),
    });
  return candidates.map(normalizePath);
}

function kindFor(file: string): EntryKind {
  const basename = path.basename(file) as 'ng-doc.page.ts' | 'ng-doc.category.ts' | 'ng-doc.api.ts';
  const kind = ENTRY_KIND.get(basename);
  if (!kind) throw new Error(`Unsupported description filename: ${file}`);
  return kind;
}

function entryRoute(kind: EntryKind, entry: LiveRecord, source: string): string {
  const route = entry.route;
  if (kind === 'guide') {
    if (typeof route === 'object' && route !== null)
      return normalizeRoute(
        String((route as LiveRecord).path ?? path.basename(path.dirname(source))),
      );
    return normalizeRoute(String(route ?? path.basename(path.dirname(source))));
  }
  if (kind === 'api') return normalizeRoute(String(route ?? 'api'));
  return normalizeRoute(String(route ?? path.basename(path.dirname(source))));
}

function stableId(projectId: string, kind: EntryKind, relativeSource: string): string {
  return `${projectId}:${kind}:${hash(relativeSource).slice(0, 16)}`;
}

function digestDependencies(dependencies: Dependency[]): string {
  return digestOf(
    dependencies.filter(
      (item) => item.kind === 'content' || item.kind === 'existence' || item.kind === 'glob',
    ),
  );
}

function normalizeAbsolute(value: string, base?: string): string {
  const absolute = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(base ?? process.cwd(), value);
  if (existsSync(absolute)) return normalizePath(realpathSync.native(absolute));
  const existingParent = nearestExistingParent(path.dirname(absolute));
  const canonicalParent = realpathSync.native(existingParent);
  return normalizePath(path.join(canonicalParent, path.relative(existingParent, absolute)));
}

function nearestExistingParent(value: string): string {
  let current = value;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function normalizePath(value: string): string {
  return value.replaceAll(path.sep, '/');
}

function normalizeRoute(value: string): string {
  return value.replaceAll('\\', '/').split('/').filter(Boolean).join('/');
}

function joinRoute(...values: string[]): string {
  return values
    .flatMap((value) => normalizeRoute(value).split('/'))
    .filter(Boolean)
    .join('/');
}

function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown, source: string): LiveRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Default export in ${source} must be an object.`);
  }
  return value as LiveRecord;
}

function recordOrEmpty(value: unknown): LiveRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as LiveRecord)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function sourceHasProperty(source: string, file: string, property: string): boolean {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .some(
      (declaration) =>
        declaration.initializer !== undefined &&
        ts.isObjectLiteralExpression(declaration.initializer) &&
        declaration.initializer.properties.some((item) => propertyName(item) === property),
    );
}

/**
 * The closure of one entry module in the bundle's import graph, with the resolution probes of
 * every module in it.
 * @param source
 * @param graph
 * @param probes
 */
function moduleClosure(
  source: string,
  graph: ReadonlyMap<string, string[]>,
  probes: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const reached = new Set<string>([source]);
  const pending = [source];
  while (pending.length) {
    const file = pending.pop() as string;
    for (const target of graph.get(file) ?? [])
      if (!reached.has(target)) {
        reached.add(target);
        pending.push(target);
      }
  }
  const files = new Set(reached);
  for (const file of reached) for (const probe of probes.get(file) ?? []) files.add(probe);
  return [...files].sort();
}

/**
 * The digest of one entry's evaluated default export (as sanitized for discovery) and its live
 * guide values: what templates (`NgDocPage`) and the semantic service (`readGuideValues`) read
 * besides the entry's descriptor. It is compared, never a path: a module's shared state that
 * another entry's module mutates, or a file a module reads itself, shows up here and nowhere else.
 *
 * A repeated reference is digested as the path of its first occurrence. A function (a class
 * included) is digested as its source text and its own properties, but what it returns when a
 * template calls it can depend on any state it closes over, which any module of the bundle may
 * mutate: a value that holds a function is therefore also keyed by the whole bundle's code, like an
 * unattested one. A value that cannot be canonicalized without running user code or
 * losing what a template could read (an accessor, a proxy, a symbol value, a native or bound
 * function, any object other than a plain object, array, `Date` or `RegExp`) leaves the entry
 * unattested: its digest is then the whole bundle's, so it changes whenever any evaluated code
 * does.
 * @param value
 * @param guideValues
 * @param bundleDigest
 */
function evaluatedDigest(
  value: LiveRecord | undefined,
  guideValues: ServiceResult<JsonValue> | undefined,
  bundleDigest: string,
): string {
  const guide = guideValues
    ? { value: guideValues.value ?? null, diagnostics: guideValues.diagnostics }
    : null;
  try {
    const canonical = canonicalValue(value);
    return digestOf({
      value: canonical.value,
      guide,
      ...(canonical.functions ? { bundle: bundleDigest } : {}),
    });
  } catch (error) {
    if (!(error instanceof Unattested)) throw error;
    return digestOf({ unattested: error.message, bundle: bundleDigest, guide });
  }
}

class Unattested extends Error {}

const NO_KEYS: ReadonlySet<string> = new Set();
const ARRAY_KEYS: ReadonlySet<string> = new Set(['length']);
/** What every function has; `caller` and `arguments` are accessors of sloppy-mode functions. */
const FUNCTION_KEYS: ReadonlySet<string> = new Set([
  'length',
  'name',
  'prototype',
  'caller',
  'arguments',
]);

/** The canonical form of a live value, and whether it holds a function. */
function canonicalValue(root: unknown): { value: unknown; functions: boolean } {
  const seen = new Map<object, string>();
  let functions = false;
  const visit = (value: unknown, at: string): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number')
      return Number.isFinite(value) ? value : { $number: String(value) };
    if (value === undefined) return { $undefined: true };
    if (typeof value === 'bigint') return { $bigint: value.toString() };
    if (typeof value === 'symbol') throw new Unattested(`symbol at ${at}`);
    const object = value as object;
    const first = seen.get(object);
    if (first !== undefined) return { $ref: first };
    seen.set(object, at);
    if (nodeTypes.isProxy(object)) throw new Unattested(`proxy at ${at}`);
    if (typeof value === 'function') {
      const source = Function.prototype.toString.call(value);
      if (/\{\s*\[native code\]\s*\}$/.test(source))
        throw new Unattested(`native or bound function at ${at}`);
      functions = true;
      // Its own properties too (static members, values assigned to it): a template can read them.
      return { $function: source, fields: fields(value, at, FUNCTION_KEYS) };
    }
    const tag = Object.prototype.toString.call(object);
    if (tag === '[object Date]') return { $date: (object as Date).getTime() };
    if (tag === '[object RegExp]') return { $regexp: String(object) };
    const prototype: unknown = Object.getPrototypeOf(object);
    const array = Array.isArray(object);
    if (
      !array &&
      !(
        tag === '[object Object]' &&
        (prototype === null || Object.getPrototypeOf(prototype) === null)
      )
    )
      throw new Unattested(`${tag} at ${at}`);
    return array
      ? { $array: fields(object, at, ARRAY_KEYS) }
      : { $object: fields(object, at, NO_KEYS) };
  };
  /** Own string-keyed data properties, sorted by key; an accessor leaves the value unattested. */
  const fields = (object: object, at: string, skipped: ReadonlySet<string>) => {
    const result: Array<[string, unknown]> = [];
    for (const key of Reflect.ownKeys(object)) {
      if (typeof key === 'symbol' || skipped.has(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
      if (!('value' in descriptor)) throw new Unattested(`accessor at ${at}.${key}`);
      result.push([key, visit(descriptor.value, `${at}.${key}`)]);
    }
    return result.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  };
  const value = visit(root, '$');
  return { value, functions };
}

/** Dependencies in the order `ObservationRecorder.all()` gives them. */
function sortDependencies(dependencies: Dependency[]): Dependency[] {
  return dependencies
    .map((dependency) => [dependencyIdentity(dependency), dependency] as const)
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([, dependency]) => dependency);
}

/**
 * The `evaluated` digest of every entry of a discovery snapshot: the refresh source of the
 * `evaluated` dependencies a generation recorded against it.
 * @param entries
 */
export function evaluatedDigests(entries: readonly EntryDescriptor[]): Map<string, string> {
  const digests = new Map<string, string>();
  for (const entry of entries)
    for (const dependency of entry.dependencies)
      if (dependency.kind === 'evaluated') digests.set(dependency.entryId, dependency.digest);
  return digests;
}

function dependenciesForEntry(
  all: Dependency[],
  source: string,
  related: string[] = [],
): Dependency[] {
  const paths = new Set([source, ...related]);
  return all.filter((item) => 'path' in item && paths.has(item.path));
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error('Discovery was aborted.');
}

function awaitWithLimits<T>(value: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () =>
      finish(() => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')));
    const timeout = setTimeout(
      () => finish(() => reject(new Error(`Executable loader exceeded ${timeoutMs}ms.`))),
      timeoutMs,
    );
    signal.addEventListener('abort', abort, { once: true });
    value.then(
      (result) => finish(() => resolve(result)),
      (error: unknown) => finish(() => reject(error)),
    );
    if (signal.aborted) abort();
  });
}

/** Omit absent optional object fields; reject data that JSON would silently corrupt. */
function jsonData<T>(value: T, omitOptional: boolean = true): T {
  const active = new Set<object>();
  function visit(input: unknown): unknown {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object' || input === null || active.has(input)) {
      throw new TypeError('Discovery produced a non-JSON value.');
    }
    active.add(input);
    try {
      if (Array.isArray(input)) return Array.from(input, visit);
      if (Object.prototype.toString.call(input) !== '[object Object]') {
        throw new TypeError('Discovery produced a non-JSON object.');
      }
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, item]) => !omitOptional || item !== undefined)
          .map(([key, item]) => [key, visit(item)]),
      );
    } finally {
      active.delete(input);
    }
  }
  return visit(value) as T;
}

function failure<T>(
  dependencies: ObservationRecorder,
  diagnostics: Diagnostic[],
): ServiceResult<T> {
  return { dependencies: dependencies.all(), diagnostics };
}

function toDiagnostic(error: unknown, stage: Diagnostic['stage']): Diagnostic {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : undefined;
  return {
    code: name === 'AbortError' ? 'DISCOVERY_ABORTED' : 'DISCOVERY_EVALUATION_FAILED',
    severity: 'error',
    stage,
    message: errorMessage(error),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isBuildFailure(error: unknown): error is { errors: esbuild.Message[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { errors?: unknown }).errors)
  );
}
