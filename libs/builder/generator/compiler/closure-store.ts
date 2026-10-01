import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { retryingRename } from '../artifacts';
import {
  type CompilationRequest,
  type DiscoverySnapshot,
  type PageArtifact,
  GENERATOR_SCHEMA_VERSION,
} from '../contracts';
import { bytesDigest, compareCodeUnits, contentDigest } from '../kernel/canonical';
import type { ClosureRecord, ClosureStore } from '../semantic/semantic-closure';
import { hash } from './common';
import type { CompilationOptions } from './index';
import type { ScopedSemanticMode } from './semantic-closure';

/**
 * The persistent store of semantic closure records, beside the artifact cache.
 *
 * A closure record (`R` and the derived-class identities of one query) lives in the runtime that
 * recorded it. The startup generation of a development server runs in a one-shot runtime, and a
 * restart restores its artifacts from the cache, so the long-lived runtime that serves the edits
 * would start without records: its first program edit would refresh every closure as changed and
 * rebuild every semantic unit. Each development generation that writes the cache therefore also
 * writes the records of every closure its candidate holds, and a runtime that carries no records
 * is seeded from them (`SemanticClosures.seed`).
 *
 * A stored record is a fact that is checked every time it is used, as a carried one is: the
 * closure digest covers the record's files and derived identities, so a record recomputes to its
 * dependency's digest only when it is that digest's record and the closure holds. A missing,
 * stale or corrupt store therefore only makes units render again; it never changes output.
 *
 * The store is kept only where the targeted rebuild and scoped semantic invalidation are on, for
 * development generations with incremental reuse and the cache enabled: `NGDOC_TARGETED_REBUILD=0`
 * (and `NGDOC_SCOPED_SEMANTIC=0`, the reference path, production) neither reads nor writes it.
 *
 * A start restored from a cache written without a store (or with a store another compiler,
 * schema or configuration wrote) writes an almost empty one: its reused IRs have no records. Its
 * first program edit then rebuilds the semantic units, as without the store, and the store holds
 * their records from then on.
 */

/** What a store must have been written by to be read: the compiler, schema and configuration. */
export interface ClosureStoreIdentity {
  compilerVersion: string;
  toolchainDigest: string;
  configurationDigest: string;
}

interface ClosureStoreFile extends ClosureStoreIdentity {
  /** 2: with `order` (a store without the program's file order confirms nothing). */
  schemaVersion: 2;
  generatorSchemaVersion: number;
  /** Every file a record names, once, in code-unit order. */
  files: string[];
  /** Per closure digest, in code-unit order: `[digest, file positions, derived, wide?]`. */
  records: StoredRecord[];
  /**
   * The file order of the program the records hold on (every program file, in program order):
   * with `stableTypeOrdering`, a record confirms its closure only while no two files swapped
   * places since (`SemanticClosures`).
   */
  order: string[];
}

type StoredRecord =
  | [digest: string, files: number[], derived: string[]]
  | [digest: string, files: number[], derived: string[], wide: Record<string, string>];

/**
 * The store of a generation, or undefined when it keeps none: a development generation with
 * incremental reuse, the cache, scoped semantic invalidation and the targeted rebuild on.
 */
export function closureStorePath(
  options: CompilationOptions,
  request: CompilationRequest,
  configuration: DiscoverySnapshot['configuration'],
  scopedSemantic: ScopedSemanticMode,
): string | undefined {
  if (
    request.mode !== 'development' ||
    options.incrementalReuse === false ||
    options.targetedRebuild === false ||
    scopedSemantic === 'off' ||
    !configuration.cacheEnabled
  )
    return undefined;
  return path.join(configuration.cacheRoot, `${hash(options.projectId)}.semantic-closures.json`);
}

/**
 * The digests a store file holds, by file, as this process last read or wrote it, with the
 * content digest of exactly those bytes: a generation whose candidate holds exactly these closures
 * does not write the file again while it still holds them.
 */
const known = new Map<string, { key: string; content: string }>();

const storeKey = (digests: readonly string[]): string => digests.join('\n');

/** The content digest of a file's current bytes (undefined when it cannot be read). */
function currentContent(file: string): string | undefined {
  try {
    return bytesDigest(readFileSync(file));
  } catch {
    return undefined;
  }
}

/** Temporary files of an interrupted save are removed once they are this old. */
const STALE_TEMPORARY_MS = 60_000;

/** Reads a store. Absent, unreadable, invalid or of another compiler, schema or configuration: empty. */
export function loadClosureStore(file: string, identity: ClosureStoreIdentity): ClosureStore {
  const store: Map<string, ClosureRecord> & { order?: readonly string[] } = new Map();
  try {
    const bytes = readFileSync(file);
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (
      !isStoreFile(value) ||
      value.generatorSchemaVersion !== GENERATOR_SCHEMA_VERSION ||
      value.compilerVersion !== identity.compilerVersion ||
      value.toolchainDigest !== identity.toolchainDigest ||
      value.configurationDigest !== identity.configurationDigest
    )
      return store;
    // An empty order (a store written without one) confirms nothing (`SemanticClosures`).
    if (value.order.length) store.order = value.order;
    for (const [digest, positions, derived, wide] of value.records)
      store.set(digest, {
        files: positions.map((position) => value.files[position]!),
        derived,
        ...(wide ? { wide } : {}),
      });
    known.set(file, {
      key: storeKey([...store.keys(), '\0', ...value.order]),
      content: bytesDigest(bytes),
    });
  } catch {
    // Absent or unreadable: nothing is seeded.
    store.clear();
    delete store.order;
  }
  return store;
}

