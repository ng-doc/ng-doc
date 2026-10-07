import type { Options } from 'prettier';

/**
 * A cache that `formatCode` consults while it is installed with {@link withFormatCodeCache}. The
 * new engine installs one around its own formatting calls; without one (the legacy engine, the
 * kill switch, the reference path) `formatCode` resolves the configuration and formats every
 * call, as it always did.
 */
export interface FormatCodeCache {
  /**
   * The Prettier configuration for `configDirectory`. `resolve` reads it; the cache may call it
   * once and return that value for later calls. An error of `resolve` is thrown to the caller.
   */
  config(configDirectory: string | undefined, resolve: () => Options | null): Options | null;
  /**
   * The formatted code. `format` formats it; the cache may return a value it stored for the same
   * code, parser and configuration instead. An error of `format` is thrown; the cache may store a
   * Prettier syntax error (deterministic for these inputs) and throw one again on a hit, so
   * `formatCode` returns the code unformatted in both cases.
   */
  format(
    input: { code: string; parser: string; config: Options | null },
    format: () => string,
  ): string;
}

let active: FormatCodeCache | undefined;

/**
 * Runs `run` with `cache` installed for every `formatCode` call it makes synchronously, and
 * restores the previous one afterwards.
 * @param cache The cache to install, or undefined for none.
 * @param run The synchronous work that formats.
 */
export function withFormatCodeCache<T>(cache: FormatCodeCache | undefined, run: () => T): T {
  const previous = active;
  active = cache;
  try {
    return run();
  } finally {
    active = previous;
  }
}

/** The cache installed by {@link withFormatCodeCache}, if any. */
export function activeFormatCodeCache(): FormatCodeCache | undefined {
  return active;
}
