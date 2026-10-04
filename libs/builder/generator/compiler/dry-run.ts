import { appendFileSync } from 'node:fs';

import type { ArtifactSnapshot, CompilationRequest } from '../contracts';
import type { PathPass } from './classify';
import { type TargetedGeneration, changedArtifacts } from './targeted';

/**
 * The targeted rebuild's report: one record per development generation that retains a program
 * while the targeted rebuild is on (`CompilationOptions.targetedRebuild`, resolved by bootstrap
 * from `NGDOC_TARGETED_REBUILD`). It says which path the generation took and why, and with
 * `verify` what the comparison with the full generation found.
 *
 * A file the report appends one JSON line per generation to (optional; for harnesses).
 */
export const TARGETED_REBUILD_TRACE_ENV = 'NGDOC_TARGETED_REBUILD_TRACE';
/** The code a difference between the targeted and the full generation is reported under. */
export const TARGETED_MISMATCH = 'COMPILATION_TARGETED_MISMATCH';

/** One generation's path, and with `verify` its check against the full generation. */
export interface DryRunRecord {
  generation: number;
  base: string | null;
  revision: string | null;
  /** `content`: the targeted path compiled this generation; `full`: it did not (with `reason`). */
  path: 'content' | 'full';
  /** Which compilation the result came from. */
  published: 'targeted' | 'full';
  reason?: string;
  pin: boolean;
  /** Whether discovery kept the keyword loaders' last results, and whether it ran again without. */
  loaders?: 'pinned' | 'refreshed';
  /** The structural class: the entries this generation added and removed. */
  entries?: { added: string[]; removed: string[] };
  /** The dirty threshold was exceeded (the generation ran FULL). */
  threshold?: string;
  classes: PathPass['classes'];
  /** Changes of earlier generations against this base that did not commit, added to its own. */
  pending: number;
  /** Paths the stat sweep found changed without an event. */
  swept: string[];
  candidates: { units: number; descriptors: number };
  /** The keyword diff K and its one-hop consumers. */
  keys: string[];
  /** Whether K came from the candidates' exports or from every key (global/remote keywords changed). */
  keysFrom?: 'candidates' | 'all';
  consumers: number;
  /** Units linked and assembled by the targeted path (content path only). */
  closure: string[];
  /** `verify`: units whose artifact revision the full generation changed. */
  actual: string[];
  /** `verify`: changed units outside the closure. */
  misses: string[];
  /** |closure \ actual| (`verify`, content path only). */
  superset: number;
  /**
   * `verify`: the first JSON path where the targeted and the full results differ. The full
   * result is published and the difference is reported under {@link TARGETED_MISMATCH}.
   */
  mismatch?: string;
  timings: {
    sweepMs: number;
    classifyMs: number;
    admitMs: number;
    targetedMs: number;
    fullMs: number;
    retainMs: number;
  };
  error?: string;
}

export interface DryRunReport {
  counters: {
    generations: number;
    /** Generations the targeted path compiled (content) or not (full). */
    content: number;
    full: number;
    /** `verify` generations with misses or a mismatch. */
    misses: number;
    mismatches: number;
    noCandidate: number;
    errors: number;
  };
  last?: DryRunRecord;
}

const empty = (): DryRunReport['counters'] => ({
  generations: 0,
  content: 0,
  full: 0,
  misses: 0,
  mismatches: 0,
  noCandidate: 0,
  errors: 0,
});
let report: DryRunReport = { counters: empty() };

/**
 * What the targeted rebuild did in this runtime. The long-lived worker runtime reads it through
 * the compilation module (an optional export beside `createCompilationService`) to return each new
 * record with its reply, since the worker's own stderr goes nowhere.
 */
export function targetedDryRun(): DryRunReport {
  return structuredClone(report);
}

export function resetTargetedDryRun(): void {
  report = { counters: empty() };
}

