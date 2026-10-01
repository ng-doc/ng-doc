import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BuildEvent,
  BuildSession,
  CompilationRequest,
  CompilationResult,
  CompilationService,
  Diagnostic,
  FileChange,
  FileEventSource,
} from '../../contracts';
import { createBuildSession } from '../../session/build-session';
import { createParcelEventSource } from '../../session/parcel-event-source';
import type { GeneratorBootstrapOptions } from '..';
import {
  type GeneratorBinProcess,
  isGeneratorBinMain,
  runGeneratorBin,
  runGeneratorBinMain,
} from '../bin';
import { createCandidateOutputCommitter } from '../candidate-output-committer';
import {
  type GeneratorCliIO,
  type GeneratorCliRuntime,
  createGeneratorCli,
  runGeneratorCli,
  spawnOwnedHost,
} from '../cli';
import { configuration, snapshot } from './fixtures';

/**
 * Every real process a test starts is registered here. afterEach reaps them even when an
 * assertion failed before the test's own cleanup ran. If the test worker goes away mid-test
 * (process.exit, or the SIGTERM Vitest sends a fork it tears down, which skips 'exit'), the
 * fallbacks below SIGKILL whatever is still registered. Spawned programs also exit on their own
 * once orphaned, which covers a SIGKILLed worker.
 */
const ownedChildren = new Set<ChildProcess>();
const ownedGroups = new Set<number>();
const killOwnedNow = () => {
  for (const group of ownedGroups) signalQuietly(-group, 'SIGKILL');
  for (const child of ownedChildren) if (running(child)) child.kill('SIGKILL');
};
const killOwnedOnSignal = (signal: NodeJS.Signals) => {
  killOwnedNow();
  removeFallbacks();
  process.kill(process.pid, signal); // Default disposition again: terminate as intended.
};
function removeFallbacks(): void {
  process.removeListener('exit', killOwnedNow);
  process.removeListener('SIGTERM', killOwnedOnSignal);
  process.removeListener('SIGINT', killOwnedOnSignal);
}
process.on('exit', killOwnedNow);
process.once('SIGTERM', killOwnedOnSignal);
process.once('SIGINT', killOwnedOnSignal);
afterAll(async () => {
  try {
    await reapOwned();
  } finally {
    removeFallbacks();
  }
});

