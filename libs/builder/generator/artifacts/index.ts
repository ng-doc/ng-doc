import { randomUUID } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { compareText } from '../../helpers/text-order';
import type {
  ArtifactCache,
  ArtifactFingerprint,
  ArtifactIdentity,
  ArtifactSnapshot,
  CacheKey,
  CommitGuard,
  CommitRequest,
  CommitResult,
  Dependency,
  Diagnostic,
  FileOutput,
  OutputCommitter,
  OutputManifest,
  PageArtifact,
  PublishedGeneratorConfiguration,
} from '../contracts';
import { GENERATOR_SCHEMA_VERSION, OUTPUT_SCHEMA_VERSION } from '../contracts';
import { validateSemanticScopes } from '../graph';
import { canonicalJson as stableJson, sha256Hex as hash } from '../kernel/canonical';

/** Cache entries (fingerprints, descriptors, IR); an entry of another version is a miss. */
const SCHEMA_VERSION = GENERATOR_SCHEMA_VERSION;
const MANIFEST_NAME = '.ng-doc-output-manifest.json';
const CACHE_EXTENSION = '.artifact.json';

/**
 * What Windows reports for a rename, or a removal, while another process holds a handle on the
 * file or directory: an antivirus scan, the search indexer, an editor or a dev server reading it.
 * The handle goes away by itself, so these are retried there; elsewhere they are real errors.
 */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Bounded backoff for transient Windows rename failures: at most about 3.5 s per rename. */
export const RENAME_RETRY = Object.freeze({ attempts: 8, delayMs: 50, maxDelayMs: 1000 });

export interface RenameRetryOptions {
  /** @internal Test port; `process.platform` by default. */
  platform?: NodeJS.Platform;
  /** @internal Test port. */
  sleep?: (milliseconds: number) => Promise<void>;
  retry?: { attempts: number; delayMs: number; maxDelayMs: number };
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * `rename`, retried on win32 while it fails with EPERM, EBUSY or EACCES, with a bounded
 * exponential backoff; the last failure is thrown. Each call still renames exactly once when it
 * succeeds, so callers keep their order (the committer publishes the manifest last). Other
 * platforms get `rename` itself.
 */
export function retryingRename(
  renameFile: typeof rename = rename,
  options: RenameRetryOptions = {},
): typeof rename {
  if ((options.platform ?? process.platform) !== 'win32') return renameFile;
  const wait = options.sleep ?? sleep;
  const retry = options.retry ?? RENAME_RETRY;
  return async (from, to) => {
    let delay = retry.delayMs;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await renameFile(from, to);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        if (!code || !TRANSIENT_RENAME_CODES.has(code) || attempt >= retry.attempts) throw error;
        await wait(delay);
        delay = Math.min(delay * 2, retry.maxDelayMs);
      }
    }
  };
}

/** Recursive removal options; Windows retries a removal a held handle blocks (see above). */
function removal(platform: NodeJS.Platform): { recursive: true; force: true; maxRetries?: number } {
  return platform === 'win32'
    ? { recursive: true, force: true, maxRetries: 5 }
    : { recursive: true, force: true };
}

export interface ArtifactCacheOptions {
  root: string;
}

/**
 * Identity of one published cache entry file (device, inode, size, mtime, ctime) and the clock
 * reading taken before that lstat. Only a settled stamp (mtime and ctime at least the racy
 * window older than `observedNs`) is trusted without reading the file.
 */
export interface FileStamp {
  dev: string;
  ino: string;
  size: string;
  mtimeNs: string;
  ctimeNs: string;
  observedNs: string;
}

export class JsonArtifactCache implements ArtifactCache {
  private readonly root: string;

  constructor(options: ArtifactCacheOptions) {
    this.root = path.resolve(options.root);
  }