function emit(record: DryRunRecord): void {
  report.counters.generations++;
  if (record.error) report.counters.errors++;
  else if (record.revision === null) report.counters.noCandidate++;
  if (record.path === 'content') report.counters.content++;
  else report.counters.full++;
  if (record.misses.length) report.counters.misses++;
  if (record.mismatch !== undefined) report.counters.mismatches++;
  if (record.misses.length || record.mismatch !== undefined) {
    // Loud, on stderr for in-process hosts and in the optional trace. A worker runtime's stdio is
    // not forwarded: it returns each new record with its reply instead (`targetedDryRun` below),
    // and the host reports it (worker/index.ts).
    console.error(
      `[ng-doc] ${TARGETED_MISMATCH}: generation ${record.generation}` +
        (record.mismatch !== undefined
          ? ` differs from the full generation at ${record.mismatch}; the full result is published`
          : '') +
        (record.misses.length
          ? ` changed ${record.misses.length} unit(s) outside the targeted closure: ${record.misses.join(', ')}`
          : ''),
    );
  }
  report.last = record;
  const trace = process.env[TARGETED_REBUILD_TRACE_ENV];
  if (trace) {
    try {
      appendFileSync(
        trace,
        JSON.stringify({
          ...(record.misses.length || record.mismatch !== undefined
            ? { code: TARGETED_MISMATCH }
            : {}),
          ...record,
        }) + '\n',
      );
    } catch {
      /* The trace is best effort; the report never changes the generation. */
    }
  }
}

/** Units whose artifact changed between two snapshots (the aggregate artifact excluded). */
export const changedUnits = changedArtifacts;

/** The first JSON path at which two JSON values differ (`$` when their types differ). */
export function firstDifference(
  left: unknown,
  right: unknown,
  at: string = '$',
): string | undefined {
  if (left === right) return undefined;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return JSON.stringify(left) === JSON.stringify(right) ? undefined : at;
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      const found = firstDifference(left[index], right[index], `${at}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  const leftKeys = Object.keys(left as object);
  const rightKeys = Object.keys(right as object);
  if (leftKeys.join('\0') !== rightKeys.join('\0')) return `${at} (keys)`;
  for (const key of leftKeys) {
    const found = firstDifference(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      `${at}.${key}`,
    );
    if (found) return found;
  }
  return undefined;
}

/** Writes the record of one generation (see {@link DryRunRecord}). */
export function reportGeneration(input: {
  request: CompilationRequest;
  targeted: TargetedGeneration;
  published: 'targeted' | 'full';
  candidate: ArtifactSnapshot | undefined;
  /** `verify`, when both compilations returned a candidate: the full one. */
  full?: ArtifactSnapshot;
  mismatch?: string;
  timings: Pick<DryRunRecord['timings'], 'targetedMs' | 'fullMs' | 'retainMs'>;
  error?: string;
}): void {
  const { request, targeted, candidate } = input;
  const facts = targeted.facts;
  const pass = facts.pass;
  const record: DryRunRecord = {
    generation: request.generation,
    base: request.previous?.revision ?? null,
    revision: candidate?.revision ?? null,
    path: facts.path,
    published: input.published,
    ...(facts.reason !== undefined ? { reason: facts.reason } : {}),
    pin: pass?.pin ?? false,
    ...(facts.loaders ? { loaders: facts.loaders } : {}),
    ...(facts.entries ? { entries: facts.entries } : {}),
    ...(pass?.threshold ? { threshold: pass.threshold } : {}),
    classes: pass?.classes ?? [],
    pending: facts.pending,
    swept: facts.swept,
    candidates:
      facts.candidates.units || !pass
        ? facts.candidates
        : { units: pass.units.size, descriptors: pass.descriptors.size },
    keys: facts.keys,
    ...(facts.keysFrom ? { keysFrom: facts.keysFrom } : {}),
    consumers: facts.consumers,
    closure: facts.path === 'content' ? facts.closure : [],
    actual: [],
    misses: [],
    superset: 0,
    ...(input.mismatch !== undefined ? { mismatch: input.mismatch } : {}),
    timings: { ...facts.timings, ...input.timings },
    ...(input.error !== undefined ? { error: input.error } : {}),
  };
  if (input.full) {
    const actual = changedArtifacts(request.previous, input.full);
    record.actual = actual;
    if (facts.path === 'content') {
      const closure = new Set(facts.closure);
      record.misses = actual.filter((id) => !closure.has(id));
      record.superset = facts.closure.filter((id) => !actual.includes(id)).length;
    }
  }
  emit(record);
}
