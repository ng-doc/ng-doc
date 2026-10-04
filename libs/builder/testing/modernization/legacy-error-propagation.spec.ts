/** @vitest-environment node */

import { type Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { factory } from '../../engine/core/operators/factory';
import { BuilderDone, BuilderError } from '../../engine/core/types';
import { renderTemplateString } from '../../engine/nunjucks/render-template';

vi.mock('../../engine/nunjucks/filters', () => ({}));

const malformedTemplate = '{% if broken %}unterminated';

/**
 *
 */
async function observeBuildNgDocError(): Promise<{
  settlement: 'resolved' | 'rejected';
  error?: unknown;
  logged: unknown[][];
}> {
  vi.resetModules();
  const generationError = new Error('malformed generated content');
  const errorState = new BuilderError('MalformedFixture', [generationError]);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const identity =
    () =>
    (source: Observable<unknown>): Observable<unknown> =>
      source;
  const mockedModules = [
    '@ng-doc/builder',
    '../../helpers',
    '../../engine/builders/global',
    '../../engine/cache',
    '../../engine/core/operators/resolve-async-file-outputs',
    '../../operators',
  ];

  const { EMPTY, of: mockedOf } = await vi.importActual<typeof import('rxjs')>('rxjs');
  const { tap } = await vi.importActual<typeof import('rxjs/operators')>('rxjs/operators');

  vi.doMock('@ng-doc/builder', () => {
    return {
      GLOBALS: {},
      disableCache: vi.fn(),
      emitCache: identity,
      emitFileOutput: identity,
      entriesEmitter: () => mockedOf(errorState),
      loadGlobalKeywords: () => mockedOf(undefined),
      printBuildProgress: identity,
      printErrors: () =>
        tap((state: unknown) => {
          if (state === errorState) errorState.error.forEach((error) => console.error('\n', error));
        }),
      setColdStartFalse: vi.fn(),
      whenStackIsEmpty: identity,
    };
  });
  vi.doMock('../../helpers', () => ({
    importEsm: async () => undefined,
    importUtils: async () => undefined,
  }));
  vi.doMock('../../engine/builders/global', () => ({
    globalBuilders: () => EMPTY,
  }));
  vi.doMock('../../engine/cache', () => ({ invalidateCacheIfNeeded: () => true }));
  vi.doMock('../../engine/core/operators/resolve-async-file-outputs', () => ({
    resolveAsyncFileOutputs: identity,
  }));
  vi.doMock('../../operators', () => ({ progress: identity }));

  let buildNgDoc!: typeof import('../../engine/build-ng-doc').buildNgDoc;
  try {
    // The registry was reset above, so this loads a fresh module graph with the mocks applied.
    ({ buildNgDoc } = await import('../../engine/build-ng-doc'));
    try {
      await firstValueFrom(
        buildNgDoc({
          cachedFiles: [],
          config: { cache: true },
          context: { workspaceRoot: '/isolated-workspace' },
          outDir: '/isolated-output',
        } as never),
      );
      return { settlement: 'resolved', logged: [...consoleError.mock.calls] };
    } catch (error) {
      return { settlement: 'rejected', error, logged: [...consoleError.mock.calls] };
    }
  } finally {
    consoleError.mockRestore();
    mockedModules.forEach((moduleName) => vi.doUnmock(moduleName));
    vi.resetModules();
  }
}

describe('legacy generation error propagation', () => {
  it('maps an actual malformed Nunjucks render to BuilderError', async () => {
    const builder = factory<string, string, never>(
      'MalformedTemplate',
      [of(new BuilderDone('input', 'ready'))],
      () => renderTemplateString(malformedTemplate, { context: {}, filters: false }),
    );

    const state = await firstValueFrom(builder);
    expect(state).toBeInstanceOf(BuilderError);
    expect((state as BuilderError).tag).toBe('MalformedTemplate');
    expect((state as BuilderError).error[0]).toEqual(
      expect.objectContaining({ name: 'Template render error' }),
    );
  });

  it('maps a synchronous factory failure to BuilderError without eager invocation', async () => {
    const build = vi.fn(() => {
      throw new Error('synchronous generation failed');
    });
    const builder = factory<string, string, never>(
      'SyncFailure',
      [of(new BuilderDone('input', 'ready'))],
      build,
    );

    expect(build).not.toHaveBeenCalled();
    const state = await firstValueFrom(builder);
    expect(state).toEqual(
      new BuilderError('SyncFailure', [new Error('synchronous generation failed')]),
    );
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('maps an asynchronous factory rejection to BuilderError', async () => {
    const failure = new Error('asynchronous generation failed');
    const builder = factory<string, string, never>(
      'AsyncFailure',
      [of(new BuilderDone('input', 'ready'))],
      async () => {
        throw failure;
      },
    );

    await expect(firstValueFrom(builder)).resolves.toEqual(
      new BuilderError('AsyncFailure', [failure]),
    );
  });

  it('confirms the isolated buildNgDoc pipeline logs BuilderError and resolves void', async () => {
    const observation = await observeBuildNgDocError();

    expect(observation.settlement).toBe('resolved');
    expect(observation.error).toBeUndefined();
    expect(observation.logged).toEqual([
      ['\n', expect.objectContaining({ message: 'malformed generated content' })],
    ]);
  });

  it.fails('requires buildNgDoc to reject when a generation BuilderError was logged', async () => {
    const observation = await observeBuildNgDocError();

    expect(observation.settlement).toBe('rejected');
    expect(observation.error).toEqual(
      expect.objectContaining({ message: 'malformed generated content' }),
    );
  });
});