  async read(key: CacheKey): ReturnType<ArtifactCache['read']> {
    const file = this.fileFor(key.identity);
    let value: unknown;
    try {
      value = JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch (error) {
      if (isMissing(error)) return { status: 'miss', reason: 'absent', diagnostics: [] };
      return miss(
        'invalid',
        'ARTIFACT_CACHE_INVALID',
        `Cannot read cache entry: ${message(error)}.`,
        file,
      );
    }
    if (!isPageArtifact(value)) {
      return miss(
        'invalid',
        'ARTIFACT_CACHE_INVALID',
        `Cached value is not a complete schema-${SCHEMA_VERSION} PageArtifact.`,
        file,
      );
    }
    if (!deepEqual(value.identity, key.identity)) {
      return miss(
        'invalid',
        'ARTIFACT_CACHE_IDENTITY',
        'Cached artifact identity does not match its cache key.',
        file,
      );
    }
    if (!deepEqual(value.fingerprint, key.fingerprint)) {
      return miss(
        'fingerprint',
        'ARTIFACT_CACHE_FINGERPRINT',
        'Cached artifact fingerprint is stale.',
        file,
      );
    }
    return { status: 'hit', artifact: value };
  }

  async write(artifact: PageArtifact): Promise<void> {
    await this.writeStamped(artifact);
  }

  /**
   * Writes exactly like `write` and returns the stamp of the entry file it published, or
   * undefined when the published path is no longer the inode this call wrote.
   */
  async writeStamped(artifact: PageArtifact): Promise<FileStamp | undefined> {
    if (!isPageArtifact(artifact))
      throw new TypeError(
        `Only a complete JSON-safe schema-${SCHEMA_VERSION} PageArtifact can be cached.`,
      );
    const file = this.fileFor(artifact.identity);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    // The stamp's observation time precedes every byte this call writes: a change after it
    // leaves a ctime inside the racy window, so the entry is compared again before trust.
    const observedNs = BigInt(Date.now()) * 1_000_000n;
    try {
      const handle = await open(temporary, 'wx');
      let written: BigIntStats;
      try {
        await handle.writeFile(entryText(artifact), 'utf8');
        written = await handle.stat({ bigint: true });
      } finally {
        await handle.close();
      }
      await retryingRename()(temporary, file);
      // Stamp the published entry itself (rename may change ctime) and only if it is still the
      // inode, size and mtime written above.
      return await this.stamp(file, written, observedNs, ['dev', 'ino', 'size', 'mtimeNs']);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Confirms that the entry file for `artifact` still holds exactly the bytes `write` would
   * publish, given the stamp recorded when it was written or last confirmed. A settled
   * matching stamp is trusted; a racy one (changed within the racy window of its stat) is
   * confirmed by reading and comparing the bytes. Returns the stamp to keep, or undefined when
   * the entry must be written.
   */
  async confirm(artifact: PageArtifact, stamp: FileStamp): Promise<FileStamp | undefined> {
    const file = this.fileFor(artifact.identity);
    try {
      const observedNs = BigInt(Date.now()) * 1_000_000n;
      const info = await lstat(file, { bigint: true });
      if (!info.isFile() || !sameStamp(fileStamp(info, observedNs), stamp)) return undefined;
      if (!isRacyStamp(stamp)) return stamp;
      const bytes = await readFile(file);
      if (!bytes.equals(Buffer.from(entryText(artifact), 'utf8'))) return undefined;
      // Re-stamp with the observation time taken before the first lstat, and only if nothing
      // changed while the bytes were compared.
      return await this.stamp(file, info, observedNs, ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']);
    } catch {
      return undefined;
    }
  }

  /**
   * Stamps `file` if it is a regular file whose `fields` equal `expected`. `observedNs` must be
   * a clock reading taken before the bytes being vouched for were written or compared. A file
   * that cannot be observed (for example removed after the rename) gets no stamp; the write
   * itself has already succeeded.
   */
  private async stamp(
    file: string,
    expected: BigIntStats,
    observedNs: bigint,
    fields: Array<'dev' | 'ino' | 'size' | 'mtimeNs' | 'ctimeNs'>,
  ): Promise<FileStamp | undefined> {
    let info: BigIntStats;
    try {
      info = await lstat(file, { bigint: true });
    } catch {
      return undefined;
    }
    if (!info.isFile() || fields.some((field) => info[field] !== expected[field])) return undefined;
    return fileStamp(info, observedNs);
  }

  private fileFor(identity: ArtifactIdentity): string {
    const project = hash(stableJson(identity.projectId)).slice(0, 16);
    const identityDigest = hash(stableJson(identity));
    return path.join(this.root, project, `${identityDigest}${CACHE_EXTENSION}`);
  }
}

export type CommitMutation =
  | 'stage-write'
  | 'backup-output'
  | 'publish-output'
  | 'remove-output'
  | 'backup-manifest'
  | 'publish-manifest';

export interface OutputCommitterOptions {
  outputRoot: string;
  /** Fault-injection/telemetry port. The real filesystem operation still follows this hook. */
  beforeMutation?: (operation: CommitMutation, target: string) => void | Promise<void>;
  fileSystem?: {
    rename?: typeof rename;
    /** @internal Test port: the hard link that backs a published file up (see `backUp`). */
    link?: typeof link;
    writeFile?: typeof writeFile;
    /**
     * @internal Test port: the platform whose rename behaviour applies (win32 retries transient
     * rename failures, see {@link retryingRename}); `process.platform` by default.
     */
    platform?: NodeJS.Platform;
    /** @internal Test port: the wait between rename retries. */
    sleep?: (milliseconds: number) => Promise<void>;
  };
  /**
   * Delta commit; on unless `false`. A request whose `base` is the manifest this committer
   * published in its previous call prepares, probes and compares only the artifacts that changed
   * against it, and the outputs a commit publishes stay verified after publication. `false` (the
   * `NGDOC_TARGETED_REBUILD=0` kill switch, resolved in bootstrap) ignores `base`: every commit is
   * the full commit, with no publication recorded.
   */
  delta?: boolean;
}

/**
 * Why a commit ran the full path while delta commits are on. `untrusted`: this committer has no
 * publication that the previous call left it (its first commit, or the previous call did not end
 * `committed`); `base-identity`: `base`/`previous` do not name that publication;
 * `manifest-stamp`: the published manifest file changed on disk; `configuration`: the candidate's
 * configuration differs; `candidate`: a check of the changed artifacts would fail (the full commit
 * reports it); `targets`: a target of a changed artifact or orphan cannot be committed as probed,
 * or planning the delta commit failed.
 */
export type FullCommitReason =
  | 'no-base'
  | 'untrusted'
  | 'base-identity'
  | 'manifest-stamp'
  | 'configuration'
  | 'candidate'
  | 'targets';

/** How the last commit call ran; for tests and diagnostics only. */
export interface CommitTelemetry {
  mode: 'full' | 'delta';
  /** Set when delta commits are on and this commit ran the full path. */
  reason?: FullCommitReason;
  /** Candidate artifacts prepared and validated: all of them (full) or the changed ones. */
  artifacts: number;
  /** Outputs probed and compared with the disk. */
  outputs: number;
}

interface PreparedOutput {
  relative: string;
  target: string;
  bytes: Buffer;
  output: FileOutput;
  ownerId: string;
}

/** The read-only check of one output in a full commit (see `checkOutputs`). */
type OutputCheck =
  | { kind: 'verified' }
  | { kind: 'compared'; comparison: Awaited<ReturnType<typeof compareFile>> }
  | { kind: 'failed'; error: unknown };

interface RollbackRecord {
  target: string;
  backup?: string;
  published: boolean;
  removeTarget: boolean;
}

interface ActiveCommit {
  controller: AbortController;
  settled: Promise<void>;
  settle(): void;
}

/** Bytes this committer compared equal to an output digest, with the file's stat at that time. */
interface VerifiedOutput {
  digest: string;
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

type PathState = { stats: BigIntStats } | { missing: true } | { error: unknown };

/** The lstat identity of the published manifest file. */
interface ManifestStamp {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

/**
 * What this committer published in a `committed` call: the base of a delta commit by
 * the very next call. Nothing here is shared with a caller.
 */
interface Publication {
  projectId: string;
  revision: string;
  generation: number;
  /** The candidate's configuration digest, or undefined for a snapshot without configuration. */
  configurationDigest: unknown;
  /** Output path → the manifest's entry (private copies), in manifest order. */
  files: Map<string, OutputManifest['files'][number]>;
  /** Owner artifact id → number of outputs. */
  counts: Map<string, number>;
  /** Artifact id → revision. */
  revisions: Map<string, string>;
  stamp: ManifestStamp;
  /** Two adjacent manifest paths compare equal, so their order follows the candidate's order. */
  ties: boolean;
}

/**
 * A published output: the clock before its publish rename, the stat of its staged file, and the
 * stat of the target right after the rename.
 */
interface PublishedOutput {
  atNs: bigint;
  staged: BigIntStats | undefined;
  /** The target's stat right after the rename; its ctime is the one any later rewrite changes. */
  renamed?: BigIntStats;
}

/** The outputs a commit probes, compares and publishes, and the manifest it writes. */
interface CommitPlan {
  outputs: PreparedOutput[];
  manifest: OutputManifest;
  orphanPaths: string[];
  ownedPaths: { has(path: string): boolean };
  telemetry: CommitTelemetry;
}

/** A stat taken this long after the file's last change cannot hide a same-tick rewrite. */
const RACY_WINDOW_NS = 2_000_000_000n;
const PROBE_CONCURRENCY = 64;

export class TransactionalOutputCommitter implements OutputCommitter {
  private readonly outputRoot: string;
  private readonly hook?: OutputCommitterOptions['beforeMutation'];
  private readonly renameFile: typeof rename;
  private readonly linkFile: typeof link;
  /** The rollback's rename: the real one, never the injected port, with the same retries. */
  private readonly restoreFile: typeof rename;
  private readonly platform: NodeJS.Platform;
  private readonly write: typeof writeFile;
  private readonly delta: boolean;
  private active?: ActiveCommit;
  private disposed = false;
  /**
   * Outputs whose on-disk bytes were compared equal to their digest. A later commit skips
   * reading an output whose digest is unchanged while its lstat identity (device, inode,
   * size, mtime, ctime) still matches; any other output is read and compared as before.
   */
  private readonly verified = new Map<string, VerifiedOutput>();
  /** The publication of the previous call, if it ended `committed` (delta commits only). */
  private published?: Publication;
  /** Commit calls so far; a publication is recorded only by the newest call. */
  private calls = 0;
  private telemetry?: CommitTelemetry;

  constructor(options: OutputCommitterOptions) {
    this.outputRoot = path.resolve(options.outputRoot);
    this.hook = options.beforeMutation;
    this.platform = options.fileSystem?.platform ?? process.platform;
    // Each rename is retried in place, one at a time, so the publication order (the manifest
    // last) and the rollback order are unchanged.
    const retry: RenameRetryOptions = {
      platform: this.platform,
      ...(options.fileSystem?.sleep ? { sleep: options.fileSystem.sleep } : {}),
    };
    this.renameFile = retryingRename(options.fileSystem?.rename ?? rename, retry);
    // Resolved at each call: the module's `rename`, as a test double replaces it.
    this.restoreFile = retryingRename((from, to) => rename(from, to), retry);
    this.linkFile = options.fileSystem?.link ?? link;
    this.write = options.fileSystem?.writeFile ?? writeFile;
    this.delta = options.delta !== false;
  }

  commit(request: CommitRequest, guard: CommitGuard, signal: AbortSignal): Promise<CommitResult> {
    const call = ++this.calls;
    // A publication is trusted by the very next commit call only. Every call, rejected ones
    // included, ends that trust here; only a `committed` outcome of the newest call records a new
    // one. A call that a wrapping committer rejects before delegating here (for example a stale
    // guard or a configuration it refuses) never reaches this method; it mutates nothing on disk,
    // so the publication stays valid.
    const last = this.published;
    this.published = undefined;
    this.telemetry = undefined;
    if (this.disposed)
      return Promise.resolve(failed('OUTPUT_COMMITTER_DISPOSED', 'Output committer is disposed.'));
    if (this.active)
      return Promise.resolve(
        failed('OUTPUT_COMMIT_IN_PROGRESS', 'Another output commit is active.'),
      );
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const active: ActiveCommit = { controller: new AbortController(), settled, settle };
    this.active = active;
    const operationSignal = AbortSignal.any([signal, active.controller.signal]);
    return this.runCommit(request, guard, operationSignal, last, call).finally(() => {
      active.settle();
      if (this.active === active) this.active = undefined;
    });
  }

  /** How the last commit call ran, if it reached a plan (tests and diagnostics). */
  inspect(): CommitTelemetry | undefined {
    return this.telemetry ? { ...this.telemetry } : undefined;
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      await this.active?.settled;
      return;
    }
    this.disposed = true;
    this.verified.clear();
    this.published = undefined;
    const active = this.active;
    active?.controller.abort(new DOMException('Output committer disposed.', 'AbortError'));
    await active?.settled;
  }

  private async runCommit(
    request: CommitRequest,
    guard: CommitGuard,
    signal: AbortSignal,
    last: Publication | undefined,
    call: number,
  ): Promise<CommitResult> {
    const diagnostics: Diagnostic[] = [];
    let stageRoot: string | undefined;
    const rollback: RollbackRecord[] = [];
    try {
      if (!isCurrent(request.generation, guard, signal)) return stale();
      await this.ensureSafeRoot();
      await this.assertSafeTarget(path.join(this.outputRoot, MANIFEST_NAME));
      let plan: CommitPlan | undefined;
      let probe: Map<string, PathState> | undefined;
      let reason: FullCommitReason | undefined;
      if (this.delta) {
        const attempt = await this.deltaAttempt(request, last, guard, signal);
        if ('reason' in attempt) reason = attempt.reason;
        else ({ plan, probe } = attempt);
      }
      if (!plan || !probe) {
        this.telemetry = { mode: 'full', ...(reason ? { reason } : {}), artifacts: 0, outputs: 0 };
        const diskManifest = await this.readManifest();
        if (request.previous && (!diskManifest || !deepEqual(request.previous, diskManifest))) {
          return failed(
            'OUTPUT_MANIFEST_STALE',
            'The on-disk manifest differs from the supplied previous manifest.',
          );
        }
        const previous = request.previous ?? diskManifest;
        const prepared = this.prepare(request, previous, await realpath(this.outputRoot));
        if ('diagnostic' in prepared)
          return { status: 'failed', diagnostics: [prepared.diagnostic] };

        const ownedPaths = new Set((diskManifest?.files ?? []).map((item) => item.path));
        const nextPaths = new Set(prepared.outputs.map((item) => item.relative));
        const orphanPaths = (previous?.files ?? [])
          .map((item) => normalizeRelative(item.path))
          .filter((item) => !nextPaths.has(item));
        plan = {
          ...prepared,
          orphanPaths,
          ownedPaths,
          telemetry: {
            mode: 'full',
            ...(reason ? { reason } : {}),
            artifacts: request.candidate.artifacts.length,
            outputs: prepared.outputs.length,
          },
        };
        this.telemetry = plan.telemetry;
        // One concurrent lstat per distinct path segment replaces the per-output sequential
        // exists/lstat/realpath walk. Checks, collisions and errors keep their order and text.
        assertCurrent(request.generation, guard, signal);
        probe = await this.probe([
          ...prepared.outputs.map((item) => item.target),
          ...orphanPaths.map((relative) => path.join(this.outputRoot, relative)),
        ]);
        const collision = this.checkTargets(plan, probe, request.generation, guard, signal);
        if (collision) return collision;
      }
      const { orphanPaths } = plan;

      stageRoot = path.join(this.outputRoot, `.ng-doc-stage-${randomUUID()}`);
      const stagedOutputs = path.join(stageRoot, 'outputs');
      const backups = path.join(stageRoot, 'backups');
      await mkdir(stagedOutputs, { recursive: true });
      await mkdir(backups, { recursive: true });

      const changed: PreparedOutput[] = [];
      const checks = await this.checkOutputs(
        plan.outputs,
        probe,
        request.generation,
        guard,
        signal,
      );
      for (const [index, item] of plan.outputs.entries()) {
        assertCurrent(request.generation, guard, signal);
        const check = checks[index];
        if (check?.kind === 'verified') continue;
        if (check?.kind === 'failed') throw check.error;
        let comparison: Awaited<ReturnType<typeof compareFile>>;
        if (check?.kind === 'compared') comparison = check.comparison;
        else {
          await this.assertSafeTarget(item.target);
          comparison = await compareFile(item.target, item.bytes);
        }
        if (comparison.equal) {
          this.rememberVerified(item, comparison.stats, comparison.observedAtNs);
        } else {
          this.verified.delete(item.relative);
          const staged = path.join(stagedOutputs, item.relative);
          await mkdir(path.dirname(staged), { recursive: true });
          await this.mutate('stage-write', item.target, signal);
          await this.write(staged, item.bytes, { flag: 'wx' });
          changed.push(item);
        }
      }

      const removedPaths: string[] = [];
      for (const relative of orphanPaths)
        this.checkProbedTarget(path.join(this.outputRoot, relative), probe);

      assertCurrent(request.generation, guard, signal);
      /**
       * Delta commits only (post-publish verification): per published output, a clock reading taken before its publish
       * rename and the stat of the staged file it renamed, which ties a later stat to these bytes.
       */
      const published = new Map<PreparedOutput, PublishedOutput>();
      for (const item of orderForPublication(changed)) {
        const staged = path.join(stagedOutputs, item.relative);
        const backup = path.join(backups, 'changed', item.relative);
        const originalExists = await exists(item.target);
        const record: RollbackRecord = {
          target: item.target,
          published: false,
          removeTarget: !originalExists,
        };
        rollback.push(record);
        if (originalExists) {
          await mkdir(path.dirname(backup), { recursive: true });
          record.backup = backup;
          await this.mutate('backup-output', item.target, signal);
          await this.backUp(item.target, backup);
        }
        await mkdir(path.dirname(item.target), { recursive: true });
        await this.mutate('publish-output', item.target, signal);
        if (this.delta) {
          published.set(item, {
            atNs: nowNs(),
            staged: await lstat(staged, { bigint: true }).catch(() => undefined),
          });
        }
        await this.renameFile(staged, item.target);
        const entry = published.get(item);
        if (entry)
          entry.renamed = await lstat(item.target, { bigint: true }).catch(() => undefined);
        record.published = true;
      }

      for (const relative of orphanPaths) {
        assertCurrent(request.generation, guard, signal);
        const target = path.join(this.outputRoot, relative);
        if (!(await exists(target))) continue;
        const backup = path.join(backups, 'removed', relative);
        await mkdir(path.dirname(backup), { recursive: true });
        const record: RollbackRecord = { target, backup, published: false, removeTarget: false };
        rollback.push(record);
        await this.mutate('remove-output', target, signal);
        await this.renameFile(target, backup);
        removedPaths.push(relative);
      }

      const manifestPath = path.join(this.outputRoot, MANIFEST_NAME);
      /** Delta commits only: the published manifest's stamp, taken right after its rename. */
      let manifestStamp: ManifestStamp | undefined;
      const manifestBytes = publishedManifestBytes(plan.manifest);
      if (!(await fileMatches(manifestPath, manifestBytes))) {
        const stagedManifest = path.join(stageRoot, 'manifest.json');
        await this.mutate('stage-write', manifestPath, signal);
        await this.write(stagedManifest, manifestBytes, 'utf8');
        const stagedStats = this.delta
          ? await lstat(stagedManifest, { bigint: true }).catch(() => undefined)
          : undefined;
        const manifestExists = await exists(manifestPath);
        const manifestRecord: RollbackRecord = {
          target: manifestPath,
          published: false,
          removeTarget: !manifestExists,
        };
        rollback.push(manifestRecord);
        if (manifestExists) {
          const backup = path.join(backups, 'manifest.json');
          manifestRecord.backup = backup;
          await this.mutate('backup-manifest', manifestPath, signal);
          await this.backUp(manifestPath, backup);
        }
        await this.mutate('publish-manifest', manifestPath, signal);
        assertCurrent(request.generation, guard, signal);
        await this.renameFile(stagedManifest, manifestPath);
        manifestRecord.published = true;
        // The stamp of the file this commit published, or none: another writer may have replaced
        // the manifest already, and that manifest must never become the base of a delta commit.
        if (stagedStats) manifestStamp = await this.publishedStamp(manifestPath, stagedStats);
      }
      assertCurrent(request.generation, guard, signal);

      await rm(stageRoot, removal(this.platform)).catch((error: unknown) => {
        diagnostics.push(
          diagnostic(
            'OUTPUT_STAGE_CLEANUP',
            `Committed, but stage cleanup failed: ${message(error)}.`,
            'warning',
          ),
        );
      });
      // Without delta commits, published files are verified again by the next commit. With them,
      // each published file's own stat is recorded instead; a stat inside the racy window
      // is not trusted, exactly as for a compared file. Only current outputs are kept.
      if (this.delta) await this.rememberPublished(published);
      else for (const item of changed) this.verified.delete(item.relative);
      const nextPaths = new Set(plan.manifest.files.map((item) => item.path));
      for (const relative of [...this.verified.keys()]) {
        if (!nextPaths.has(relative)) this.verified.delete(relative);
      }
      if (this.delta && call === this.calls && !this.disposed) {
        const publication = manifestStamp && this.publication(request, plan, last, manifestStamp);
        // A call made meanwhile (rejected while this one was active) ended the trust as well.
        if (call === this.calls && !this.disposed) this.published = publication;
      }
      return {
        status: 'committed',
        manifest: plan.manifest,
        written: changed.map((item) => item.relative),
        removed: removedPaths,
        diagnostics,
      };
    } catch (error) {
      this.verified.clear();
      const rollbackDiagnostics = await rollbackFiles(rollback, this.restoreFile, this.platform);
      if (stageRoot && rollbackDiagnostics.length === 0) {
        await rm(stageRoot, removal(this.platform)).catch(() => undefined);
      } else if (stageRoot) {
        rollbackDiagnostics.push(
          diagnostic(
            'OUTPUT_STAGE_PRESERVED',
            `Rollback was incomplete; recovery data remains at ${slash(stageRoot)}.`,
          ),
        );
      }
      if (isStaleError(error)) return { status: 'stale', diagnostics: rollbackDiagnostics };
      return {
        status: 'failed',
        diagnostics: [diagnostic('OUTPUT_COMMIT_FAILED', message(error)), ...rollbackDiagnostics],
      };
    }
  }

  /**
   * The probe of a plan's targets: every segment is checked as `assertSafeTarget` would, and an
   * existing target that the previous manifest does not own is an unowned collision.
   */
  private checkTargets(
    plan: CommitPlan,
    probe: Map<string, PathState>,
    generation: number,
    guard: CommitGuard,
    signal: AbortSignal,
  ): CommitResult | undefined {
    const ownedPaths = plan.ownedPaths;
    for (const item of plan.outputs) {
      assertCurrent(generation, guard, signal);
      this.checkProbedTarget(item.target, probe);
      if (probedExists(item.target, probe) && !ownedPaths.has(item.relative)) {
        return failed(
          'OUTPUT_UNOWNED_COLLISION',
          `Refusing to overwrite unowned output ${item.relative}.`,
        );
      }
    }
    return undefined;
  }

  private prepare(
    request: CommitRequest,
    previous: OutputManifest | undefined,
    canonicalOutputRoot: string,
  ): { outputs: PreparedOutput[]; manifest: OutputManifest } | { diagnostic: Diagnostic } {
    if (!isArtifactSnapshotShape(request.candidate)) {
      return {
        diagnostic: diagnostic(
          'OUTPUT_CANDIDATE_INVALID',
          `Candidate is not a complete schema-${SCHEMA_VERSION} ArtifactSnapshot.`,
        ),
      };
    }
    if (
      request.candidate.configuration &&
      request.candidate.configuration.outputRoot !== this.outputRoot.replace(/\\/g, '/') &&
      request.candidate.configuration.outputRoot !== canonicalOutputRoot.replace(/\\/g, '/')
    ) {
      return {
        diagnostic: diagnostic(
          'OUTPUT_CONFIGURATION_ROOT',
          'Candidate configuration does not match the committer publication root.',
        ),
      };
    }
    if (
      request.candidate.configuration &&
      request.candidate.artifacts.some(
        (artifact) =>
          artifact.fingerprint.configurationDigest !== request.candidate.configuration!.digest,
      )
    ) {
      return {
        diagnostic: diagnostic(
          'OUTPUT_CONFIGURATION_DIGEST',
          'Candidate host configuration and artifact configuration digests differ.',
        ),
      };
    }
    const scopeError = validateSemanticScopes(request.candidate.artifacts)[0];
    if (scopeError) return { diagnostic: scopeError };
    if (
      previous &&
      (!isOutputManifest(previous) || previous.projectId !== request.candidate.projectId)
    ) {
      return {
        diagnostic: diagnostic(
          'OUTPUT_MANIFEST_INVALID',
          'Previous output manifest is invalid or belongs to another project.',
        ),
      };
    }
    const byPath = new Map<string, PreparedOutput>();
    const artifactIds = new Set<string>();
    const identities = new Set<string>();
    for (const artifact of request.candidate.artifacts) {
      if (artifact.identity.projectId !== request.candidate.projectId) {
        return {
          diagnostic: diagnostic(
            'OUTPUT_PROJECT_MISMATCH',
            `Artifact ${artifact.id} belongs to another project.`,
          ),
        };
      }
      const identity = stableJson(artifact.identity);
      if (artifactIds.has(artifact.id) || identities.has(identity)) {
        return {
          diagnostic: diagnostic(
            'OUTPUT_ARTIFACT_COLLISION',
            `Duplicate artifact identity ${artifact.id}.`,
          ),
        };
      }
      artifactIds.add(artifact.id);
      identities.add(identity);
      for (const output of artifact.outputs) {
        let relative: string;
        let bytes: Buffer;
        try {
          relative = normalizeRelative(output.path);
          bytes = outputBytes(output);
        } catch (error) {
          return { diagnostic: diagnostic('OUTPUT_INVALID', `${artifact.id}: ${message(error)}`) };
        }
        if (relative === MANIFEST_NAME || relative.startsWith('.ng-doc-stage-')) {
          return {
            diagnostic: diagnostic(
              'OUTPUT_RESERVED_PATH',
              `Output uses reserved path ${relative}.`,
            ),
          };
        }
        if (byPath.has(relative)) {
          return {
            diagnostic: diagnostic('OUTPUT_PATH_COLLISION', `Multiple artifacts own ${relative}.`),
          };
        }
        byPath.set(relative, {
          relative,
          target: path.join(this.outputRoot, relative),
          bytes,
          output,
          ownerId: artifact.id,
        });
      }
    }
    const outputs = [...byPath.values()].sort((left, right) =>
      compareText(left.relative, right.relative),
    );
    const manifest: OutputManifest = {
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      projectId: request.candidate.projectId,
      generation: request.generation,
      revision: request.candidate.revision,
      files: outputs.map((item) => ({
        path: item.relative,
        ownerId: item.ownerId,
        digest: item.output.digest,
        role: item.output.role,
      })),
    };
    return { outputs, manifest };
  }

  private async ensureSafeRoot(): Promise<void> {
    if (await exists(this.outputRoot)) {
      const info = await lstat(this.outputRoot);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error('Output root must be a real directory, not a symlink.');
    } else {
      await mkdir(this.outputRoot, { recursive: true });
    }
  }

  private async assertSafeTarget(target: string): Promise<void> {
    const root = await realpath(this.outputRoot);
    const relative = path.relative(this.outputRoot, target);
    if (outside(relative)) throw new Error(`Output escapes root: ${target}.`);
    let current = this.outputRoot;
    const segments = relative.split(path.sep).filter(Boolean);
    for (const [index, segment] of segments.entries()) {
      current = path.join(current, segment);
      if (!(await exists(current))) break;
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Output path contains a symlink: ${current}.`);
      if (index < segments.length - 1 && !info.isDirectory())
        throw new Error(`Output parent is not a directory: ${current}.`);
      if (index === segments.length - 1 && !info.isFile())
        throw new Error(`Output target is not a regular file: ${current}.`);
      const resolved = await realpath(current);
      if (!within(root, resolved)) throw new Error(`Output resolves outside root: ${target}.`);
    }
  }

  /**
   * The read-only half of the full commit's per-output loop, concurrently: whether each output is
   * unchanged since it was verified, else its safety check (`assertSafeTarget`) and the comparison
   * of its bytes. A large site has thousands of outputs, and one at a time those lstat, realpath
   * and read calls made a restart that writes nothing wait on the filesystem for seconds.
   *
   * Nothing here writes or records anything: the caller applies the outcomes in plan order, so
   * staging, the verified stats and the first failure are exactly those of the sequential loop (a
   * later output's failure is never reported before an earlier output's). An output whose check
   * did not run (the generation stopped being current) is checked by the caller as before.
   */
  private async checkOutputs(
    outputs: readonly PreparedOutput[],
    probe: Map<string, PathState>,
    generation: number,
    guard: CommitGuard,
    signal: AbortSignal,
  ): Promise<Array<OutputCheck | undefined>> {
    const checks: Array<OutputCheck | undefined> = new Array(outputs.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      for (let index = next++; index < outputs.length; index = next++) {
        if (!isCurrent(generation, guard, signal)) return;
        const item = outputs[index]!;
        if (this.unchangedSinceVerified(item, probe)) {
          checks[index] = { kind: 'verified' };
          continue;
        }
        try {
          await this.assertSafeTarget(item.target);
          checks[index] = {
            kind: 'compared',
            comparison: await compareFile(item.target, item.bytes),
          };
        } catch (error) {
          checks[index] = { kind: 'failed', error };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, outputs.length) }, worker));
    return checks;
  }

  /**
   * Observes every path segment under the root once, concurrently.
   */
  private async probe(targets: string[]): Promise<Map<string, PathState>> {
    const paths = new Set<string>();
    for (const target of targets) {
      const relative = path.relative(this.outputRoot, target);
      if (outside(relative)) continue;
      let current = this.outputRoot;
      for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        paths.add(current);
      }
    }
    const states = new Map<string, PathState>();
    const pending = [...paths];
    const worker = async (): Promise<void> => {
      for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        try {
          states.set(next, { stats: await lstat(next, { bigint: true }) });
        } catch (error) {
          states.set(next, isMissing(error) ? { missing: true } : { error });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, pending.length) }, worker));
    return states;
  }

  /** `assertSafeTarget` over probed segments: the same checks, order and messages. */
  private checkProbedTarget(target: string, probe: Map<string, PathState>): void {
    const relative = path.relative(this.outputRoot, target);
    if (outside(relative)) throw new Error(`Output escapes root: ${target}.`);
    let current = this.outputRoot;
    const segments = relative.split(path.sep).filter(Boolean);
    for (const [index, segment] of segments.entries()) {
      current = path.join(current, segment);
      const state = probe.get(current);
      if (!state) throw new Error(`Output path was not observed: ${current}.`);
      if ('error' in state) throw state.error;
      if ('missing' in state) break;
      const info = state.stats;
      if (info.isSymbolicLink()) throw new Error(`Output path contains a symlink: ${current}.`);
      if (index < segments.length - 1 && !info.isDirectory())
        throw new Error(`Output parent is not a directory: ${current}.`);
      if (index === segments.length - 1 && !info.isFile())
        throw new Error(`Output target is not a regular file: ${current}.`);
      // Every segment below the non-symlink root is a real non-symlink entry, so the
      // resolved path is the canonical root joined with these segments: never outside it.
    }
  }

  private unchangedSinceVerified(item: PreparedOutput, probe: Map<string, PathState>): boolean {
    const record = this.verified.get(item.relative);
    const state = probe.get(item.target);
    if (!record || record.digest !== item.output.digest || !state || !('stats' in state))
      return false;
    const info = state.stats;
    return (
      info.isFile() &&
      info.dev === record.dev &&
      info.ino === record.ino &&
      info.size === record.size &&
      info.mtimeNs === record.mtimeNs &&
      info.ctimeNs === record.ctimeNs
    );
  }

  private rememberVerified(item: PreparedOutput, stats: BigIntStats, observedAtNs: bigint): void {
    // A file changed within the timestamp granularity of the stat could be rewritten after
    // it without a visible stat change; such files are compared again next time. The window
    // is measured from the clock reading taken before the stat, not from this later call.
    if (!stats.isFile() || isRacy(stats, observedAtNs)) {
      this.verified.delete(item.relative);
      return;
    }
    this.verified.set(item.relative, {
      digest: item.output.digest,
      dev: stats.dev,
      ino: stats.ino,
      size: stats.size,
      mtimeNs: stats.mtimeNs,
      ctimeNs: stats.ctimeNs,
    });
  }

  private async readManifest(): Promise<OutputManifest | undefined> {
    const file = path.join(this.outputRoot, MANIFEST_NAME);
    try {
      const value: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (!isOutputManifest(value)) throw new Error('Existing output manifest is invalid.');
      return value;
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  /**
   * The delta commit's plan, or why the full commit runs instead. It mutates nothing, and it
   * returns a plan only when the full commit would reach the same transaction: the base is the
   * publication this committer made in its previous call and still on disk (manifest stamp); the
   * configuration is unchanged; the changed artifacts and the top level pass the full path's
   * checks; and every target of a changed artifact and every orphan passes the probe. Anything
   * else, including an error, runs the full commit, which then reports any failure exactly as
   * before.
   */
  private async deltaAttempt(
    request: CommitRequest,
    last: Publication | undefined,
    guard: CommitGuard,
    signal: AbortSignal,
  ): Promise<{ plan: CommitPlan; probe: Map<string, PathState> } | { reason: FullCommitReason }> {
    if (!request.base) return { reason: 'no-base' };
    if (!last) return { reason: 'untrusted' };
    if (!trustedBase(last, request)) return { reason: 'base-identity' };
    try {
      const stamp = await this.manifestStamp();
      if (!stamp || !sameManifestStamp(stamp, last.stamp)) return { reason: 'manifest-stamp' };
      if (configurationDigest(request.candidate) !== last.configurationDigest)
        return { reason: 'configuration' };
      const prepared = this.prepareDelta(
        request,
        last,
        request.base.snapshot,
        await realpath(this.outputRoot),
      );
      if (!prepared) return { reason: 'candidate' };
      const plan: CommitPlan = { ...prepared, ownedPaths: last.files };
      assertCurrent(request.generation, guard, signal);
      const probe = await this.probe([
        ...plan.outputs.map((item) => item.target),
        ...plan.orphanPaths.map((relative) => path.join(this.outputRoot, relative)),
      ]);
      if (this.checkTargets(plan, probe, request.generation, guard, signal))
        return { reason: 'targets' };
      for (const relative of plan.orphanPaths)
        this.checkProbedTarget(path.join(this.outputRoot, relative), probe);
      this.telemetry = plan.telemetry;
      return { plan, probe };
    } catch (error) {
      if (isStaleError(error)) throw error;
      return { reason: 'targets' };
    }
  }

  /**
   * `prepare` for the changed artifacts only, or undefined when the full commit must decide.
   * Unchanged artifacts (the same id and revision, and outputs equal to the published ones) keep
   * their published manifest entries; the manifest is the published one minus the entries of
   * removed or changed artifacts plus the changed artifacts' outputs, in the full path's order.
   */
  private prepareDelta(
    request: CommitRequest,
    last: Publication,
    base: ArtifactSnapshot,
    canonicalOutputRoot: string,
  ): Omit<CommitPlan, 'ownedPaths'> | undefined {
    const candidate = request.candidate;
    if (last.ties || !isSnapshotEnvelope(candidate) || candidate.projectId !== last.projectId)
      return undefined;
    const configuration = candidate.configuration;
    if (
      configuration &&
      configuration.outputRoot !== this.outputRoot.replace(/\\/g, '/') &&
      configuration.outputRoot !== canonicalOutputRoot.replace(/\\/g, '/')
    ) {
      return undefined;
    }
    const ids = new Set<string>();
    const identities = new Set<string>();
    const kept = new Set<string>();
    const changed: PageArtifact[] = [];
    for (const artifact of candidate.artifacts) {
      if (
        !isRecord(artifact) ||
        Object.getPrototypeOf(artifact) !== Object.prototype ||
        !string(artifact.id) ||
        ids.has(artifact.id)
      )
        return undefined;
      ids.add(artifact.id);
      if (unchangedArtifact(artifact, last)) {
        kept.add(artifact.id);
      } else if (
        !isPageArtifact(artifact) ||
        artifact.identity.projectId !== candidate.projectId ||
        (configuration && artifact.fingerprint.configurationDigest !== configuration.digest)
      ) {
        return undefined;
      } else {
        changed.push(artifact);
      }
      const identity = stableJson(artifact.identity);
      if (identities.has(identity)) return undefined;
      identities.add(identity);
    }
    // Removed or changed artifacts: their published entries leave the manifest.
    const replaced = new Set([...last.revisions.keys()].filter((id) => !kept.has(id)));
    if (
      scopesMayChange(changed, replaced, base, last) &&
      validateSemanticScopes(candidate.artifacts).length
    )
      return undefined;

    const byPath = new Map<string, PreparedOutput>();
    for (const artifact of changed) {
      for (const output of artifact.outputs) {
        let relative: string;
        let bytes: Buffer;
        try {
          relative = normalizeRelative(output.path);
          bytes = outputBytes(output);
        } catch {
          return undefined;
        }
        const owner = last.files.get(relative)?.ownerId;
        if (
          relative === MANIFEST_NAME ||
          relative.startsWith('.ng-doc-stage-') ||
          byPath.has(relative) ||
          // A path of an unchanged artifact: the full commit reports the collision.
          (owner !== undefined && !replaced.has(owner))
        ) {
          return undefined;
        }
        byPath.set(relative, {
          relative,
          target: path.join(this.outputRoot, relative),
          bytes,
          output,
          ownerId: artifact.id,
        });
      }
    }
    const outputs = [...byPath.values()].sort((left, right) =>
      compareText(left.relative, right.relative),
    );
    // Equal-comparing paths keep the candidate's order in the full path; that order is not known
    // here for the published entries, so such a commit is left to the full path.
    if (
      outputs.some(
        (item, index) => index > 0 && compareText(outputs[index - 1].relative, item.relative) === 0,
      )
    )
      return undefined;

    const files: OutputManifest['files'] = [];
    const orphanPaths: string[] = [];
    let next = 0;
    for (const entry of last.files.values()) {
      if (replaced.has(entry.ownerId)) {
        if (!byPath.has(entry.path)) orphanPaths.push(entry.path);
        continue;
      }
      for (; next < outputs.length; next++) {
        const order = compareText(outputs[next].relative, entry.path);
        if (order === 0) return undefined;
        if (order > 0) break;
        files.push(manifestEntry(outputs[next]));
      }
      files.push({ ...entry });
    }
    for (; next < outputs.length; next++) files.push(manifestEntry(outputs[next]));
    return {
      outputs,
      manifest: {
        schemaVersion: OUTPUT_SCHEMA_VERSION,
        projectId: candidate.projectId,
        generation: request.generation,
        revision: candidate.revision,
        files,
      },
      orphanPaths,
      telemetry: { mode: 'delta', artifacts: changed.length, outputs: outputs.length },
    };
  }

  /**
   * Post-publish verification: the stat of each file this commit published is recorded instead of
   * forgotten, but only while the target is provably still the file this commit wrote:
   * - the target right after the rename had the staged file's device, inode, size and mtime (a
   *   rename keeps them; a replacement changes the inode);
   * - the target now has that same stat, including the ctime taken right after the rename (an
   *   in-place rewrite changes the ctime even when it restores the mtime, as `touch -r` does);
   * - the timestamps are finer than whole seconds (on a coarse filesystem a rewrite within the
   *   same tick leaves every timestamp unchanged, so nothing is recorded there).
   * `rememberVerified` keeps its racy-window rule, so a file is trusted only when it was
   * published at least that window before its stat; a file published later would be dropped by
   * that rule anyway and is not observed at all.
   */
  private async rememberPublished(published: Map<PreparedOutput, PublishedOutput>): Promise<void> {
    for (const [item, { atNs, staged, renamed }] of published) {
      const observedAtNs = nowNs();
      if (!staged || !renamed || coarse(staged) || observedAtNs - atNs < RACY_WINDOW_NS) {
        this.verified.delete(item.relative);
        continue;
      }
      try {
        const info = await lstat(item.target, { bigint: true });
        if (
          sameWrittenFile(renamed, staged) &&
          sameWrittenFile(info, renamed) &&
          info.ctimeNs === renamed.ctimeNs
        ) {
          this.rememberVerified(item, info, observedAtNs);
        } else this.verified.delete(item.relative);
      } catch {
        this.verified.delete(item.relative);
      }
    }
  }

  /**
   * The stamp of `file` if it is still the file whose staged stat is `staged`. None on a
   * filesystem with whole-second timestamps: there an in-place rewrite of the manifest within the
   * same tick would keep the stamp, so such a committer always takes the full path.
   */
  private async publishedStamp(
    file: string,
    staged: BigIntStats,
  ): Promise<ManifestStamp | undefined> {
    try {
      if (coarse(staged)) return undefined;
      const info = await lstat(file, { bigint: true });
      if (!info.isFile() || !sameWrittenFile(info, staged)) return undefined;
      return {
        dev: info.dev,
        ino: info.ino,
        size: info.size,
        mtimeNs: info.mtimeNs,
        ctimeNs: info.ctimeNs,
      };
    } catch {
      return undefined;
    }
  }

  /** What the next call may use as its delta base: this commit's manifest, as published. */
  private publication(
    request: CommitRequest,
    plan: CommitPlan,
    last: Publication | undefined,
    stamp: ManifestStamp,
  ): Publication {
    const files = new Map<string, OutputManifest['files'][number]>();
    const counts = new Map<string, number>();
    let ties = plan.telemetry.mode === 'delta' ? !!last?.ties : false;
    let previous: string | undefined;
    for (const item of plan.manifest.files) {
      files.set(item.path, { ...item });
      counts.set(item.ownerId, (counts.get(item.ownerId) ?? 0) + 1);
      if (
        !ties &&
        plan.telemetry.mode === 'full' &&
        previous !== undefined &&
        compareText(previous, item.path) === 0
      )
        ties = true;
      previous = item.path;
    }
    return {
      projectId: plan.manifest.projectId,
      revision: plan.manifest.revision,
      generation: plan.manifest.generation,
      configurationDigest: configurationDigest(request.candidate),
      files,
      counts,
      revisions: new Map(
        request.candidate.artifacts.map((artifact) => [artifact.id, artifact.revision]),
      ),
      stamp,
      ties,
    };
  }

  private async manifestStamp(): Promise<ManifestStamp | undefined> {
    try {
      const info = await lstat(path.join(this.outputRoot, MANIFEST_NAME), { bigint: true });
      if (!info.isFile()) return undefined;
      return {
        dev: info.dev,
        ino: info.ino,
        size: info.size,
        mtimeNs: info.mtimeNs,
        ctimeNs: info.ctimeNs,
      };
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  /**
   * Keeps the published file `target` at `backup` for the rollback, leaving `target` in place: a
   * hard link to the same file, so the publish rename that follows replaces `target` in one step
   * and it never goes missing. Had it been moved away first, a reader between the two renames (a
   * transform request) would find no file, and a watcher that stats a file whose inode moved
   * (chokidar's `fs.watch` backend, the default on Linux) would report the rewrite as a deletion
   * and a creation; a host waiting for that output's change would wait in vain.
   *
   * Where the file system refuses the link, the file is moved away instead, which is the protocol
   * without links: the rollback restores either backup the same way, so only the gap differs. Any
   * system error falls back, not a list of codes, because file systems do not agree on one: FAT
   * reports `EPERM` on Linux, while Windows reports its "incorrect function" as `EISDIR` and a file
   * another process holds open as `EBUSY`; network and FUSE mounts answer `ENOTSUP`, `ENOSYS` or
   * whatever their server does. An unknown code must not fail every commit. A link that took
   * effect although it reported an error is harmless: both names then refer to the original file.
   * Only an error without a code, which no file system call raises, is rethrown.
   * @param target A published output or the manifest.
   * @param backup Its path in the stage's backups.
   */
  private async backUp(target: string, backup: string): Promise<void> {
    try {
      await this.linkFile(target, backup);
    } catch (error) {
      if (typeof (error as NodeJS.ErrnoException | undefined)?.code !== 'string') throw error;
      await this.renameFile(target, backup);
    }
  }

  private async mutate(
    operation: CommitMutation,
    target: string,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    if (this.hook)
      await abortable(
        Promise.resolve().then(() => this.hook?.(operation, target)),
        signal,
      );
    throwIfAborted(signal);
  }
}

/** The bytes a commit publishes as `outputRoot`'s manifest. */
function publishedManifestBytes(manifest: OutputManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Whether `outputRoot` still publishes exactly `manifest`: its manifest file holds the bytes the
 * commit of `manifest` wrote. A later commit of any generation or project replaces it.
 */
export function publishesManifest(outputRoot: string, manifest: OutputManifest): Promise<boolean> {
  return fileMatches(path.join(outputRoot, MANIFEST_NAME), publishedManifestBytes(manifest));
}

export function createArtifactCache(root: string): ArtifactCache {
  return new JsonArtifactCache({ root });
}

export function createOutputCommitter(options: OutputCommitterOptions): OutputCommitter {
  return new TransactionalOutputCommitter(options);
}

async function rollbackFiles(
  records: RollbackRecord[],
  renameFile: typeof rename,
  platform: NodeJS.Platform,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const record of [...records].reverse()) {
    try {
      if (record.backup && (await exists(record.backup))) {
        await rm(record.target, removal(platform));
        await mkdir(path.dirname(record.target), { recursive: true });
        await renameFile(record.backup, record.target);
      } else if (record.backup && !(await exists(record.target))) {
        throw new Error(`Rollback backup is missing: ${record.backup}.`);
      } else if (record.published || record.removeTarget) {
        await rm(record.target, removal(platform));
      }
    } catch (error) {
      diagnostics.push(diagnostic('OUTPUT_ROLLBACK_FAILED', `${record.target}: ${message(error)}`));
    }
  }
  return diagnostics;
}

function outputBytes(output: FileOutput): Buffer {
  const bytes =
    output.encoding === 'utf8' ? Buffer.from(output.content, 'utf8') : decodeBase64(output.content);
  if (hash(bytes) !== output.digest) throw new Error(`Digest mismatch for ${output.path}.`);
  return bytes;
}

function decodeBase64(value: string): Buffer {
  const normalized = value.replace(/\s/g, '');
  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
    throw new Error('Invalid base64 output content.');
  }
  return bytes;
}

function normalizeRelative(value: string): string {
  if (!value || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value)) {
    throw new Error(`Unsafe output path: ${value}.`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    value.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe output path: ${value}.`);
  }
  return normalized;
}

/**
 * The base and the previous manifest both name the publication this committer made in its previous
 * call, and the base snapshot is that publication's candidate. A caller behind its own disk (a
 * commit it did not adopt) or passing a pair from different acknowledgements fails here.
 */
function trustedBase(last: Publication, request: CommitRequest): boolean {
  const published = (manifest: unknown) =>
    isRecord(manifest) &&
    manifest.projectId === last.projectId &&
    manifest.revision === last.revision &&
    manifest.generation === last.generation;
  const base = request.base;
  return (
    isRecord(base) &&
    published(base.manifest) &&
    published(request.previous) &&
    isRecord(base.snapshot) &&
    base.snapshot.projectId === last.projectId &&
    base.snapshot.revision === last.revision
  );
}

/** Whole-second modification and change times: a coarse-timestamp filesystem. */
function coarse(info: BigIntStats): boolean {
  return info.mtimeNs % 1_000_000_000n === 0n && info.ctimeNs % 1_000_000_000n === 0n;
}

/** The same file as written: a rename keeps these; a replacement changes the inode. */
function sameWrittenFile(info: BigIntStats, written: BigIntStats): boolean {
  return (
    info.dev === written.dev &&
    info.ino === written.ino &&
    info.size === written.size &&
    info.mtimeNs === written.mtimeNs
  );
}

function sameManifestStamp(left: ManifestStamp, right: ManifestStamp): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function configurationDigest(candidate: unknown): unknown {
  return isRecord(candidate) && isRecord(candidate.configuration)
    ? candidate.configuration.digest
    : undefined;
}

/**
 * A candidate artifact that the publication already holds: the same id and revision (a digest of
 * the artifact) and the same output paths, digests and roles. Its checks and its outputs' bytes
 * were verified when it was published.
 */
function unchangedArtifact(artifact: Record<string, unknown>, last: Publication): boolean {
  const id = artifact.id as string;
  const outputs = artifact.outputs;
  if (
    !string(artifact.revision) ||
    last.revisions.get(id) !== artifact.revision ||
    !Array.isArray(outputs) ||
    outputs.length !== (last.counts.get(id) ?? 0)
  )
    return false;
  return outputs.every((output: unknown) => {
    if (!isRecord(output) || !string(output.path)) return false;
    const entry = last.files.get(output.path);
    return entry?.ownerId === id && entry.digest === output.digest && entry.role === output.role;
  });
}

const EMPTY_SCOPE_FACTS = stableJson({ definitions: [], references: [] });

/** An artifact's inputs to `validateSemanticScopes`: aggregate definitions and references. */
function scopeFacts(artifact: PageArtifact): string {
  return stableJson({
    definitions:
      artifact.identity.role === 'aggregate'
        ? artifact.dependencies.filter((dependency) => dependency.kind === 'semantic')
        : [],
    references: [
      ...artifact.dependencies,
      ...artifact.content.flatMap((content) => content.ir.dependencies),
    ].filter((dependency) => dependency.kind === 'semantic-reference'),
  });
}

/**
 * Whether `validateSemanticScopes` over the candidate can report anything, given that it reported
 * nothing for the published candidate (no commit publishes otherwise). Its result depends only on
 * the aggregates' semantic definitions and the artifacts' semantic references (it still runs over
 * the whole candidate whenever an aggregate's dependencies change). Removing references cannot add
 * a diagnostic, so only removed aggregates and changed or new definitions or references can; a
 * published artifact the base snapshot does not hold counts as changed.
 */
function scopesMayChange(
  changed: PageArtifact[],
  replaced: Set<string>,
  base: ArtifactSnapshot,
  last: Publication,
): boolean {
  const published = new Map<string, PageArtifact>();
  for (const artifact of Array.isArray(base.artifacts) ? base.artifacts : []) {
    if (
      isRecord(artifact) &&
      string(artifact.id) &&
      last.revisions.get(artifact.id) === artifact.revision
    ) {
      published.set(artifact.id, artifact as unknown as PageArtifact);
    }
  }
  const changedIds = new Set(changed.map((artifact) => artifact.id));
  for (const id of replaced) {
    const before = published.get(id);
    if (
      !changedIds.has(id) &&
      (!before || !isRecord(before.identity) || before.identity.role === 'aggregate')
    )
      return true;
  }
  for (const artifact of changed) {
    if (!last.revisions.has(artifact.id)) {
      if (scopeFacts(artifact) !== EMPTY_SCOPE_FACTS) return true;
      continue;
    }
    const before = published.get(artifact.id);
    try {
      if (!before || scopeFacts(before) !== scopeFacts(artifact)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

function manifestEntry(item: PreparedOutput): OutputManifest['files'][number] {
  return {
    path: item.relative,
    ownerId: item.ownerId,
    digest: item.output.digest,
    role: item.output.role,
  };
}

function orderForPublication(outputs: PreparedOutput[]): PreparedOutput[] {
  const late = new Set<FileOutput['role']>(['routes', 'context', 'search', 'api-list']);
  return [...outputs].sort(
    (left, right) =>
      Number(late.has(left.output.role)) - Number(late.has(right.output.role)) ||
      compareText(left.relative, right.relative),
  );
}

/** `fileMatches` that also returns the stat taken before the bytes were read and the clock
 * reading taken before that stat. */
async function compareFile(
  file: string,
  expected: Buffer,
): Promise<{ equal: true; stats: BigIntStats; observedAtNs: bigint } | { equal: false }> {
  try {
    const observedAtNs = nowNs();
    const info = await stat(file, { bigint: true });
    if (!info.isFile() || info.size !== BigInt(expected.byteLength)) return { equal: false };
    return (await readFile(file)).equals(expected)
      ? { equal: true, stats: info, observedAtNs }
      : { equal: false };
  } catch (error) {
    if (isMissing(error)) return { equal: false };
    throw error;
  }
}

function nowNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

/** Changed within the racy window before `observedAtNs` (the clock reading before the stat). */
function isRacy(info: BigIntStats, observedAtNs: bigint): boolean {
  const settled = observedAtNs - RACY_WINDOW_NS;
  return info.mtimeNs > settled || info.ctimeNs > settled;
}

function probedExists(target: string, probe: Map<string, PathState>): boolean {
  const state = probe.get(target);
  if (!state) throw new Error(`Output path was not observed: ${target}.`);
  if ('error' in state) throw state.error;
  return 'stats' in state;
}

function fileStamp(info: BigIntStats, observedNs: bigint): FileStamp {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    size: String(info.size),
    mtimeNs: String(info.mtimeNs),
    ctimeNs: String(info.ctimeNs),
    observedNs: String(observedNs),
  };
}

/** Same file identity; `observedNs` is when a stamp was taken, not part of the identity. */
function sameStamp(left: FileStamp, right: FileStamp): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function isRacyStamp(stamp: FileStamp): boolean {
  try {
    const settled = BigInt(stamp.observedNs) - RACY_WINDOW_NS;
    return BigInt(stamp.mtimeNs) > settled || BigInt(stamp.ctimeNs) > settled;
  } catch {
    return true;
  }
}

function entryText(artifact: PageArtifact): string {
  return `${JSON.stringify(artifact)}\n`;
}

async function fileMatches(file: string, expected: Buffer): Promise<boolean> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size !== expected.byteLength) return false;
    return (await readFile(file)).equals(expected);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isCurrent(generation: number, guard: CommitGuard, signal: AbortSignal): boolean {
  return !signal.aborted && guard.isCurrent(generation);
}

function assertCurrent(generation: number, guard: CommitGuard, signal: AbortSignal): void {
  if (!isCurrent(generation, guard, signal)) throw new StaleCommitError();
}

class StaleCommitError extends Error {}

function isStaleError(error: unknown): boolean {
  return error instanceof StaleCommitError || isAbort(error);
}

function stale(): CommitResult {
  return { status: 'stale', diagnostics: [] };
}

function failed(code: string, text: string): CommitResult {
  return { status: 'failed', diagnostics: [diagnostic(code, text)] };
}

function diagnostic(
  code: string,
  text: string,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return { code, severity, stage: 'commit', message: text };
}

function miss(
  reason: 'invalid' | 'fingerprint',
  code: string,
  text: string,
  source: string,
): { status: 'miss'; reason: 'invalid' | 'fingerprint'; diagnostics: Diagnostic[] } {
  return {
    status: 'miss',
    reason,
    diagnostics: [
      { code, severity: 'warning', stage: 'cache', message: text, source: { path: slash(source) } },
    ],
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    String((error as { name: unknown }).name) === 'AbortError'
  );
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === 'ENOENT'
  );
}

function within(root: string, child: string): boolean {
  const relative = path.relative(root, child);
  return relative === '' || !outside(relative);
}

function outside(relative: string): boolean {
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function slash(value: string): string {
  return value.replaceAll(path.sep, '/');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => key in value) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function string(value: unknown): value is string {
  return typeof value === 'string';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(string);
}

function isIdentity(value: unknown): value is ArtifactIdentity {
  if (
    !isRecord(value) ||
    !exact(value, ['projectId', 'entryId', 'role'], ['declarationId', 'part'])
  )
    return false;
  return (
    string(value.projectId) &&
    string(value.entryId) &&
    [
      'page-shell',
      'content',
      'demo-assets',
      'playgrounds',
      'category',
      'api-list',
      'aggregate',
    ].includes(String(value.role)) &&
    (value.declarationId === undefined || string(value.declarationId)) &&
    (value.part === undefined || string(value.part))
  );
}

function isFingerprint(value: unknown): value is ArtifactFingerprint {
  return (
    isRecord(value) &&
    exact(value, [
      'schemaVersion',
      'compilerVersion',
      'toolchainDigest',
      'configurationDigest',
      'inputDigest',
      'keywordDigest',
    ]) &&
    value.schemaVersion === SCHEMA_VERSION &&
    [
      value.compilerVersion,
      value.toolchainDigest,
      value.configurationDigest,
      value.inputDigest,
      value.keywordDigest,
    ].every(string)
  );
}

function isDependency(value: unknown): value is Dependency {
  if (!isRecord(value) || !string(value.kind)) return false;
  if (value.kind === 'content')
    return exact(value, ['kind', 'path', 'digest']) && string(value.path) && string(value.digest);
  if (value.kind === 'existence')
    return (
      exact(value, ['kind', 'path', 'exists']) &&
      string(value.path) &&
      typeof value.exists === 'boolean'
    );
  if (value.kind === 'glob')
    return (
      exact(value, ['kind', 'root', 'include', 'exclude', 'members']) &&
      string(value.root) &&
      stringArray(value.include) &&
      stringArray(value.exclude) &&
      stringArray(value.members)
    );
  if (value.kind === 'semantic')
    return (
      exact(value, ['kind', 'scopeId', 'digest', 'files', 'reason']) &&
      string(value.scopeId) &&
      string(value.digest) &&
      stringArray(value.files) &&
      string(value.reason)
    );
  if (value.kind === 'semantic-reference')
    return (
      exact(value, ['kind', 'scopeId', 'digest', 'reason']) &&
      string(value.scopeId) &&
      string(value.digest) &&
      string(value.reason)
    );
  if (value.kind === 'semantic-closure')
    return (
      exact(value, ['kind', 'scopeId', 'key', 'digest']) &&
      string(value.scopeId) &&
      string(value.key) &&
      string(value.digest)
    );
  if (value.kind === 'evaluated')
    return (
      exact(value, ['kind', 'entryId', 'digest']) && string(value.entryId) && string(value.digest)
    );
  return (
    value.kind === 'keyword' &&
    exact(value, ['kind', 'key', 'digest']) &&
    string(value.key) &&
    string(value.digest)
  );
}

function isKeyword(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(value, ['key', 'title', 'path'], ['type', 'languages', 'description']) &&
    string(value.key) &&
    string(value.title) &&
    string(value.path) &&
    (value.type === undefined || value.type === 'link') &&
    (value.languages === undefined || stringArray(value.languages)) &&
    [value.description, value.signature].every((item) => item === undefined || string(item))
  );
}

function isSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(value, ['path'], ['line', 'column']) &&
    string(value.path) &&
    (value.line === undefined || finite(value.line)) &&
    (value.column === undefined || finite(value.column))
  );
}

function isDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(value, ['code', 'severity', 'message', 'stage'], ['source', 'ownerId', 'related']) &&
    string(value.code) &&
    ['error', 'warning', 'info'].includes(String(value.severity)) &&
    string(value.message) &&
    [
      'discovery',
      'evaluation',
      'semantic',
      'content',
      'aggregate',
      'cache',
      'commit',
      'host',
    ].includes(String(value.stage)) &&
    (value.source === undefined || isSource(value.source)) &&
    (value.ownerId === undefined || string(value.ownerId)) &&
    (value.related === undefined ||
      (Array.isArray(value.related) &&
        value.related.every(
          (item) =>
            isRecord(item) &&
            exact(item, ['message', 'source']) &&
            string(item.message) &&
            isSource(item.source),
        )))
  );
}

function isSearch(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(
      value,
      ['breadcrumbs', 'pageType', 'title', 'section', 'route', 'content'],
      ['fragment', 'kind', 'signature', 'description'],
    ) &&
    stringArray(value.breadcrumbs) &&
    ['guide', 'api'].includes(String(value.pageType)) &&
    [value.title, value.section, value.route, value.content].every(string) &&
    [value.fragment, value.kind, value.signature, value.description].every(
      (item) => item === undefined || string(item),
    )
  );
}

function isAnchor(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(value, ['anchorId', 'anchor', 'title', 'type'], ['scope']) &&
    [value.anchorId, value.anchor, value.title].every(string) &&
    ['heading', 'member'].includes(String(value.type)) &&
    (value.scope === undefined ||
      (isRecord(value.scope) &&
        exact(value.scope, ['key', 'title']) &&
        string(value.scope.key) &&
        string(value.scope.title)))
  );
}

