import { type BigIntStats, statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { BuildResult, FileChange, OutputManifest } from '../contracts';
import { contentDigest } from '../kernel/canonical';
import { canonicalDrive } from './paths';

type EventType = 'create' | 'update' | 'delete';

interface Deferred {
  promise: Promise<void>;
  resolved: boolean;
  resolve(): void;
}

export interface PhysicalState {
  digest?: string;
  version: string;
}

interface ManifestFile {
  digest: string;
  role: OutputManifest['files'][number]['role'];
}

interface ExpectedOutput {
  path: string;
  kind: 'shape' | 'update';
  digest?: string;
  blocker: string;
  observed: boolean;
  completed: boolean;
  state: Promise<PhysicalState>;
}

interface Attempt {
  generation: number;
  result: Deferred;
  publication: Deferred;
  superseded: Deferred;
  shapes: Deferred;
  changes: FileChange[];
  events: HostToken[];
  expected: Map<string, ExpectedOutput>;
  resultSeen: boolean;
  resultStatus?: BuildResult['status'];
  publicationStatus?: 'success' | 'failure' | 'skipped' | 'cancelled';
  publicationError?: Error;
  previous?: OutputManifest;
}

interface HostToken {
  id: number;
  path: string;
  type: EventType;
  generated: boolean;
  sourceKind: 'plain' | 'typescript' | 'resource';
  observation: Promise<PhysicalState>;
  claimed: Deferred;
  attempt?: Attempt;
  expected?: ExpectedOutput;
  /**
   * A report of an output its generation already completed, with the same physical file (a
   * watcher that reports one write twice under load): announced with that generation, and
   * obliging nothing.
   */
  repeat?: boolean;
  postObserved: boolean;
  isClaimed: boolean;
}

export interface HostUpdateTicket {
  readonly ready: Promise<void>;
  readonly token: object;
}

export interface InitialCompilationInventory {
  readonly files: ReadonlyArray<{ path: string; digest: string }>;
  isCurrent(): boolean;
}

const COMPILER_TYPESCRIPT = /\.[cm]?ts(?![a-z])/;
const JAVASCRIPT_MODULE = /\.[cm]?jsx?$/;
const COMPILER_RESOURCE = /\.(?:html?|css|less|sass|scss)$/;
const HOST_COMPLETION_TIMEOUT_MS = 30_000;

function deferred(resolved: boolean = false): Deferred {
  let settled = false;
  let settle = (): void => {};
  const promise = new Promise<void>((done) => {
    settle = done;
  });
  const resolve = (): void => {
    if (settled) return;
    settled = true;
    settle();
  };
  if (resolved) resolve();
  return {
    promise,
    get resolved() {
      return settled;
    },
    resolve,
  };
}

function normalize(file: string): string {
  return canonicalDrive(path.resolve(file));
}

function relativeWithin(root: string, file: string): string | undefined {
  const relative = path.relative(root, file);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  return relative.replace(/\\/g, '/');
}

function manifestMap(manifest?: OutputManifest): Map<string, ManifestFile> {
  return new Map((manifest?.files ?? []).map((file) => [file.path.replace(/\\/g, '/'), file]));
}

function isModule(file: ManifestFile | undefined, filePath: string): boolean {
  return (
    /\.[cm]?tsx?$/.test(filePath) ||
    (!!file && !['asset', 'search', 'api-list'].includes(file.role))
  );
}

function sameFile(left: ManifestFile | undefined, right: ManifestFile | undefined): boolean {
  return left?.digest === right?.digest && left?.role === right?.role;
}

export async function observePhysicalState(
  file: string,
  read: () => string | Promise<string> = () => readFile(file, 'utf8'),
): Promise<PhysicalState> {
  try {
    const before = await stat(file, { bigint: true });
    const value = await read();
    const after = await stat(file, { bigint: true });
    if (
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      return observePhysicalState(file);
    }
    return {
      digest: contentDigest(value),
      version: physicalVersion(after),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 'missing' };
    throw error;
  }
}

function physicalVersion(state: BigIntStats): string {
  return `${state.dev}:${state.ino}:${state.size}:${state.mtimeNs}:${state.ctimeNs}`;
}

/** A synchronous metadata-only stamp preserves the event-time identity without starting I/O queues. */
export function observePhysicalVersion(file: string): string | undefined {
  try {
    return physicalVersion(statSync(file, { bigint: true }));
  } catch {
    return undefined;
  }
}

/** Coordinates committed generator versions with Vite's client hot-update pipeline. */
export class HostUpdateCoordinator {
  private outputRoot?: string;
  private manifest?: OutputManifest;
  private announcedManifest?: OutputManifest;
  private pendingManifest?: OutputManifest;
  private publishedGeneration?: number;
  private latestAttempt?: Attempt;
  private readonly attempts = new Map<number, Attempt>();
  private readonly pendingSources = new Map<string, HostToken[]>();
  private readonly claimedSources = new Map<number, HostToken>();
  private readonly blockers = new Set<string>();
  private readonly diagnosticFailures = new Map<
    number,
    { token: HostToken; error: Error; recorded: number }
  >();
  /** How many compiler diagnostics were ever recorded: the mark a pass takes when it starts. */
  private diagnosticRecords = 0;
  /** Each Vite hot update's token, by that event's `read` function (shared by all its hooks). */
  private readonly tokensByEvent = new WeakMap<object, HostToken>();
  private diagnosticChanged = deferred();
  private outputDrain = deferred(true);
  private hostDrain = deferred(true);
  private pendingGeneration?: number;
  private sequence = 0;
  private disposed = false;

  constructor(
    private readonly notify: () => void,
    private readonly fail: (error: Error) => void,
  ) {}

  seed(outputRoot: string, manifest: OutputManifest): void {
    this.outputRoot = normalize(outputRoot);
    this.manifest = structuredClone(manifest);
    this.announcedManifest = structuredClone(manifest);
    this.publishedGeneration = manifest.generation;
  }

  initialCompilationInventory(): InitialCompilationInventory {
    const manifest = this.manifest;
    const root = this.outputRoot;
    const signature = JSON.stringify(manifest?.files);
    let checked = manifest;
    let unchanged = true;
    return {
      files: root
        ? (manifest?.files ?? [])
            .filter((file) => COMPILER_TYPESCRIPT.test(file.path))
            .map((file) => ({ path: normalize(path.join(root, file.path)), digest: file.digest }))
        : [],
      isCurrent: () => {
        if (checked !== this.manifest) {
          checked = this.manifest;
          unchanged = JSON.stringify(checked?.files) === signature;
        }
        return !this.disposed && this.outputRoot === root && unchanged;
      },
    };
  }

  started(generation: number, changes: FileChange[]): void {
    this.latestAttempt?.superseded.resolve();
    const attempt: Attempt = {
      generation,
      result: deferred(),
      publication: deferred(),
      superseded: deferred(),
      shapes: deferred(),
      changes: changes.map((change) => ({ ...change, path: normalize(change.path) })),
      events: [],
      expected: new Map(),
      resultSeen: false,
      ...(this.manifest ? { previous: structuredClone(this.manifest) } : {}),
    };
    this.attempts.set(generation, attempt);
    this.latestAttempt = attempt;
    for (const change of attempt.changes) {
      const pending = this.pendingSources.get(change.path) ?? [];
      this.pendingSources.delete(change.path);
      for (const token of pending) this.claimSource(token, attempt);
    }
  }

  /**
   * The session discarded these source changes as unchanged saves, so no generation will claim
   * their pending hot updates. They are released unclaimed, as for a file outside the generator's
   * inputs: a plain source completes at once, and a compiler source requests the current reload
   * after its own Angular acknowledgment. A later generation that lists the path claims only
   * hot updates begun after this call.
   */
  unchanged(changes: FileChange[]): void {
    for (const change of changes) {
      const file = normalize(change.path);
      const pending = this.pendingSources.get(file) ?? [];
      this.pendingSources.delete(file);
      for (const token of pending) token.claimed.resolve();
    }
  }

  result(result: BuildResult): void {
    const attempt = this.attempts.get(result.generation);
    if (!attempt || attempt.resultSeen) return;
    attempt.resultSeen = true;
    attempt.resultStatus = result.status;
    if (result.status === 'success' && this.outputRoot) {
      this.defineExpected(attempt, result.manifest);
      this.manifest = structuredClone(result.manifest);
    } else {
      attempt.shapes.resolve();
    }
    attempt.result.resolve();
    this.releaseUnwitnessedSources(attempt);
  }

  publication(
    generation: number,
    status: 'success' | 'failure' | 'skipped' | 'cancelled',
    error?: Error,
  ): void {
    const attempt = this.attempts.get(generation);
    if (!attempt || attempt.publication.resolved) return;
    attempt.publicationStatus = status;
    attempt.publicationError = error;
    if (status === 'success') this.publishedGeneration = generation;
    attempt.publication.resolve();
  }

  begin(
    file: string,
    type: EventType,
    read: () => string | Promise<string>,
    relevantSource: boolean,
  ): HostUpdateTicket {
    if (this.disposed) {
      return {
        ready: Promise.reject(new Error('[NGDOC_VITE_DISPOSED] Plugin is disposed.')),
        token: {},
      };
    }
    const filePath = normalize(file);
    const generated = !!this.outputRoot && relativeWithin(this.outputRoot, filePath) !== undefined;
    const token: HostToken = {
      id: ++this.sequence,
      path: filePath,
      type,
      generated,
      sourceKind: COMPILER_TYPESCRIPT.test(filePath)
        ? 'typescript'
        : COMPILER_RESOURCE.test(filePath)
          ? 'resource'
          : 'plain',
      observation: generated
        ? observePhysicalState(filePath, read)
        : Promise.resolve({ version: '' }),
      claimed: deferred(),
      postObserved: false,
      isClaimed: false,
    };
    this.tokensByEvent.set(read, token);
    let ready = Promise.resolve();
    if (generated && this.latestAttempt) {
      token.claimed.resolve();
      ready = this.prepareGenerated(token);
    } else if (!generated && relevantSource) {
      const pending = this.pendingSources.get(filePath) ?? [];
      pending.push(token);
      this.pendingSources.set(filePath, pending);
      ready = this.prepareSource(token);
    } else {
      token.claimed.resolve();
    }
    return { ready, token };
  }

  /**
   * Records this exact host hook's compiler acknowledgment without waiting on peer hooks.
   *
   * @param recoverBefore A {@link diagnosticMark} taken when a successful whole-program pass
   *   started: every diagnostic recorded before it is repaired too, whatever its hook's order.
   */
  async acknowledge(
    ticket: HostUpdateTicket,
    resourceWitness: boolean = false,
    compilerPass: boolean = false,
    recoverBefore?: number,
  ): Promise<void> {
    const token = ticket.token as HostToken;
    if (!token || this.disposed) return;
    if (compilerPass) this.recoverDiagnostics(token, recoverBefore);
    token.postObserved = true;
    if (token.repeat) return;
    if (!token.generated) {
      await ticket.ready;
      if (
        token.sourceKind === 'plain' ||
        (token.sourceKind === 'typescript' && token.type === 'update') ||
        (token.sourceKind === 'resource' && token.type === 'update' && resourceWitness)
      ) {
        this.clearBlocker(this.sourceBlocker(token));
        this.supersedeOlderSource(token);
      }
      if (token.isClaimed) this.releaseUnwitnessedSources(token.attempt!);
      if (
        !token.isClaimed &&
        token.type === 'update' &&
        (token.sourceKind === 'typescript' || (token.sourceKind === 'resource' && resourceWitness))
      ) {
        // Files outside the generator dependency registry can still be Angular application
        // modules/resources. Their owned Angular acknowledgment requests a browser reload without
        // waiting for a BuildSession generation that will not exist.
        this.queueCurrentReload();
      }
      return;
    }
    // Non-compiler hooks may finish before their asynchronous physical-file match.
    await ticket.ready;
    const expected = token.expected;
    // A data module's hook confirms only that module, never an Angular compiler pass.
    if (
      expected &&
      JAVASCRIPT_MODULE.test(token.path) &&
      (await this.matches(token, expected, true))
    ) {
      expected.completed = true;
      this.clearBlocker(expected.blocker);
      this.supersedeOlderPath(token.path, token.attempt!.generation);
      return;
    }
    if (expected?.kind === 'update' && (await this.matches(token, expected, true))) {
      expected.completed = true;
      this.clearBlocker(expected.blocker);
      this.supersedeOlderPath(token.path, token.attempt!.generation);
      for (const shape of token.attempt!.expected.values()) {
        if (shape.kind === 'shape') {
          shape.completed = true;
          this.clearBlocker(shape.blocker);
        }
      }
      for (const source of this.claimedSources.values()) {
        if (
          source.id < token.id &&
          source.postObserved &&
          (source.sourceKind === 'resource' || source.type !== 'update')
        ) {
          this.clearBlocker(this.sourceBlocker(source));
        }
      }
      this.releaseUnwitnessedSources(token.attempt!);
    }
  }

  /**
   * Whether this coordinator announces the hot update identified by `read` itself: a committed
   * generated output that a generation claimed. Its host hooks settle only once the newest
   * generation is published and every host obligation is drained, and by then `flush()` has sent
   * that generation's reload (or its outputs equal the last announced ones). A native reload for
   * the same output would be a second one.
   */
  announces(read: object): boolean {
    const token = this.tokensByEvent.get(read);
    return !this.disposed && !!token?.generated && token.attempt !== undefined;
  }

  /**
   * The other TypeScript outputs that the generation of this generated TypeScript update created
   * or changed in place and whose own hot updates have not completed yet. The Angular composition
   * compiles them in this update's pass, so a later report of any of them with the same bytes (a
   * created output reported as changed, a repeated change) takes no pass of its own. Call it after
   * `ticket.ready`, which binds the generation.
   */
  compilerCompanions(ticket: HostUpdateTicket): string[] {
    const token = ticket.token as HostToken;
    if (
      this.disposed ||
      !token?.generated ||
      token.sourceKind !== 'typescript' ||
      token.type !== 'update' ||
      !token.attempt?.resultSeen
    ) {
      return [];
    }
    return [...token.attempt.expected.values()]
      .filter(
        (expected) =>
          // A deleted output (a shape without bytes) is nothing to compile.
          expected.digest !== undefined &&
          !expected.completed &&
          expected.path !== token.path &&
          COMPILER_TYPESCRIPT.test(expected.path),
      )
      .map((expected) => expected.path)
      .sort();
  }

  /**
   * Whether `file` is a generated output: a path below the output root of the published
   * generation. Nothing is generated before the first publication or after disposal.
   * @param file An absolute path.
   */
  generated(file: string): boolean {
    return (
      !this.disposed &&
      !!this.outputRoot &&
      relativeWithin(this.outputRoot, normalize(file)) !== undefined
    );
  }

  /** A failed compiler candidate is observed, but never acknowledged as successful. */
  diagnostic(ticket: HostUpdateTicket, error: Error): void {
    const token = ticket.token as HostToken;
    if (!token || this.disposed) return;
    this.diagnosticFailures.set(token.id, { token, error, recorded: this.diagnosticRecords++ });
    this.addBlocker(`diagnostic:${token.id}`);
    this.diagnosticChanged.resolve();
  }

  diagnosticError(): Error | undefined {
    return [...this.diagnosticFailures.values()].at(-1)?.error;
  }

  /** The diagnostics recorded so far; a pass that starts now can repair exactly these. */
  diagnosticMark(): number {
    return this.diagnosticRecords;
  }

  private recoverDiagnostics(successful: HostToken, recoverBefore?: number): void {
    for (const [id, { token, recorded }] of this.diagnosticFailures) {
      // An older in-flight hook must not erase a newer failed compiler admission, unless its
      // successful pass started after that admission failed.
      if (id >= successful.id && (recoverBefore === undefined || recorded >= recoverBefore)) {
        continue;
      }
      this.diagnosticFailures.delete(id);
      if (token.generated && token.expected) {
        token.expected.completed = true;
        this.clearBlocker(token.expected.blocker);
      } else {
        this.clearBlocker(this.sourceBlocker(token));
      }
      this.clearBlocker(`diagnostic:${id}`);
    }
    if (this.diagnosticFailures.size === 0 && this.diagnosticChanged.resolved) {
      this.diagnosticChanged = deferred();
    }
  }

  /** Waits for the current accepted publication and all peer host acknowledgments. */
  async settle(ticket: HostUpdateTicket): Promise<void> {
    const token = ticket.token as HostToken;
    if (!token || this.disposed) return;
    if (
      !token.generated &&
      token.isClaimed &&
      token.sourceKind === 'typescript' &&
      token.type === 'update'
    ) {
      await this.awaitWithoutDiagnostic(token.attempt!.publication.promise);
      if (
        token.attempt!.publicationStatus === 'skipped' ||
        token.attempt!.publicationStatus === 'cancelled'
      ) {
        this.queueCurrentReload();
      }
    }
    await this.awaitCurrentPublication(token.attempt);
  }

  /** Waits for the candidate's atomic commit boundary, including a failure that kept last-good. */
  async committed(ticket: HostUpdateTicket): Promise<void> {
    const token = ticket.token as HostToken;
    await ticket.ready;
    if (!token?.attempt || this.disposed) return;
    await token.attempt.result.promise;
  }

  async complete(ticket: HostUpdateTicket): Promise<void> {
    await this.acknowledge(ticket);
    await this.settle(ticket);
  }

  published(result: Extract<BuildResult, { status: 'success' }>, recovered: boolean): void {
    const attempt = this.attempts.get(result.generation);
    if (!attempt) return;
    const delta = this.delta(this.announcedManifest, result.manifest);
    const compilerSource = attempt.changes.some(
      (change) => COMPILER_TYPESCRIPT.test(change.path) || COMPILER_RESOURCE.test(change.path),
    );
    this.publishedGeneration = result.generation;
    this.publication(result.generation, 'success');
    // A later no-op reconciliation must not discard an earlier reload that is still waiting for
    // host compilation. Rebind that intent to the newest successful epoch and clear it only in
    // flush(), after every compiler obligation has acknowledged completion.
    if (recovered || delta.changed || compilerSource || this.pendingGeneration !== undefined) {
      this.pendingGeneration = result.generation;
      this.pendingManifest = structuredClone(result.manifest);
      this.flush();
    }
    this.prune(result.generation);
  }

  dispose(): void {
    this.disposed = true;
    this.pendingGeneration = undefined;
    this.pendingManifest = undefined;
    for (const attempt of this.attempts.values()) {
      attempt.result.resolve();
      attempt.shapes.resolve();
      attempt.publication.resolve();
      attempt.superseded.resolve();
    }
    for (const pending of this.pendingSources.values()) {
      for (const token of pending) token.claimed.resolve();
    }
    this.blockers.clear();
    this.diagnosticFailures.clear();
    this.diagnosticChanged.resolve();
    this.outputDrain.resolve();
    this.hostDrain.resolve();
  }

  blockerCount(): number {
    return this.blockers.size;
  }

  private defineExpected(attempt: Attempt, nextManifest: OutputManifest): void {
    const previous = manifestMap(attempt.previous);
    const next = manifestMap(nextManifest);
    for (const relative of [...new Set([...previous.keys(), ...next.keys()])].sort()) {
      const before = previous.get(relative);
      const after = next.get(relative);
      if (sameFile(before, after) || (!isModule(before, relative) && !isModule(after, relative))) {
        continue;
      }
      const absolute = normalize(path.join(this.outputRoot!, relative));
      const expected: ExpectedOutput = {
        path: absolute,
        kind: before && after ? 'update' : 'shape',
        ...(after ? { digest: after.digest } : {}),
        blocker: `output:${attempt.generation}:${relative}`,
        observed: false,
        completed: false,
        state: observePhysicalState(absolute),
      };
      attempt.expected.set(absolute, expected);
      this.addBlocker(expected.blocker);
    }
    if (![...attempt.expected.values()].some((item) => item.kind === 'shape')) {
      attempt.shapes.resolve();
    }
    for (const token of attempt.events) void this.attachExpected(token);
  }

  private async prepareGenerated(token: HostToken): Promise<void> {
    let attempt = await this.findMatchingAttempt(token);
    // Checked before waiting for a newer generation: that one did not write these bytes.
    if (!attempt && (await this.bindRepeat(token))) return;
    if (!attempt) {
      const latest = this.latestAttempt;
      await this.withTimeout(latest?.result.promise);
      attempt = await this.findMatchingAttempt(token);
    }
    if (this.disposed) throw new Error('[NGDOC_VITE_DISPOSED] Plugin is disposed.');
    if (!attempt) return;
    token.attempt = attempt;
    attempt.events.push(token);
    await this.attachExpected(token);
    // An update's pass must witness every created or deleted source of its generation, so it
    // waits until each was reported (and so claimed by the compiler), as the creation reported as
    // changed does too.
    if (token.expected && token.type === 'update') await this.withTimeout(attempt.shapes.promise);
  }

  private async findMatchingAttempt(token: HostToken): Promise<Attempt | undefined> {
    const candidates = [...this.attempts.values()]
      .filter((attempt) => attempt.resultSeen && !attempt.expected.get(token.path)?.completed)
      .sort((left, right) => right.generation - left.generation);
    for (const attempt of candidates) {
      const expected = attempt.expected.get(token.path);
      if (expected && (await this.matches(token, expected, false))) return attempt;
    }
    return undefined;
  }

  /**
   * Binds a report of an output whose expectation its generation already completed, while the
   * file is still the one that generation wrote. Vite's own reload for it would be a second one
   * (the adapter reloaded for that generation), and it obliges no further compiler pass.
   * @param token A generated output's report that matched no open expectation.
   */
  private async bindRepeat(token: HostToken): Promise<boolean> {
    const candidates = [...this.attempts.values()]
      .filter((attempt) => attempt.resultSeen && attempt.expected.get(token.path)?.completed)
      .sort((left, right) => right.generation - left.generation);
    for (const attempt of candidates) {
      const expected = attempt.expected.get(token.path);
      if (expected && (await this.matches(token, expected, false))) {
        if (this.disposed) throw new Error('[NGDOC_VITE_DISPOSED] Plugin is disposed.');
        token.attempt = attempt;
        token.repeat = true;
        return true;
      }
    }
    return false;
  }

  private async prepareSource(token: HostToken): Promise<void> {
    // The matching BuildSession listener is attached after the initial generation. A client
    // hot-update received during that startup is buffered by ViteFileEventSource, so its claim is
    // valid even when a large initial program takes longer than the host-completion deadline.
    await token.claimed.promise;
    if (this.disposed) throw new Error('[NGDOC_VITE_DISPOSED] Plugin is disposed.');
  }

  private async attachExpected(token: HostToken): Promise<void> {
    if (token.expected || !token.attempt?.resultSeen) return;
    const expected = token.attempt.expected.get(token.path);
    if (!expected || !(await this.matches(token, expected, false))) return;
    token.expected = expected;
    expected.observed = true;
    if (expected.kind === 'shape') this.resolveShapes(token.attempt);
  }

  private async matches(
    token: HostToken,
    expected: ExpectedOutput,
    revalidate: boolean,
  ): Promise<boolean> {
    const observed = revalidate ? await observePhysicalState(token.path) : await token.observation;
    const current = await expected.state;
    if (expected.kind === 'shape' && expected.digest === undefined) {
      return token.type === 'delete' && observed.version === current.version;
    }
    if (expected.kind === 'shape') {
      // A created output may also be reported as changed: a watcher that sees its creation and
      // its write apart (FSEvents under load) reports a change after (or, for a path it still
      // knew, instead of) the creation. The same physical file is the same creation.
      return (
        (token.type === 'create' || token.type === 'update') && observed.version === current.version
      );
    }
    return (
      token.type === 'update' &&
      (token.sourceKind === 'typescript' || JAVASCRIPT_MODULE.test(token.path)) &&
      expected.digest !== undefined &&
      observed.digest === expected.digest &&
      observed.version === current.version
    );
  }

  private resolveShapes(attempt: Attempt): void {
    const shapes = [...attempt.expected.values()].filter((item) => item.kind === 'shape');
    if (shapes.length > 0 && shapes.every((item) => item.observed)) attempt.shapes.resolve();
  }

  private claimSource(token: HostToken, attempt: Attempt): void {
    if (token.isClaimed) return;
    token.isClaimed = true;
    token.attempt = attempt;
    token.claimed.resolve();
    this.claimedSources.set(token.id, token);
    if (token.sourceKind !== 'plain' || !token.postObserved) {
      this.addBlocker(this.sourceBlocker(token));
    }
    if (token.postObserved && token.sourceKind === 'typescript' && token.type === 'update') {
      this.clearBlocker(this.sourceBlocker(token));
    }
    attempt.events.push(token);
  }

  /**
   * A claimed source that only a compiler pass can witness (a created or deleted TypeScript
   * source, a resource without its own witness) waits for its generation's compiled update of a
   * generated TypeScript output: that pass reads the program with the source in it. A generation
   * that rewrites no such output (a category without pages, a new component file no page imports
   * yet, an edit whose outputs are data modules only) never takes that pass, so once its result is
   * known and every such update of it has completed, its sources are released; otherwise the edit
   * never settled (`NGDOC_VITE_HOST_TIMEOUT`).
   */
  private releaseUnwitnessedSources(attempt: Attempt): void {
    if (!attempt.resultSeen) return;
    for (const expected of attempt.expected.values()) {
      if (
        expected.kind === 'update' &&
        !expected.completed &&
        COMPILER_TYPESCRIPT.test(expected.path) &&
        !JAVASCRIPT_MODULE.test(expected.path)
      ) {
        return;
      }
    }
    for (const source of [...this.claimedSources.values()]) {
      if (source.attempt === attempt && source.postObserved) {
        this.clearBlocker(this.sourceBlocker(source));
      }
    }
  }

  private supersedeOlderPath(file: string, generation: number): void {
    for (const attempt of this.attempts.values()) {
      if (attempt.generation >= generation) continue;
      const expected = attempt.expected.get(file);
      if (expected && !expected.completed) {
        expected.completed = true;
        this.clearBlocker(expected.blocker);
      }
    }
  }

  private supersedeOlderSource(token: HostToken): void {
    for (const source of this.claimedSources.values()) {
      if (source.id < token.id && source.path === token.path) {
        this.clearBlocker(this.sourceBlocker(source));
      }
    }
  }

  private sourceBlocker(token: HostToken): string {
    return `source:${token.id}`;
  }

  private addBlocker(blocker: string): void {
    if (this.blockers.has(blocker)) return;
    if (this.blockers.size === 0) this.hostDrain = deferred();
    if (blocker.startsWith('output:') && !this.hasOutputBlockers()) this.outputDrain = deferred();
    this.blockers.add(blocker);
  }

  private clearBlocker(blocker: string): void {
    this.blockers.delete(blocker);
    if (blocker.startsWith('source:')) {
      this.claimedSources.delete(Number(blocker.slice('source:'.length)));
    }
    if (!this.hasOutputBlockers()) this.outputDrain.resolve();
    if (this.blockers.size === 0) this.hostDrain.resolve();
    this.flush();
  }

  private hasOutputBlockers(): boolean {
    return [...this.blockers].some((value) => value.startsWith('output:'));
  }

  private flush(): void {
    if (
      this.disposed ||
      this.pendingGeneration === undefined ||
      this.blockers.size > 0 ||
      this.diagnosticFailures.size > 0
    )
      return;
    if (this.latestAttempt && this.pendingGeneration < this.latestAttempt.generation) return;
    this.pendingGeneration = undefined;
    try {
      this.notify();
      if (this.pendingManifest) this.announcedManifest = this.pendingManifest;
      this.pendingManifest = undefined;
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private queueCurrentReload(): void {
    this.pendingGeneration =
      this.publishedGeneration ?? this.manifest?.generation ?? this.pendingGeneration ?? 0;
    this.pendingManifest = structuredClone(this.manifest ?? this.announcedManifest);
    this.flush();
  }

  private async awaitCurrentPublication(initial?: Attempt): Promise<void> {
    if (this.diagnosticError()) throw this.diagnosticError();
    let attempt = initial ?? this.latestAttempt;
    while (attempt && !this.disposed) {
      // Generator execution and candidate admission are not native-HMR obligations and can be
      // legitimately long for a large program. Session cancellation/disposal settles this gate.
      await this.awaitWithoutDiagnostic(attempt.publication.promise);
      if (this.disposed) return;
      if (this.latestAttempt !== attempt) {
        attempt = this.latestAttempt;
        continue;
      }
      if (attempt.publicationStatus === 'skipped' || attempt.publicationStatus === 'cancelled') {
        await this.awaitWithoutDiagnostic(attempt.superseded.promise);
        attempt = this.latestAttempt;
        continue;
      }
      if (attempt.publicationStatus === 'failure') {
        throw (
          attempt.publicationError ??
          new Error('[NGDOC_VITE_GENERATION_FAILED] Current publication failed.')
        );
      }
      await this.awaitWithoutDiagnostic(this.outputDrain.promise, true);
      await this.awaitWithoutDiagnostic(this.hostDrain.promise, true);
      if (attempt === this.latestAttempt && this.publishedGeneration === attempt.generation) {
        return;
      }
      attempt = this.latestAttempt;
    }
  }

  private async awaitWithoutDiagnostic(
    promise: Promise<void>,
    timeout: boolean = false,
  ): Promise<void> {
    while (!this.disposed) {
      const failure = this.diagnosticError();
      if (failure) throw failure;
      let completed = false;
      const waiting = Promise.race([
        promise.then(() => {
          completed = true;
        }),
        this.diagnosticChanged.promise,
      ]);
      if (timeout) await this.withTimeout(waiting);
      else await waiting;
      const current = this.diagnosticError();
      if (current) throw current;
      if (completed) return;
      // A diagnostic can be raised and repaired before this continuation runs. Its notification
      // is not completion of the original publication/native obligation; continue waiting.
    }
  }

  private delta(
    previousManifest: OutputManifest | undefined,
    nextManifest: OutputManifest,
  ): { changed: boolean } {
    const previous = manifestMap(previousManifest);
    const next = manifestMap(nextManifest);
    let changed = false;
    for (const relative of new Set([...previous.keys(), ...next.keys()])) {
      const before = previous.get(relative);
      const after = next.get(relative);
      if (sameFile(before, after)) continue;
      changed = true;
    }
    return { changed };
  }

  private prune(generation: number): void {
    for (const [candidate, attempt] of this.attempts) {
      if (
        candidate < generation &&
        ![...attempt.expected.values()].some((item) => !item.completed)
      ) {
        this.attempts.delete(candidate);
      }
    }
  }

  private async withTimeout(promise?: Promise<void>): Promise<void> {
    if (!promise) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('[NGDOC_VITE_HOST_TIMEOUT] Host update did not settle.')),
            HOST_COMPLETION_TIMEOUT_MS,
          );
          timeout.unref?.();
        }),
      ]).catch((error) => {
        const failure = error instanceof Error ? error : new Error(String(error));
        this.fail(failure);
        throw failure;
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
