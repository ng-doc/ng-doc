import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { createObserver } from './runtime.mjs';
import { captureObserverSources, createWorkObserverPlugin } from './plugin.mjs';
import { readObserverTraces } from './read-traces.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const turn = () => new Promise((resolve) => setImmediate(resolve));

test('delegates exact this, arguments and synchronous return/throw identity', () => {
  const events = [];
  const observer = createObserver((event) => events.push(event));
  const receiver = { value: {} };
  const arg = {};
  const fn = observer.wrapCall('method', function (...args) {
    assert.equal(this, receiver);
    assert.deepEqual(args, [arg, undefined]);
    return this.value;
  });
  assert.equal(fn.call(receiver, arg, undefined), receiver.value);
  const error = new Error('original');
  assert.throws(
    () =>
      observer.wrapCall('bad', () => {
        throw error;
      })(),
    (value) => value === error,
  );
  assert.deepEqual(
    events.map((event) => event.event),
    ['call', 'return', 'call', 'throw'],
  );
  assert.equal(observer.status().active, 0);
});

test('preserves Promise identity, settlement value and rejection reason', async () => {
  const events = [];
  const observer = createObserver((event) => events.push(event));
  const value = { status: 'hit' };
  const promise = Promise.resolve(value);
  assert.equal(observer.wrapCall('cache.read', () => promise)(), promise);
  assert.equal(await promise, value);
  const reason = new Error('cancelled');
  const rejected = Promise.reject(reason);
  assert.equal(observer.wrapCall('content.compile', () => rejected)(), rejected);
  await assert.rejects(rejected, (error) => error === reason);
  await turn();
  assert.equal(
    events.find((event) => event.name === 'cache.read' && event.event === 'return').result.status,
    'hit',
  );
  assert.equal(events.filter((event) => event.event === 'reject').length, 1);
  assert.equal(observer.status().active, 0);
});

test('does not assimilate thenables or invoke accessors', () => {
  const observer = createObserver(() => {});
  const object = {
    get then() {
      throw new Error('must not read then');
    },
  };
  assert.equal(observer.wrapCall('foreign', () => object)(), object);
  const argument = {
    get generation() {
      throw new Error('must not read generation');
    },
  };
  assert.equal(
    observer.wrapCall('compiler.compile', () => object, { scope: true })(argument),
    object,
  );
  assert.equal(observer.status().failed, false);
});

test('isolates async generation contexts without serializing concurrent calls', async () => {
  const events = [];
  const observer = createObserver((event) => events.push(event));
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const inner = observer.wrapCall('content.compile', async () => ({ diagnostics: [] }));
  const outer = observer.wrapCall(
    'compiler.compile',
    async (request) => {
      if (request.generation === 1) await gate;
      return inner({ id: `content-${request.generation}` });
    },
    { scope: true },
  );
  const first = outer({
    generation: 1,
    mode: 'development',
    contentRequest: { origin: 'interactive' },
  });
  await outer({ generation: 2, mode: 'development', contentRequest: { origin: 'background' } });
  assert.equal(events.find((event) => event.name === 'content.compile').generation, 2);
  release();
  await first;
  await turn();
  const calls = events.filter(
    (event) => event.name === 'content.compile' && event.event === 'call',
  );
  assert.deepEqual(
    calls.map((event) => [event.generation, event.origin]),
    [
      [2, 'background'],
      [1, 'interactive'],
    ],
  );
});

test('sink failure invalidates observation without replacing application outcomes', async () => {
  const observer = createObserver(() => {
    throw new Error('disk full');
  });
  const promise = Promise.resolve(7);
  assert.equal(observer.wrapCall('method', () => promise)(), promise);
  assert.equal(await promise, 7);
  assert.equal(observer.status().failed, true);
  await turn();
  assert.equal(observer.status().active, 0);
});

test('decorated real instance retains private fields and explicit receivers; no double counting', () => {
  const events = [];
  const observer = createObserver((event) => events.push(event));
  class Service {
    #value;
    constructor(value) {
      this.#value = value;
    }
    read() {
      return this.#value;
    }
  }
  const first = new Service(1);
  const second = new Service(2);
  assert.equal(observer.decorate(first, 'service', ['read']), first);
  observer.decorate(first, 'service', ['read']);
  assert.equal(first.read(), 1);
  assert.equal(first.read.call(second), 2);
  assert.equal(events.filter((event) => event.event === 'call').length, 2);
  assert.throws(() => observer.decorate({}, 'wrong', ['missing']), /missing/);
});

async function runChild(entry, env) {
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
  try {
    const exit = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    assert.deepEqual(exit, { code: 0, signal: null }, output);
    return output;
  } finally {
    clearTimeout(timer);
  }
}