function isLinkedContent(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exact(value, ['ir', 'html', 'searchRecords', 'keywordDigest']) ||
    !string(value.html) ||
    !string(value.keywordDigest) ||
    !Array.isArray(value.searchRecords) ||
    !value.searchRecords.every(isSearch) ||
    !isRecord(value.ir)
  )
    return false;
  const ir = value.ir;
  return (
    exact(
      ir,
      [
        'schemaVersion',
        'id',
        'entryId',
        'role',
        'title',
        'route',
        'absoluteRoute',
        'html',
        'anchors',
        'exportedKeywords',
        'usedKeywords',
        'dependencies',
        'diagnostics',
      ],
      ['icon', 'searchBreadcrumbs'],
    ) &&
    ir.schemaVersion === SCHEMA_VERSION &&
    [ir.id, ir.entryId, ir.title, ir.route, ir.absoluteRoute, ir.html].every(string) &&
    ['guide-tab', 'api-tab', 'header', 'demo-assets'].includes(String(ir.role)) &&
    (ir.searchBreadcrumbs === undefined || stringArray(ir.searchBreadcrumbs)) &&
    (ir.icon === undefined || string(ir.icon)) &&
    Array.isArray(ir.anchors) &&
    ir.anchors.every(isAnchor) &&
    Array.isArray(ir.exportedKeywords) &&
    ir.exportedKeywords.every(isKeyword) &&
    stringArray(ir.usedKeywords) &&
    Array.isArray(ir.dependencies) &&
    ir.dependencies.every(isDependency) &&
    Array.isArray(ir.diagnostics) &&
    ir.diagnostics.every(isDiagnostic)
  );
}

