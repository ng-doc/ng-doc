import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ts } from 'ts-morph';

import { retryingRename } from '../artifacts';
import {
  type CompilationRequest,
  type CompilationResult,
  type Dependency,
  type Diagnostic,
  type DiscoverySnapshot,
  type PageArtifact,
  GENERATOR_SCHEMA_VERSION,
} from '../contracts';
import { createDependencyRefresher } from '../graph';
import { bytesDigest, contentDigest, dependencyIdentity, digestOf } from '../kernel/canonical';
import { FAST_START_FLAG, FLAGS, readFlag } from '../kernel/flags';
import { runtimePackages } from '../kernel/runtime-identity';
import { type ProgramWatchFacts, watchFactsChange } from '../semantic/program-retention';
import { snapshotOf } from './assemble';
import { sweepTemporaries } from './closure-store';
import { hash } from './common';
import type { Contribution } from './fold';
import type { CompilationOptions } from './index';
import { restoreIndex } from './plan';

/**
 * The fast start: a development start whose recorded inputs all re-read identically publishes the
 * candidate of the generation that recorded them, without building the TypeScript program or
 * rendering, linking and assembling anything.
 *
 * Every development generation that writes the artifact cache also writes, beside it, a record of
 * its result: the candidate's revision, the result's dependencies and diagnostics, the digest of
 * its discovery (the snapshot and what discovery recorded), and the private observations of its
 * program (`ProgramWatchFacts`). A start (a development `buildOnce`, which has no previous
 * snapshot) runs discovery as always, so user modules are evaluated and keyword loaders refresh,
 * and then takes the record only when all of this holds:
 *
 * - the record was written by this compiler, schema, options and engine switches, in a process
 *   with the same runtime (`runtimeIdentity`: Node, ICU, the default locale, TypeScript and the
 *   versions of the packages that shape output);
 * - discovery produced exactly the recorded snapshot, dependencies and diagnostics;
 * - every recorded physical dependency (content by its bytes' digest, existence, glob membership)
 *   and every private observation of the program re-reads identically: the program a
 *   synchronization would build now is then the recorded one, so every semantic digest the
 *   candidate holds is current;
 * - the artifact cache holds every artifact of the recorded candidate, each equal to its revision.
 *
 * The candidate is then the recorded one, assembled from the cache entries and the fresh discovery
 * exactly as a generation assembles it, and the result's dependencies are exact: each was the
 * digest of the bytes the recorded generation compiled, and those bytes are unchanged. Anything
 * else (no record, another engine, a changed or unreadable input, an incomplete cache) is a reason,
 * and the generation goes on as without the fast start. The long-lived runtime builds the program
 * afterwards in its warm-up, so the first edit still compiles only what it reaches.
 *
 * `NGDOC_FAST_START=0` (or `CompilationOptions.fastStart: false`) turns it off, together with the
 * reuse of the cache index's links and assemblies on a start after edits (`restoredReuse`).
 * `verify` restores and then compiles from scratch (the reference path's options, no previous
 * artifacts, no memo or closure store), publishes that result and reports
 * `COMPILATION_FAST_START_MISMATCH` when the two candidates differ: a compile that reused the
 * cache could not see an input that both the record and the cached artifacts lack.
 */

/** The warning a `verify` start reports when the restored candidate differs from the compiled one. */
export const FAST_START_MISMATCH = 'COMPILATION_FAST_START_MISMATCH';

const RECORD_VERSION = 1;

/** Recorded inputs re-read at once. */
const CHECK_CONCURRENCY = 64;

interface FastStartRecord {
  version: typeof RECORD_VERSION;
  /** The compiler, schema, options and switches that wrote it (`header`). */
  header: string;
  /** The candidate's revision. */
  revision: string;
  /** The discovery it was compiled from (`discoveryDigest`). */
  discovery: string;
  dependencies: Dependency[];
  diagnostics: Diagnostic[];
  program: ProgramWatchFacts;
}

/** The switch's value: `off`, `on` or `verify`. */
function fastStartSwitch(options: CompilationOptions): 'off' | 'on' | 'verify' {
  if (options.fastStart === false) return 'off';
  const value = readFlag(FAST_START_FLAG).value;
  return value === 'off' ? 'off' : options.fastStart === 'verify' ? 'verify' : value;
}

