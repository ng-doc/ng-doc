import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ViteDevServer } from 'vite';

import type {
  ArtifactSnapshot,
  BuildEvent,
  BuildResult,
  BuildSession,
  Diagnostic,
  PublishedGeneratorConfiguration,
  WatchHandle,
} from '../contracts';
import { GeneratedAssetInventory } from './assets';
import { sameRuntimeConfiguration } from './configuration';
import { diagnosticText, resultError } from './diagnostics';
import { type HostUpdateTicket, HostUpdateCoordinator } from './host-updates';
import type { OutputLease } from './lease';
import { canonicalDrive } from './paths';
import {
  type ViteFileEventSource,
  type WatchObservation,
  NGDOC_VITE_WATCHER,
} from './vite-event-source';

/** The file names of the description modules discovery scans the docs roots for. */
const DESCRIPTION_MODULE = /^ng-doc\.(?:page|category|api)\.ts$/;

function errorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return 'Unknown Vite adapter error';
  }
}

export class ViteAdapterLifecycle {
  readonly assets = new GeneratedAssetInventory();
  configuration?: PublishedGeneratorConfiguration;
  private generationFailure?: Error;

  get failure(): Error | undefined {
    return this.hostFailure ?? this.hostUpdates.diagnosticError() ?? this.generationFailure;
  }

  private session?: BuildSession;
  private watch?: WatchHandle;
  private source?: ViteFileEventSource;
  private server?: ViteDevServer;
  private registration: Promise<void> = Promise.resolve();
  private disposal?: Promise<void>;
  private hostFailure?: Error;
  private disposed = false;
  private latestStarted = -1;
  private readonly hostUpdates: HostUpdateCoordinator;
  /**
   * The snapshot of the newest committed success: the generated modules on disk import the
   * description modules it read. `read` is computed on demand, once per snapshot.
   */
  private committed?: { generation: number; snapshot: ArtifactSnapshot; read?: Set<string> };

  /**
   * @param progress NgDoc's terminal progress: `interrupt` clears its live line before the adapter
   *   logs, and `release` follows each watch result the adapter has logged (or skipped), so the
   *   result's progress line comes after the diagnostics it counts. A result the adapter failed to
   *   publish or reconcile is released as failed, so its line is the failure line.
   */
  constructor(
    private readonly lease: OutputLease,
    private readonly progress?: {
      interrupt(): void;
      release(generation: number, failed?: boolean): void;
    },
  ) {
    this.hostUpdates = new HostUpdateCoordinator(
      () => this.server?.ws.send({ type: 'full-reload' }),
      (error) => this.fail(error),
      {
        warn: (message) => this.warn(message),
        // Exactly the event Vite's watcher emits for the file: Vite invalidates its modules and
        // runs the hot update hooks, which the coordinator matches like the lost report.
        replay: (file, type) => {
          if (this.disposed) return;
          this.server?.watcher.emit(
            type === 'create' ? 'add' : type === 'delete' ? 'unlink' : 'change',
            file,
          );
        },
        rescan: () => {
          if (this.disposed) return;
          void this.session?.rescan().catch(() => {});
        },
      },
    );
  }

  attachSession(session: BuildSession): void {
    if (this.disposed) throw new Error('Vite adapter is disposed.');
    this.session = session;
  }

  attachServer(server: ViteDevServer, source: ViteFileEventSource): void {
    if (this.disposed) throw new Error('Vite adapter is disposed.');
    this.server = server;
    this.source = source;
  }

  attachWatch(watch: WatchHandle): void {
    if (this.disposed) throw new Error('Vite adapter is disposed.');
    this.watch = watch;
  }

  acceptInitial(result: BuildResult): Extract<BuildResult, { status: 'success' }> {
    if (result.status !== 'success') throw resultError(result, 'Initial NgDoc generation failed.');
    return result;
  }