describe('standalone generator CLI', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-bootstrap-cli-'));
  });

  afterEach(async () => {
    try {
      await reapOwned();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes onlyForTags build tags: production for generate, development for dev and watch, or --tags', async () => {
    const tagsFor = async (argv: string[]) => {
      let tags: unknown = 'not started';
      const code = await createGeneratorCli({
        createSession: (options) => {
          tags = options.discovery?.tags;
          throw new Error('captured');
        },
        createEventSource: () => {
          throw new Error('must not watch');
        },
        spawnHost: () => {
          throw new Error('must not spawn');
        },
      })(argv, output().io);
      return { code, tags };
    };
    const base = ['--project', 'docs', '--workspace', root];
    expect(await tagsFor(['generate', ...base])).toEqual({ code: 1, tags: ['production'] });
    expect(await tagsFor(['dev', ...base])).toEqual({ code: 1, tags: ['development'] });
    expect(await tagsFor(['watch', ...base])).toEqual({ code: 1, tags: ['development'] });
    expect(await tagsFor(['generate', ...base, '--tags', 'development, preview'])).toEqual({
      code: 1,
      tags: ['development', 'preview'],
    });
    for (const value of ['', 'a,,b', ' , ']) {
      expect(await tagsFor(['generate', ...base, '--tags', value])).toEqual({
        code: 2,
        tags: 'not started',
      });
    }
  });

  it('validates commands without admission and generates with normalized defaults and JSON', async () => {
    let admitted = 0;
    const denied = createGeneratorCli({
      createSession: () => {
        admitted += 1;
        throw new Error('must not start');
      },
      createEventSource: () => {
        throw new Error('must not watch');
      },
      spawnHost: () => {
        throw new Error('must not spawn');
      },
    });
    expect(await denied(['--help'], output().io)).toBe(0);
    expect(await denied(['unknown'], output().io)).toBe(2);
    expect(await denied(['generate', '--project'], output().io)).toBe(2);
    expect(await denied(['generate', '--project', 'one', '--project', 'two'], output().io)).toBe(2);
    expect(await denied(['generate', '--project', 'one', '--', 'host'], output().io)).toBe(2);
    expect(await denied(['dev', '--project', 'one', '--'], output().io)).toBe(2);
    expect(await denied(['generate', '--unknown'], output().io)).toBe(2);
    expect(await denied(['generate', '--json', '--json'], output().io)).toBe(2);
    expect(await denied(['generate', '--project', '   '], output().io)).toBe(2);
    expect(await denied(['generate', '--project', 'bad\0id'], output().io)).toBe(2);
    expect(
      await denied(['generate', '--project', 'one', '--config', 'bad\0file'], output().io),
    ).toBe(2);
    expect(admitted).toBe(0);

    let options!: GeneratorBootstrapOptions;
    const source = new ControlledSource();
    const runtime = scriptedRuntime(
      (request, selected) => success(selected, request),
      source,
      (selected) => (options = selected),
    );
    const capture = output();
    const run = createGeneratorCli(runtime);
    expect(
      await run(['generate', '--project', 'docs', '--workspace', root, '--json'], capture.io),
    ).toBe(0);
    expect(options).toMatchObject({
      projectId: 'docs',
      workspaceRoot: root,
      defaults: {
        docsRoot: path.join(root, 'docs'),
        tsConfig: path.join(root, 'tsconfig.json'),
        outputRoot: path.join(root, '.ng-doc/docs'),
        cacheRoot: path.join(root, '.cache/ng-doc/docs'),
      },
    });
    expect(JSON.parse(capture.stdout.trim())).toMatchObject({
      kind: 'result',
      result: { status: 'success' },
    });
    expect(fs.readFileSync(path.join(root, '.ng-doc/docs/content.txt'), 'utf8')).toBe(
      'generation-1',
    );

    const customCapture = output();
    expect(
      await run(
        [
          'generate',
          '--project',
          'custom',
          '--workspace',
          root,
          '--config',
          'ng-doc.config.ts',
          '--docs-root',
          'custom-docs',
          '--tsconfig',
          'custom.tsconfig.json',
          '--output-root',
          'custom-output',
          '--cache-root',
          'custom-cache',
        ],
        customCapture.io,
      ),
    ).toBe(0);
    expect(options).toMatchObject({
      projectId: 'custom',
      configFile: path.join(root, 'ng-doc.config.ts'),
      defaults: {
        docsRoot: path.join(root, 'custom-docs'),
        tsConfig: path.join(root, 'custom.tsconfig.json'),
        outputRoot: path.join(root, 'custom-output'),
        cacheRoot: path.join(root, 'custom-cache'),
      },
    });
    // The summary is the human result line (progress: summary, see `output`).
    expect(customCapture.stdout).toMatch(/^NgDoc: OK generated 1 page in \d+\.\ds; /m);
    expect(customCapture.stdout).not.toContain('Generated revision-1');
  });

  it('uses immutable version output, contains default startup failure, and prints human diagnostics', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runGeneratorCli(['--version'])).toBe(0);
      expect(await runGeneratorCli(['unknown'])).toBe(2);
      expect(await runGeneratorCli(['generate', '--project', 'default-paths'])).toBe(1);
      expect(stdout).toHaveBeenCalled();
      expect(stderr).toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }

    const missingRuntime = output();
    expect(
      await runGeneratorCli(
        ['generate', '--project', 'docs', '--workspace', root],
        missingRuntime.io,
      ),
    ).toBe(1);
    expect(missingRuntime.stderr).toContain('WORKER_');

    const source = new ControlledSource();
    const capture = output();
    const warningRuntime = scriptedRuntime(
      () => ({
        dependencies: [],
        diagnostics: [{ code: 'NOTICE', severity: 'warning', stage: 'content', message: 'notice' }],
        whyRebuilt: [],
      }),
      source,
    );
    expect(
      await createGeneratorCli(warningRuntime)(
        ['generate', '--project', 'docs', '--workspace', root],
        capture.io,
      ),
    ).toBe(1);
    expect(capture.stdout).toContain('[warning] NOTICE');
    expect(capture.stderr).toContain('SESSION_NO_CANDIDATE');
  });

  it('starts a direct host only after post-subscription reconciliation and propagates its exit', async () => {
    const source = new ControlledSource();
    let compileCalls = 0;
    let spawnAt = 0;
    const runtime = scriptedRuntime(
      (request, options) => {
        compileCalls += 1;
        return success(options, request);
      },
      source,
      undefined,
      (command, args, cwd) => {
        spawnAt = compileCalls;
        return spawnOwnedHost(command, args, cwd);
      },
    );
    const run = createGeneratorCli(runtime);
    const code = await run(
      [
        'dev',
        '--project',
        'docs',
        '--workspace',
        root,
        '--',
        process.execPath,
        '-e',
        'process.exit(7)',
      ],
      output().io,
    );

    expect(code).toBe(7);
    expect(spawnAt).toBe(2);
    expect(source.disposals).toBe(1);
  });

  it('contains direct host spawn errors and reports cleanup rejection', async () => {
    const source = new ControlledSource();
    const hostFailure = createGeneratorCli(
      scriptedRuntime((request, options) => success(options, request), source),
    );
    expect(
      await hostFailure(
        ['dev', '--project', 'docs', '--workspace', root, '--', '/definitely/missing-host'],
        output().io,
      ),
    ).toBe(1);

    const cleanupCapture = output();
    const cleanupFailure = createGeneratorCli({
      createSession: () => ({
        buildOnce: async () => ({
          status: 'failure',
          generation: 1,
          diagnostics: [],
          whyRebuilt: [],
        }),
        watch: async () => {
          throw new Error('unused watch');
        },
        reconcileInputs: async () => {
          throw new Error('unused reconcile');
        },
        rescan: async () => {
          throw new Error('unused rescan');
        },
        dispose: async () => {
          throw new Error('dispose failed');
        },
      }),
      createEventSource: () => {
        throw new Error('unused source');
      },
      spawnHost: () => {
        throw new Error('unused host');
      },
    });
    expect(
      await cleanupFailure(
        ['generate', '--project', 'docs', '--workspace', root],
        cleanupCapture.io,
      ),
    ).toBe(1);
    expect(cleanupCapture.stderr).toContain('Cleanup failed: dispose failed');

    const startupCapture = output();
    const startupFailure = createGeneratorCli({
      createSession: () => {
        throw 'non-Error startup failure';
      },
      createEventSource: () => {
        throw new Error('unused source');
      },
      spawnHost: () => {
        throw new Error('unused host');
      },
    });
    expect(
      await startupFailure(
        ['generate', '--project', 'docs', '--workspace', root],
        startupCapture.io,
      ),
    ).toBe(1);
    expect(startupCapture.stderr).toContain('non-Error startup failure');
  });

  it('blocks a root-affecting reconciliation before host start and preserves last good files', async () => {
    const source = new ControlledSource();
    let spawned = false;
    const runtime = scriptedRuntime(
      (request, options) =>
        success(
          options,
          request,
          request.generation === 1
            ? undefined
            : { cacheRoot: path.join(root, 'changed-cache'), digest: 'changed' },
        ),
      source,
      undefined,
      () => {
        spawned = true;
        return own(spawn(process.execPath, ['-e', 'process.exit(0)']));
      },
    );
    const capture = output();
    const code = await createGeneratorCli(runtime)(
      ['dev', '--project', 'docs', '--workspace', root, '--', 'unused'],
      capture.io,
    );

    expect(code).toBe(1);
    expect(spawned).toBe(false);
    expect(capture.stderr).toContain('BOOTSTRAP_RESTART_REQUIRED');
    expect(fs.readFileSync(path.join(root, '.ng-doc/docs/content.txt'), 'utf8')).toBe(
      'generation-1',
    );
  });

  it('blocks host admission after an early watcher error but admits through a warning', async () => {
    const failedSource = new ControlledSource();
    failedSource.diagnosticOnSubscribe = {
      code: 'NATIVE_ADMISSION_ERROR',
      severity: 'error',
      stage: 'host',
      message: 'watcher failed during reconciliation',
    };
    let failedSpawns = 0;
    const failedCapture = output();
    const failed = await createGeneratorCli(
      scriptedRuntime(
        (request, options) => success(options, request),
        failedSource,
        undefined,
        () => {
          failedSpawns += 1;
          return own(spawn(process.execPath, ['-e', 'process.exit(0)']));
        },
      ),
    )(['dev', '--project', 'docs', '--workspace', root, '--', 'unused'], failedCapture.io);
    expect(failed).toBe(1);
    expect(failedSpawns).toBe(0);
    expect(failedSource.disposals).toBe(1);
    expect(failedCapture.stderr).toContain('[error] NATIVE_ADMISSION_ERROR');

    const warningSource = new ControlledSource();
    warningSource.diagnosticOnSubscribe = {
      code: 'NATIVE_ADMISSION_WARNING',
      severity: 'warning',
      stage: 'host',
      message: 'watcher reported a recoverable condition',
    };
    let warningSpawns = 0;
    const warningCapture = output();
    const admitted = await createGeneratorCli(
      scriptedRuntime(
        (request, options) => success(options, request),
        warningSource,
        undefined,
        () => {
          warningSpawns += 1;
          return own(spawn(process.execPath, ['-e', 'process.exit(0)']));
        },
      ),
    )(['dev', '--project', 'docs', '--workspace', root, '--', 'unused'], warningCapture.io);
    expect(admitted).toBe(0);
    expect(warningSpawns).toBe(1);
    expect(warningCapture.stdout).toContain('[warning] NATIVE_ADMISSION_WARNING');
    expect(warningCapture.stderr).toBe('');
  });

  it('keeps watch alive across a failed generation, recovers, and joins on abort', async () => {
    const source = new ControlledSource();
    let calls = 0;
    const runtime = scriptedRuntime((request, options) => {
      calls += 1;
      if (calls === 3) return failure('EXPECTED_FAILURE');
      return success(options, request);
    }, source);
    const controller = new AbortController();
    const capture = output();
    const running = createGeneratorCli(runtime)(
      ['watch', '--project', 'docs', '--workspace', root, '--json'],
      capture.io,
      controller.signal,
    );
    await waitFor(
      () =>
        calls >= 2 &&
        source.listening &&
        capture.stdout.includes('"status":"success","generation":2'),
    );
    source.change({ kind: 'update', path: path.join(root, 'broken.md') });
    await waitFor(() => calls >= 3 && capture.stdout.includes('EXPECTED_FAILURE'));
    source.change({ kind: 'update', path: path.join(root, 'fixed.md') });
    await waitFor(() => calls >= 4 && capture.stdout.includes('revision-4'));
    controller.abort({ exitCode: 143 });

    expect(await running).toBe(143);
    expect(source.disposals).toBe(1);
    const events = capture.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as BuildEvent);
    expect(
      events.some((event) => event.kind === 'result' && event.result.status === 'failure'),
    ).toBe(true);
    expect(
      events.filter((event) => event.kind === 'result' && event.result.status === 'success'),
    ).toHaveLength(3);
  });

  it('receives a real Parcel filesystem event and ignores its generated roots', async () => {
    const placeholder = new ControlledSource();
    let calls = 0;
    const base = scriptedRuntime((request, options) => {
      calls += 1;
      return success(options, request);
    }, placeholder);
    const runtime: GeneratorCliRuntime = {
      ...base,
      createEventSource: (workspaceRoot, ignore) =>
        createParcelEventSource(workspaceRoot, { ignore }),
    };
    const capture = output();
    const controller = new AbortController();
    const running = createGeneratorCli(runtime)(
      ['watch', '--project', 'docs', '--workspace', root, '--json'],
      capture.io,
      controller.signal,
    );
    await waitFor(() => calls >= 2 && capture.stdout.includes('"status":"success","generation":2'));
    fs.writeFileSync(path.join(root, 'native-change.md'), 'changed');
    await waitFor(() => calls >= 3 && capture.stdout.includes('"status":"success","generation":3'));
    const observed = calls;
    fs.writeFileSync(path.join(root, '.ng-doc/docs/generated-loop.txt'), 'ignored');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(calls).toBe(observed);
    controller.abort({ exitCode: 130 });
    expect(await running).toBe(130);
  });

  it('treats watcher diagnostics as fatal and closes the subscription', async () => {
    const source = new ControlledSource();
    let calls = 0;
    const runtime = scriptedRuntime((request, options) => {
      calls += 1;
      return success(options, request);
    }, source);
    const capture = output();
    const running = createGeneratorCli(runtime)(
      ['dev', '--project', 'docs', '--workspace', root, '--json'],
      capture.io,
    );
    await waitFor(() => calls >= 2 && source.listening);
    source.fail({ code: 'WATCHER_ERROR', severity: 'error', stage: 'host', message: 'lost' });
    expect(await running).toBe(1);
    expect(source.disposals).toBe(1);
    expect(capture.stdout).toContain('"kind":"diagnostic"');
  });

  it('terminates and joins its own active host on SIGTERM-style abort', async () => {
    const source = new ControlledSource();
    const controller = new AbortController();
    let child: ReturnType<typeof spawn> | undefined;
    const runtime = scriptedRuntime(
      (request, options) => success(options, request),
      source,
      undefined,
      (command, args, cwd) => {
        child = own(spawn(command, args, { cwd, shell: false, stdio: 'ignore' }));
        return child;
      },
    );
    const running = createGeneratorCli(runtime)(
      [
        'dev',
        '--project',
        'docs',
        '--workspace',
        root,
        '--',
        process.execPath,
        '-e',
        `${EXIT_WHEN_ORPHANED}setInterval(() => {}, 1000)`,
      ],
      output().io,
      controller.signal,
    );
    await waitFor(() => child?.pid !== undefined);
    controller.abort({ exitCode: 143 });
    expect(await running).toBe(143);
    expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
  });

  it('supervises the host as a process tree on Windows', async () => {
    const source = new ControlledSource();
    const controller = new AbortController();
    const killed: number[] = [];
    let child: ReturnType<typeof spawn> | undefined;
    const runtime = scriptedRuntime(
      (request, options) => success(options, request),
      source,
      undefined,
      (command, args, cwd) => {
        child = own(
          spawnOwnedHost(command, args, cwd, {
            platform: 'win32',
            // Natively the real taskkill ends the tree; elsewhere this simulates it.
            ...(process.platform === 'win32'
              ? {}
              : {
                  killTree: async (pid: number) => {
                    killed.push(pid);
                    process.kill(pid, 'SIGKILL');
                  },
                }),
          }),
        );
        return child;
      },
    );
    const running = createGeneratorCli(runtime)(
      [
        'dev',
        '--project',
        'docs',
        '--workspace',
        root,
        '--',
        process.execPath,
        '-e',
        `${EXIT_WHEN_ORPHANED}setInterval(() => {}, 1000)`,
      ],
      output().io,
      controller.signal,
    );
    await waitFor(() => child?.pid !== undefined);
    controller.abort({ exitCode: 130 });
    expect(await running).toBe(130);
    expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
    if (process.platform !== 'win32') expect(killed).toEqual([child?.pid]);
  });

  it.skipIf(process.platform === 'win32')(
    'joins an owned host process group, including a stubborn server grandchild',
    async () => {
      const source = new ControlledSource();
      const controller = new AbortController();
      const ready = path.join(root, 'grandchild-ready.json');
      const orphaned = path.join(root, 'grandchild-orphaned');
      let child: ReturnType<typeof spawn> | undefined;
      // The grandchild ignores SIGTERM, so only the CLI's group SIGKILL (after its 2 s grace) can
      // end it in time. As a leak guard it exits by itself 10 s after losing its parent, leaving a
      // marker that the assertions below reject. It binds port 0 and reports the port it got.
      const grandchildProgram = [
        "const fs = require('node:fs');",
        "const net = require('node:net');",
        "process.on('SIGTERM', () => {});",
        'const parent = process.ppid;',
        'let orphanedAt = 0;',
        'setInterval(() => {',
        '  if (process.ppid === parent) return;',
        '  orphanedAt ||= Date.now();',
        `  if (Date.now() - orphanedAt > 10000) { fs.writeFileSync(${JSON.stringify(orphaned)}, ''); process.exit(0); }`,
        '}, 100);',
        'const server = net.createServer();',
        `server.listen(0, '127.0.0.1', () => { fs.writeFileSync(${JSON.stringify(`${ready}.tmp`)}, JSON.stringify({ pid: process.pid, port: server.address().port })); fs.renameSync(${JSON.stringify(`${ready}.tmp`)}, ${JSON.stringify(ready)}); });`,
      ].join('');
      const parentProgram = [
        EXIT_WHEN_ORPHANED,
        "const { spawn } = require('node:child_process');",
        `spawn(process.execPath, ['-e', ${JSON.stringify(grandchildProgram)}], { stdio: 'ignore' });`,
        "process.on('SIGTERM', () => process.exit(0));",
        'setInterval(() => {}, 1000);',
      ].join('');
      const runtime = scriptedRuntime(
        (request, options) => success(options, request),
        source,
        undefined,
        (command, args, cwd) => {
          child = own(spawnOwnedHost(command, args, cwd), { group: true });
          return child;
        },
      );
      const running = createGeneratorCli(runtime)(
        [
          'dev',
          '--project',
          'docs',
          '--workspace',
          root,
          '--',
          process.execPath,
          '-e',
          parentProgram,
        ],
        output().io,
        controller.signal,
      );
      await waitFor(() => fs.existsSync(ready));
      const parentPid = child?.pid;
      const { pid: grandchildPid, port } = JSON.parse(fs.readFileSync(ready, 'utf8')) as {
        pid: number;
        port: number;
      };
      expect(parentPid).toBeTypeOf('number');
      expect(processAlive(grandchildPid)).toBe(true);

      controller.abort({ exitCode: 143 });
      expect(await running).toBe(143);
      expect(processAlive(parentPid as number)).toBe(false);
      expect(processAlive(grandchildPid)).toBe(false);
      expect(fs.existsSync(orphaned)).toBe(false);

      const reuse = net.createServer();
      await new Promise<void>((resolve, reject) => {
        reuse.once('error', reject);
        reuse.listen(port, '127.0.0.1', resolve);
      });
      await closeServer(reuse);
    },
  );

  it('escalates an injected direct host that ignores graceful termination', async () => {
    const source = new ControlledSource();
    const controller = new AbortController();
    const ready = path.join(root, 'stubborn-host-ready');
    let child: ReturnType<typeof spawn> | undefined;
    const runtime = scriptedRuntime(
      (request, options) => success(options, request),
      source,
      undefined,
      (command, args, cwd) => {
        child = own(spawn(command, args, { cwd, shell: false, stdio: 'ignore' }));
        return child;
      },
    );
    const running = createGeneratorCli(runtime)(
      [
        'dev',
        '--project',
        'docs',
        '--workspace',
        root,
        '--',
        process.execPath,
        '-e',
        `${EXIT_WHEN_ORPHANED}const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000)`,
      ],
      output().io,
      controller.signal,
    );
    await waitFor(() => fs.existsSync(ready));
    controller.abort({ exitCode: 143 });
    expect(await running).toBe(143);
    expect(child?.signalCode).toBe('SIGKILL');
  });

  it('maps process signals once and removes handlers after bin cleanup', async () => {
    const listeners = new Map<string, () => void>();
    const removed: string[] = [];
    const processPort: GeneratorBinProcess = {
      argv: ['node', 'ng-doc', 'watch'],
      stderr: { write: () => undefined },
      once: (event, listener) => listeners.set(event, listener),
      removeListener: (event) => removed.push(event),
    };
    const run = async (
      _argv: readonly string[],
      _io?: GeneratorCliIO,
      signal?: AbortSignal,
    ): Promise<number> => {
      if (!signal) return 1;
      return new Promise((resolve) =>
        signal.addEventListener(
          'abort',
          () => resolve((signal.reason as { exitCode: number }).exitCode),
          { once: true },
        ),
      );
    };
    const result = runGeneratorBin(processPort, run);
    listeners.get('SIGINT')?.();
    listeners.get('SIGTERM')?.();
    expect(await result).toBe(130);
    expect(processPort.exitCode).toBe(130);
    expect(removed.sort()).toEqual(['SIGINT', 'SIGTERM']);
  });

  it('handles SIGTERM and unexpected bin failures without bypassing cleanup', async () => {
    const listeners = new Map<string, () => void>();
    const errors: string[] = [];
    const processPort: GeneratorBinProcess = {
      argv: ['node', 'ng-doc', 'watch'],
      stderr: { write: (text) => errors.push(text) },
      once: (event, listener) => listeners.set(event, listener),
      removeListener: () => undefined,
    };
    const waiting = runGeneratorBin(
      processPort,
      async (_argv, _io, signal) =>
        new Promise<number>((resolve) =>
          signal?.addEventListener(
            'abort',
            () => resolve((signal.reason as { exitCode: number }).exitCode),
            { once: true },
          ),
        ),
    );
    listeners.get('SIGTERM')?.();
    expect(await waiting).toBe(143);

    await runGeneratorBinMain(processPort, async () => {
      throw 'bin failed';
    });
    expect(processPort.exitCode).toBe(1);
    expect(errors).toEqual(['bin failed\n']);
    expect(isGeneratorBinMain(undefined, import.meta.url)).toBe(false);
    expect(isGeneratorBinMain('/missing/bin', import.meta.url)).toBe(false);
    expect(isGeneratorBinMain(import.meta.filename, import.meta.url)).toBe(true);
  });
});

