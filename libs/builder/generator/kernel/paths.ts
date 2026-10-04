import path from 'node:path';

/**
 * The path rules of the platform a path belongs to. Production code always uses the running
 * platform's (`node:path`); tests pass `path.win32` to check Windows spellings on any host.
 */
export type PathRules = Pick<typeof path, 'resolve'>;

/**
 * The engine's spelling of a host path: absolute, resolved and with forward slashes, so
 * `D:\a\docs\page.md` is recorded as `D:/a/docs/page.md` and a POSIX path is unchanged.
 *
 * Every path a dependency, a watch input or another DTO carries takes this form, whatever produced
 * it (`session/watch-inputs.ts` rejects any other), so the paths a generation records, and the
 * outputs derived from them, are the same on every operating system. A path built with `node:path`
 * (`resolve`, `join`, `fileURLToPath`) has native separators and must pass through here before it
 * is recorded.
 */
export function hostPath(file: string, rules: PathRules = path): string {
  return rules.resolve(file).replace(/\\/g, '/');
}

/**
 * A relative path (an output path, a glob or a path inside a root) with forward slashes. Unlike
 * {@link hostPath} it does not resolve the path.
 */
export function forwardSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}