  /** Runs synchronously inside the candidate committer, before it mutates published output. */
  admit(configuration: Readonly<PublishedGeneratorConfiguration>): void {
    if (this.configuration && !sameRuntimeConfiguration(this.configuration, configuration)) {
      throw new Error(
        '[NGDOC_VITE_RESTART_REQUIRED] outputRoot, cacheRoot or assetDirectory changed; restart Vite.',
      );
    }
    this.lease.admit(configuration.outputRoot);
    // Admission runs synchronously inside the candidate committer before physical mutation.
    // Extend the startup exclusions with configuration-resolved roots before those writes begin.
    this.source?.excludeOwned(configuration.outputRoot, configuration.cacheRoot);
  }

  publish(
    result: Extract<BuildResult, { status: 'success' }>,
    configuration: PublishedGeneratorConfiguration,
  ): void {
    const recovered = this.generationFailure !== undefined && this.hostFailure === undefined;
    const initial = this.configuration === undefined;
    this.admit(configuration);
    this.lease.seal(configuration.outputRoot);
    if (initial) this.hostUpdates.seed(configuration.outputRoot, result.manifest);
    this.configuration = configuration;
    this.assets.update(result, configuration);
    this.generationFailure = undefined;
    this.committedResult(result);
    this.hostUpdates.published(result, recovered);
  }

  /**
   * Records a committed success (published or not), unless a newer one is recorded already.
   * @param result The committed result.
   */
  private committedResult(result: Extract<BuildResult, { status: 'success' }>): void {
    if (this.committed && this.committed.generation >= result.generation) return;
    this.committed = { generation: result.generation, snapshot: result.snapshot };
  }

  /**
   * Whether the newest committed generation read the description module `file`, so that a
   * generated module (its page shell, `routes.ts`) may import it.
   * @param file An absolute path.
   */
  private committedDescriptionModule(file: string): boolean {
    const committed = this.committed;
    if (!committed) return false;
    if (!committed.read) {
      const read = new Set<string>();
      for (const artifact of committed.snapshot.artifacts) {
        for (const dependency of artifact.dependencies) {
          if (
            dependency.kind === 'content' &&
            DESCRIPTION_MODULE.test(path.basename(dependency.path))
          )
            read.add(canonicalDrive(path.resolve(dependency.path)));
        }
      }
      committed.read = read;
    }
    return committed.read.has(canonicalDrive(path.resolve(file)));
  }

  hostUpdateStarted(
    file: string,
    type: 'create' | 'update' | 'delete',
    read: () => string | Promise<string>,
  ): HostUpdateTicket {
    const change = { kind: type, path: file } as const;
    const relevant = this.source?.matches(change) ?? false;
    const ticket = this.hostUpdates.begin(file, type, read, relevant);
    if (relevant) this.source!.forward(change);
    return ticket;
  }

  hostUpdateCompleted(ticket: HostUpdateTicket): Promise<void> {
    return this.hostUpdates.complete(ticket);
  }

  /** The adapter reloads for this settled hot update itself. */
  hostUpdateAnnounced(read: object): boolean {
    return !this.disposed && this.hostUpdates.announces(read);
  }

  /** See {@link HostUpdateCoordinator.compilerCompanions}. */
  hostUpdateCompanions(ticket: HostUpdateTicket): string[] {
    return this.disposed ? [] : this.hostUpdates.compilerCompanions(ticket);
  }

  /**
   * Whether the Angular compiler leaves the add or unlink event of `file` to the pass of the
   * generation it belongs to (see `composeAngularPlugins`):
   *
   * - a generated output: a commit creates or deletes it, and rewrites the module that imports it
   *   (`routes.ts`, a page shell) in the same commit, whose update takes the generation's pass;
   * - a description module (`ng-doc.page.ts`, `ng-doc.category.ts`, `ng-doc.api.ts`) the
   *   generator watches, unless the newest committed generation read it and it exists. A new one
   *   is imported by no generated module before its generation commits, and that commit rewrites
   *   `routes.ts`; a deleted one cannot be compiled, and the commit that drops it rewrites the
   *   modules that imported it. An existing one the committed generation read is in the program:
   *   its page shell imports it (`page.ts.nunj`), and an add event that replaced it (an editor's
   *   atomic save, a checkout) may change it without changing any generated module, so its own
   *   pass compiles it as before. The file is checked when the event arrives: a file deleted
   *   again since is claimed, and one restored since compiles, either way from its current bytes.
   *
   * A claimed file is not compiled on its own: it joins the next pass, which would otherwise
   * follow the one its event starts. If its generation fails or rewrites no generated module, the
   * file still waits for that next pass: a new one is imported by no generated module, and a
   * deleted one has no bytes left to serve.
   * @param file The added or deleted file, as Vite's watcher reports it.
   */
  hostClaimsFilesystemChange(file: string): boolean {
    if (this.disposed) return false;
    if (this.hostUpdates.generated(file)) return true;
    if (
      !DESCRIPTION_MODULE.test(path.basename(file)) ||
      !(this.source?.matches({ kind: 'update', path: file }) ?? false)
    )
      return false;
    return !(this.committedDescriptionModule(file) && existsSync(file));
  }