/**
 * Whether a start may reuse the links, assemblies and revisions of the cache index's artifacts,
 * as a generation reuses those of the session's snapshot (`GenerationPlan.sessionPrevious`), when
 * each of them is {@link intact}.
 */
export function restoredReuse(options: CompilationOptions): boolean {
  return fastStartSwitch(options) !== 'off';
}

/**
 * The fast start's mode for this request, or undefined: only a development generation without a
 * previous snapshot or watched changes (a start) with incremental reuse may take it.
 */
export function fastStartMode(
  options: CompilationOptions,
  request: CompilationRequest,
): 'on' | 'verify' | undefined {
  if (
    request.mode !== 'development' ||
    request.previous !== undefined ||
    request.contentRequest !== undefined ||
    request.changes.length > 0 ||
    options.incrementalReuse === false
  )
    return undefined;
  const value = fastStartSwitch(options);
  return value === 'off' ? undefined : value;
}

/** Where a generation of this request keeps its record, or undefined when it keeps none. */
export function fastStartPath(
  options: CompilationOptions,
  request: CompilationRequest,
  configuration: DiscoverySnapshot['configuration'],
): string | undefined {
  if (
    request.mode !== 'development' ||
    options.incrementalReuse === false ||
    fastStartSwitch(options) === 'off' ||
    !configuration.cacheEnabled
  )
    return undefined;
  return path.join(configuration.cacheRoot, `${hash(options.projectId)}.fast-start.json`);
}

/** Every engine switch but this one (`verify` and `on` record the same thing), as read now. */
export function engineSwitches(): Array<[string, string]> {
  return FLAGS.filter((flag) => flag.name !== FAST_START_FLAG).map((flag) => [
    flag.name,
    readFlag(flag.name).value,
  ]);
}

/**
 * What a record must have been written by: the compiler (its version and toolchain, in the
 * options), the schema, every option, and every engine switch, since switches change what a
 * generation records. Some switches are read when the compilation service is created (`created`,
 * for example the semantic service's shape closures), others when a generation compiles: both
 * readings count.
 */
function header(options: CompilationOptions, created: ReadonlyArray<[string, string]>): string {
  const { fastStart: _ignored, ...rest } = options;
  return digestOf({
    version: RECORD_VERSION,
    schema: GENERATOR_SCHEMA_VERSION,
    options: rest,
    switches: { created, compiled: engineSwitches() },
    runtime: runtimeIdentity(),
  });
}

let runtime: Record<string, unknown> | undefined;

/**
 * What the process that compiles brings to a generation besides the options: the Node and ICU
 * versions and the default locale (`localeCompare` and `Intl` without a locale depend on them),
 * the TypeScript that ts-morph runs, and the resolved versions of the packages that shape output
 * (`runtimePackages`). Read once per process: a package upgraded while it runs is not the code it
 * loaded, and the next process reads the new versions.
 */
export function runtimeIdentity(): Record<string, unknown> {
  if (runtime) return runtime;
  runtime = {
    node: process.versions.node,
    icu: process.versions.icu ?? null,
    unicode: process.versions.unicode ?? null,
    locale: new Intl.Collator().resolvedOptions().locale,
    typescript: ts.version,
    packages: runtimePackages(),
  };
  return runtime;
}

/** Discovery as the record compares it: the snapshot and what discovery recorded. */
function discoveryDigest(found: DiscoverySnapshot, discovery: readonly Contribution[]): string {
  return digestOf({ found, discovery });
}

/**
 * The content digest of the record a file holds, as this process last read or wrote it: a
 * generation whose record is unchanged does not write it again while the file still holds it.
 */
const known = new Map<string, string>();

/**
 * Writes the record of a generation's published result. Best effort and atomic: a record that is
 * not written only makes the next start compile.
 */
