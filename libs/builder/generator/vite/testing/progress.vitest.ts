import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Logger } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GeneratorBootstrapOptions } from '../../bootstrap';
import type { BuildResult } from '../../contracts';
import type { ProgressEvent } from '../../progress/events';
import { acquireOutputLease } from '../lease';
import { ViteAdapterLifecycle } from '../lifecycle';
import { resolveOptions } from '../options';
import { createViteProgress, withProgress } from '../progress';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function generator(root: string = '/workspace'): GeneratorBootstrapOptions {
  return {
    projectId: 'docs',
    workspaceRoot: root,
    defaults: {
      docsRoot: root,
      tsConfig: path.join(root, 'tsconfig.json'),
      outputRoot: path.join(root, 'out'),
      cacheRoot: path.join(root, 'cache'),
    },
  };
}

function logger() {
  const info = vi.fn<(message: string, options?: { timestamp?: boolean }) => void>();
  return { info, logger: { info } as unknown as Logger };
}

const started: ProgressEvent = {
  kind: 'progress-started',
  generation: 1,
  seq: 0,
  trigger: 'build',
  mode: 'development',
  changes: 0,
  elapsedMs: 0,
};

const settled = (generation: number, trigger: 'build' | 'watch' = 'build'): ProgressEvent[] => [
  { ...(started as Extract<ProgressEvent, { kind: 'progress-started' }>), generation, trigger },
  {
    kind: 'progress-settled',
    generation,
    seq: 1,
    status: 'success',
    elapsedMs: 900,
    phases: {},
    counts: { pages: 4, rebuilt: 1, errors: 0, warnings: 0, written: 2, routes: ['/guide'] },
  },
];

