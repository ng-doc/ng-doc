import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CompilationRequest, JsonValue } from '../../contracts';
import { type WorkerCompilationOptions, createWorkerCompilationService } from '../index';

/**
 * A runtime's own children end with it. The compiler's esbuild service is such a child: it is
 * started once per runtime, unreferenced, and exits only after it reads the end of its stdin once
 * the runtime died. A host that exits right after `dispose` must not leave it behind, so every way
 * a runtime ends (a one-shot reply, the watch stopping, a recycle, dispose) resolves only after
 * everything the runtime started is gone. The fixture's helper stands in for the esbuild service
 * and lingers for a long time after the end of its stdin, so nothing but a kill ends it in time.
 */

const posix = process.platform !== 'win32';
let temporary: string;
let moduleUrl: URL;
let workerEntryUrl: URL;
let fixtureCount = 0;
const started = new Set<number>();

/** Present (EPERM: exited but not reaped yet, as macOS answers for it) or gone (ESRCH). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function processes(file: string): Promise<Array<{ runtime: number; helper: number }>> {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [runtime, helper] = line.split(' ').map(Number);
      started.add(runtime).add(helper);
      return { runtime, helper };
    });
}

function service(options: Partial<WorkerCompilationOptions> = {}) {
  const log = path.join(temporary, `processes-${++fixtureCount}`);
  const compiler = createWorkerCompilationService({
    moduleUrl,
    workerEntryUrl,
    factoryOptions: { log } as JsonValue,
    startupTimeoutMs: 10_000,
    compileTimeoutMs: 10_000,
    ...options,
  });
  return { compiler, log };
}

const request = (generation: number, mode: CompilationRequest['mode']): CompilationRequest => ({
  generation,
  mode,
  changes: [],
});
const signal = () => new AbortController().signal;
const watch = { lifetime: 'watch' as const };

beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'ng-doc-worker-tree-'));
  await build({
    entryPoints: [
      path.resolve(import.meta.dirname, '../entry.ts'),
      path.resolve(import.meta.dirname, '../protocol.ts'),
    ],
    outdir: temporary,
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  workerEntryUrl = pathToFileURL(path.join(temporary, 'entry.js'));
  // The helper ignores SIGTERM and stays 30 s after the end of its stdin.
  const helper =
    "process.on('SIGTERM',()=>{});process.stdin.on('end',()=>setTimeout(()=>process.exit(0),30000));process.stdin.resume();";
  const file = path.join(temporary, 'factory.mjs');
  await writeFile(
    file,
    `import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
let helper;
export function createCompilationService({ log }) {
  if (!helper) {
    // Started like esbuild starts its service: piped stdin, unreferenced, never stopped.
    helper = spawn(process.execPath, ['-e', ${JSON.stringify(helper)}], { stdio: ['pipe', 'ignore', 'ignore'] });
    helper.unref();
    helper.stdin.unref();
    appendFileSync(log, process.pid + ' ' + helper.pid + '\\n');
  }
  return {
    async compile(request) {
      return { dependencies: [], diagnostics: [], whyRebuilt: [], candidate: { projectId: 'tree', revision: String(request.generation), artifacts: [], globalKeywords: [], remoteKeywords: [] } };
    },
    async dispose() {},
  };
}
`,
  );
  moduleUrl = pathToFileURL(file);
});

afterAll(async () => {
  // A failing assertion must not leave its helpers running for their 30 s.
  for (const pid of started) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* Gone. */
    }
  }
  await rm(temporary, { recursive: true, force: true });
});

describe.runIf(posix)('worker process trees', () => {
  it('resolves a one-shot generation only after everything its runtime started is gone', async () => {
    const { compiler, log } = service({ persistent: false });
    const result = await compiler.compile(request(1, 'production'), signal());
    expect(result.candidate?.revision).toBe('1');
    const [{ runtime, helper }] = await processes(log);
    expect(alive(runtime)).toBe(false);
    expect(alive(helper)).toBe(false);
    await compiler.dispose();
  });

  it('ends the long-lived runtime and its children before watching(false) and dispose resolve', async () => {
    const stopped = service();
    await stopped.compiler.watching?.(true);
    expect(
      (await stopped.compiler.compile(request(1, 'development'), signal(), watch)).candidate,
    ).toBeDefined();
    const [first] = await processes(stopped.log);
    expect(alive(first.helper)).toBe(true);
    await stopped.compiler.watching?.(false);
    expect(alive(first.runtime)).toBe(false);
    expect(alive(first.helper)).toBe(false);
    await stopped.compiler.dispose();

    const disposed = service();
    await disposed.compiler.watching?.(true);
    await disposed.compiler.compile(request(1, 'development'), signal(), watch);
    const [second] = await processes(disposed.log);
    await disposed.compiler.dispose();
    expect(alive(second.runtime)).toBe(false);
    expect(alive(second.helper)).toBe(false);
  });

  it('waits on dispose for a recycled runtime that is still ending, and for its children', async () => {
    const { compiler, log } = service({ persistent: { maxGenerations: 1 } });
    await compiler.watching?.(true);
    await compiler.compile(request(1, 'development'), signal(), watch);
    // The reply recycled the runtime: it was asked to exit, and a replacement is warming up.
    const [retired] = await processes(log);
    await compiler.dispose();
    expect(alive(retired.runtime)).toBe(false);
    expect(alive(retired.helper)).toBe(false);
  });

  it('ends what a runtime started when the runtime is killed mid-generation', async () => {
    const { compiler, log } = service({ persistent: { abortGraceMs: 50 } });
    await compiler.watching?.(true);
    await compiler.compile(request(1, 'development'), signal(), watch);
    const [{ runtime, helper }] = await processes(log);
    // A crash: the runtime dies without a chance to end its children.
    process.kill(runtime, 'SIGKILL');
    await compiler.dispose();
    expect(alive(runtime)).toBe(false);
    expect(alive(helper)).toBe(false);
  });
});
