import { PageStore } from './page-store';

/**
 * Set of resolved entry file paths (pages and API files) discovered when the build
 * starts. Populated by the entries emitter as it creates a builder for each entry.
 */
export const ExpectedEntries = new Set<string>();

/**
 * Set of entry file paths whose build ended in an error. Such entries never register
 * a page in the {@link PageStore}, so the completion gate must treat them as resolved
 * to avoid waiting forever.
 */
export const FailedEntries = new Set<string>();

/**
 * Returns `true` once every entry discovered at build start has either registered its
 * page in the {@link PageStore} or failed to build.
 *
 * The build pipeline declares itself "done" the first time the global builder stack is
 * empty. However, entry pages can register in the `PageStore` late (e.g. on a cold
 * build the guide pages are processed after a large API), so an empty stack does not
 * guarantee that every page has been collected. Gating completion on this check
 * prevents `routes.ts`/`context.ts` from being generated from a partially-populated
 * `PageStore` (see issue #322).
 */
export function allEntriesResolved(): boolean {
  for (const entryPath of ExpectedEntries) {
    if (PageStore.get(entryPath) === undefined && !FailedEntries.has(entryPath)) {
      return false;
    }
  }

  return true;
}
