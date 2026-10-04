import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  CompilationRequest,
  CompilationResult,
  Diagnostic,
  FileChange,
  FileEventSource,
} from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import type { GeneratorBootstrapOptions } from '..';
import { createCandidateOutputCommitter } from '../candidate-output-committer';
import { type GeneratorCliIO, type GeneratorCliRuntime, createGeneratorCli } from '../cli';
import { configuration, snapshot } from './fixtures';

type Channel = 'stdout' | 'stderr' | 'terminal';

/** Every write in order, so lines on stdout and stderr can be compared with each other. */
function capture(env: NodeJS.ProcessEnv, tty: boolean = false) {
  const writes: Array<{ channel: Channel; text: string }> = [];
  const io: GeneratorCliIO = {
    cwd: () => process.cwd(),
    stdout: (text) => void writes.push({ channel: 'stdout', text }),
    stderr: (text) => void writes.push({ channel: 'stderr', text }),
    env,
    ...(tty
      ? {
          terminal: {
            isTTY: true,
            columns: 100,
            hasColors: () => false,
            write: (text: string) => void writes.push({ channel: 'terminal', text }),
          },
        }
      : {}),
  };
  const text = (channel: Channel) =>
    writes
      .filter((entry) => entry.channel === channel)
      .map((entry) => entry.text)
      .join('');
  const lines = () =>
    writes
      .filter((entry) => entry.channel !== 'terminal')
      .flatMap((entry) =>
        entry.text
          .split('\n')
          .filter(Boolean)
          .map((line) => `${entry.channel}: ${line}`),
      );
  return { io, writes, text, lines };
}

class Source implements FileEventSource {
  listener?: (events: FileChange[]) => void;
  async subscribe(listener: (events: FileChange[]) => void, _onError: (d: Diagnostic) => void) {
    this.listener = listener;
    return { dispose: async () => undefined };
  }
}

/** A host that exits when the CLI stops it, without a real process. */
function fakeHost(): ChildProcess {
  const child = new EventEmitter() as ChildProcess & { exitCode: number | null };
  Object.assign(child, {
    exitCode: null,
    signalCode: null,
    kill() {
      child.exitCode = 0;
      setImmediate(() => child.emit('close', 0, null));
      return true;
    },
  });
  return child;
}

function runtime(
  compile: (
    request: CompilationRequest,
    options: GeneratorBootstrapOptions,
  ) => Promise<CompilationResult> | CompilationResult,
  source: Source = new Source(),
  spawned: { count: number } = { count: 0 },
): GeneratorCliRuntime {
  return {
    createSession(options: GeneratorBootstrapOptions) {
      return createBuildSession(
        {
          compiler: {
            compile: async (request) => compile(request, options),
            dispose: async () => undefined,
          },
          committer: createCandidateOutputCommitter(),
        },
        { batchDelayMs: 0, ...options.session },
      );
    },
    createEventSource: () => source,
    spawnHost: () => {
      spawned.count++;
      return fakeHost();
    },
  };
}

function success(
  options: GeneratorBootstrapOptions,
  request: CompilationRequest,
  diagnostics: Diagnostic[] = [],
): CompilationResult {
  const config = configuration(options.workspaceRoot, {
    outputRoot: options.defaults.outputRoot,
    cacheRoot: options.defaults.cacheRoot,
  });
  return {
    candidate: snapshot(
      config,
      `generation-${request.generation}`,
      `revision-${request.generation}`,
    ),
    dependencies: [],
    diagnostics,
    whyRebuilt: [],
  };
}

const warning: Diagnostic = {
  code: 'NOTE',
  severity: 'warning',
  stage: 'content',
  message: 'check',
};

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for CLI state');
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

