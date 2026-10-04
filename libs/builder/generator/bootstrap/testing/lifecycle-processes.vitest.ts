import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BuildEvent } from '../../contracts';
import { createParcelEventSource } from '../../session/parcel-event-source';
import { createGeneratorBuildSession } from '..';

/**
 * A host that ran a production build, a watch with an edit and disposed must be left with nothing
 * it started, so it can exit at once and a supervisor that waits for its process group to empty
 * finds it empty. That covers the runtimes and what they started (the fixture's helper lingers
 * like the compiler's esbuild service), and the host's own children, exited ones included: a
 * child nobody reaps stays a zombie in the host's group until the host exits. @parcel/watcher's
 * Watchman probe on Linux left one, so this test watches with NgDoc's own watcher.
 */

const repository = path.resolve(import.meta.dirname, '../../../../..');
const posix = process.platform !== 'win32';
let root: string;
let workerEntryUrl: URL;
let factoryUrl: URL;
const started = new Set<number>();

interface Row {
  pid: number;
  ppid: number;
  pgid: number;
  stat: string;
  command: string;
}

function rows(): Row[] {
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,stat=,command='], { encoding: 'utf8' })
    .split('\n')
    .flatMap((row) => {
      const match = row.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
      return match
        ? [
            {
              pid: Number(match[1]),
              ppid: Number(match[2]),
              pgid: Number(match[3]),
              stat: match[4],
              command: match[5],
            },
          ]
        : [];
    })
    .filter((row) => !row.command.startsWith('/bin/ps '));
}

/** This process's children, exited but unreaped ones included. */
const children = (): Row[] => rows().filter((row) => row.ppid === process.pid);

/** A process group that still has a member; macOS answers EPERM for one only exited ones hold. */
function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Present, or exited but not reaped yet (EPERM, as macOS answers for it). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function processes(log: string): Array<{ runtime: number; helper: number }> {
  const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
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

beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-lifecycle-processes-')));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  await build({
    entryPoints: [path.join(repository, 'libs/builder/generator/worker/entry.ts')],
    outfile: path.join(root, 'worker-entry.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  // The helper ignores SIGTERM and stays 30 s after the end of its stdin.
  const helper =
    "process.on('SIGTERM',()=>{});process.stdin.on('end',()=>setTimeout(()=>process.exit(0),30000));process.stdin.resume();";
  const factory = path.join(root, 'factory.mjs');
  fs.writeFileSync(
    factory,
    `import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
const hash = value => createHash('sha256').update(value).digest('hex');
let helper;
export function createCompilationService(options) {
  if (!helper) {
    // Started like esbuild starts its service: piped stdin, unreferenced, never stopped.
    helper = spawn(process.execPath, ['-e', ${JSON.stringify(helper)}], { stdio: ['pipe', 'ignore', 'ignore'] });
    helper.unref();
    helper.stdin.unref();
    appendFileSync(path.join(options.defaults.cacheRoot, '..', 'processes'), process.pid + ' ' + helper.pid + '\\n');
  }
  return {
    async compile(request) {
      const content = readFileSync(path.join(options.defaults.docsRoot, 'page.md'), 'utf8');
      const configuration = { outputRoot: options.defaults.outputRoot, cacheRoot: options.defaults.cacheRoot, assetDirectory: 'assets', themes: { light: 'light', dark: 'dark' }, digest: 'configuration' };
      const output = { path: 'generated.txt', role: 'content', encoding: 'utf8', content, digest: hash(content) };
      const artifact = {
        id: 'artifact', identity: { projectId: options.projectId, entryId: 'entry', role: 'content' }, revision: hash(content),
        fingerprint: { schemaVersion: 4, compilerVersion: options.compilerVersion, toolchainDigest: options.toolchainDigest, configurationDigest: configuration.digest, inputDigest: hash(content), keywordDigest: 'keywords' },
        dependencies: [], content: [], exportedKeywords: [], usedKeywords: [], searchRecords: [], routes: [], apiList: [], outputs: [output], diagnostics: []
      };
      return { candidate: { configuration, projectId: options.projectId, revision: 'revision-' + request.generation, artifacts: [artifact], globalKeywords: [], remoteKeywords: [] }, dependencies: [], diagnostics: [], whyRebuilt: [] };
    },
    async dispose() {}
  };
}`,
  );
  workerEntryUrl = pathToFileURL(path.join(root, 'worker-entry.mjs'));
  factoryUrl = pathToFileURL(factory);
});

afterAll(() => {
  // A failing assertion must not leave its helpers running for their 30 s.
  for (const pid of started) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* Gone. */
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe.runIf(posix)('host processes after dispose', () => {
  it('leaves nothing after a production build, a watch with an edit and dispose', async () => {
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'cache-once'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'cache-watch'), { recursive: true });
    const page = path.join(workspace, 'docs', 'page.md');
    fs.writeFileSync(page, 'content one\n');
    const create = (name: string) =>
      createGeneratorBuildSession({
        projectId: 'lifecycle',
        workspaceRoot: workspace,
        defaults: {
          docsRoot: path.join(workspace, 'docs'),
          tsConfig: path.join(workspace, 'tsconfig.json'),
          outputRoot: path.join(workspace, `output-${name}`),
          cacheRoot: path.join(workspace, `cache-${name}`),
        },
        templateRoot: root,
        compilerVersion: 'test-compiler',
        toolchainDigest: 'test-toolchain',
        worker: { moduleUrl: factoryUrl, workerEntryUrl },
        session: { batchDelayMs: 0 },
      });
    const before = new Set(children().map((row) => row.pid));

    const once = create('once');
    try {
      expect((await once.buildOnce({ mode: 'production' })).status).toBe('success');
    } finally {
      await once.dispose();
    }

    const watched = create('watch');
    const results: Array<Extract<BuildEvent, { kind: 'result' }>['result']> = [];
    try {
      const handle = await watched.watch(
        createParcelEventSource(workspace, {
          ignore: ['output-once', 'output-watch', 'cache-once', 'cache-watch', 'processes'].map(
            (name) => path.join(workspace, name),
          ),
        }),
        (event) => {
          if (event.kind === 'result') results.push(event.result);
        },
      );
      try {
        const initial = await handle.initial;
        expect(initial.status).toBe('success');
        fs.writeFileSync(page, 'content two\n');
        const deadline = Date.now() + 30_000;
        while (!results.some((result) => result.generation > initial.generation)) {
          if (Date.now() > deadline) throw new Error('The edit produced no generation');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const updated = results.find((result) => result.generation > initial.generation);
        expect(updated?.status).toBe('success');
        expect(fs.readFileSync(path.join(workspace, 'output-watch', 'generated.txt'), 'utf8')).toBe(
          'content two\n',
        );
      } finally {
        await handle.dispose();
      }
    } finally {
      await watched.dispose();
    }

    // One one-shot runtime for the build, one long-lived runtime for the watch.
    const runtimes = processes(path.join(workspace, 'processes'));
    expect(runtimes.length).toBeGreaterThanOrEqual(2);
    for (const { runtime, helper } of runtimes) {
      expect(groupAlive(runtime), `runtime group ${runtime}`).toBe(false);
      expect(alive(helper), `helper ${helper}`).toBe(false);
    }
    expect(children().filter((row) => !before.has(row.pid))).toEqual([]);
  }, 60_000);
});