function isRoute(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(
      value,
      ['id', 'path', 'title'],
      [
        'parentId',
        'order',
        'hidden',
        'icon',
        'metadata',
        'category',
        'modulePath',
        'apiListSegment',
      ],
    ) &&
    [value.id, value.path, value.title].every(string) &&
    (value.parentId === undefined || string(value.parentId)) &&
    (value.order === undefined || finite(value.order)) &&
    (value.hidden === undefined || typeof value.hidden === 'boolean') &&
    (value.icon === undefined || string(value.icon)) &&
    (value.modulePath === undefined || string(value.modulePath)) &&
    (value.apiListSegment === undefined || string(value.apiListSegment)) &&
    (value.metadata === undefined ||
      (isRecord(value.metadata) &&
        exact(value.metadata, ['description', 'tags']) &&
        string(value.metadata.description) &&
        isRecord(value.metadata.tags) &&
        Object.values(value.metadata.tags).every(stringArray))) &&
    (value.category === undefined ||
      (isRecord(value.category) &&
        exact(value.category, ['runtimeImport'], ['expandable', 'expanded']) &&
        isRecord(value.category.runtimeImport) &&
        exact(value.category.runtimeImport, ['source', 'exportName']) &&
        string(value.category.runtimeImport.source) &&
        string(value.category.runtimeImport.exportName) &&
        (value.category.expandable === undefined ||
          typeof value.category.expandable === 'boolean') &&
        (value.category.expanded === undefined || typeof value.category.expanded === 'boolean')))
  );
}

