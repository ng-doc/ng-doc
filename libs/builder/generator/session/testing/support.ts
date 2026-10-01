import { expect, vi } from 'vitest';

import type {
  ArtifactSnapshot,
  BuildSessionServices,
  CommitGuard,
  CommitRequest,
  CommitResult,
  CompilationRequest,
  CompilationResult,
  Diagnostic,
  FileChange,
  FileEventSource,
} from '../../contracts';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function until(predicate: () => boolean, timeout: number = 4000): Promise<void> {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error('Timed out waiting for observable state');
    await new Promise((done) => setTimeout(done, 2));
  }
}

export function snapshot(revision: string, projectId: string = 'test'): ArtifactSnapshot {
  return { projectId, revision, artifacts: [], globalKeywords: [], remoteKeywords: [] };
}

export function compilation(revision: string, projectId: string = 'test'): CompilationResult {
  return {
    candidate: snapshot(revision, projectId),
    dependencies: [],
    diagnostics: [],
    whyRebuilt: [],
  };
}

export function committed(request: CommitRequest): CommitResult {
  return {
    status: 'committed',
    manifest: {
      schemaVersion: 1,
      projectId: request.candidate.projectId,
      generation: request.generation,
      revision: request.candidate.revision,
      files: [],
    },
    written: [],
    removed: [],
    diagnostics: [],
  };
}

export function harness(projectId: string = 'test') {
  const compile = vi.fn(
    async (request: CompilationRequest, _signal: AbortSignal): Promise<CompilationResult> =>
      compilation(`${projectId}-${request.generation}`, projectId),
  );
  const commit = vi.fn(
    async (
      request: CommitRequest,
      guard: CommitGuard,
      _signal: AbortSignal,
    ): Promise<CommitResult> => {
      expect(guard.isCurrent(request.generation)).toBe(true);
      expect(guard.isCurrent(request.generation + 1)).toBe(false);
      return committed(request);
    },
  );
  const compilerDispose = vi.fn(async () => {});
  const committerDispose = vi.fn(async () => {});
  const services: BuildSessionServices = {
    compiler: { compile, dispose: compilerDispose },
    committer: { commit, dispose: committerDispose },
  };
  return { services, compile, commit, compilerDispose, committerDispose };
}

export class Events implements FileEventSource {
  listener?: (events: FileChange[]) => void;
  onError?: (diagnostic: Diagnostic) => void;
  subscribed = 0;
  closed = 0;
  gate?: Promise<void>;
  closeError?: Error;

  async subscribe(
    listener: (events: FileChange[]) => void,
    onError: (diagnostic: Diagnostic) => void,
  ) {
    this.subscribed++;
    this.listener = listener;
    this.onError = onError;
    await this.gate;
    return {
      dispose: async () => {
        this.closed++;
        if (this.closeError) throw this.closeError;
      },
    };
  }

  emit(...events: FileChange[]) {
    this.listener?.(events);
  }
}