export async function saveFastStart(
  file: string,
  input: {
    options: CompilationOptions;
    /** The engine switches as the compilation service read them when it was created. */
    switches: ReadonlyArray<[string, string]>;
    found: DiscoverySnapshot;
    discovery: readonly Contribution[];
    result: CompilationResult;
    program: ProgramWatchFacts;
  },
): Promise<void> {
  const { options, switches, found, discovery, result, program } = input;
  if (!result.candidate) return;
  const record: FastStartRecord = {
    version: RECORD_VERSION,
    header: header(options, switches),
    revision: result.candidate.revision,
    discovery: discoveryDigest(found, discovery),
    dependencies: result.dependencies,
    diagnostics: result.diagnostics,
    program,
  };
  const text = JSON.stringify(record);
  const digest = contentDigest(text);
  if (known.get(file) === digest && currentDigest(file) === digest) return;
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await sweepTemporaries(file);
    await writeFile(temporary, text, { flag: 'wx' });
    await retryingRename(rename)(temporary, file);
    known.set(file, digest);
  } catch {
    known.delete(file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function currentDigest(file: string): string | undefined {
  try {
    return bytesDigest(readFileSync(file));
  } catch {
    return undefined;
  }
}

/** The outcome of {@link restoreFastStart}: the restored result, or why there is none. */
export type FastStart = { result: CompilationResult } | { reason: string };

/**
 * The recorded result, when every recorded input holds (see the module comment), or the reason
 * the start compiles.
 */
export async function restoreFastStart(input: {
  file: string;
  options: CompilationOptions;
  /** The engine switches as the compilation service read them when it was created. */
  switches: ReadonlyArray<[string, string]>;
  found: DiscoverySnapshot;
  discovery: readonly Contribution[];
  signal: AbortSignal;
}): Promise<FastStart> {
  const { file, options, found, signal } = input;
  let record: FastStartRecord;
  try {
    const bytes = readFileSync(file);
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!isRecord(value)) return { reason: 'the start record is invalid' };
    record = value;
    known.set(file, bytesDigest(bytes));
  } catch (error) {
    return {
      reason:
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'no start record'
          : 'the start record is unreadable',
    };
  }
  if (record.header !== header(options, input.switches))
    return { reason: 'the engine, its options or its switches changed' };
  if (record.discovery !== discoveryDigest(found, input.discovery)) {
    const changed = discoveryChange(record.dependencies, input.discovery);
    return {
      reason: changed
        ? `${changed} changed`
        : 'the configuration, a page module or a keyword loader changed',
    };
  }
  const ownedRoots = [found.configuration.outputRoot, found.configuration.cacheRoot].map(normalize);
  const [changed, artifacts] = await Promise.all([
    firstChange([...physical(record.dependencies), ...physical(record.program.hidden)], ownedRoots),
    restoreIndex(found.configuration.cacheRoot, options.projectId, []),
  ]);
  signal.throwIfAborted();
  if (changed) return { reason: `${changed} changed` };
  const program = watchFactsChange(record.program);
  if (program) return { reason: program };
  const candidate = snapshotOf(options.projectId, found, artifacts);
  if (candidate.revision !== record.revision)
    return { reason: 'the artifact cache does not hold the recorded pages' };
  if (!artifacts.every(intact)) return { reason: 'an artifact cache entry is damaged' };
  return {
    result: {
      candidate,
      dependencies: record.dependencies,
      diagnostics: record.diagnostics,
      whyRebuilt: [],
    },
  };
}

/**
 * A file discovery read now with other bytes (or existence) than the recorded generation did, for
 * the reason a start compiles; undefined when discovery differs otherwise (an evaluated value, a
 * keyword loader's result, a file it no longer reads).
 */
function discoveryChange(
  recorded: readonly Dependency[],
  discovery: readonly Contribution[],
): string | undefined {
  const before = new Map(physical(recorded).map((item) => [dependencyIdentity(item), item]));
  for (const item of physical(discovery.flatMap((contribution) => contribution.dependencies))) {
    if (item.kind === 'glob') continue;
    const previous = before.get(dependencyIdentity(item));
    if (previous && JSON.stringify(previous) !== JSON.stringify(item)) return item.path;
  }
  return undefined;
}

/**
 * Whether a restored artifact is the one its revision names. The cache vouches for an entry by its
 * identity and fingerprint only; an entry damaged in place may still parse.
 */
export function intact(artifact: PageArtifact): boolean {
  return hash({ ...artifact, revision: '' }) === artifact.revision;
}

type PhysicalDependency = Extract<Dependency, { kind: 'content' | 'existence' | 'glob' }>;

function physical(dependencies: readonly Dependency[]): PhysicalDependency[] {
  return dependencies.filter(
    (dependency): dependency is PhysicalDependency =>
      dependency.kind === 'content' ||
      dependency.kind === 'existence' ||
      dependency.kind === 'glob',
  );
}

function normalize(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

/** The members of a glob outside the generator-owned roots, as the session compares them. */
function members(values: readonly string[], roots: readonly string[]): string {
  return JSON.stringify(
    [...new Set(values.map(normalize))]
      .filter((file) => !roots.some((root) => file === root || file.startsWith(`${root}/`)))
      .sort(),
  );
}

/**
 * The first recorded input (in record order) that does not re-read identically, or undefined.
 * Content is compared by the digest of its bytes, never by a stat stamp; a glob by its membership
 * outside the owned roots (which no source membership includes); any read failure is a change.
 */
async function firstChange(
  inputs: readonly PhysicalDependency[],
  ownedRoots: readonly string[],
): Promise<string | undefined> {
  const refresher = createDependencyRefresher();
  const changed: boolean[] = new Array(inputs.length).fill(false);
  let next = 0;
  let found = false;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < inputs.length && !found; index = next++) {
      const input = inputs[index]!;
      const refreshed = await refresher.refresh([input], []);
      const current = refreshed.dependencies[0];
      const same =
        !refreshed.diagnostics.some((item) => item.severity === 'error') &&
        (input.kind === 'content'
          ? current?.kind === 'content' && current.digest === input.digest
          : input.kind === 'existence'
            ? current?.kind === 'existence' && current.exists === input.exists
            : current?.kind === 'glob' &&
              members(current.members, ownedRoots) === members(input.members, ownedRoots));
      if (!same) {
        changed[index] = true;
        found = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, inputs.length) }, worker));
  const index = changed.indexOf(true);
  if (index < 0) return undefined;
  const input = inputs[index]!;
  return input.kind === 'glob' ? `the files of ${input.root}` : input.path;
}