function isApiList(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(
      value,
      ['apiEntryId', 'scopeId', 'scopeTitle', 'name', 'type', 'route'],
      ['description', 'signature'],
    ) &&
    [value.apiEntryId, value.scopeId, value.scopeTitle, value.name, value.type, value.route].every(
      string,
    ) &&
    [value.description, value.signature].every((item) => item === undefined || string(item))
  );
}

function isFileOutput(value: unknown): value is FileOutput {
  return (
    isRecord(value) &&
    exact(value, ['path', 'role', 'encoding', 'content', 'digest']) &&
    string(value.path) &&
    ['angular', 'content', 'asset', 'routes', 'context', 'search', 'api-list'].includes(
      String(value.role),
    ) &&
    ['utf8', 'base64'].includes(String(value.encoding)) &&
    string(value.content) &&
    string(value.digest)
  );
}

function isContentDescriptor(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exact(
      value,
      [
        'schemaVersion',
        'id',
        'ownerId',
        'ordinal',
        'role',
        'locator',
        'title',
        'route',
        'absoluteRoute',
        'searchBreadcrumbs',
        'dependencies',
        'inputDigest',
        'requestDigest',
        'closureIds',
      ],
      ['icon', 'keyword'],
    )
  )
    return false;
  if (
    value.schemaVersion !== SCHEMA_VERSION ||
    ![
      value.id,
      value.ownerId,
      value.title,
      value.route,
      value.absoluteRoute,
      value.inputDigest,
      value.requestDigest,
    ].every(string) ||
    ![value.id, value.ownerId, value.inputDigest, value.requestDigest].every(
      (item) => string(item) && item.length > 0 && !item.includes('\0'),
    ) ||
    !finite(value.ordinal) ||
    value.ordinal < 0 ||
    !Number.isInteger(value.ordinal) ||
    !['guide-tab', 'api-tab', 'header'].includes(String(value.role)) ||
    !stringArray(value.searchBreadcrumbs) ||
    !Array.isArray(value.dependencies) ||
    !value.dependencies.every((dependency) => isPhysicalDescriptorDependency(dependency)) ||
    new Set(value.dependencies.map((dependency) => stableJson(dependency))).size !==
      value.dependencies.length ||
    !stringArray(value.closureIds) ||
    (value.icon !== undefined && !string(value.icon)) ||
    (value.keyword !== undefined && !string(value.keyword)) ||
    !isRecord(value.locator)
  )
    return false;
  const locator = value.locator;
  return value.role === 'header'
    ? exact(locator, ['kind']) && locator.kind === 'header'
    : value.role === 'guide-tab'
      ? exact(locator, ['kind', 'markdown']) &&
        locator.kind === 'guide-tab' &&
        string(locator.markdown)
      : exact(locator, ['kind', 'declarationId']) &&
        locator.kind === 'api-tab' &&
        string(locator.declarationId);
}

