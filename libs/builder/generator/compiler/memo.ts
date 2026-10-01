import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type FileStamp, retryingRename } from '../artifacts';
import { hash } from './common';
import type { CompilationOptions } from './index';

export interface LinkMemo {
  /** SHA-256 of the IR HTML that was linked. */
  input: string;
  /** SHA-256 of the linked HTML it produced. */
  output: string;
  /** Every keyword key the link pass looked up, sorted and unique. */
  keys: string[];
  /** Digest of those keys' bindings when it linked. */
  bindings: string;
}

export interface AssemblyMemo {
  key: string;
  revision: string;
}

export interface CacheMemo {
  revision: string;
  stamp: FileStamp;
}

/**
 * Version 2: link facts no longer carry a completeness mode (every link resolves every keyword),
 * so a version 1 file, which may hold links that left unknown keys unlinked, is not read.
 */
const MEMO_SCHEMA_VERSION = 2;

interface CompilerMemoFile {
  schemaVersion: typeof MEMO_SCHEMA_VERSION;
  compilerVersion: string;
  toolchainDigest: string;
  link: Record<string, LinkMemo>;
  assembly: Record<string, AssemblyMemo>;
  cache: Record<string, CacheMemo>;
}

/**
 * Per-project reuse facts kept beside the artifact cache. Every entry states a fact about a
 * pure computation or a file identity ("linking this HTML with these consulted bindings
 * produced that HTML", "this assembly key produced the page of that revision", "this cache
 * file with this stamp holds that revision"), and every use re-checks the fact against the
 * current inputs, so a stale, missing or corrupt memo only disables reuse.
 */
export interface MemoState {
  enabled: boolean;
  link(id: string): LinkMemo | undefined;
  recordLink(id: string, entry: LinkMemo | undefined): void;
  assembly(id: string): AssemblyMemo | undefined;
  recordAssembly(id: string, entry: AssemblyMemo): void;
  cacheEntry(id: string): CacheMemo | undefined;
  recordCache(id: string, entry: CacheMemo): void;
  /**
   * Keeps the recorded facts of a unit the targeted path did not link, assemble or write again
   * (its assembly and cache entries, and the link entries of its content): the full path would
   * record the same facts for it, since each still holds for its unchanged inputs.
   */
  carry(unitId: string, contentIds: readonly string[]): void;
  save(projectId: string): Promise<void>;
}

const memoPath = (root: string, projectId: string) =>
  path.join(root, `${hash(projectId)}.compiler-memo.json`);

export function createMemoState(
  enabled: boolean,
  root: string,
  options: Pick<CompilationOptions, 'projectId' | 'compilerVersion' | 'toolchainDigest'>,
): MemoState {
  let loaded: CompilerMemoFile | undefined;
  const empty = (): CompilerMemoFile => ({
    schemaVersion: MEMO_SCHEMA_VERSION,
    compilerVersion: options.compilerVersion,
    toolchainDigest: options.toolchainDigest,
    link: {},
    assembly: {},
    cache: {},
  });
  const next = empty();
  const read = (): CompilerMemoFile => {
    if (loaded) return loaded;
    loaded = empty();
    if (!enabled) return loaded;
    try {
      const value: unknown = JSON.parse(readFileSync(memoPath(root, options.projectId), 'utf8'));
      if (
        isMemoFile(value) &&
        value.compilerVersion === options.compilerVersion &&
        value.toolchainDigest === options.toolchainDigest
      )
        loaded = value;
    } catch {
      // Absent or unreadable: nothing is reused.
    }
    return loaded;
  };
  const own = <T>(record: Record<string, T>, id: string): T | undefined =>
    Object.hasOwn(record, id) ? record[id] : undefined;
  return {
    enabled,
    link: (id) => (enabled ? own(read().link, id) : undefined),
    recordLink(id: string, entry: LinkMemo | undefined) {
      if (enabled && entry) next.link[id] = entry;
    },
    assembly: (id) => (enabled ? own(read().assembly, id) : undefined),
    recordAssembly(id: string, entry: AssemblyMemo) {
      if (enabled) next.assembly[id] = entry;
    },
    cacheEntry: (id) => (enabled ? own(read().cache, id) : undefined),
    recordCache(id: string, entry: CacheMemo) {
      if (enabled) next.cache[id] = entry;
    },
    carry(unitId: string, contentIds: readonly string[]) {
      if (!enabled) return;
      const memo = read();
      const assembly = own(memo.assembly, unitId);
      if (assembly) next.assembly[unitId] = assembly;
      const cache = own(memo.cache, unitId);
      if (cache) next.cache[unitId] = cache;
      for (const id of contentIds) {
        const link = own(memo.link, id);
        if (link) next.link[id] = link;
      }
    },
    async save(projectId: string) {
      if (!enabled) return;
      const file = memoPath(root, projectId);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(next), { flag: 'wx' });
        await retryingRename(rename)(temporary, file);
      } catch {
        // Best effort: a missing memo only disables reuse in the next compilation.
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
      }
    },
  };
}

function isMemoFile(value: unknown): value is CompilerMemoFile {
  const record = (item: unknown): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item);
  const text = (item: unknown): item is string => typeof item === 'string';
  const entries = (item: unknown, valid: (entry: Record<string, unknown>) => boolean) =>
    record(item) && Object.values(item).every((entry) => record(entry) && valid(entry));
  const stamp = (item: unknown) =>
    record(item) &&
    ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'observedNs'].every((key) => text(item[key]));
  return (
    record(value) &&
    value['schemaVersion'] === MEMO_SCHEMA_VERSION &&
    text(value['compilerVersion']) &&
    text(value['toolchainDigest']) &&
    entries(
      value['link'],
      (entry) =>
        text(entry['input']) &&
        text(entry['output']) &&
        Array.isArray(entry['keys']) &&
        entry['keys'].every(text) &&
        text(entry['bindings']),
    ) &&
    entries(value['assembly'], (entry) => text(entry['key']) && text(entry['revision'])) &&
    entries(value['cache'], (entry) => text(entry['revision']) && stamp(entry['stamp']))
  );
}
