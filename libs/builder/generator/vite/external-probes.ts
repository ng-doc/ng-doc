import { type BigIntStats, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';

import type { FileChange } from '../contracts';

/**
 * How often a recorded file outside the workspace is re-checked. These are configuration lookups
 * (`.editorconfig`, `.prettierrc*`, `package.json` in the directories above the workspace) and
 * rarely edited, so a change there is noticed within about a second.
 */
export const EXTERNAL_PROBE_INTERVAL_MS = 1_000;

/**
 * At most this many files outside the workspace are polled. More are handed to the native watcher
 * as before, so a workspace whose inputs mostly live elsewhere never turns into a stat storm.
 */
export const MAX_EXTERNAL_PROBES = 512;

function signature(state: BigIntStats): string {
  return `${state.dev}:${state.ino}:${state.mode}:${state.size}:${state.mtimeNs}:${state.ctimeNs}`;
}

function failure(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  // A missing file, or a missing directory on its path, is the same probe outcome.
  return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : `error:${code ?? 'unknown'}`;
}

/** A file's probe state: its metadata signature, `missing`, or the code of a failed lookup. */
export function probeState(file: string): string {
  try {
    return signature(statSync(file, { bigint: true }));
  } catch (error) {
    return failure(error);
  }
}

async function next(file: string): Promise<string> {
  try {
    return signature(await stat(file, { bigint: true }));
  } catch (error) {
    return failure(error);
  }
}

/**
 * Watches individual files outside the workspace by polling their metadata instead of attaching
 * the shared native watcher to them. chokidar's FSEvents backend watches a missing or extension
 * file through its directory and consolidates nearby streams upwards, so a probe such as
 * `/.editorconfig` or `/package.json` made the Vite process subscribe to every file event on the
 * disk (`/`, `/Users`). A poll costs one `stat` per probe per interval and sees exactly the probed
 * path: its creation, change and removal.
 *
 * The baseline is taken synchronously when a path is added, before the generation that recorded
 * it is published, so a change after that point is reported on the next poll.
 */
export class ExternalProbeWatcher {
  private readonly states = new Map<string, string>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  private disposed = false;

  constructor(
    private readonly emit: (change: FileChange) => void,
    private readonly intervalMs: number = EXTERNAL_PROBE_INTERVAL_MS,
  ) {}

  get size(): number {
    return this.states.size;
  }

  has(file: string): boolean {
    return this.states.has(file);
  }

  add(files: readonly string[]): void {
    if (this.disposed) return;
    for (const file of files) {
      if (!this.states.has(file)) this.states.set(file, probeState(file));
    }
    if (!this.timer && this.states.size) {
      this.timer = setInterval(() => void this.poll(), this.intervalMs);
      this.timer.unref?.();
    }
  }

  /** One pass over every probe; exported for deterministic tests. */
  async poll(): Promise<void> {
    if (this.polling || this.disposed) return;
    this.polling = true;
    try {
      const entries = [...this.states];
      const after = await Promise.all(entries.map(([file]) => next(file)));
      if (this.disposed) return;
      entries.forEach(([file, before], index) => {
        const state = after[index]!;
        // Only a state this pass started from is replaced: `add` never rewrites a known path.
        if (state === before || this.states.get(file) !== before) return;
        this.states.set(file, state);
        const kind: FileChange['kind'] =
          before === 'missing' ? 'create' : state === 'missing' ? 'delete' : 'update';
        this.emit({ kind, path: file });
      });
    } finally {
      this.polling = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.states.clear();
  }
}
