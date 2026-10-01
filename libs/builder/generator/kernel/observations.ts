import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import type { Dependency } from '../contracts';
import { bytesDigest, compareCodeUnits, dependencyIdentity } from './canonical';

/**
 * The files recorder shared by discovery and the semantic service: every read, existence probe and
 * glob a phase makes, recorded as dependencies in the one digest domain (`kernel/canonical.ts`).
 * The content compiler and the semantic footprints record through {@link readText} as well, so a
 * path read by several phases always has one digest for the same bytes.
 */

/**
 * The digest recorded for a path that one recorder saw with two different contents: no single
 * digest describes what was used, so it never verifies and every consumer is recomputed.
 */
export const CONFLICTING_CONTENT_DIGEST = 'conflicting-reads';

export interface ObservationRecorderOptions {
  /**
   * A recorder that also receives everything this one records; this one then keeps its own subset
   * (for example the configuration's inputs) and shares the parent's bytes.
   */
  readonly parent?: ObservationRecorder;
  /**
   * Read each file once: every later read returns the same bytes, so all consumers use, and the
   * recorded digest describes, exactly those bytes. Only for a recorder that lives for one phase
   * call; a long-lived one would keep serving old bytes.
   */
  readonly cacheBytes?: boolean;
  /** Turns a path into its recorded form; the identity by default. */
  readonly normalize?: (file: string) => string;
  /** Receives every observation added after construction (a footprint's files channel). */
  readonly observer?: (dependency: Dependency) => void;
}

/**
 * A set of dependencies with at most one per identity, listed in code-unit order of the identity.
 * A later observation of an identity replaces the earlier one, except that two contents of one
 * path record {@link CONFLICTING_CONTENT_DIGEST}.
 */
export class ObservationRecorder {
  private readonly values = new Map<string, { dependency: Dependency; text: string }>();
  private ordered?: Dependency[];
  private readonly parent?: ObservationRecorder;
  private readonly bytes?: Map<string, Buffer>;
  private readonly normalize: (file: string) => string;
  private readonly observer?: (dependency: Dependency) => void;

  constructor(initial: readonly Dependency[] = [], options: ObservationRecorderOptions = {}) {
    this.parent = options.parent;
    this.bytes = options.parent ? options.parent.bytes : options.cacheBytes ? new Map() : undefined;
    this.normalize = options.normalize ?? options.parent?.normalize ?? ((file) => file);
    for (const dependency of initial) this.add(dependency);
    // An already ordered initial list (a published observation set) needs no sort.
    const entries = [...this.values.keys()];
    if (
      entries.every((key, index) => index === 0 || compareCodeUnits(entries[index - 1]!, key) < 0)
    )
      this.ordered = [...this.values.values()].map(({ dependency }) => dependency);
    this.observer = options.observer;
  }

  add(dependency: Dependency): void {
    this.parent?.add(dependency);
    this.observer?.(dependency);
    const identity = dependencyIdentity(dependency);
    const existing = this.values.get(identity)?.dependency;
    let value = cloneDependency(dependency);
    if (
      value.kind === 'content' &&
      existing?.kind === 'content' &&
      existing.digest !== value.digest
    )
      value = { ...value, digest: CONFLICTING_CONTENT_DIGEST };
    const text = JSON.stringify(value);
    if (this.values.get(identity)?.text === text) return;
    this.values.set(identity, { dependency: value, text });
    this.ordered = undefined;
  }

  /** Records whether the file exists and, when it does, its content. */
  observeFile(file: string): boolean {
    return this.readFile(file) !== undefined;
  }

  /**
   * Records the file's existence and the digest of exactly the bytes returned. Undefined when the
   * file does not exist; a read error propagates.
   */
  readFile(file: string): Buffer | undefined {
    const path = this.normalize(file);
    let bytes = this.bytes?.get(path);
    const exists = bytes !== undefined || existsSync(file);
    this.add({ kind: 'existence', path, exists });
    if (!exists) return undefined;
    if (!bytes) {
      bytes = readFileSync(file);
      this.bytes?.set(path, bytes);
    }
    this.add({ kind: 'content', path, digest: bytesDigest(bytes) });
    return bytes;
  }

  /** {@link readFile} decoded as UTF-8; a missing file throws like `readFileSync`. */
  readText(file: string): string {
    const bytes = this.readFile(file);
    if (!bytes) return readFileSync(file, 'utf8');
    return bytes.toString('utf8');
  }

  /** The recorded dependencies, in code-unit order of their identities. */
  all(): Dependency[] {
    this.ordered ??= [...this.values]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([, { dependency }]) => dependency);
    return this.ordered.map(cloneDependency);
  }
}

/**
 * A synchronous read decoded as UTF-8 (as `readFileSync(path, 'utf8')`), with the content digest
 * of its bytes; throws what `readFileSync` throws.
 */
export function readText(path: string): { text: string; digest: string } {
  const bytes = readFileSync(path);
  return { text: bytes.toString('utf8'), digest: bytesDigest(bytes) };
}

/** The asynchronous {@link readText}; rejects with what `readFile` rejects with. */
export async function readTextFile(path: string): Promise<{ text: string; digest: string }> {
  const bytes = await readFile(path);
  return { text: bytes.toString('utf8'), digest: bytesDigest(bytes) };
}

function cloneDependency(dependency: Dependency): Dependency {
  if (dependency.kind === 'glob') {
    return {
      ...dependency,
      include: [...dependency.include],
      exclude: [...dependency.exclude],
      members: [...dependency.members],
    };
  }
  if (dependency.kind === 'semantic') return { ...dependency, files: [...dependency.files] };
  return { ...dependency };
}