function isPhysicalDescriptorDependency(value: unknown): boolean {
  return (
    isRecord(value) &&
    ((value.kind === 'content' &&
      exact(value, ['kind', 'path', 'digest']) &&
      absoluteNormalizedPath(value.path) &&
      string(value.digest)) ||
      (value.kind === 'existence' &&
        exact(value, ['kind', 'path', 'exists']) &&
        absoluteNormalizedPath(value.path) &&
        typeof value.exists === 'boolean'))
  );
}

function validDescriptorPlan(artifact: PageArtifact): boolean {
  const descriptors = artifact.contentDescriptors;
  if (descriptors === undefined) return true;
  if (!Array.isArray(descriptors) || !descriptors.every(isContentDescriptor)) return false;
  if (
    (artifact.identity.role === 'category' || artifact.identity.role === 'aggregate') &&
    descriptors.length
  )
    return false;
  const headers = descriptors.filter((descriptor) => descriptor.role === 'header');
  if (
    descriptors.length &&
    (headers.length !== 1 ||
      descriptors.some(
        (descriptor) =>
          descriptor.role !== 'header' && !descriptor.closureIds.includes(headers[0].id),
      ))
  )
    return false;
  if (
    artifact.identity.declarationId !== undefined &&
    (descriptors.length !== 2 ||
      descriptors.filter((descriptor) => descriptor.role === 'api-tab').length !== 1)
  )
    return false;
  const ids = new Set<string>();
  const ready = new Map<string, PageArtifact['content'][number]>();
  for (const item of artifact.content) {
    if (item.ir.role === 'demo-assets' || ready.has(item.ir.id)) continue;
    ready.set(item.ir.id, item);
  }
  if (ready.size !== artifact.content.filter((item) => item.ir.role !== 'demo-assets').length)
    return false;
  for (const [ordinal, descriptor] of descriptors.entries()) {
    if (
      descriptor.ownerId !== artifact.id ||
      descriptor.ordinal !== ordinal ||
      ids.has(descriptor.id) ||
      descriptor.closureIds.includes(descriptor.id) ||
      new Set(descriptor.closureIds).size !== descriptor.closureIds.length ||
      descriptor.closureIds.some((id, index) => index > 0 && descriptor.closureIds[index - 1] >= id)
    )
      return false;
    if (
      descriptor.role === 'guide-tab' &&
      (artifact.identity.declarationId !== undefined ||
        (descriptor.locator.kind === 'guide-tab' &&
          !absoluteNormalizedPath(descriptor.locator.markdown)))
    )
      return false;
    if (
      descriptor.role === 'api-tab' &&
      (descriptor.locator.kind !== 'api-tab' ||
        descriptor.locator.declarationId !== artifact.identity.declarationId)
    )
      return false;
    ids.add(descriptor.id);
  }
  for (const id of ids) if (!ready.has(id)) return false;
  for (const id of ready.keys()) if (!ids.has(id)) return false;
  for (const descriptor of descriptors) {
    const linked = ready.get(descriptor.id);
    if (
      linked &&
      (linked.ir.entryId !== artifact.identity.entryId ||
        linked.ir.role !== descriptor.role ||
        linked.ir.title !== descriptor.title ||
        linked.ir.route !== descriptor.route ||
        linked.ir.absoluteRoute !== descriptor.absoluteRoute ||
        !sameStringArray(linked.ir.searchBreadcrumbs ?? [], descriptor.searchBreadcrumbs) ||
        linked.ir.icon !== descriptor.icon)
    )
      return false;
  }
  const closures = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor.closureIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    const valid = (closures.get(id) ?? []).every(
      (dependency) => ids.has(dependency) && visit(dependency),
    );
    visiting.delete(id);
    visited.add(id);
    return valid;
  };
  return [...ids].every(visit);
}