  /** See {@link HostUpdateCoordinator.diagnosticMark}. */
  hostDiagnosticMark(): number {
    return this.hostUpdates.diagnosticMark();
  }

  initialCompilationInventory() {
    return this.hostUpdates.initialCompilationInventory();
  }

  hostUpdateAcknowledged(
    ticket: HostUpdateTicket,
    resourceWitness: boolean = false,
    compilerPass: boolean = false,
    recoverBefore?: number,
  ): Promise<void> {
    return this.hostUpdates.acknowledge(ticket, resourceWitness, compilerPass, recoverBefore);
  }

  hostUpdateDiagnostic(ticket: HostUpdateTicket, error: Error): void {
    this.hostUpdates.diagnostic(ticket, error);
    this.report(error);
  }

  hostUpdateSettled(ticket: HostUpdateTicket): Promise<void> {
    return this.hostUpdates.settle(ticket);
  }

  hostUpdateCommitted(ticket: HostUpdateTicket): Promise<void> {
    return this.hostUpdates.committed(ticket);
  }

  hostUpdateFailed(error: Error): void {
    this.hostFailure ??= error;
    this.report(this.hostFailure);
  }

  observer(configurationOf: (result: BuildResult) => PublishedGeneratorConfiguration | undefined) {
    return (event: BuildEvent): void => {
      if (this.disposed) return;
      if (event.kind === 'started') {
        this.latestStarted = Math.max(this.latestStarted, event.generation);
        this.source?.started(event.generation);
        this.hostUpdates.started(event.generation, event.changes);
        return;
      }
      if (event.kind === 'unchanged') {
        // No generation will claim these hot updates: release them like unrelated sources.
        this.hostUpdates.unchanged(event.changes);
        return;
      }
      if (event.kind === 'diagnostic') {
        this.log(event.diagnostic);
        if (event.diagnostic.severity === 'error') {
          const error = new Error(diagnosticText(event.diagnostic));
          // A broken watcher is not repaired by a later publication: it may already be missing
          // input changes, so it stays visible until Vite restarts.
          if (event.diagnostic.code === NGDOC_VITE_WATCHER) this.hostFailure ??= error;
          this.fail(error);
        }
        return;
      }
      if (event.kind !== 'result') return;
      const result = event.result;
      this.hostUpdates.result(result);
      // Committed on disk, whether or not it is published (a superseded one may be skipped).
      if (result.status === 'success') this.committedResult(result);
      /** The host could not publish (or reconcile) what the session committed. */
      let failed = false;
      this.registration = this.registration
        .then(async () => {
          if (this.disposed) {
            this.hostUpdates.publication(result.generation, 'skipped');
            return;
          }
          const observation = await this.source?.observe(result);
          if (this.disposed || (observation && !observation.accepted)) {
            this.hostUpdates.publication(result.generation, 'skipped');
            return;
          }
          if (!this.isCurrent(result.generation)) {
            this.hostUpdates.publication(result.generation, 'skipped');
            return;
          }
          this.logAll(result.diagnostics);
          if (result.status === 'failure') {
            const error = resultError(result, 'NgDoc regeneration failed.');
            this.fail(error);
            this.hostUpdates.publication(result.generation, 'failure', error);
          }
          if (result.status === 'success') {
            const configuration = configurationOf(result);
            if (!configuration)
              throw new Error('[NGDOC_VITE_CONFIGURATION] Missing configuration.');
            this.publish(result, configuration);
          }
          if (result.status === 'cancelled') {
            this.hostUpdates.publication(result.generation, 'cancelled');
          }
          // A superseded generation is followed by the one that superseded it. That one starts
          // after these watches exist (otherwise this result would not be current here) and
          // re-verifies every input it reuses, so a reconcile would only repeat its work.
          if (
            observation?.reconcile &&
            result.status !== 'cancelled' &&
            !(result.status === 'success' && result.superseded)
          )
            await this.reconcile(observation);
        })
        .catch((error) => {
          if (this.disposed || !this.isCurrent(result.generation)) {
            this.hostUpdates.publication(result.generation, 'skipped');
            return;
          }
          const failure = error instanceof Error ? error : new Error(errorMessage(error));
          failed = true;
          this.fail(failure);
          // The session committed what the host could not publish: a re-save must regenerate
          // (and so retry the publication) rather than be discarded as an unchanged save.
          (this.session as { publicationFailed?(): void } | undefined)?.publicationFailed?.();
          this.hostUpdates.publication(result.generation, 'failure', failure);
        })
        .finally(() => {
          try {
            this.progress?.release(result.generation, failed);
          } catch {
            // Progress is advisory; the registration chain must never reject.
          }
        });
    };
  }

