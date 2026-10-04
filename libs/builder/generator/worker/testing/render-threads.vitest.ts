import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CompilationRequest, JsonValue } from '../../contracts';
import { type WorkerCompilationOptions, createWorkerCompilationService } from '../index';

/**
 * A compiler runtime's render threads (`content/html-pool.ts`) end with it on every path: a
 * one-shot runtime terminates them before it replies, a long-lived one keeps them across its
 * generations' services and terminates them before it exits on dispose or recycle. The fixture's
 * compilation module starts a real thread per compile and logs what the runtime asks of it.
 */

const posix = process.platform !== 'win32';
let temporary: string;
let moduleUrl: URL;
let workerEntryUrl: URL;
let fixtureCount = 0;

async function events(file: string): Promise<string[]> {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text.trim().split('\n').filter(Boolean);
}

function service(options: Partial<WorkerCompilationOptions> = {}) {
  const log = path.join(temporary, `events-${++fixtureCount}`);
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
  temporary = await mkdtemp(path.join(tmpdir(), 'ng-doc-render-threads-'));
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
  const file = path.join(temporary, 'factory.mjs');
  // The pool of the fixture: real threads that would run forever, unreferenced like the pool's.
  await writeFile(
    file,
    `import { appendFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
let log;
let kept = false;
const threads = new Set();
const note = (event) => appendFileSync(log, process.pid + ' ' + event + '\\n');
export function keepRenderThreads(keep) {
  kept = keep;
}
export async function disposeRenderThreads() {
  const ending = [...threads];
  threads.clear();
  await Promise.all(ending.map((thread) => thread.terminate()));
  note('disposed ' + ending.length);
}
export function createCompilationService(options) {
  log = options.log;
  return {
    async compile(request) {
      const thread = new Worker('setInterval(() => {}, 1000);', { eval: true });
      thread.unref();
      threads.add(thread);
      note('compiled ' + request.generation + ' threads ' + threads.size + (kept ? ' kept' : ''));
      return { dependencies: [], diagnostics: [], whyRebuilt: [], candidate: { projectId: 'threads', revision: String(request.generation), artifacts: [], globalKeywords: [], remoteKeywords: [] } };
    },
    async dispose() {
      if (!kept) await disposeRenderThreads();
    },
  };
}
`,
  );
  moduleUrl = pathToFileURL(file);
});

afterAll(async () => {
  await rm(temporary, { recursive: true, force: true });
});

describe.runIf(posix)('render threads of a compiler runtime', () => {
  it('a one-shot runtime terminates them before it replies', async () => {
    const { compiler, log } = service({ persistent: false });
    expect((await compiler.compile(request(1, 'production'), signal())).candidate).toBeDefined();
    const logged = (await events(log)).map((line) => line.split(' ').slice(1).join(' '));
    // The service's dispose, then the runtime's own (nothing left by then).
    expect(logged).toEqual(['compiled 1 threads 1', 'disposed 1', 'disposed 0']);
    await compiler.dispose();
  });

  it('a long-lived runtime keeps them across generations and terminates them before it exits', async () => {
    const { compiler, log } = service();
    await compiler.watching?.(true);
    await compiler.compile(request(1, 'development'), signal(), watch);
    await compiler.compile(request(2, 'development'), signal(), watch);
    // The watch stops: the runtime is asked to exit, and resolves once it has.
    await compiler.watching?.(false);
    await compiler.dispose();
    const logged = await events(log);
    const runtime = logged[0]!.split(' ')[0];
    expect(logged.filter((line) => line.startsWith(`${runtime} `))).toEqual([
      `${runtime} compiled 1 threads 1 kept`,
      `${runtime} compiled 2 threads 2 kept`,
      `${runtime} disposed 2`,
    ]);
  });

  it('a recycled runtime terminates them before it exits', async () => {
    const { compiler, log } = service({ persistent: { maxGenerations: 1 } });
    await compiler.watching?.(true);
    await compiler.compile(request(1, 'development'), signal(), watch);
    // The reply recycled the runtime: it was asked to exit (a dispose kills every runtime at once,
    // so wait for the recycled one's own exit first).
    const deadline = Date.now() + 10_000;
    while (!(await events(log)).some((line) => line.includes('disposed')) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    await compiler.dispose();
    const logged = await events(log);
    const runtime = logged[0]!.split(' ')[0];
    expect(logged.filter((line) => line.startsWith(`${runtime} `))).toEqual([
      `${runtime} compiled 1 threads 1 kept`,
      `${runtime} disposed 1`,
    ]);
  });
});