function absoluteNormalizedPath(value: unknown): value is string {
  if (!string(value) || value.includes('\0') || value.includes('\\')) return false;
  const unc = value.match(/^\/\/([^/]+)\/([^/]+)(?:\/|$)/);
  const rooted =
    (value.startsWith('/') && !value.startsWith('//')) || /^[A-Za-z]:\//.test(value) || !!unc;
  const remainder = unc ? value.slice(`//${unc[1]}/${unc[2]}`.length) : value;
  const root = value === '/' || /^[A-Za-z]:\/$/.test(value) || /^\/\/[^/]+\/[^/]+\/$/.test(value);
  return (
    rooted &&
    (!unc || (!['.', '..'].includes(unc[1]) && !['.', '..'].includes(unc[2]))) &&
    !remainder.includes('//') &&
    (root || !value.endsWith('/')) &&
    !remainder.split('/').some((part) => part === '.' || part === '..')
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPageArtifact(value: unknown): value is PageArtifact {
  return (
    isJsonTree(value) &&
    isRecord(value) &&
    exact(
      value,
      [
        'id',
        'identity',
        'revision',
        'fingerprint',
        'dependencies',
        'content',
        'exportedKeywords',
        'usedKeywords',
        'searchRecords',
        'routes',
        'apiList',
        'outputs',
        'diagnostics',
      ],
      ['contentDescriptors'],
    ) &&
    string(value.id) &&
    isIdentity(value.identity) &&
    string(value.revision) &&
    isFingerprint(value.fingerprint) &&
    Array.isArray(value.dependencies) &&
    value.dependencies.every(isDependency) &&
    Array.isArray(value.content) &&
    value.content.every(isLinkedContent) &&
    Array.isArray(value.exportedKeywords) &&
    value.exportedKeywords.every(isKeyword) &&
    stringArray(value.usedKeywords) &&
    Array.isArray(value.searchRecords) &&
    value.searchRecords.every(isSearch) &&
    Array.isArray(value.routes) &&
    value.routes.every(isRoute) &&
    Array.isArray(value.apiList) &&
    value.apiList.every(isApiList) &&
    Array.isArray(value.outputs) &&
    value.outputs.every((output) => isFileOutput(output) && validOutputDigest(output)) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(isDiagnostic) &&
    validDescriptorPlan(value as unknown as PageArtifact)
  );
}

function isJsonTree(value: unknown, ancestors: WeakSet<object> = new WeakSet()): boolean {
  if (value === null || string(value) || typeof value === 'boolean') return true;
  if (finite(value)) return !Object.is(value, -0);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || !keys.includes('length')) return false;
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index) || !isJsonTree(value[index], ancestors)) return false;
      }
      return true;
    }
    if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        descriptor?.enumerable === true &&
        'value' in descriptor &&
        isJsonTree(descriptor.value, ancestors)
      );
    });
  } finally {
    ancestors.delete(value);
  }
}

