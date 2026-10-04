import type { Diagnostic } from '../contracts';

/**
 * A file event source reports this warning when its native watcher may have lost events (for
 * example an FSEvents queue overflow: "Events were dropped ... File system must be re-scanned").
 * The watch itself stays alive. The session answers it with a reconciling generation whose
 * changes are re-observed from the inputs of the last committed generation, instead of treating
 * the signal as a fatal watcher error.
 */
export const WATCHER_RESCAN = 'WATCHER_RESCAN';

export function isRescanSignal(diagnostic: Diagnostic): boolean {
  return diagnostic.code === WATCHER_RESCAN;
}
