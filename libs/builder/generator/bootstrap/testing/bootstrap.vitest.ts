import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { FileChange } from '../../contracts';
import { createGeneratorBuildSession } from '..';

const repository = path.resolve(import.meta.dirname, '../../../../..');
let root: string;
let workerEntryUrl: URL;
let factoryUrl: URL;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-bootstrap-worker-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  await build({
    entryPoints: [path.join(repository, 'libs/builder/generator/worker/entry.ts')],
    outfile: path.join(root, 'worker-entry.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  const factory = path.join(root, 'factory.mjs');
  fs.writeFileSync(
    factory,
    `import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
export function createCompilationService(options) {
  return {
    async compile(request) {
      const content = 'generation-' + request.generation;
      const configuration = {
        outputRoot: options.defaults.outputRoot,
        cacheRoot: options.defaults.cacheRoot,
        assetDirectory: 'assets',
        themes: { light: 'light', dark: 'dark' },
        digest: 'configuration'
      };
      const output = { path: 'generated.txt', role: 'content', encoding: 'utf8', content, digest: hash(content) };
      const artifact = {
        id: 'artifact', identity: { projectId: options.projectId, entryId: 'entry', role: 'content' },
        revision: 'artifact-' + request.generation,
        fingerprint: { schemaVersion: 4, compilerVersion: options.compilerVersion, toolchainDigest: options.toolchainDigest, configurationDigest: configuration.digest, inputDigest: 'input', keywordDigest: 'keywords' },
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
  fs.rmSync(root, { recursive: true, force: true });
});

describe('generator bootstrap composition', () => {
  it('runs real disposable workers through one session and commits cold and warm generations', async () => {
    const workspace = path.join(root, 'workspace');
    const outputRoot = path.join(workspace, 'output');
    const session = createGeneratorBuildSession({
      projectId: 'project',
      workspaceRoot: workspace,
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot,
        cacheRoot: path.join(workspace, 'cache'),
      },
      templateRoot: root,
      compilerVersion: 'test-compiler',
      toolchainDigest: 'test-toolchain',
      worker: { moduleUrl: factoryUrl, workerEntryUrl },
      session: { batchDelayMs: 0 },
    });
    try {
      const cold = await session.buildOnce();
      expect(cold).toMatchObject({
        status: 'success',
        generation: 1,
        snapshot: { configuration: { outputRoot } },
      });
      expect(fs.readFileSync(path.join(outputRoot, 'generated.txt'), 'utf8')).toBe('generation-1');

      const warm = await session.buildOnce();
      expect(warm).toMatchObject({
        status: 'success',
        generation: 2,
        snapshot: { revision: 'revision-2' },
      });
      expect(fs.readFileSync(path.join(outputRoot, 'generated.txt'), 'utf8')).toBe('generation-2');
    } finally {
      await session.dispose();
      await session.dispose();
    }
  });

  it('contains worker startup failures and keeps the publication root absent', async () => {
    const workspace = path.join(root, 'failed-workspace');
    const outputRoot = path.join(workspace, 'output');
    const session = createGeneratorBuildSession({
      projectId: 'project',
      workspaceRoot: workspace,
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot,
        cacheRoot: path.join(workspace, 'cache'),
      },
      templateRoot: root,
      worker: {
        moduleUrl: pathToFileURL(path.join(root, 'missing-factory.mjs')),
        workerEntryUrl,
      },
    });
    try {
      expect(await session.buildOnce()).toMatchObject({
        status: 'failure',
        diagnostics: [expect.objectContaining({ code: 'WORKER_STARTUP' })],
      });
      expect(fs.existsSync(outputRoot)).toBe(false);
    } finally {
      await session.dispose();
    }
  });

  it('forwards an in-process admission hook without adding it to worker options', async () => {
    const workspace = path.join(root, 'host-admission');
    const outputRoot = path.join(workspace, 'output');
    const admitted: string[] = [];
    const session = createGeneratorBuildSession(
      {
        projectId: 'project',
        workspaceRoot: workspace,
        defaults: {
          docsRoot: path.join(workspace, 'docs'),
          tsConfig: path.join(workspace, 'tsconfig.json'),
          outputRoot,
          cacheRoot: path.join(workspace, 'cache'),
        },
        templateRoot: root,
        worker: { moduleUrl: factoryUrl, workerEntryUrl },
      },
      { admitConfiguration: (configuration) => admitted.push(configuration.outputRoot) },
    );
    try {
      await expect(session.buildOnce()).resolves.toMatchObject({ status: 'success' });
      expect(admitted).toEqual([outputRoot]);
    } finally {
      await session.dispose();
    }
  });

  it('validates all host paths and identifiers before worker admission', () => {
    const workspace = path.join(root, 'validation');
    const valid = {
      projectId: 'project',
      workspaceRoot: workspace,
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot: path.join(workspace, 'output'),
        cacheRoot: path.join(workspace, 'cache'),
      },
      templateRoot: root,
      worker: { moduleUrl: factoryUrl, workerEntryUrl },
    };
    expect(() => createGeneratorBuildSession({ ...valid, projectId: '' })).toThrow('projectId');
    expect(() => createGeneratorBuildSession({ ...valid, workspaceRoot: 'relative' })).toThrow(
      'workspaceRoot',
    );
    expect(() =>
      createGeneratorBuildSession({
        ...valid,
        defaults: { ...valid.defaults, outputRoot: `${workspace}/bad\0root` },
      }),
    ).toThrow('defaults.outputRoot');
  });

  it('rejects the removed virtual content mode with a coded migration error', () => {
    const workspace = path.join(root, 'development-content');
    const valid = {
      projectId: 'project',
      workspaceRoot: workspace,
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot: path.join(workspace, 'output'),
        cacheRoot: path.join(workspace, 'cache'),
      },
      templateRoot: root,
      worker: { moduleUrl: factoryUrl, workerEntryUrl },
    };
    const removed = { ...valid, developmentContent: 'virtual' } as unknown as Parameters<
      typeof createGeneratorBuildSession
    >[0];
    expect(() => createGeneratorBuildSession(removed)).toThrow(
      /^\[NGDOC_DEVELOPMENT_CONTENT_REMOVED\] developmentContent: 'virtual'.*Remove the option/,
    );
    const unknown = { ...valid, developmentContent: 'lazy' } as unknown as Parameters<
      typeof createGeneratorBuildSession
    >[0];
    expect(() => createGeneratorBuildSession(unknown)).toThrow(
      "developmentContent must be 'file' or omitted.",
    );
  });

  it('accepts an explicit file development content mode', async () => {
    const workspace = path.join(root, 'development-content-file');
    const session = createGeneratorBuildSession({
      projectId: 'project',
      workspaceRoot: workspace,
      developmentContent: 'file',
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot: path.join(workspace, 'output'),
        cacheRoot: path.join(workspace, 'cache'),
      },
      templateRoot: root,
      worker: { moduleUrl: factoryUrl, workerEntryUrl },
    });
    await session.dispose();
  });
});

describe('development worker lifetime', () => {
  let pidFactoryUrl: URL;
  beforeAll(() => {
    const factory = path.join(root, 'pid-factory.mjs');
    fs.writeFileSync(
      factory,
      `import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
export function createCompilationService(options) {
  return {
    async compile(request, signal) {
      // Slow until superseded: the superseding generation also lists fast.md.
      if (request.changes.some((change) => change.path.endsWith('slow.md')) && !request.changes.some((change) => change.path.endsWith('fast.md')))
        await new Promise((resolve) => signal.aborted ? resolve() : signal.addEventListener('abort', resolve, { once: true }));
      const revision = 'revision-' + request.generation + '-' + process.pid;
      const configuration = { outputRoot: options.defaults.outputRoot, cacheRoot: options.defaults.cacheRoot, assetDirectory: 'assets', themes: { light: 'light', dark: 'dark' }, digest: 'configuration' };
      const output = { path: 'generated.txt', role: 'content', encoding: 'utf8', content: revision, digest: hash(revision) };
      const artifact = {
        id: 'artifact', identity: { projectId: options.projectId, entryId: 'entry', role: 'content' }, revision,
        fingerprint: { schemaVersion: 4, compilerVersion: options.compilerVersion, toolchainDigest: options.toolchainDigest, configurationDigest: configuration.digest, inputDigest: 'input', keywordDigest: 'keywords' },
        dependencies: [], content: [], exportedKeywords: [], usedKeywords: [], searchRecords: [], routes: [], apiList: [], outputs: [output], diagnostics: []
      };
      return { candidate: { configuration, projectId: options.projectId, revision, artifacts: [artifact], globalKeywords: [], remoteKeywords: [] }, dependencies: [], diagnostics: [], whyRebuilt: [] };
    },
    async dispose() {}
  };
}`,
    );
    pidFactoryUrl = pathToFileURL(factory);
  });

  const pid = (result: { status: string; snapshot?: { revision: string } }) =>
    Number(result.snapshot?.revision.split('-').at(-1));

  async function run(name: string, worker: Record<string, unknown> = {}) {
    const workspace = path.join(root, name);
    const session = createGeneratorBuildSession({
      projectId: 'project',
      workspaceRoot: workspace,
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot: path.join(workspace, 'output'),
        cacheRoot: path.join(workspace, 'cache'),
      },
      templateRoot: root,
      compilerVersion: 'test-compiler',
      toolchainDigest: 'test-toolchain',
      worker: { moduleUrl: pidFactoryUrl, workerEntryUrl, ...worker },
      session: { batchDelayMs: 0 },
    });
    const results: Array<{ status: string; generation: number; snapshot?: { revision: string } }> =
      [];
    let started = 0;
    let emit!: (changes: Array<{ kind: 'update'; path: string }>) => unknown;
    try {
      const once = await session.buildOnce({ mode: 'development' });
      const watch = await session.watch(
        {
          async subscribe(listener: (events: FileChange[]) => unknown) {
            emit = listener;
            return { dispose: async () => {} };
          },
        },
        (event) => {
          if (event.kind === 'result') results.push(event.result as never);
          if (event.kind === 'started') started++;
        },
      );
      const initial = await watch.initial;
      emit([{ kind: 'update', path: path.join(workspace, 'docs', 'slow.md') }]);
      await vi.waitFor(() => expect(started).toBe(2), { timeout: 10_000 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      // A change while the slow generation runs supersedes it (cooperative abort).
      emit([{ kind: 'update', path: path.join(workspace, 'docs', 'fast.md') }]);
      await vi.waitFor(() => expect(results.length).toBeGreaterThanOrEqual(3), { timeout: 10_000 });
      await watch.dispose();
      const production = await session.buildOnce();
      return { once, initial, results, production };
    } finally {
      await session.dispose();
    }
  }

  it('serves the startup buildOnce and watch generations from one runtime and keeps production one-shot', async () => {
    const { once, initial, results, production } = await run('persistent');
    expect(results.map((result) => result.status)).toEqual(['success', 'cancelled', 'success']);
    expect(pid(results[2])).toBe(pid(initial));
    // The development buildOnce before the watch runs in the runtime the watch then uses.
    expect(pid(once)).toBe(pid(initial));
    expect(pid(production)).not.toBe(pid(initial));
  }, 30_000);

  it('warns once about an unrecognised NGDOC_PERSISTENT_WORKER value and keeps persistence on', async () => {
    const previous = process.env['NGDOC_PERSISTENT_WORKER'];
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    const create = () =>
      createGeneratorBuildSession({
        projectId: 'project',
        workspaceRoot: path.join(root, 'switch'),
        defaults: {
          docsRoot: path.join(root, 'switch', 'docs'),
          tsConfig: path.join(root, 'switch', 'tsconfig.json'),
          outputRoot: path.join(root, 'switch', 'output'),
          cacheRoot: path.join(root, 'switch', 'cache'),
        },
        templateRoot: root,
        worker: { moduleUrl: pidFactoryUrl, workerEntryUrl },
      });
    try {
      for (const value of ['yes', ' ON ', '']) {
        process.env['NGDOC_PERSISTENT_WORKER'] = value;
        await create().dispose();
      }
      expect(warn).not.toHaveBeenCalled();
      process.env['NGDOC_PERSISTENT_WORKER'] = 'disabled';
      await create().dispose();
      await create().dispose();
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('NGDOC_PERSISTENT_WORKER="disabled"');
    } finally {
      warn.mockRestore();
      if (previous === undefined) delete process.env['NGDOC_PERSISTENT_WORKER'];
      else process.env['NGDOC_PERSISTENT_WORKER'] = previous;
    }
  });

  it('runs every watch generation one-shot with NGDOC_PERSISTENT_WORKER=0 or persistent: false', async () => {
    const previous = process.env['NGDOC_PERSISTENT_WORKER'];
    process.env['NGDOC_PERSISTENT_WORKER'] = '0';
    try {
      const { initial, results } = await run('disabled-env', { persistent: { abortGraceMs: 100 } });
      expect(pid(results[2])).not.toBe(pid(initial));
    } finally {
      if (previous === undefined) delete process.env['NGDOC_PERSISTENT_WORKER'];
      else process.env['NGDOC_PERSISTENT_WORKER'] = previous;
    }
    const { initial, results } = await run('disabled-option', { persistent: false });
    expect(pid(results[2])).not.toBe(pid(initial));
  }, 30_000);
});

describe('priming the development worker', () => {
  let primeFactoryUrl: URL;
  beforeAll(() => {
    const factory = path.join(root, 'prime-factory.mjs');
    // Deterministic like the real compiler: the revision depends on the page only, so a warm-up
    // of the committed baseline yields the committed revision. Every compile is logged.
    fs.writeFileSync(
      factory,
      `import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
export function createCompilationService(options) {
  return {
    async compile(request, _signal, context) {
      const page = options.defaults.docsRoot + '/page.md';
      const body = readFileSync(page, 'utf8');
      appendFileSync(options.defaults.cacheRoot + '.log', JSON.stringify({ pid: process.pid, generation: request.generation, lifetime: context?.lifetime ?? null, base: request.previous?.revision ?? null, frozen: Object.isFrozen(request.previous ?? {}) }) + '\\n');
      const revision = 'revision-' + hash(body);
      const configuration = { outputRoot: options.defaults.outputRoot, cacheRoot: options.defaults.cacheRoot, assetDirectory: 'assets', themes: { light: 'light', dark: 'dark' }, digest: 'configuration' };
      const output = { path: 'generated.txt', role: 'content', encoding: 'utf8', content: body, digest: hash(body) };
      const artifact = {
        id: 'artifact', identity: { projectId: options.projectId, entryId: 'entry', role: 'content' }, revision,
        fingerprint: { schemaVersion: 4, compilerVersion: options.compilerVersion, toolchainDigest: options.toolchainDigest, configurationDigest: configuration.digest, inputDigest: 'input', keywordDigest: 'keywords' },
        dependencies: [], content: [], exportedKeywords: [], usedKeywords: [], searchRecords: [], routes: [], apiList: [], outputs: [output], diagnostics: []
      };
      return { candidate: { configuration, projectId: options.projectId, revision, artifacts: [artifact], globalKeywords: [], remoteKeywords: [] }, dependencies: [{ kind: 'content', path: page, digest: hash(body) }], diagnostics: [], whyRebuilt: [] };
    },
    async dispose() {}
  };
}`,
    );
    primeFactoryUrl = pathToFileURL(factory);
  });

  async function start(name: string, worker: Record<string, unknown> = {}) {
    const workspace = path.join(root, name);
    fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'docs', 'page.md'), 'page body');
    const cacheRoot = path.join(workspace, 'cache');
    const session = createGeneratorBuildSession({
      projectId: 'project',
      workspaceRoot: workspace,
      defaults: {
        docsRoot: path.join(workspace, 'docs'),
        tsConfig: path.join(workspace, 'tsconfig.json'),
        outputRoot: path.join(workspace, 'output'),
        cacheRoot,
      },
      templateRoot: root,
      worker: { moduleUrl: primeFactoryUrl, workerEntryUrl, ...worker },
      session: { batchDelayMs: 0 },
    });
    const inspect = () =>
      (session as unknown as { inspect(): { priming?: string } }).inspect().priming;
    const delta =
      typeof (session as unknown as { services: { compiler: { acknowledge?: unknown } } }).services
        .compiler.acknowledge === 'function';
    try {
      const once = await session.buildOnce({ mode: 'development' });
      expect(once.status).toBe('success');
      const watch = await session.watch(
        {
          async subscribe() {
            return { dispose: async () => {} };
          },
        },
        () => {},
      );
      expect(await watch.initial).toEqual(once);
      // A warm-up starts as the watch becomes ready; without the hook there is none.
      await vi.waitFor(() => expect(inspect()).not.toBe('running'), { timeout: 10_000 });
      const state = inspect();
      await watch.dispose();
      const log = fs
        .readFileSync(`${cacheRoot}.log`, 'utf8')
        .trim()
        .split('\n')
        .map(
          (line) => JSON.parse(line) as { lifetime: string; base: string | null; frozen: boolean },
        );
      return {
        state,
        log,
        delta,
        revision: once.status === 'success' ? once.snapshot.revision : '',
      };
    } finally {
      await session.dispose();
    }
  }

  function withEnv(values: Record<string, string>) {
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.assign(process.env, values);
    return () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };
  }

  it('primes the long-lived worker with the committed baseline by default', async () => {
    const { state, log, revision } = await start('prime-default');
    expect(state).toBe('primed');
    // The startup buildOnce runs in the long-lived runtime; this compiler retains nothing, so the
    // warm-up compiles the committed baseline there.
    expect(log).toEqual([
      expect.objectContaining({ lifetime: 'watch', base: null }),
      expect.objectContaining({ lifetime: 'watch', base: revision }),
    ]);
  }, 30_000);

  it('does not prime with NGDOC_PERSISTENT_WORKER_PRIME=0, persistent.prime false or NGDOC_PERSISTENT_WORKER=0', async () => {
    for (const [name, env, worker] of [
      ['prime-env', { NGDOC_PERSISTENT_WORKER_PRIME: 'off' }, {}],
      [
        'prime-env-options',
        { NGDOC_PERSISTENT_WORKER_PRIME: '0' },
        { persistent: { abortGraceMs: 100 } },
      ],
      ['prime-option', {}, { persistent: { prime: false } }],
      ['prime-kill-switch', { NGDOC_PERSISTENT_WORKER: 'no' }, {}],
    ] as const) {
      const restore = withEnv(env);
      try {
        const { state, log } = await start(name, worker);
        expect(state).toBeUndefined();
        expect(log).toHaveLength(1);
      } finally {
        restore();
      }
    }
  }, 30_000);

  it('uses the delta transport by default; NGDOC_DELTA_TRANSPORT=0 or delta: false keep the full one; verify is recognised', async () => {
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      const byDefault = await start('delta-default');
      expect(byDefault).toMatchObject({ state: 'primed', delta: true });
      // Priming is the first resync: the runtime compiles its retained copy, not frozen by default.
      expect(byDefault.log[1]).toMatchObject({
        lifetime: 'watch',
        base: byDefault.revision,
        frozen: false,
      });
      for (const [name, env, worker] of [
        ['delta-env-off', { NGDOC_DELTA_TRANSPORT: 'off' }, {}],
        ['delta-env-zero', { NGDOC_DELTA_TRANSPORT: '0' }, { persistent: { abortGraceMs: 100 } }],
        ['delta-option', {}, { persistent: { delta: false } }],
        ['delta-kill-switch', { NGDOC_PERSISTENT_WORKER: '0' }, {}],
      ] as const) {
        const restore = withEnv(env);
        try {
          expect((await start(name, worker)).delta, name).toBe(false);
        } finally {
          restore();
        }
      }
      const restore = withEnv({ NGDOC_DELTA_TRANSPORT: 'verify' });
      try {
        const verified = await start('delta-verify');
        expect(verified).toMatchObject({ state: 'primed', delta: true });
        // verify mode freezes the retained snapshot in the runtime.
        expect(verified.log[1]).toMatchObject({ lifetime: 'watch', frozen: true });
      } finally {
        restore();
      }
      const unknown = withEnv({ NGDOC_DELTA_TRANSPORT: 'maybe' });
      try {
        expect((await start('delta-unrecognised')).delta).toBe(true);
      } finally {
        unknown();
      }
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('NGDOC_DELTA_TRANSPORT="maybe"');
    } finally {
      warn.mockRestore();
    }
  }, 60_000);

  it('warns once about an unrecognised NGDOC_PERSISTENT_WORKER_PRIME value and keeps priming on', async () => {
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    const restore = withEnv({ NGDOC_PERSISTENT_WORKER_PRIME: 'sometimes' });
    try {
      expect((await start('prime-unrecognised')).state).toBe('primed');
      expect((await start('prime-unrecognised-again')).state).toBe('primed');
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('NGDOC_PERSISTENT_WORKER_PRIME="sometimes"');
    } finally {
      restore();
      warn.mockRestore();
    }
  }, 30_000);
});