class ControlledSource implements FileEventSource {
  listener?: (events: FileChange[]) => void;
  error?: (diagnostic: Diagnostic) => void;
  diagnosticOnSubscribe?: Diagnostic;
  disposals = 0;

  get listening(): boolean {
    return !!this.listener;
  }

  async subscribe(
    listener: (events: FileChange[]) => void,
    onError: (diagnostic: Diagnostic) => void,
  ) {
    this.listener = listener;
    this.error = onError;
    if (this.diagnosticOnSubscribe) onError(this.diagnosticOnSubscribe);
    return { dispose: async () => void (this.disposals += 1) };
  }

  change(...events: FileChange[]): void {
    this.listener?.(events);
  }

  fail(diagnostic: Diagnostic): void {
    this.error?.(diagnostic);
  }
}

function scriptedRuntime(
  compile: (request: CompilationRequest, options: GeneratorBootstrapOptions) => CompilationResult,
  source: ControlledSource,
  admitted?: (options: GeneratorBootstrapOptions) => void,
  spawnHost: GeneratorCliRuntime['spawnHost'] = (command, args, cwd) =>
    own(spawn(command, args, { cwd, shell: false, stdio: 'ignore' })),
): GeneratorCliRuntime {
  return {
    createSession(options: GeneratorBootstrapOptions) {
      admitted?.(options);
      sourceRoots.set(source, options.workspaceRoot);
      const compiler: CompilationService = {
        compile: async (request) => compile(request, options),
        dispose: async () => undefined,
      };
      return createBuildSession(
        { compiler, committer: createCandidateOutputCommitter() },
        { batchDelayMs: 0, ...options.session },
      );
    },
    createEventSource(_root: string, ignore: string[]) {
      expect(ignore).toEqual(
        expect.arrayContaining([
          path.join(rootFor(source), '.ng-doc/docs'),
          path.join(rootFor(source), '.cache/ng-doc/docs'),
          '**/node_modules/**',
        ]),
      );
      return source;
    },
    spawnHost,
  };
}

