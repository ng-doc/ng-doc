import type { Options } from 'prettier';

import { withFormatCodeCache } from '../../helpers/format-cache';

/**
 * The cache `formatCode` consults: `FormatCodeCache` of `helpers/format-cache.ts`, restated here
 * because the published declarations reach this module and cannot import from outside the
 * generator. TypeScript checks that the two agree where `formatting` installs it.
 */
export interface GenerationFormatCache {
  config(configDirectory: string | undefined, resolve: () => Options | null): Options | null;
  format(
    input: { code: string; parser: string; config: Options | null },
    format: () => string,
  ): string;
}

/** The format cache of the generation that is compiling in this runtime, if any. */
let current: GenerationFormatCache | undefined;

/**
 * Makes `cache` the one {@link formatting} installs (undefined: none). A runtime compiles one
 * generation at a time; the compiler sets it when it plans a generation and clears it when the
 * compile ends, so a later generation never sees an earlier one's resolved configuration.
 * @param cache The generation's cache (`content/format-cache.ts`).
 */
export function useFormatCache(cache: GenerationFormatCache | undefined): void {
  current = cache;
}

/**
 * Runs synchronous formatting work (API templates, demo snippets) with the current generation's
 * format cache, if any.
 * @param run The work; `formatCode` calls it makes consult the cache.
 */
export function formatting<T>(run: () => T): T {
  return withFormatCodeCache(current, run);
}