function isRecord(value: unknown): value is FastStartRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const program = record['program'] as Record<string, unknown> | undefined;
  const strings = (item: unknown): boolean =>
    Array.isArray(item) && item.every((entry) => typeof entry === 'string');
  return (
    record['version'] === RECORD_VERSION &&
    typeof record['header'] === 'string' &&
    typeof record['revision'] === 'string' &&
    typeof record['discovery'] === 'string' &&
    Array.isArray(record['dependencies']) &&
    record['dependencies'].every(isDependency) &&
    Array.isArray(record['diagnostics']) &&
    !!program &&
    typeof program === 'object' &&
    Array.isArray(program['hidden']) &&
    program['hidden'].every(isDependency) &&
    strings(program['missingDirectories']) &&
    Array.isArray(program['realpaths']) &&
    program['realpaths'].every(
      (pair: unknown) => Array.isArray(pair) && pair.length === 2 && strings(pair),
    ) &&
    Array.isArray(program['directories']) &&
    program['directories'].every((directory: unknown) => {
      const fact = directory as Record<string, unknown> | null;
      return (
        !!fact &&
        typeof fact === 'object' &&
        typeof fact['path'] === 'string' &&
        (fact['entries'] === null || strings(fact['entries']))
      );
    })
  );
}

/** A dependency's shape, as far as the fast start reads it (physical ones in full). */
function isDependency(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const dependency = value as Record<string, unknown>;
  switch (dependency['kind']) {
    case 'content':
      return typeof dependency['path'] === 'string' && typeof dependency['digest'] === 'string';
    case 'existence':
      return typeof dependency['path'] === 'string' && typeof dependency['exists'] === 'boolean';
    case 'glob':
      return (
        typeof dependency['root'] === 'string' &&
        Array.isArray(dependency['include']) &&
        Array.isArray(dependency['exclude']) &&
        Array.isArray(dependency['members']) &&
        dependency['members'].every((member) => typeof member === 'string')
      );
    default:
      return typeof dependency['kind'] === 'string';
  }
}

/** Forgets what this process read or wrote, and the runtime identity it read (tests). */
export function resetFastStarts(): void {
  known.clear();
  runtime = undefined;
}