test(
  'actual esbuild interception observes real compiler services, cache miss and deduplicated filesystem reads',
  { timeout: 60_000 },
  async () => {
    const temporary = await mkdtemp(path.join(here, '.test-'));
    try {
      const expectedSources = await captureObserverSources(root);
      const entry = path.join(temporary, 'entry.mjs');
      const trace = path.join(temporary, 'trace');
      const input = path.join(temporary, 'input.txt');
      await mkdir(trace);
      await writeFile(input, 'real physical input');
      await mkdir(path.join(temporary, 'docs/guide'), { recursive: true });
      await writeFile(
        path.join(temporary, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
          include: ['docs/**/*.ts'],
        }),
      );
      await writeFile(
        path.join(temporary, 'ng-doc.config.ts'),
        "export default { docsPath: 'docs', cache: true };",
      );
      await writeFile(
        path.join(temporary, 'docs/guide/ng-doc.page.ts'),
        "const page = { title: 'Guide', route: 'guide', mdFile: './index.md' }; export default page;",
      );
      await writeFile(
        path.join(temporary, 'docs/guide/index.md'),
        '# Actual observer guide\n\nReal rendered body.',
      );
      await writeFile(
        entry,
        `
      import assert from 'node:assert/strict';
      import {createCompilationService} from ${JSON.stringify(path.join(root, 'libs/builder/generator/compiler/index.ts'))};
      import {GeneratorContentCompiler} from ${JSON.stringify(path.join(root, 'libs/builder/generator/content/content-compiler.ts'))};
      import {createDependencyRefresher} from ${JSON.stringify(path.join(root, 'libs/builder/generator/graph/index.ts'))};
      import {createHash} from 'node:crypto';
      import {createArtifactCache,createOutputCommitter} from ${JSON.stringify(path.join(root, 'libs/builder/generator/artifacts/index.ts'))};
      const service = createCompilationService({
        projectId:'observer-test', workspaceRoot:${JSON.stringify(temporary)},
        configFile:${JSON.stringify(path.join(temporary, 'ng-doc.config.ts'))},
        templateRoot:${JSON.stringify(path.join(root, 'libs/builder/templates'))},
        defaults:{docsRoot:${JSON.stringify(path.join(temporary, 'docs'))},tsConfig:${JSON.stringify(path.join(temporary, 'tsconfig.json'))},outputRoot:${JSON.stringify(path.join(temporary, 'generated'))},cacheRoot:${JSON.stringify(path.join(temporary, 'compiler-cache'))}},
        compilerVersion:'test',toolchainDigest:'test'
      });
      try {
        const generated = await service.compile({generation:41,mode:'production',changes:[]},new AbortController().signal);
        assert.deepEqual(generated.diagnostics.filter(item=>item.severity==='error'),[]);
        assert.ok(generated.candidate);
        assert.match(JSON.stringify(generated.candidate.artifacts),/Real rendered body/);
      } finally { await service.dispose(); }
      const calls = [];
      const options = { onObserve(...args) { assert.equal(this, options); calls.push(args); } };
      const refresher = createDependencyRefresher(options);
      const deps = [{kind:'content',path:${JSON.stringify(input)},digest:'stale'}];
      const first = await refresher.refresh(deps, []);
      const second = await refresher.refresh(deps, []);
      assert.deepEqual(first, second);
      assert.equal(calls.length, 1);
      assert.equal(Object.keys(options).length, 1);
      const cache = createArtifactCache(${JSON.stringify(path.join(temporary, 'cache'))});
      const result = await cache.read({identity:{projectId:'p',entryId:'e',kind:'guide'},fingerprint:{}});
      assert.equal(result.status,'miss');
      const artifact = {
        id:'guide',identity:{projectId:'p',entryId:'e',role:'content',part:'body'},revision:'one',
        fingerprint:{schemaVersion:1,compilerVersion:'test',toolchainDigest:'test',configurationDigest:'test',inputDigest:'test',keywordDigest:'test'},
        dependencies:[],content:[],exportedKeywords:[],usedKeywords:[],searchRecords:[],routes:[],apiList:[],diagnostics:[],
        outputs:[{path:'body.txt',role:'content',encoding:'utf8',content:'real bytes',digest:createHash('sha256').update('real bytes').digest('hex')}],
      };
      await cache.write(artifact);
      assert.equal((await cache.read(artifact)).status,'hit');
      const committer = createOutputCommitter({outputRoot:${JSON.stringify(path.join(temporary, 'output'))}});
      const candidate = {projectId:'p',revision:'one',artifacts:[artifact],globalKeywords:[],remoteKeywords:[]};
      const committed = await committer.commit({generation:1,candidate},{isCurrent:()=>true},new AbortController().signal);
      assert.equal(committed.status,'committed');
      assert.equal(committed.written.length,1);
      const noOp = await committer.commit({generation:1,candidate},{isCurrent:()=>true},new AbortController().signal);
      assert.equal(noOp.written.length,0);
      await committer.dispose();
      const content = new GeneratorContentCompiler({});
      const signal = AbortSignal.abort();
      const cancelled = await content.compile({kind:'guide-tab',id:'cancel'},signal);
      assert.equal(cancelled.diagnostics.length,1);
      console.log('REAL_OBSERVER_PASS');
    `,
      );
      await build({
        entryPoints: [entry],
        outfile: path.join(temporary, 'bundle.mjs'),
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'esm',
        target: 'node24',
        logLevel: 'silent',
        alias: {
          '@ng-doc/core': path.join(root, 'libs/core/index.ts'),
          '@ng-doc/utils': path.join(root, 'libs/utils/index.ts'),
        },
        plugins: [createWorkObserverPlugin({ root, expectedSources })],
      });
      const output = await runChild(path.join(temporary, 'bundle.mjs'), {
        NGDOC_BENCHMARK_OBSERVER_DIR: trace,
        NGDOC_BENCHMARK_RUN_ID: 'real-services',
      });
      assert.match(output, /REAL_OBSERVER_PASS/);
      const files = await readdir(trace);
      assert.equal(files.length, 1);
      const records = (await readFile(path.join(trace, files[0]), 'utf8'))
        .trim()
        .split('\n')
        .map(JSON.parse);
      assert.equal(
        records.filter(
          (event) => event.event === 'physical-observation' && event.identity.includes(input),
        ).length,
        1,
      );
      assert.equal(
        records.filter(
          (event) =>
            event.name === 'dependency.refresh' &&
            event.event === 'call' &&
            event.generation === undefined,
        ).length,
        2,
      );
      assert.equal(
        records.find((event) => event.name === 'cache.read' && event.event === 'return').result
          .status,
        'miss',
      );
      assert.ok(
        records.some(
          (event) =>
            event.name === 'cache.read' &&
            event.event === 'return' &&
            event.result.status === 'hit',
        ),
      );
      assert.deepEqual(
        records
          .filter((event) => event.name === 'committer.commit' && event.event === 'return')
          .map((event) => event.result.written),
        [1, 0],
      );
      assert.ok(
        records.some(
          (event) =>
            event.name === 'content.compile' &&
            event.event === 'return' &&
            event.result.errors.length === 1,
        ),
      );
      assert.ok(
        records.some(
          (event) =>
            event.name === 'content.compile' &&
            event.event === 'return' &&
            event.generation === 41 &&
            event.result.errors.length === 0,
        ),
      );
      assert.equal(records.at(-1).event, 'observer-end');
      assert.equal(records.at(-1).failed, false);
      assert.equal(records.at(-1).active, 0);
      const summary = await readObserverTraces(trace, {
        runId: 'real-services',
        expectedPids: [records[0].pid],
      });
      assert.equal(summary.counts['cache.read:return:hit'], 1);
      assert.ok(summary.counts['content.compile:call'] >= 2);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);

test('trace reader rejects missing, failed, truncated, foreign and unpaired cohorts', async () => {
  const temporary = await mkdtemp(path.join(here, '.test-reader-'));
  const envelope = { schema: 1, run: 'test', pid: 123 };
  const start = { ...envelope, event: 'observer-start' };
  const call = { ...envelope, event: 'call', id: 1, name: 'cache.read' };
  const result = {
    ...envelope,
    event: 'return',
    id: 1,
    name: 'cache.read',
    result: { status: 'hit' },
  };
  const end = { ...envelope, event: 'observer-end', calls: 1, active: 0, failed: false };
  const put = (events) =>
    writeFile(
      path.join(temporary, 'trace.jsonl'),
      events.map((event) => JSON.stringify(event)).join('\n'),
    );
  try {
    await assert.rejects(readObserverTraces(temporary, { runId: 'test' }), /required/);
    for (const events of [
      [start, call],
      [start, call, end],
      [start, result, end],
      [start, call, result, { ...end, failed: true }],
      [start, { ...end, run: 'other' }],
    ]) {
      await put(events);
      await assert.rejects(readObserverTraces(temporary, { runId: 'test' }));
    }
    await put([start, call, result, end]);
    await assert.rejects(
      readObserverTraces(temporary, { runId: 'test', expectedPids: [456] }),
      /Missing expected/,
    );
    assert.equal(
      (await readObserverTraces(temporary, { runId: 'test', expectedPids: [123] })).counts[
        'cache.read:return:hit'
      ],
      1,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('source guard rejects drift and missing intercepted entry modules', async () => {
  const expectedSources = await captureObserverSources(root);
  await assert.rejects(
    build({
      stdin: { contents: 'export const x=1' },
      write: false,
      logLevel: 'silent',
      plugins: [createWorkObserverPlugin({ root, expectedSources: {} })],
    }),
    /source guard mismatch/,
  );
  await assert.rejects(
    build({
      stdin: { contents: 'export const x=1' },
      write: false,
      logLevel: 'silent',
      plugins: [createWorkObserverPlugin({ root, expectedSources, requiredModules: ['compiler'] })],
    }),
    /not reached/,
  );
  assert.throws(
    () => createWorkObserverPlugin({ root, expectedSources, requiredModules: ['typo'] }),
    /Unknown/,
  );
});