  async settled(): Promise<void> {
    for (;;) {
      const current = this.registration;
      await current;
      if (current === this.registration) return;
    }
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.disposeAll();
    return this.disposal;
  }

  /**
   * The generation just published recorded inputs that the watcher did not cover while it read
   * them. Once their watches are attached, only those paths are re-observed against what the
   * session last observed, and a difference becomes an ordinary filesystem change. So the
   * retained program is kept, and no generation, which would also hold back this generation's
   * reload, runs when nothing changed. After a rejection overflow the rejected paths are unknown,
   * so the session rescans: its next generation re-observes every committed input, as after a
   * lossy watcher, and takes the full commit. Neither call waits for a generation; its result
   * arrives through the observer like any other.
   */
  private async reconcile(observation: WatchObservation): Promise<void> {
    const session = this.session;
    if (!session) return;
    if (observation.paths) {
      await this.source?.attached(observation.paths);
      await session.reconcileInputs(observation.paths);
    } else {
      await session.rescan();
    }
  }

  private fail(error: Error): void {
    this.generationFailure = error;
    this.report(error);
  }

  private report(error: Error): void {
    this.interrupt();
    // Reporting is best effort: a closing server may have lost its logger or socket.
    try {
      this.server?.config.logger.error(error.message);
    } catch {
      // Nothing else can report it.
    }
    try {
      this.server?.ws.send({
        type: 'error',
        err: { message: error.message, stack: error.stack ?? '' },
      });
    } catch {
      // The overlay is optional; the logger above already has the error.
    }
  }

  private warn(message: string): void {
    if (!this.server) return;
    this.interrupt();
    try {
      this.server.config.logger.warn(message);
    } catch {
      // Logging is best effort while the server closes.
    }
  }

  private isCurrent(generation: number): boolean {
    return (
      !this.disposed &&
      generation >= this.latestStarted &&
      (!this.source || this.source.isCurrent(generation))
    );
  }

  private log(diagnostic: Diagnostic): void {
    if (!this.server) return;
    this.interrupt();
    const value = diagnosticText(diagnostic);
    try {
      if (diagnostic.severity === 'error') this.server.config.logger.error(value);
      else if (diagnostic.severity === 'warning') this.server.config.logger.warn(value);
      else this.server.config.logger.info(value);
    } catch {
      // Logging is best effort while the server closes.
    }
  }

  private interrupt(): void {
    try {
      this.progress?.interrupt();
    } catch {
      // Progress is advisory.
    }
  }

  private logAll(diagnostics: Diagnostic[]): void {
    diagnostics.forEach((diagnostic) => this.log(diagnostic));
  }

  private async disposeAll(): Promise<void> {
    this.hostUpdates.dispose();
    const results = await Promise.allSettled([
      this.registration,
      this.watch?.dispose(),
      this.source?.dispose(),
      this.session?.dispose(),
    ]);
    this.lease.dispose();
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Vite adapter cleanup failed.');
  }
}