/**
 * Writes the records of every closure the artifacts hold (their dependencies and their IRs'),
 * as far as `record` knows them. Best effort, atomically replaced: a store that is not written only
 * makes a later runtime render again.
 */
export async function saveClosureStore(
  file: string,
  identity: ClosureStoreIdentity,
  artifacts: readonly PageArtifact[],
  record: (digest: string) => ClosureRecord | undefined,
): Promise<void> {
  const digests = new Set<string>();
  for (const artifact of artifacts)
    for (const dependency of [
      ...artifact.dependencies,
      ...artifact.content.flatMap((item) => item.ir.dependencies),
    ])
      if (dependency.kind === 'semantic-closure') digests.add(dependency.digest);
  const records: Array<[string, ClosureRecord]> = [];
  for (const digest of [...digests].sort(compareCodeUnits)) {
    const found = record(digest);
    if (found) records.push([digest, found]);
  }
  // Every record a generation hands out carries its program's file order.
  const order = records.find(([, item]) => item.order)?.[1].order ?? [];
  const key = storeKey([...records.map(([digest]) => digest), '\0', ...order]);
  const last = known.get(file);
  if (last?.key === key && last.content === currentContent(file)) return;
  const files = [...new Set(records.flatMap(([, item]) => item.files))].sort(compareCodeUnits);
  const positions = new Map(files.map((item, position) => [item, position]));
  const content: ClosureStoreFile = {
    schemaVersion: 2,
    generatorSchemaVersion: GENERATOR_SCHEMA_VERSION,
    compilerVersion: identity.compilerVersion,
    toolchainDigest: identity.toolchainDigest,
    configurationDigest: identity.configurationDigest,
    files,
    records: records.map(([digest, item]): StoredRecord => {
      const stored: [string, number[], string[]] = [
        digest,
        item.files.map((name) => positions.get(name)!),
        [...item.derived],
      ];
      return item.wide ? [...stored, { ...item.wide }] : stored;
    }),
    order: [...order],
  };
  const text = JSON.stringify(content);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await sweepTemporaries(file);
    await writeFile(temporary, text, { flag: 'wx' });
    await retryingRename(rename)(temporary, file);
    // What this call wrote, not what the file holds now: another writer may already have replaced
    // it, and the next save then writes again.
    known.set(file, { key, content: contentDigest(text) });
  } catch {
    // Best effort: a missing store only makes a later runtime render again.
    known.delete(file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

/**
 * Removes the temporary files a save of `file` left behind when its process was killed. A
 * temporary file younger than {@link STALE_TEMPORARY_MS} may belong to a save in progress.
 */
export async function sweepTemporaries(file: string): Promise<void> {
  const directory = path.dirname(file);
  const prefix = `${path.basename(file)}.`;
  const now = Date.now();
  for (const name of await readdir(directory)) {
    if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
    const temporary = path.join(directory, name);
    try {
      if (now - (await stat(temporary)).mtimeMs > STALE_TEMPORARY_MS)
        await rm(temporary, { force: true });
    } catch {
      // Removed meanwhile.
    }
  }
}

/** Forgets what this process read or wrote (tests). */
export function resetClosureStores(): void {
  known.clear();
}

function isStoreFile(value: unknown): value is ClosureStoreFile {
  const text = (item: unknown): item is string => typeof item === 'string';
  const texts = (item: unknown): item is string[] => Array.isArray(item) && item.every(text);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as Record<string, unknown>)['schemaVersion'] !== 2
  )
    return false;
  const file = value as Record<string, unknown>;
  const files = file['files'];
  const records = file['records'];
  if (
    typeof file['generatorSchemaVersion'] !== 'number' ||
    !text(file['compilerVersion']) ||
    !text(file['toolchainDigest']) ||
    !text(file['configurationDigest']) ||
    !texts(files) ||
    !texts(file['order']) ||
    !Array.isArray(records)
  )
    return false;
  return records.every((item: unknown) => {
    if (!Array.isArray(item) || (item.length !== 3 && item.length !== 4)) return false;
    const [digest, positions, derived, wide] = item as unknown[];
    return (
      text(digest) &&
      Array.isArray(positions) &&
      positions.every(
        (position) =>
          Number.isInteger(position) &&
          (position as number) >= 0 &&
          (position as number) < files.length,
      ) &&
      texts(derived) &&
      (item.length === 3 ||
        (!!wide &&
          typeof wide === 'object' &&
          !Array.isArray(wide) &&
          Object.values(wide).every(text)))
    );
  });
}
