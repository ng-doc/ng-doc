import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Dependency, Diagnostic, SourceLocation } from '../contracts';
import { sha256Hex } from '../kernel/canonical';
import { ObservationRecorder, readText } from '../kernel/observations';

export const normalize = (file: string): string => resolve(file).replace(/\\/g, '/');
/** The sha256 of a text; digests of values go through `digestOf` (`kernel/canonical.ts`). */
export const digest = (text: string): string => sha256Hex(text);

export class SemanticFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly source?: SourceLocation,
  ) {
    super(message);
  }
}

export function diagnostic(error: unknown, source?: SourceLocation): Diagnostic {
  return {
    code: error instanceof SemanticFailure ? error.code : 'SEMANTIC_FAILED',
    severity: 'error',
    stage: 'semantic',
    message: error instanceof Error ? error.message : String(error),
    ...((error instanceof SemanticFailure ? error.source : undefined) ?? source
      ? { source: (error instanceof SemanticFailure ? error.source : undefined) ?? source }
      : {}),
  };
}

/**
 * The semantic service's files recorder: the kernel {@link ObservationRecorder} without a byte
 * cache (program observations outlive a generation), whose reads fail as semantic diagnostics.
 * Two reads of one path that saw different bytes record a conflicting digest.
 */
export class TrackedFiles extends ObservationRecorder {
  constructor(initial: Dependency[] = [], observer?: (dependency: Dependency) => void) {
    super(initial, { normalize, observer });
  }

  read(file: string): string {
    const path = normalize(file);
    this.add({ kind: 'existence', path, exists: existsSync(path) });
    try {
      const { text, digest } = readText(path);
      this.add({ kind: 'content', path, digest });
      return text;
    } catch (error) {
      throw new SemanticFailure(
        'SEMANTIC_INPUT_READ',
        error instanceof Error ? error.message : String(error),
        { path },
      );
    }
  }
}