describe('Vite progress', () => {
  it('is off for a quiet Vite log level unless the plugin option asks for it', () => {
    const { logger: log } = logger();
    for (const logLevel of ['warn', 'error', 'silent'] as const)
      expect(createViteProgress({ logger: () => log, logLevel, generator: generator() })).toBe(
        undefined,
      );
    expect(
      createViteProgress({ logger: () => log, option: 'off', generator: generator() }),
    ).toBeUndefined();
    // An explicit `auto` still yields to the log level.
    expect(
      createViteProgress({
        logger: () => log,
        logLevel: 'warn',
        option: 'auto',
        generator: generator(),
      }),
    ).toBeUndefined();
  });

  it('writes an explicitly requested setting to stderr when the log level hides info', () => {
    const { info, logger: log } = logger();
    const written: string[] = [];
    const forced = createViteProgress({
      logger: () => log,
      logLevel: 'warn',
      option: 'plain',
      generator: generator(),
      stderr: { write: (text: string) => void written.push(text) },
    })!;
    expect(forced.reporter.environment.style).toBe('lines');
    for (const event of settled(1)) forced.sink(event);
    forced.release(1);
    forced.setForeign('notices');
    for (const event of settled(2, 'watch')) forced.sink(event);
    forced.release(2);
    expect(written).toEqual([
      'NgDoc: generating documentation for docs (development)\n',
      'NgDoc: OK generated 4 pages in 0.9s; 1 rebuilt, 2 files written\n',
      'NgDoc: updated 1 of 4 pages in 0.9s (/guide)\n',
    ]);
    expect(info).not.toHaveBeenCalled();
    forced.dispose();
  });

  it('never repeats a line verbatim, so the Vite logger never clears the screen for it', () => {
    const { info, logger: log } = logger();
    const progress = createViteProgress({
      logger: () => log,
      option: 'plain',
      generator: generator(),
    })!;
    progress.setForeign('notices');
    for (const generation of [2, 3, 4, 5]) {
      for (const event of settled(generation, 'watch')) progress.sink(event);
      progress.release(generation);
    }
    expect(info.mock.calls.map(([text]) => text)).toEqual([
      'NgDoc: updated 1 of 4 pages in 0.9s (/guide)',
      'NgDoc: updated 1 of 4 pages in 0.9s (/guide) (2 in a row)',
      'NgDoc: updated 1 of 4 pages in 0.9s (/guide) (3 in a row)',
      'NgDoc: updated 1 of 4 pages in 0.9s (/guide) (4 in a row)',
    ]);
    progress.dispose();
  });

  it('warns once through the Vite logger when its writer fails', () => {
    const warn = vi.fn();
    const broken = {
      info: () => {
        throw new Error('stdout closed');
      },
      warn,
    } as unknown as Logger;
    const progress = createViteProgress({
      logger: () => broken,
      option: 'plain',
      generator: generator(),
    })!;
    progress.sink(started);
    progress.sink(started);
    expect(warn.mock.calls).toEqual([
      ['[SESSION_PROGRESS_FAILED] Progress reporting failed and was skipped: stdout closed'],
    ]);
    progress.dispose();
  });

  it('writes through the Vite logger, timestamped once the server serves, and forwards events', () => {
    const { info, logger: log } = logger();
    const forwarded: ProgressEvent[] = [];
    const progress = createViteProgress({
      logger: () => log,
      option: 'plain',
      logLevel: 'info',
      generator: {
        ...generator(),
        session: { onProgress: (event) => void forwarded.push(event) },
      },
    })!;
    for (const event of settled(1)) progress.sink(event);
    progress.release(1);
    expect(info.mock.calls).toEqual([
      ['NgDoc: generating documentation for docs (development)', undefined],
      ['NgDoc: OK generated 4 pages in 0.9s; 1 rebuilt, 2 files written', undefined],
    ]);
    progress.setForeign('notices');
    for (const event of settled(2, 'watch')) progress.sink(event);
    progress.release(2);
    expect(info.mock.calls.at(-1)).toEqual([
      'NgDoc: updated 1 of 4 pages in 0.9s (/guide)',
      { timestamp: true },
    ]);
    expect(forwarded).toHaveLength(4);
    progress.dispose();
    // Without a logger yet, lines are dropped rather than failing.
    const early = createViteProgress({
      logger: () => undefined,
      option: 'plain',
      generator: generator(),
    })!;
    expect(() => early.sink(started)).not.toThrow();
    early.dispose();
  });

  it('adds the progress consumer to the session options only when progress is on', () => {
    const base = generator();
    expect(withProgress(base, undefined)).toBe(base);
    const { logger: log } = logger();
    const progress = createViteProgress({ logger: () => log, option: 'summary', generator: base })!;
    const combined = withProgress({ ...base, session: { batchDelayMs: 5 } }, progress);
    expect(combined.session).toEqual({ batchDelayMs: 5, onProgress: progress.sink });
    progress.dispose();
  });

  it('validates the plugin option', () => {
    const options = {
      analogLiveReload: true as const,
      angularPlugins: [{ name: 'angular' }],
      angularComponentProbe: '/workspace/src/app.component.ts',
      generator: generator(),
    };
    expect(resolveOptions(options).progress).toBeUndefined();
    expect(resolveOptions({ ...options, progress: 'summary' }).progress).toBe('summary');
    for (const progress of ['json', 'loud', 1])
      expect(() => resolveOptions({ ...options, progress: progress as never })).toThrow(
        'progress must be auto, live, plain, verbose, summary or off.',
      );
  });

  it('clears the live line before logging and releases each handled result, a failed publication as failed, even when progress fails', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ngdoc-vite-progress-'));
    roots.push(root);
    const handled: Array<[number, boolean | undefined]> = [];
    let interrupted = 0;
    const lifecycle = new ViteAdapterLifecycle(acquireOutputLease(`progress-${Date.now()}`, root), {
      interrupt() {
        interrupted++;
        throw new Error('progress failed');
      },
      release(generation: number, failed?: boolean) {
        handled.push([generation, failed]);
        throw new Error('progress failed');
      },
    });
    const info = vi.fn();
    lifecycle.attachServer(
      { config: { logger: { info, warn: info, error: info } }, ws: { send: vi.fn() } } as never,
      undefined as never,
    );
    const observer = lifecycle.observer(() => undefined);
    const cancelled: BuildResult = {
      status: 'cancelled',
      generation: 2,
      diagnostics: [],
      whyRebuilt: [],
    };
    observer({ kind: 'started', generation: 2, changes: [] });
    observer({ kind: 'result', result: cancelled });
    observer({ kind: 'started', generation: 3, changes: [] });
    observer({ kind: 'result', result: { ...cancelled, generation: 3 } });
    observer({
      kind: 'diagnostic',
      diagnostic: { code: 'NOTE', severity: 'warning', stage: 'host', message: 'note' },
    });
    await lifecycle.settled();
    // A committed result the adapter cannot publish (here: no configuration).
    observer({ kind: 'started', generation: 4, changes: [] });
    observer({
      kind: 'result',
      result: {
        status: 'success',
        generation: 4,
        snapshot: {
          projectId: 'docs',
          revision: 'r4',
          artifacts: [],
          globalKeywords: [],
          remoteKeywords: [],
        },
        manifest: { schemaVersion: 1, projectId: 'docs', generation: 4, revision: 'r4', files: [] },
        diagnostics: [],
        whyRebuilt: [],
      },
    });
    await lifecycle.settled();
    expect(handled).toEqual([
      [2, false],
      [3, false],
      [4, true],
    ]);
    expect(lifecycle.failure?.message).toContain('NGDOC_VITE_CONFIGURATION');
    expect(interrupted).toBeGreaterThanOrEqual(2);
    expect(info.mock.calls[0]).toEqual(['[NOTE] note']);
    await lifecycle.dispose();
  });
});
