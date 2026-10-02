import path from 'node:path';

import { forwardSlashes, hostPath } from '../../kernel/paths';

// `node:path` helpers that return the engine's spelling of a path (forward slashes, drive letter
// kept), which every path the semantic service records uses. A test that builds its fixture and
// expected paths with these compares equal on Windows too, where `node:path` gives backslashes.

export { hostPath };

/**
 * `path.join` in the engine's spelling.
 * @param parts The path segments.
 */
export function join(...parts: string[]): string {
  return forwardSlashes(path.join(...parts));
}

/**
 * `path.resolve` in the engine's spelling.
 * @param parts The path segments.
 */
export function resolve(...parts: string[]): string {
  return hostPath(path.resolve(...parts));
}
