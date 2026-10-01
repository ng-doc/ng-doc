import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { FileChange } from '../contracts';
import { bytesDigest } from '../kernel/canonical';
import type { PhysicalInput } from './input-verification';

/**
 * Bounds on the synchronous reads made to recognise unchanged saves. A file above `maxFileBytes`,
 * and every candidate after a delivered event batch has used up its file or byte budget, is
 * admitted unchecked, exactly as without the filter.
 */
export interface UnchangedSaveLimits {
  maxFileBytes: number;
  maxFilesPerBatch: number;
  maxBytesPerBatch: number;
}

export const UNCHANGED_SAVE_LIMITS: Readonly<UnchangedSaveLimits> = Object.freeze({
  maxFileBytes: 4 * 1024 * 1024,
  maxFilesPerBatch: 256,
  maxBytesPerBatch: 16 * 1024 * 1024,
});

function normalize(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

/**
 * The digest the compiler records for a `content` observation (graph `observePhysicalDependency`):
 * sha256 of the file's bytes. An observation recorded from decoded text can only differ when the
 * bytes differ, so a mismatch in representation admits the change and never drops it.
 */
function fileDigest(file: string, maxBytes: number): { digest: string; bytes: number } | undefined {
  try {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return undefined;
    const bytes = readFileSync(file);
    if (bytes.length > maxBytes) return undefined;
    return { digest: bytesDigest(bytes), bytes: bytes.length };
  } catch {
    return undefined;
  }
}

export interface ScreenContext {
  /** A generation is running; it may read a path after the committed observation. */
  active: boolean;
  /** The path (normalized) is in the changes of the active, a queued or the pending batch. */
  busy(path: string): boolean;
}

export interface ScreenResult {
  passed: FileChange[];
  dropped: FileChange[];
  deferred: number;
}

/**
 * Recognises watched saves that change nothing: an `update` whose file bytes equal the content the
 * last committed generation observed for that path, while no active or queued generation has the
 * path in its changes. Such an event would only rerun a full
 * generation (and supersede one in flight) to publish identical output.
 *
 * Exactness:
 * - Creates, deletes and paths without a recorded content digest are always admitted.
 * - Nothing is dropped unless the newest settled (non-cancelled) generation succeeded, so a revert
 *   to the committed bytes after a failed generation still regenerates and clears the failure.
 * - A path in the changes of the active, a queued or the pending batch is admitted: an active
 *   generation may already have read newer bytes (a revert during a generation still runs).
 * - While any generation is active, a matching save is deferred, not dropped: that generation may
 *   read the path after the committed observation (for example during a coalesced A→B→A write).
 *   When it settles, deferred saves are screened again against the digests it committed.
 */
export class UnchangedSaves {
  private digests = new Map<string, string>();
  private healthy = false;
  private readonly waiting = new Map<string, FileChange>();

  constructor(
    private readonly limits: Readonly<UnchangedSaveLimits> = UNCHANGED_SAVE_LIMITS,
    private readonly digestOf: (
      file: string,
      maxBytes: number,
    ) => { digest: string; bytes: number } | undefined = fileDigest,
  ) {}

  /** Records the content observations of a committed generation. */
  committed(inputs: readonly PhysicalInput[]): void {
    const digests = new Map<string, string>();
    for (const input of inputs) {
      if (input.kind === 'content') digests.set(normalize(input.path), input.digest);
    }
    this.digests = digests;
  }

  /** A non-cancelled generation settled. Only a success keeps unchanged saves droppable. */
  settled(status: 'success' | 'failure'): void {
    this.healthy = status === 'success';
  }

  /** Recorded digest of a path, for diagnostics and tests. */
  recorded(file: string): string | undefined {
    return this.digests.get(normalize(file));
  }

  deferredCount(): number {
    return this.waiting.size;
  }

  /** Deferred saves, removed from the filter, in arrival order. */
  takeDeferred(): FileChange[] {
    const changes = [...this.waiting.values()];
    this.waiting.clear();
    return changes;
  }

  clearDeferred(): void {
    this.waiting.clear();
  }

  reset(): void {
    this.digests = new Map();
    this.healthy = false;
    this.waiting.clear();
  }

  screen(events: readonly FileChange[], context: ScreenContext): ScreenResult {
    const passed: FileChange[] = [];
    const dropped: FileChange[] = [];
    let deferred = 0;
    let files = 0;
    let bytes = 0;
    const observed = new Map<string, string | undefined>();
    for (const event of events) {
      const file = normalize(event.path);
      const decision = ((): 'pass' | 'drop' | 'defer' => {
        if (event.kind !== 'update' || !this.healthy) return 'pass';
        const recorded = this.digests.get(file);
        if (recorded === undefined) return 'pass';
        let current: string | undefined;
        if (observed.has(file)) current = observed.get(file);
        else {
          if (files >= this.limits.maxFilesPerBatch || bytes >= this.limits.maxBytesPerBatch)
            return 'pass';
          const read = this.digestOf(file, this.limits.maxFileBytes);
          files++;
          bytes += read?.bytes ?? 0;
          current = read?.digest;
          observed.set(file, current);
        }
        // Only a matching save asks for the (host-computed) busy set: a changed file never does,
        // so a burst of real edits delivered one event per call stays linear.
        if (current !== recorded || context.busy(file)) return 'pass';
        return context.active ? 'defer' : 'drop';
      })();
      if (decision === 'pass') {
        this.waiting.delete(file);
        passed.push(event);
      } else if (decision === 'drop') {
        this.waiting.delete(file);
        dropped.push(event);
      } else {
        this.waiting.set(file, { kind: event.kind, path: event.path });
        deferred++;
      }
    }
    return { passed, dropped, deferred };
  }
}
