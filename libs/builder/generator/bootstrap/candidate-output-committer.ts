import {
  type OutputCommitterOptions,
  createOutputCommitter,
  isPublishedGeneratorConfiguration,
} from '../artifacts';
import type {
  CommitGuard,
  CommitRequest,
  CommitResult,
  Diagnostic,
  OutputCommitter,
  PublishedGeneratorConfiguration,
} from '../contracts';

export type CandidateOutputCommitterOptions = Omit<OutputCommitterOptions, 'outputRoot'>;

/** Process-local host policy; this callback is never part of a worker DTO. */
export interface CandidateOutputCommitterHostOptions {
  admitConfiguration?: (configuration: Readonly<PublishedGeneratorConfiguration>) => void;
}

interface BoundCommitter {
  configuration: PublishedGeneratorConfiguration;
  delegate: OutputCommitter;
}

function diagnostic(code: string, message: string): Diagnostic {
  return { code, message, severity: 'error', stage: 'commit' };
}

function failed(code: string, message: string): CommitResult {
  return { status: 'failed', diagnostics: [diagnostic(code, message)] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function restartChanges(
  previous: PublishedGeneratorConfiguration,
  next: PublishedGeneratorConfiguration,
): string[] {
  return (['outputRoot', 'cacheRoot', 'assetDirectory'] as const).filter(
    (field) => previous[field] !== next[field],
  );
}

/**
 * Selects the transactional output root from the first committed candidate.
 * Later root/watcher-identity changes require a new session before any mutation.
 */
export function createCandidateOutputCommitter(
  options: CandidateOutputCommitterOptions = {},
  host: CandidateOutputCommitterHostOptions = {},
): OutputCommitter {
  let bound: BoundCommitter | undefined;
  let provisional: OutputCommitter | undefined;
  let active: Promise<CommitResult> | undefined;
  let disposed = false;
  let disposing: Promise<void> | undefined;

  const run = async (
    request: CommitRequest,
    guard: CommitGuard,
    signal: AbortSignal,
  ): Promise<CommitResult> => {
    if (disposed) {
      return failed('BOOTSTRAP_DISPOSED', 'Candidate output committer is disposed.');
    }
    const configuration = request.candidate.configuration;
    if (!isPublishedGeneratorConfiguration(configuration)) {
      return failed(
        'BOOTSTRAP_CONFIGURATION_INVALID',
        'Candidate is missing a valid published generator configuration.',
      );
    }

    if (bound) {
      const changes = restartChanges(bound.configuration, configuration);
      if (changes.length) {
        return failed(
          'BOOTSTRAP_RESTART_REQUIRED',
          `Generator configuration changed ${changes.join(', ')} (${bound.configuration.digest} -> ${configuration.digest}); start a new session.`,
        );
      }
    }

    if (!guard.isCurrent(request.generation) || signal.aborted) {
      return { status: 'stale', diagnostics: [] };
    }
    try {
      const admission = host.admitConfiguration?.(structuredClone(configuration)) as unknown;
      if (isThenable(admission)) {
        void Promise.resolve(admission).catch(() => {});
        return failed(
          'BOOTSTRAP_ADMISSION_FAILED',
          'Configuration admission must complete synchronously.',
        );
      }
    } catch (error) {
      return failed('BOOTSTRAP_ADMISSION_FAILED', errorMessage(error));
    }

    if (disposed || !guard.isCurrent(request.generation) || signal.aborted) {
      return { status: 'stale', diagnostics: [] };
    }

    if (bound) {
      try {
        const result = await bound.delegate.commit(request, guard, signal);
        if (result.status === 'committed') {
          bound.configuration = structuredClone(configuration);
        }
        return result;
      } catch (error) {
        return failed('BOOTSTRAP_COMMIT_THROW', errorMessage(error));
      }
    }

    const delegate = createOutputCommitter({ ...options, outputRoot: configuration.outputRoot });
    provisional = delegate;
    let result: CommitResult;
    try {
      result = await delegate.commit(request, guard, signal);
    } catch (error) {
      result = failed('BOOTSTRAP_COMMIT_THROW', errorMessage(error));
    }
    if (result.status === 'committed' && !disposed) {
      bound = { configuration: structuredClone(configuration), delegate };
      provisional = undefined;
    } else {
      await delegate.dispose();
      if (provisional === delegate) provisional = undefined;
    }
    return result;
  };

  return {
    commit(request: CommitRequest, guard: CommitGuard, signal: AbortSignal) {
      if (disposed) {
        return Promise.resolve(
          failed('BOOTSTRAP_DISPOSED', 'Candidate output committer is disposed.'),
        );
      }
      if (active) {
        return Promise.resolve(
          failed('BOOTSTRAP_COMMIT_IN_PROGRESS', 'Another candidate commit is active.'),
        );
      }
      // Schedule after reserving active: synchronous host admission may reenter commit/dispose.
      const operation = Promise.resolve().then(() => run(request, guard, signal));
      active = operation;
      const clear = (): void => {
        if (active === operation) active = undefined;
      };
      void operation.then(clear, clear);
      return operation;
    },

    dispose() {
      if (disposing) return disposing;
      disposed = true;
      const delegate = bound?.delegate ?? provisional;
      disposing = Promise.allSettled([delegate?.dispose(), active]).then((results) => {
        const errors = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (errors.length) throw new AggregateError(errors.map(({ reason }) => reason));
      });
      return disposing;
    },
  };
}