describe('generator CLI progress', () => {
  let root: string;
  let base: string[];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-cli-progress-'));
    base = ['--project', 'docs', '--workspace', root];
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('prints plain progress on stderr and the summary on stdout, after the diagnostics', async () => {
    const out = capture({});
    const code = await createGeneratorCli(
      runtime((request, options) => success(options, request, [warning])),
    )(['generate', ...base, '--progress', 'plain'], out.io);
    expect(code).toBe(0);
    const lines = out.lines();
    expect(lines[0]).toBe('stderr: NgDoc: generating documentation for docs (production)');
    expect(lines.at(-2)).toBe('stdout: [warning] NOTE: check');
    expect(lines.at(-1)).toMatch(
      /^stdout: NgDoc: OK generated 1 page in \d+\.\ds; 0 rebuilt, 1 file written; 1 warning$/,
    );
    expect(out.text('stdout')).not.toContain('Generated revision');
  });

  it('prints a failure line after the errors it counts', async () => {
    const out = capture({});
    const code = await createGeneratorCli(
      runtime(() => ({
        dependencies: [],
        diagnostics: [{ code: 'BROKEN', severity: 'error', stage: 'content', message: 'broken' }],
        whyRebuilt: [],
      })),
    )(['generate', ...base, '--progress', 'summary'], out.io);
    expect(code).toBe(1);
    expect(out.lines()).toEqual([
      'stderr: [error] BROKEN: broken',
      expect.stringMatching(
        /^stdout: NgDoc: FAILED generation failed after \d+\.\ds \(1 error, see above\)$/,
      ),
    ]);
  });

  it('prints only diagnostics when progress is off, and keeps the result line in verbose', async () => {
    const off = capture({ NGDOC_PROGRESS: 'off' });
    const run = createGeneratorCli(
      runtime((request, options) => success(options, request, [warning])),
    );
    expect(await run(['generate', ...base], off.io)).toBe(0);
    expect(off.lines()).toEqual(['stdout: [warning] NOTE: check']);

    const verbose = capture({ NGDOC_PROGRESS: 'off' });
    expect(await run(['generate', ...base, '--progress', 'verbose'], verbose.io)).toBe(0);
    const stdout = verbose.lines().filter((line) => line.startsWith('stdout: '));
    expect(stdout.at(-1)).toMatch(/^stdout: Generated revision-\d+ at .*\/\.ng-doc\/docs\.$/);
    expect(stdout.at(-2)).toMatch(/^stdout: NgDoc: OK generated 1 page/);
    expect(verbose.text('stderr')).toMatch(/NgDoc: phases: commit \d+\.\ds/);
  });

  it('rejects an unknown --progress value as a usage error', async () => {
    const out = capture({});
    const run = createGeneratorCli(
      runtime(() => {
        throw new Error('must not compile');
      }),
    );
    expect(await run(['generate', ...base, '--progress', 'loud'], out.io)).toBe(2);
    expect(out.text('stderr')).toContain(
      '--progress must be one of auto, live, plain, summary, off, json, verbose.',
    );
    expect(await run(['generate', ...base, '--progress'], out.io)).toBe(2);
    expect(await run(['generate', ...base, '--progress='], out.io)).toBe(2);
    expect(await run(['generate', ...base, '--progress=loud'], out.io)).toBe(2);
    expect(await run(['generate', ...base, '--progress=plain', '--progress', 'off'], out.io)).toBe(
      2,
    );
    expect(out.text('stderr')).toContain('Duplicate option: --progress');
  });

  it('keeps --json unchanged unless progress events are asked for', async () => {
    const run = createGeneratorCli(runtime((request, options) => success(options, request)));
    const plain = capture({ NGDOC_PROGRESS: 'plain' });
    expect(await run(['generate', ...base, '--json'], plain.io)).toBe(0);
    const kinds = (text: string) =>
      text
        .trim()
        .split('\n')
        .map((line) => (JSON.parse(line) as { kind: string }).kind);
    expect(kinds(plain.text('stdout'))).toEqual(['result']);
    expect(plain.text('stderr')).toBe('');

    const json = capture({});
    expect(await run(['generate', ...base, '--json', '--progress', 'json'], json.io)).toBe(0);
    expect(kinds(json.text('stdout'))).toEqual([
      'progress-started',
      'progress',
      'progress',
      'result',
      'progress-settled',
    ]);
    // The `=` form is the same option.
    const inline = capture({});
    expect(await run(['generate', ...base, '--json', '--progress=json'], inline.io)).toBe(0);
    expect(kinds(inline.text('stdout'))).toEqual(kinds(json.text('stdout')));
  });

  it('reports a broken progress writer once on stderr and still exits cleanly', async () => {
    let failures = 0;
    const writes: string[] = [];
    const io: GeneratorCliIO = {
      cwd: () => process.cwd(),
      // The progress line fails once; everything else is recorded.
      stdout: (text) => void writes.push(`stdout: ${text}`),
      stderr: (text) => {
        if (text.startsWith('NgDoc:') && failures++ === 0) throw new Error('pipe closed');
        writes.push(`stderr: ${text}`);
      },
      env: { NGDOC_PROGRESS: 'plain' },
    };
    const code = await createGeneratorCli(runtime((request, options) => success(options, request)))(
      ['generate', ...base],
      io,
    );
    expect(code).toBe(0);
    expect(writes).toEqual([
      'stderr: [SESSION_PROGRESS_FAILED] Progress reporting failed and was skipped: pipe closed\n',
    ]);
  });

  it('draws the live line on the terminal and clears it before any other line', async () => {
    const out = capture({ NGDOC_PROGRESS: 'live' }, true);
    const code = await createGeneratorCli(
      runtime(async (request, options) => {
        await new Promise((resolve) => setTimeout(resolve, 700));
        return success(options, request, [warning]);
      }),
    )(['generate', ...base], out.io);
    expect(code).toBe(0);
    const terminal = out.text('terminal');
    expect(terminal).toContain('NgDoc generating documentation');
    expect(terminal).not.toContain('\n');
    expect(out.text('stderr')).toBe('');
    // The live line is cleared before the diagnostics and never redrawn over the summary.
    const warningAt = out.writes.findIndex((entry) => entry.text.includes('[warning] NOTE'));
    const drawn = out.writes.slice(0, warningAt).filter((entry) => entry.channel === 'terminal');
    expect(drawn.at(-1)?.text).toBe('\r\x1b[2K');
    expect(out.writes.slice(warningAt).some((entry) => entry.channel === 'terminal')).toBe(false);
    expect(out.lines()).toEqual([
      'stdout: [warning] NOTE: check',
      expect.stringMatching(/^stdout: NgDoc: OK generated 1 page/),
    ]);
  });

  it('prints one line per edit, and only result lines once the host runs', async () => {
    const source = new Source();
    const spawned = { count: 0 };
    let calls = 0;
    const out = capture({ NGDOC_PROGRESS: 'plain' });
    const controller = new AbortController();
    const running = createGeneratorCli(
      runtime(
        async (request, options) => {
          calls++;
          // The edit takes longer than the slow-edit notice would wait.
          if (calls === 3) await new Promise((resolve) => setTimeout(resolve, 2_300));
          return success(options, request);
        },
        source,
        spawned,
      ),
    )(['dev', ...base, '--', 'host'], out.io, controller.signal);
    await waitFor(() => spawned.count === 1 && !!source.listener);
    const before = out.lines().length;
    source.listener!([{ kind: 'update', path: path.join(root, 'docs/page.md') }]);
    await waitFor(() => out.lines().length > before);
    controller.abort({ exitCode: 130 });
    expect(await running).toBe(130);
    const after = out.lines().slice(before);
    expect(after).toEqual([expect.stringMatching(/^stdout: NgDoc: updated 1 file in 2\.\ds$/)]);
    // The start of the session: a build summary for the preflight, then one for the first watch
    // generation, which regenerates because the preflight recorded no inputs.
    expect(
      out
        .lines()
        .slice(0, before)
        .filter((line) => line.startsWith('stdout: ')),
    ).toEqual([
      expect.stringMatching(/^stdout: NgDoc: OK generated 1 page/),
      expect.stringMatching(/^stdout: NgDoc: (updated 1 file|finished) in /),
    ]);
  });

  it('reports Ctrl-C during a generation as cancelled, not as an error', async () => {
    let started = false;
    const out = capture({ NGDOC_PROGRESS: 'plain' });
    const controller = new AbortController();
    const running = createGeneratorCli(
      abortable(() => {
        started = true;
        return 'wait';
      }),
    )(['generate', ...base], out.io, controller.signal);
    await waitFor(() => started);
    controller.abort({ exitCode: 130 });
    expect(await running).toBe(130);
    expect(out.lines()).toEqual([
      'stderr: NgDoc: generating documentation for docs (production)',
      expect.stringMatching(/^stdout: NgDoc: generation cancelled after \d+\.\ds$/),
    ]);
  });

  it('does not report an edit superseded by newer changes as an error', async () => {
    const source = new Source();
    let calls = 0;
    const out = capture({ NGDOC_PROGRESS: 'plain' });
    const controller = new AbortController();
    const running = createGeneratorCli(
      abortable(() => (++calls === 3 ? 'wait' : 'succeed'), source),
    )(['dev', ...base], out.io, controller.signal);
    await waitFor(() => calls === 2 && !!source.listener);
    const page = path.join(root, 'docs/page.md');
    source.listener!([{ kind: 'update', path: page }]);
    await waitFor(() => calls === 3);
    source.listener!([{ kind: 'update', path: page }]);
    await waitFor(() => calls === 4 && out.text('stdout').includes('updated'));
    controller.abort({ exitCode: 130 });
    expect(await running).toBe(130);
    expect(out.text('stdout') + out.text('stderr')).not.toMatch(/\[error\]|WORKER_ABORTED/);
  });
});

/**
 * A runtime whose compiles either succeed at once or wait for their abort signal and then return
 * what the worker returns for an aborted compile.
 */
function abortable(next: () => 'wait' | 'succeed', source: Source = new Source()) {
  const base = runtime(() => {
    throw new Error('replaced below');
  }, source);
  return {
    ...base,
    createSession(options: GeneratorBootstrapOptions) {
      return createBuildSession(
        {
          compiler: {
            compile: async (request: CompilationRequest, signal: AbortSignal) =>
              next() === 'succeed'
                ? success(options, request)
                : new Promise<CompilationResult>((resolve) =>
                    signal.addEventListener(
                      'abort',
                      () =>
                        resolve({
                          dependencies: [],
                          diagnostics: [
                            {
                              code: 'WORKER_ABORTED',
                              message: 'Compilation aborted',
                              severity: 'error',
                              stage: 'evaluation',
                            },
                          ],
                          whyRebuilt: [],
                        }),
                      { once: true },
                    ),
                  ),
            dispose: async () => undefined,
          },
          committer: createCandidateOutputCommitter(),
        },
        { batchDelayMs: 0, ...options.session },
      );
    },
  } satisfies GeneratorCliRuntime;
}