function validOutputDigest(output: FileOutput): boolean {
  try {
    outputBytes(output);
    return true;
  } catch {
    return false;
  }
}

/** Shared strict boundary for host-visible candidate configuration. */
export function isPublishedGeneratorConfiguration(
  value: unknown,
): value is PublishedGeneratorConfiguration {
  return (
    isJsonTree(value) &&
    isRecord(value) &&
    exact(value, ['outputRoot', 'cacheRoot', 'assetDirectory', 'themes', 'digest']) &&
    [value.outputRoot, value.cacheRoot].every(
      (item) =>
        string(item) &&
        path.isAbsolute(item) &&
        path.resolve(item).replace(/\\/g, '/') === item &&
        !item.includes('\0'),
    ) &&
    string(value.assetDirectory) &&
    !path.win32.parse(value.assetDirectory).root &&
    safeRelative(value.assetDirectory) &&
    isRecord(value.themes) &&
    exact(value.themes, ['light', 'dark']) &&
    string(value.themes.light) &&
    string(value.themes.dark) &&
    string(value.digest)
  );
}

function isArtifactSnapshotShape(value: unknown): boolean {
  return (
    isJsonTree(value) &&
    isRecord(value) &&
    exact(
      value,
      ['projectId', 'revision', 'artifacts', 'globalKeywords', 'remoteKeywords'],
      ['configuration'],
    ) &&
    (value.configuration === undefined || isPublishedGeneratorConfiguration(value.configuration)) &&
    string(value.projectId) &&
    string(value.revision) &&
    Array.isArray(value.artifacts) &&
    value.artifacts.every(isPageArtifact) &&
    Array.isArray(value.globalKeywords) &&
    value.globalKeywords.every(isKeyword) &&
    Array.isArray(value.remoteKeywords) &&
    value.remoteKeywords.every(isRemoteKeywords)
  );
}

function isRemoteKeywords(remote: unknown): boolean {
  return (
    isRecord(remote) &&
    exact(remote, ['loaderId', 'digest', 'keywords'], ['validator']) &&
    string(remote.loaderId) &&
    string(remote.digest) &&
    Array.isArray(remote.keywords) &&
    remote.keywords.every(isKeyword) &&
    (remote.validator === undefined || string(remote.validator))
  );
}

/**
 * `isArtifactSnapshotShape` without the artifacts themselves: every top-level field is
 * a JSON value of its schema and `artifacts` is a plain dense array. The delta commit checks the
 * changed artifacts with `isPageArtifact`; the unchanged ones passed it when they were published.
 */
function isSnapshotEnvelope(value: unknown): value is ArtifactSnapshot {
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (
    !keys.every((key) => {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && 'value' in descriptor;
    })
  )
    return false;
  const artifacts = value.artifacts;
  if (
    !Array.isArray(artifacts) ||
    Object.getPrototypeOf(artifacts) !== Array.prototype ||
    Reflect.ownKeys(artifacts).length !== artifacts.length + 1
  )
    return false;
  for (let index = 0; index < artifacts.length; index += 1)
    if (!Object.hasOwn(artifacts, index)) return false;
  return (
    exact(
      value,
      ['projectId', 'revision', 'artifacts', 'globalKeywords', 'remoteKeywords'],
      ['configuration'],
    ) &&
    (value.configuration === undefined || isPublishedGeneratorConfiguration(value.configuration)) &&
    string(value.projectId) &&
    string(value.revision) &&
    isJsonTree(value.globalKeywords) &&
    Array.isArray(value.globalKeywords) &&
    value.globalKeywords.every(isKeyword) &&
    isJsonTree(value.remoteKeywords) &&
    Array.isArray(value.remoteKeywords) &&
    value.remoteKeywords.every(isRemoteKeywords)
  );
}

function isOutputManifest(value: unknown): value is OutputManifest {
  return (
    isJsonTree(value) &&
    isRecord(value) &&
    exact(value, ['schemaVersion', 'projectId', 'generation', 'revision', 'files']) &&
    value.schemaVersion === OUTPUT_SCHEMA_VERSION &&
    string(value.projectId) &&
    finite(value.generation) &&
    string(value.revision) &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) =>
        isRecord(file) &&
        exact(file, ['path', 'ownerId', 'digest', 'role']) &&
        string(file.path) &&
        string(file.ownerId) &&
        string(file.digest) &&
        safeRelative(file.path) &&
        ['angular', 'content', 'asset', 'routes', 'context', 'search', 'api-list'].includes(
          String(file.role),
        ),
    ) &&
    new Set(value.files.map((file) => (file as { path: string }).path)).size === value.files.length
  );
}

function safeRelative(value: string): boolean {
  try {
    normalizeRelative(value);
    return true;
  } catch {
    return false;
  }
}