const sourceRoots = new WeakMap<ControlledSource, string>();

function rootFor(source: ControlledSource): string {
  const value = sourceRoots.get(source);
  if (!value) throw new Error('Source root was not registered');
  return value;
}

function success(
  options: GeneratorBootstrapOptions,
  request: CompilationRequest,
  overrides: Parameters<typeof configuration>[1] = {},
): CompilationResult {
  const config = configuration(options.workspaceRoot, {
    outputRoot: options.defaults.outputRoot,
    cacheRoot: options.defaults.cacheRoot,
    ...overrides,
  });
  return {
    candidate: snapshot(
      config,
      `generation-${request.generation}`,
      `revision-${request.generation}`,
    ),
    dependencies: [],
    diagnostics: [],
    whyRebuilt: [],
  };
}

function failure(code: string): CompilationResult {
  return {
    dependencies: [],
    diagnostics: [{ code, severity: 'error', stage: 'content', message: code }],
    whyRebuilt: [],
  };
}

function output(): { io: GeneratorCliIO; stdout: string; stderr: string } {
  const value = {
    stdout: '',
    stderr: '',
    io: undefined as unknown as GeneratorCliIO,
  };
  value.io = {
    cwd: () => process.cwd(),
    stdout: (text) => (value.stdout += text),
    stderr: (text) => (value.stderr += text),
    // Result lines only, whatever the machine's CI or NGDOC_PROGRESS (cli-progress.vitest.ts
    // covers the other settings).
    env: { NGDOC_PROGRESS: 'summary' },
  };
  return value;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for CLI state');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** Prefix for spawned `-e` programs: exit once reparented, i.e. when the test worker is gone. */
const EXIT_WHEN_ORPHANED =
  'const ownerPid=process.ppid;setInterval(()=>{if(process.ppid!==ownerPid)process.exit(0)},200).unref();';

function own<T extends ChildProcess>(
  child: T,
  { group = false }: { group?: boolean | undefined } = {},
): T {
  ownedChildren.add(child);
  if (group && child.pid !== undefined) ownedGroups.add(child.pid);
  return child;
}

function running(child: ChildProcess): boolean {
  return child.pid !== undefined && child.exitCode === null && child.signalCode === null;
}

/**
 * Sends `signal` (0 probes) to a pid or a group (-pgid) and reports whether the target still
 * exists. ESRCH means gone. macOS answers EPERM for a group whose only member is an exited but not
 * yet reaped leader; that still counts as present, so the caller keeps polling until Node reaps it.
 */
function signalQuietly(target: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(target, signal);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

async function eventually(done: () => boolean, timeoutMs: number = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() >= deadline) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

/** SIGKILLs every registered group and child and waits until each is really gone. */
async function reapOwned(): Promise<void> {
  const survivors: string[] = [];
  for (const group of [...ownedGroups]) {
    signalQuietly(-group, 'SIGKILL');
    if (!(await eventually(() => !signalQuietly(-group, 0)))) survivors.push(`group ${group}`);
    ownedGroups.delete(group);
  }
  for (const child of [...ownedChildren]) {
    if (running(child)) {
      child.kill('SIGKILL');
      if (!(await eventually(() => !running(child)))) survivors.push(`pid ${child.pid}`);
    }
    ownedChildren.delete(child);
  }
  if (survivors.length) throw new Error(`Test processes survived SIGKILL: ${survivors.join(', ')}`);
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}
