import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import test from 'node:test';
import * as runner from '../check-builder-modernization.mjs';
import {
  COMMANDS,
  commandFor,
  commandPlan,
  isMain,
  parseArgs,
  prepareConfig,
  repositoryPath,
  ROOT,
  runCommand,
  runPlan,
  sourceBoundaryCheck,
  THRESHOLDS,
} from '../check-builder-modernization.mjs';
import { partition } from '../vitest-shard.mjs';

const temporary = async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ngdoc runner spaces '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(read, accept) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    try {
      const value = await read();
      if (accept(value)) return value;
    } catch {}
    await delay(10);
  }
  throw new Error('Expected real-child state was not reached');
}
const absent = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error.code === 'ESRCH') return true;
    throw error;
  }
};
const posix = { skip: process.platform === 'win32', timeout: 15000 };

test('inventory covers actual independent production groups with fresh absolute coverage flags', () => {
  const entries = commandPlan({ lane: 'posix', platform: 'darwin' });
  for (const id of [
    'contracts',
    'session',
    'discovery',
    'artifact-cache-commit',
    'graph',
    'content',
    'semantic',
    'compiler',
    'outputs',
    'worker',
    'progress',
    'bootstrap',
    'angular',
    'vite-adapter',
  ])
    assert.ok(
      entries.some((entry) => entry.id === id),
      id,
    );
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.deepEqual(THRESHOLDS, { lines: 90, statements: 90, functions: 90, branches: 85 });
  for (const entry of entries.filter((entry) => entry.runner !== 'source')) {
    const directory = path.join(ROOT, 'tmp', 'fresh evidence', entry.id);
    const command = commandFor(entry, directory);
    if (entry.id === 'contracts') {
      assert.ok(!command.includes('--coverage'));
      continue;
    }
    assert.ok(command.includes('--coverage'), entry.id);
    assert.ok(
      command.some((arg) => arg.includes(path.join(directory, 'coverage'))),
      entry.id,
    );
    assert.equal(entry.runner, 'vitest', entry.id);
    for (const key of Object.keys(THRESHOLDS))
      assert.ok(command.includes(`--coverage.thresholds.${key}=${THRESHOLDS[key]}`));
  }
  assert.ok(
    COMMANDS.find((entry) => entry.id === 'compiler').additionalIncludes.includes(
      'generator/compiler/watch.integration.ts',
    ),
  );
  const angular = COMMANDS.find((entry) => entry.id === 'angular');
  assert.deepEqual(angular.additionalIncludes, [
    'generator/angular/testing/native-smoke.integration.ts',
  ]);
  assert.equal(angular.fileParallelism, false);
  assert.ok(!COMMANDS.some((entry) => 'mergeChildCoverage' in entry || 'coverage' in entry));
  assert.ok(
    commandFor(
      COMMANDS.find((entry) => entry.id === 'artifact-cache-commit'),
      '/tmp/fresh',
    ).includes(path.join('/tmp/fresh', 'vitest.config.mjs')),
  );
});

test('spec groups run only their tests and gate only the files they collect', async (t) => {
  const root = await temporary(t);
  for (const [id, tests, collect] of [
    [
      'contracts',
      ['generator/testing/contracts.spec.ts', 'generator/testing/content-module-ids.spec.ts'],
      undefined,
    ],
    [
      'artifact-cache-commit',
      ['generator/artifacts/testing/**/*.spec.ts'],
      ['generator/artifacts/index.ts'],
    ],
  ]) {
    const entry = COMMANDS.find((item) => item.id === id);
    const directory = path.join(root, id);
    await mkdir(directory);
    await prepareConfig(entry, directory, 'linux');
    const config = await readFile(path.join(directory, 'vitest.config.mjs'), 'utf8');
    assert.ok(
      config.includes(JSON.stringify(path.join(ROOT, 'libs/builder/vitest.config.ts'))),
      id,
    );
    assert.ok(config.includes(`include:${JSON.stringify(tests)}`), id);
    assert.equal(config.includes('coverage:{'), Boolean(collect), id);
    if (collect) assert.ok(config.includes(`include:${JSON.stringify(collect)}}`), id);
  }
});

test('unknown groups, lanes, CLI arguments and empty values fail rather than pass an empty plan', () => {
  assert.throws(() => commandPlan({ groups: ['typo'] }), /Unknown group/);
  assert.throws(() => commandPlan({ lane: 'missing' }), /Unknown lane/);
  assert.throws(() => commandPlan({ lane: 'posix', platform: 'win32' }), /Windows/);
  assert.throws(() => commandPlan({ groups: ['bootstrap'] }), /POSIX/);
  for (const args of [
    [],
    ['--group'],
    ['--nope'],
    ['--list', '--group', 'graph'],
    ['--source-check', '--nope'],
    ['--group', 'typo', '--log-dir', 'x'],
    ['--log-dir', 'x', '--timeout-ms', 'NaN'],
  ])
    assert.throws(() => parseArgs(args));
  assert.deepEqual(
    commandPlan({ groups: ['graph'] }).map((entry) => entry.id),
    ['graph'],
  );
  assert.equal(
    parseArgs(['--log-dir', 'x', '--lane', 'posix'], { platform: 'linux' }).lane,
    'posix',
  );
  assert.throws(
    () => parseArgs(['--log-dir', 'x', '--lane', 'posix'], { platform: 'win32' }),
    /Windows is unsupported/,
  );
});

test('boundary violations name files with forward slashes on every OS', () => {
  assert.equal(
    repositoryPath(
      'D:\\a\\ng-doc',
      'D:\\a\\ng-doc\\libs\\builder\\generator\\kernel\\bad.ts',
      path.win32,
    ),
    'libs/builder/generator/kernel/bad.ts',
  );
  assert.equal(
    repositoryPath(
      '/work/ng-doc',
      '/work/ng-doc/libs/builder/generator/progress/bad.ts',
      path.posix,
    ),
    'libs/builder/generator/progress/bad.ts',
  );
});

test('private import audit parses imports rather than matching comments/spec strings or adapters', async (t) => {
  const root = await temporary(t);
  const base = path.join(root, 'libs/builder/generator');
  for (const name of [
    'artifacts',
    'compiler',
    'content',
    'discovery',
    'graph',
    'kernel',
    'outputs',
    'progress',
    'semantic',
    'session',
    'worker',
    'angular',
    'vite',
    'bootstrap',
  ])
    await mkdir(path.join(base, name), { recursive: true });
  for (const name of ['contracts.ts', 'content-module-ids.ts'])
    await writeFile(path.join(base, name), 'export {};');
  await mkdir(path.join(base, 'compiler/testing'));
  const forbidden = "import '@angular/build/private';";
  await writeFile(path.join(base, 'angular/index.ts'), forbidden);
  await writeFile(path.join(base, 'compiler/a.spec.ts'), forbidden);
  await writeFile(path.join(base, 'compiler/testing/a.ts'), forbidden);
  await writeFile(
    path.join(base, 'compiler/ok.ts'),
    "// import '@angular/build/private';\nconst example = '@angular-devkit/build-angular/src/anything';\nimport type {A} from '@angular/core';",
  );
  assert.equal((await sourceBoundaryCheck(root)).filesChecked, 3);
  for (const code of [
    "import {x} from '@angular-devkit/architect';",
    "import '@angular/build';",
    "import '@angular/cli';",
    "import {x} from '@angular-devkit/build-angular/src/private';",
    "export * from '@angular/build/private';",
    "const x = require('@angular/compiler-cli/src/hidden');",
    "const x = import('@angular/cli/src/hidden');",
  ]) {
    await writeFile(path.join(base, 'compiler/bad.ts'), code);
    await assert.rejects(sourceBoundaryCheck(root), /Private Angular CLI imports.*\n.*bad.ts:1/s);
  }
});

test('the progress module imports only ./*, node:* and types from ../contracts', async (t) => {
  const root = await temporary(t);
  const base = path.join(root, 'libs/builder/generator');
  for (const name of [
    'artifacts',
    'compiler',
    'content',
    'discovery',
    'graph',
    'kernel',
    'outputs',
    'progress',
    'semantic',
    'session',
    'worker',
  ])
    await mkdir(path.join(base, name), { recursive: true });
  for (const name of ['contracts.ts', 'content-module-ids.ts'])
    await writeFile(path.join(base, name), 'export {};');
  await mkdir(path.join(base, 'progress/testing'));
  await writeFile(
    path.join(base, 'progress/testing/harness.ts'),
    "import { build } from 'esbuild';",
  );
  await writeFile(
    path.join(base, 'progress/ok.ts'),
    "import type { Diagnostic } from '../contracts';\nexport type { Generation } from '../contracts';\nimport type * as C from '../contracts';\nexport type * from '../contracts';\ntype T = import('../contracts').Diagnostic;\nimport { a } from './a';\nimport { b } from './sub/../b';\nimport { appendFileSync } from 'node:fs';\nexport * from './b';\nconst later = await import('./c');",
  );
  await writeFile(path.join(base, 'compiler/free.ts'), "import { x } from '../session';");
  assert.equal((await sourceBoundaryCheck(root)).filesChecked, 4);
  for (const code of [
    "import { Diagnostic } from '../contracts';",
    "import { type Diagnostic } from '../contracts';",
    "import '../contracts';",
    "import { x } from '../session';",
    "import { x } from './../session';",
    "import { x } from './../../../../../evil';",
    "type T = import('../session').Session;",
    "import { x } from 'typescript';",
    "export * from '../contracts';",
    "const x = require('fs');",
    "const x = require('node:fs');",
    'const x = require(`../session`);',
    "import x = require('node:fs');",
    'const x = await import(name);',
    "const x = await import('../contracts');",
    "import { createRequire } from 'node:module';",
    "const { createRequire: r } = await import('node:fs');",
    "module.require('../session');",
  ]) {
    await writeFile(path.join(base, 'progress/bad.ts'), code);
    await assert.rejects(
      sourceBoundaryCheck(root),
      /progress module may import only.*\n.*progress\/bad.ts:1/s,
      code,
    );
  }
  await rm(path.join(base, 'progress/bad.ts'));
  await writeFile(path.join(base, 'progress/bad.mts'), "import { x } from '../session';");
  await assert.rejects(sourceBoundaryCheck(root), /progress\/bad.mts:1/);
  assert.deepEqual(COMMANDS.find((entry) => entry.id === 'progress').posixEnv, {
    NGDOC_REQUIRE_PTY: '1',
  });
});

test('the kernel is a leaf: it imports only ./*, node:* and ../contracts', async (t) => {
  const root = await temporary(t);
  const base = path.join(root, 'libs/builder/generator');
  for (const name of [
    'artifacts',
    'compiler',
    'content',
    'discovery',
    'graph',
    'kernel',
    'outputs',
    'progress',
    'semantic',
    'session',
    'worker',
  ])
    await mkdir(path.join(base, name), { recursive: true });
  for (const name of ['contracts.ts', 'content-module-ids.ts'])
    await writeFile(path.join(base, name), 'export {};');
  await mkdir(path.join(base, 'kernel/testing'));
  await writeFile(
    path.join(base, 'kernel/testing/harness.ts'),
    "import { x } from '../../session';",
  );
  await writeFile(
    path.join(base, 'kernel/ok.ts'),
    "import { createHash } from 'node:crypto';\nimport { nonPhysicalIdentity } from '../contracts';\nimport type { Dependency } from '../contracts';\nimport { a } from './a';\nexport * from './sub/../b';",
  );
  await writeFile(
    path.join(base, 'semantic/uses.ts'),
    "import { digestOf } from '../kernel/canonical';",
  );
  assert.equal((await sourceBoundaryCheck(root)).filesChecked, 4);
  for (const code of [
    "import { x } from '../graph';",
    "import type { x } from '../semantic/recorder';",
    "import { x } from './../compiler';",
    "import { x } from 'typescript';",
    "import { minimatch } from 'minimatch';",
    "const x = require('node:fs');",
    "import x = require('node:fs');",
    'const x = await import(name);',
    "export * from '../session';",
  ]) {
    await writeFile(path.join(base, 'kernel/bad.ts'), code);
    await assert.rejects(
      sourceBoundaryCheck(root),
      /kernel is a leaf.*\n.*kernel\/bad.ts:1/s,
      code,
    );
  }
});

test('posixEnv reaches the generated Vitest config on POSIX only', async (t) => {
  const root = await temporary(t);
  const progress = COMMANDS.find((entry) => entry.id === 'progress');
  for (const [platform, expected] of [
    ['darwin', true],
    ['linux', true],
    ['win32', false],
  ]) {
    const directory = path.join(root, platform);
    await mkdir(directory);
    await prepareConfig(progress, directory, platform);
    assert.equal(
      (await readFile(path.join(directory, 'vitest.config.mjs'), 'utf8')).includes(
        '"NGDOC_REQUIRE_PTY":"1"',
      ),
      expected,
      platform,
    );
  }
  const graph = path.join(root, 'graph');
  await mkdir(graph);
  await prepareConfig(
    COMMANDS.find((entry) => entry.id === 'graph'),
    graph,
    'linux',
  );
  assert.ok(
    !(await readFile(path.join(graph, 'vitest.config.mjs'), 'utf8')).includes('NGDOC_REQUIRE_PTY'),
  );
});

test('real nonzero child output is fully flushed before result including final large chunk', async (t) => {
  const root = await temporary(t);
  const logFile = path.join(root, 'output.log');
  const result = await runCommand(
    [
      process.execPath,
      '-e',
      "process.stdout.write('BEGIN\\n');process.stderr.write('ERR\\n');process.stdout.write('x'.repeat(200000)+'END\\n',()=>{process.exitCode=23});",
    ],
    { logFile },
  );
  assert.equal(result.code, 23);
  assert.equal(result.exitCode, 23);
  assert.equal(result.joinedChild, true);
  const log = await readFile(logFile, 'utf8');
  assert.ok(log.replace('ERR\n', '').includes('x'.repeat(200000) + 'END\n'));
  assert.ok(log.indexOf('END\n') < log.lastIndexOf('"exitCode":23'));
  assert.match(log, /ERR/);
});

test('spawn errors are observed and persisted as failed results', async (t) => {
  const root = await temporary(t);
  const logFile = path.join(root, 'missing.log');
  const result = await runCommand([path.join(root, 'not-an-executable')], { logFile });
  assert.equal(result.code, 1);
  assert.match(result.spawnError, /ENOENT/);
  assert.equal(result.joinedChild, true);
  assert.match(await readFile(logFile, 'utf8'), /ENOENT/);
});

test('timeout escalates TERM-resistant owned child and joins its group', posix, async (t) => {
  const root = await temporary(t);
  const result = await runCommand(
    [
      process.execPath,
      '-e',
      "process.on('SIGTERM',()=>{});process.stdout.write('started\\n');setInterval(()=>{},1000)",
    ],
    { logFile: path.join(root, 'timeout.log'), timeoutMs: 250, graceMs: 50, killMs: 2000 },
  );
  assert.equal(result.code, 124);
  assert.equal(result.stopReason, 'timeout');
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.joinedChild, true);
  assert.deepEqual(result.stillOwned, []);
});

test('output limit bounds queued logs and terminates the producing child', posix, async (t) => {
  const root = await temporary(t);
  const result = await runCommand(
    [
      process.execPath,
      '-e',
      "process.on('SIGTERM',()=>{});process.stdout.write('x'.repeat(4096));setInterval(()=>process.stdout.write('more'),10)",
    ],
    {
      logFile: path.join(root, 'overflow.log'),
      maxOutputBytes: 1024,
      timeoutMs: 5000,
      graceMs: 50,
      killMs: 2000,
    },
  );
  assert.equal(result.code, 1);
  assert.equal(result.stopReason, 'output-limit');
  assert.equal(result.overflow, true);
  assert.equal(result.joinedChild, true);
  assert.deepEqual(result.stillOwned, []);
  assert.ok((await readFile(result.logFile)).length < 2048);
});

test('leader exit does not hide an inherited live descendant from cleanup', posix, async (t) => {
  const root = await temporary(t);
  const pidFile = path.join(root, 'descendant.pid');
  const script = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid));c.unref();`;
  const result = await runCommand([process.execPath, '-e', script], {
    logFile: path.join(root, 'descendant.log'),
    timeoutMs: 5000,
    graceMs: 100,
    killMs: 2000,
  });
  const pid = Number(await readFile(pidFile, 'utf8'));
  assert.equal(result.exitCode, 0);
  assert.equal(result.code, 1);
  assert.equal(result.forcedCleanup, true);
  assert.deepEqual(result.stillOwned, []);
  assert.ok(absent(pid));
});

test(
  'abort closes a real held child and keeps interruption distinct from child exit',
  posix,
  async (t) => {
    const root = await temporary(t),
      ready = path.join(root, 'ready');
    const controller = new AbortController();
    const result = runCommand(
      [
        process.execPath,
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(ready)},'yes');setInterval(()=>{},1000)`,
      ],
      {
        logFile: path.join(root, 'abort.log'),
        signal: controller.signal,
        graceMs: 100,
        killMs: 2000,
      },
    );
    await waitFor(() => readFile(ready, 'utf8'), Boolean);
    controller.abort();
    const value = await result;
    assert.equal(value.code, 130);
    assert.equal(value.stopReason, 'interrupted');
    assert.equal(value.joinedChild, true);
    assert.deepEqual(value.stillOwned, []);
  },
);

test('log write failure cannot leave the test command alive', posix, async (t) => {
  const root = await temporary(t),
    logFile = path.join(root, 'failure.log'),
    ready = path.join(root, 'ready');
  const job = runCommand(
    [
      process.execPath,
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>process.stdout.write('tick\\n'),20)`,
    ],
    { logFile, graceMs: 100, killMs: 2000 },
  );
  void job.catch(() => {});
  const pid = Number(await waitFor(() => readFile(ready, 'utf8'), Boolean));
  await rm(logFile);
  await mkdir(logFile);
  await assert.rejects(job, /EISDIR/);
  assert.ok(absent(pid));
});

test('CLI entry detection supports spaces, relative paths and strict unknown arguments', async (t) => {
  const root = await temporary(t);
  const script = path.join(root, 'runner with spaces.mjs');
  await copyFile(path.join(ROOT, 'tools/scripts/check-builder-modernization.mjs'), script);
  assert.equal(
    await isMain(pathToFileURL(script).href, path.relative(process.cwd(), script)),
    true,
  );
  assert.equal(await isMain(pathToFileURL(script).href, path.join(root, 'missing')), false);
  const listed = await runCommand([process.execPath, script, '--list'], {
    logFile: path.join(root, 'list.log'),
  });
  assert.equal(listed.code, 0);
  assert.match(await readFile(listed.logFile, 'utf8'), /artifact-cache-commit/);
  const bad = await runCommand(
    [process.execPath, script, '--group', 'typo', '--log-dir', path.join(root, 'unused')],
    { logFile: path.join(root, 'bad.log') },
  );
  assert.equal(bad.code, 1);
  assert.match(await readFile(bad.logFile, 'utf8'), /Unknown group/);
});

test('CLI SIGTERM flushes interrupted group result and exits nonzero', posix, async (t) => {
  const root = await temporary(t);
  const scripts = path.join(root, 'tools/scripts');
  await mkdir(scripts, { recursive: true });
  const cli = path.join(scripts, 'check-builder-modernization.mjs');
  await copyFile(path.join(ROOT, 'tools/scripts/check-builder-modernization.mjs'), cli);
  const fakeVitest = path.join(root, 'node_modules/vitest');
  await mkdir(fakeVitest, { recursive: true });
  const ready = path.join(root, 'ready');
  await writeFile(
    path.join(fakeVitest, 'vitest.mjs'),
    `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000);`,
  );
  const evidence = path.join(root, 'fresh logs');
  const child = spawn(process.execPath, [cli, '--group', 'graph', '--log-dir', evidence], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const pid = Number(await waitFor(() => readFile(ready, 'utf8'), Boolean));
  child.kill('SIGTERM');
  const result = await exit;
  assert.equal(result.code, 130);
  assert.equal(result.signal, null);
  assert.ok(absent(pid));
  const data = JSON.parse(await readFile(path.join(evidence, 'results.json'), 'utf8'));
  assert.equal(data.results[0].code, 130);
  assert.equal(data.results[0].joinedChild, true);
  const command = await readFile(path.join(evidence, 'graph/run.log'), 'utf8');
  assert.match(command, /--coverage/);
});

test('plan refuses reused evidence directories before running commands', async (t) => {
  const root = await temporary(t);
  await assert.rejects(runPlan({ groups: ['graph'], logDir: root }), /EEXIST/);
});

test(
  'real existing TypeScript graph config loads through the runner and emits fresh gated coverage',
  { timeout: 120000 },
  async (t) => {
    const root = await temporary(t);
    const logDir = path.join(root, 'real graph fresh evidence');
    const results = await runPlan({ groups: ['graph'], logDir, timeoutMs: 90000 });
    const log = await readFile(path.join(logDir, 'graph/run.log'), 'utf8');
    assert.equal(results.length, 1);
    assert.equal(results[0].code, 0, log);
    assert.equal(results[0].exitCode, 0);
    assert.equal(results[0].forcedCleanup, false);
    assert.equal(results[0].joinedChild, true);
    assert.deepEqual(results[0].stillOwned, []);
    const summary = JSON.parse(
      await readFile(path.join(logDir, 'graph/coverage/coverage-summary.json'), 'utf8'),
    );
    for (const [metric, minimum] of Object.entries(THRESHOLDS)) {
      assert.ok(summary.total[metric].total > 0, metric);
      assert.ok(summary.total[metric].pct >= minimum, metric);
    }
    assert.match(log, /Tests.*passed/);
  },
);

// --- Per-group timeouts and EPERM-safe group cleanup ---------------------------------------------
// New exports are read through the namespace so this file still loads against an older runner
// (fail-before evidence) and each test fails on its own assertion rather than on import.
const realKill = process.kill.bind(process);
const reap = (pid) => {
  if (pid)
    try {
      realKill(pid, 'SIGKILL');
    } catch {}
};
// Timeouts below are 1.5-2 s so a slow Node start cannot let the timeout fire before the child is
// ready; readiness failures name themselves instead of a generic wait error.
const readPid = async (file) => {
  try {
    return Number(await waitFor(() => readFile(file, 'utf8'), Boolean));
  } catch {
    throw new Error(`child never became ready: no pid written to ${file}`);
  }
};
const assertReadyBefore = (readyAt, started, timeoutMs) =>
  assert.ok(
    readyAt - started < timeoutMs,
    `child became ready ${readyAt - started} ms after start, after the ${timeoutMs} ms timeout (slow start)`,
  );
const eperm = (target) =>
  Object.assign(new Error(`kill EPERM (stub for ${target})`), {
    code: 'EPERM',
    errno: -1,
    syscall: 'kill',
  });
// Simulates a group that stays zombie-only forever: signals still reach live members, but where the
// kernel would answer ESRCH (group gone) the stub answers EPERM, as macOS does for unreaped members.
const zombieForever = (target, signal = 'SIGTERM') => {
  try {
    return realKill(target, signal);
  } catch (error) {
    if (target < 0) throw eperm(target);
    throw error;
  }
};
const termResistant = (pidFile) =>
  `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`;

test('per-group default timeouts: compiler 1,200,000 ms, others unchanged, --timeout-ms overrides', () => {
  assert.equal(runner.DEFAULT_TIMEOUT_MS, 600_000);
  assert.equal(typeof runner.groupTimeoutMs, 'function');
  const compiler = COMMANDS.find((entry) => entry.id === 'compiler');
  assert.equal(runner.groupTimeoutMs(compiler), 2_100_000);
  for (const entry of COMMANDS.filter((entry) => entry.id !== 'compiler'))
    assert.equal(runner.groupTimeoutMs(entry), 600_000, entry.id);
  assert.equal(runner.groupTimeoutMs(compiler, 900_000), 900_000);
  assert.equal(
    runner.groupTimeoutMs(
      COMMANDS.find((entry) => entry.id === 'graph'),
      1_000,
    ),
    1_000,
  );
  assert.equal(parseArgs(['--log-dir', 'x', '--timeout-ms', '900000']).timeoutMs, 900_000);
  assert.equal(parseArgs(['--log-dir', 'x']).timeoutMs, undefined);
});

test('--list prints each group with its effective default timeout', async (t) => {
  const root = await temporary(t);
  const script = path.join(root, 'runner.mjs');
  await copyFile(path.join(ROOT, 'tools/scripts/check-builder-modernization.mjs'), script);
  const listed = await runCommand([process.execPath, script, '--list'], {
    logFile: path.join(root, 'list.log'),
  });
  assert.equal(listed.code, 0);
  const log = await readFile(listed.logFile, 'utf8');
  assert.match(log, /^compiler\tcore\tvitest\t2100000ms\theavy\t4 shards$/m);
  assert.match(log, /^worker\tcore\tvitest\t600000ms\theavy$/m);
  assert.match(log, /^graph\tcore\tvitest\t600000ms\theavy$/m);
  assert.match(log, /^angular\tposix\tvitest\t600000ms\theavy$/m);
});

test(
  'timeout kills a group whose leader already exited while a descendant ignores SIGTERM',
  posix,
  async (t) => {
    const root = await temporary(t);
    const pidFile = path.join(root, 'descendant.pid');
    let pid;
    t.after(() => reap(pid));
    // The leader exits cleanly; the TERM-resistant descendant keeps the group and the log pipes.
    const leader = `const fs=require('node:fs');require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(termResistant(pidFile))}],{stdio:['ignore','inherit','inherit']}).unref();const wait=()=>fs.existsSync(${JSON.stringify(pidFile)})?process.exit(0):setTimeout(wait,5);wait();`;
    const started = Date.now();
    const result = await runCommand([process.execPath, '-e', leader], {
      logFile: path.join(root, 'group.log'),
      timeoutMs: 1500,
      graceMs: 100,
      killMs: 3000,
    });
    pid = await readPid(pidFile);
    assert.equal(result.exitCode, 0, 'the leader exited on its own after the descendant was ready');
    assert.equal(result.code, 124);
    assert.equal(result.stopReason, 'timeout');
    assert.match(result.message ?? '', /timed out after 1500 ms/);
    assert.equal(result.forcedCleanup, true);
    assert.equal(result.escalated, true);
    assert.equal(result.joinedChild, true);
    assert.deepEqual(result.stillOwned, []);
    assert.equal(result.cleanupError, undefined);
    assert.ok(absent(pid), 'TERM-resistant descendant must be killed with the group');
    assert.ok(Date.now() - started < 6000);
    assert.match(await readFile(result.logFile, 'utf8'), /timed out after 1500 ms/);
  },
);

test(
  'EPERM from group signals (macOS zombie-only group) counts as present: runner escalates and joins without throwing',
  posix,
  async (t) => {
    const root = await temporary(t);
    const pidFile = path.join(root, 'child.pid');
    let pid;
    t.after(() => reap(pid));
    const calls = [];
    let refusals = 3;
    t.mock.method(process, 'kill', (target, signal = 'SIGTERM') => {
      calls.push([target, signal]);
      if (target < 0 && refusals > 0) {
        refusals--;
        throw eperm(target);
      }
      return realKill(target, signal);
    });
    const started = Date.now();
    const job = runCommand([process.execPath, '-e', termResistant(pidFile)], {
      logFile: path.join(root, 'eperm.log'),
      timeoutMs: 1500,
      graceMs: 100,
      killMs: 3000,
    });
    void job.catch(() => {});
    pid = await readPid(pidFile);
    assertReadyBefore(Date.now(), started, 1500);
    const result = await job;
    assert.equal(refusals, 0, 'every stubbed EPERM was consumed');
    assert.equal(result.code, 124);
    assert.equal(result.stopReason, 'timeout');
    assert.match(result.message ?? '', /timed out after 1500 ms/);
    assert.equal(result.escalated, true);
    assert.ok(calls.some(([target, signal]) => target === -pid && signal === 'SIGKILL'));
    assert.equal(result.joinedChild, true);
    assert.deepEqual(result.stillOwned, []);
    assert.equal(result.cleanupError, undefined);
    assert.equal(result.signalErrors?.EPERM, 3);
    assert.ok(absent(pid));
  },
);

test(
  'persistent EPERM is bounded: timeout and cleanup failure are reported, never thrown or hung',
  posix,
  async (t) => {
    const root = await temporary(t);
    const pidFile = path.join(root, 'child.pid');
    let pid;
    t.after(() => reap(pid));
    // Probes of the group never resolve (EPERM forever); real TERM/KILL still reach the child.
    t.mock.method(process, 'kill', zombieForever);
    const started = Date.now();
    const job = runCommand([process.execPath, '-e', termResistant(pidFile)], {
      logFile: path.join(root, 'eperm-forever.log'),
      timeoutMs: 1500,
      graceMs: 100,
      killMs: 500,
    });
    void job.catch(() => {});
    pid = await readPid(pidFile);
    assertReadyBefore(Date.now(), started, 1500);
    const result = await job;
    assert.ok(Date.now() - started < 5000);
    assert.equal(result.code, 124);
    assert.equal(result.stopReason, 'timeout');
    assert.match(result.message ?? '', /timed out after 1500 ms/);
    assert.match(result.cleanupError ?? '', /did not join/);
    assert.deepEqual(result.stillOwned, [pid]);
    assert.ok(absent(pid), 'SIGKILL still reached the real child');
  },
);

test(
  'CLI reports a timed-out group clearly, exits nonzero and leaves no descendants',
  posix,
  async (t) => {
    const root = await temporary(t);
    const scripts = path.join(root, 'tools/scripts');
    await mkdir(scripts, { recursive: true });
    const cli = path.join(scripts, 'check-builder-modernization.mjs');
    await copyFile(path.join(ROOT, 'tools/scripts/check-builder-modernization.mjs'), cli);
    const fakeVitest = path.join(root, 'node_modules/vitest');
    await mkdir(fakeVitest, { recursive: true });
    const pidFile = path.join(root, 'descendant.pid');
    let pid;
    t.after(() => reap(pid));
    await writeFile(
      path.join(fakeVitest, 'vitest.mjs'),
      `import {spawn} from 'node:child_process';process.on('SIGTERM',()=>{});spawn(process.execPath,['-e',${JSON.stringify(termResistant(pidFile))}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000);`,
    );
    const evidence = path.join(root, 'fresh logs');
    const child = spawn(
      process.execPath,
      [cli, '--group', 'graph', '--log-dir', evidence, '--timeout-ms', '2000'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const exit = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    const started = Date.now();
    pid = await readPid(pidFile);
    assertReadyBefore(Date.now(), started, 2000);
    assert.deepEqual(await exit, { code: 1, signal: null });
    assert.match(stderr, /graph: timed out after 2000 ms/);
    assert.doesNotMatch(stderr, /EPERM|Error:/);
    const data = JSON.parse(await readFile(path.join(evidence, 'results.json'), 'utf8'));
    assert.equal(data.results[0].code, 124);
    assert.equal(data.results[0].stopReason, 'timeout');
    assert.equal(data.results[0].timeoutMs, 2000);
    assert.deepEqual(data.results[0].stillOwned, []);
    assert.ok(absent(pid));
  },
);

test('logTail keeps the last lines of a log and says how many earlier ones the file keeps', async (t) => {
  const root = await temporary(t);
  const file = path.join(root, 'run.log');
  await writeFile(
    file,
    `${Array.from({ length: 5 }, (_, index) => `line ${index + 1}`).join('\n')}\n`,
  );
  assert.equal(
    await runner.logTail(file, 2),
    '(3 earlier lines are in the log file)\nline 4\nline 5',
  );
  assert.equal(await runner.logTail(file, 5), 'line 1\nline 2\nline 3\nline 4\nline 5');
  assert.equal(runner.FAILURE_LOG_TAIL_LINES, 200);
  assert.match(
    await runner.logTail(path.join(root, 'missing.log')),
    /^\(the log could not be read: .*ENOENT/,
  );
});

test("CLI prints the tail of a failed group's log after its failure line", async (t) => {
  const root = await temporary(t);
  const scripts = path.join(root, 'tools/scripts');
  await mkdir(scripts, { recursive: true });
  const cli = path.join(scripts, 'check-builder-modernization.mjs');
  await copyFile(path.join(ROOT, 'tools/scripts/check-builder-modernization.mjs'), cli);
  const fakeVitest = path.join(root, 'node_modules/vitest');
  await mkdir(fakeVitest, { recursive: true });
  // More lines than the tail: the runner's argv line and the first of these stay in the file.
  await writeFile(
    path.join(fakeVitest, 'vitest.mjs'),
    `for (let line = 1; line <= 250; line++) console.log('vitest line ' + line); console.log('AssertionError: the cause'); process.exitCode = 1;`,
  );
  const evidence = path.join(root, 'fresh logs');
  const child = spawn(process.execPath, [cli, '--group', 'graph', '--log-dir', evidence], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stdout.resume();
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(exit, { code: 1, signal: null });
  const log = path.join(evidence, 'graph', 'run.log');
  const lines = (await readFile(log, 'utf8')).trimEnd().split('\n');
  const failure = stderr.indexOf('graph: exited with code 1');
  const header = stderr.indexOf(`--- graph: last 200 lines of ${log} ---`);
  assert.ok(failure >= 0 && header > failure, stderr);
  // The tail is the log's last 200 lines (the failure and the runner's result line among them),
  // after a note of how many earlier lines the file keeps.
  assert.ok(lines.length > 200);
  assert.ok(
    stderr.includes(
      `---\n(${lines.length - 200} earlier lines are in the log file)\n${lines.slice(-200).join('\n')}\n--- end of graph ---\n`,
    ),
    stderr,
  );
  assert.match(stderr, /vitest line 250\nAssertionError: the cause\n/);
});

test(
  'after a natural exit a briefly zombie-only group (EPERM) settles instead of failing the run',
  posix,
  async (t) => {
    const root = await temporary(t);
    let refusals = 3;
    t.mock.method(process, 'kill', (target, signal = 'SIGTERM') => {
      if (target < 0 && signal === 0 && refusals > 0) {
        refusals--;
        throw eperm(target);
      }
      return realKill(target, signal);
    });
    const result = await runCommand([process.execPath, '-e', 'process.exitCode=0'], {
      logFile: path.join(root, 'settle.log'),
      timeoutMs: 10000,
      graceMs: 100,
      killMs: 1000,
    });
    assert.equal(refusals, 0);
    assert.equal(result.code, 0);
    assert.equal(result.forcedCleanup, false);
    assert.equal(result.message, undefined);
    assert.equal(result.signalErrors?.EPERM, 3);
    assert.deepEqual(result.stillOwned, []);
  },
);

test(
  'a group that never settles after a natural exit fails with a clear message, not a bare code 1',
  posix,
  async (t) => {
    const root = await temporary(t);
    t.mock.method(process, 'kill', zombieForever);
    const started = Date.now();
    const result = await runCommand([process.execPath, '-e', 'process.exitCode=0'], {
      logFile: path.join(root, 'unsettled.log'),
      timeoutMs: 10000,
      graceMs: 100,
      killMs: 300,
      settleMs: 100,
    });
    assert.ok(Date.now() - started < 3000);
    assert.equal(result.code, 1);
    assert.equal(result.exitCode, 0);
    assert.equal(result.forcedCleanup, true);
    assert.match(
      result.message ?? '',
      /exited with code 0, but its process group was still running after 100 ms and had to be killed/,
    );
    assert.match(result.message ?? '', /did not join before deadline/);
  },
);

test(
  'once the owned group answers ESRCH it is never probed or signalled again',
  posix,
  async (t) => {
    const root = await temporary(t);
    const leaderFile = path.join(root, 'leader.pid');
    const escapedFile = path.join(root, 'escaped.pid');
    let leader, escaped;
    t.after(() => {
      reap(leader);
      reap(escaped);
    });
    // The escaped grandchild leaves the group (detached = setsid) but keeps our output pipes, so the
    // runner keeps waiting for 'close' after the group itself is gone.
    const script = `const fs=require('node:fs');process.on('SIGTERM',()=>{});const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:['ignore','inherit','inherit']});fs.writeFileSync(${JSON.stringify(escapedFile)},String(c.pid));fs.writeFileSync(${JSON.stringify(leaderFile)},String(process.pid));setInterval(()=>{},1000);`;
    const calls = [];
    t.mock.method(process, 'kill', (target, signal = 'SIGTERM') => {
      try {
        const value = realKill(target, signal);
        calls.push({ target, signal, outcome: 'ok' });
        return value;
      } catch (error) {
        calls.push({ target, signal, outcome: error.code });
        throw error;
      }
    });
    const started = Date.now();
    const job = runCommand([process.execPath, '-e', script], {
      logFile: path.join(root, 'escaped.log'),
      timeoutMs: 1500,
      graceMs: 100,
      killMs: 1000,
    });
    void job.catch(() => {});
    leader = await readPid(leaderFile);
    assertReadyBefore(Date.now(), started, 1500);
    escaped = await readPid(escapedFile);
    const result = await job;
    assert.equal(result.code, 124);
    assert.equal(result.joinedChild, false, 'the escaped grandchild still holds the pipes');
    assert.match(result.message ?? '', /timed out after 1500 ms; Owned child\/group did not join/);
    const group = calls.filter((call) => call.target === -leader);
    const firstGone = group.findIndex((call) => call.outcome === 'ESRCH');
    assert.ok(firstGone >= 0, 'the group was observed gone');
    assert.deepEqual(group.slice(firstGone + 1), [], 'no probe or signal after the first ESRCH');
    assert.ok(group.some((call) => call.signal === 'SIGKILL'));
    assert.deepEqual(result.stillOwned, []);
    assert.ok(absent(leader));
  },
);

// --- Light groups in parallel, shards, runs without coverage and the merged gate -----------------

test('groups are light or heavy: heavy groups are the real-process, program and timing suites', () => {
  const heavy = COMMANDS.filter((entry) => entry.heavy).map((entry) => entry.id);
  for (const id of [
    'semantic',
    'compiler',
    'worker',
    'progress',
    'bootstrap',
    'angular',
    'vite-adapter',
  ])
    assert.ok(heavy.includes(id), id);
  assert.deepEqual(
    commandPlan({ lane: 'posix', platform: 'darwin', weight: 'light' }).map((entry) => entry.id),
    COMMANDS.filter((entry) => !entry.heavy).map((entry) => entry.id),
  );
  assert.deepEqual(
    commandPlan({ weight: 'heavy' }).map((entry) => entry.id),
    ['session', 'discovery', 'graph', 'semantic', 'compiler', 'worker', 'progress'],
  );
  assert.throws(() => commandPlan({ weight: 'medium' }), /Unknown weight/);
  assert.equal(runner.weightOf(COMMANDS.find((entry) => entry.id === 'graph')), 'heavy');
  assert.equal(runner.defaultJobs(1), 1);
  assert.equal(runner.defaultJobs(4), 2);
  assert.equal(runner.defaultJobs(10), 4);
  assert.equal(runner.defaultJobs(64), 4);
});

test('CLI: --shard, --no-coverage, --jobs, --weight and --merge-coverage are validated', () => {
  const base = ['--log-dir', 'x'];
  assert.deepEqual(parseArgs([...base, '--group', 'compiler', '--shard', '2/4']).shard, {
    index: 2,
    count: 4,
  });
  assert.equal(parseArgs([...base, '--no-coverage']).coverage, false);
  assert.equal(parseArgs(base).coverage, undefined);
  assert.equal(parseArgs([...base, '--jobs', '3']).jobs, 3);
  assert.equal(parseArgs([...base, '--weight', 'light']).weight, 'light');
  assert.equal(
    parseArgs([...base, '--group', 'compiler', '--merge-coverage', 'blobs']).mergeFrom,
    'blobs',
  );
  for (const args of [
    [...base, '--group', 'compiler', '--shard', '0/4'],
    [...base, '--group', 'compiler', '--shard', '5/4'],
    [...base, '--group', 'compiler', '--shard', '1'],
    [...base, '--group', 'compiler', '--shard', 'a/b'],
    [...base, '--shard', '1/2'],
    [...base, '--group', 'graph', '--group', 'content', '--shard', '1/2'],
    [...base, '--group', 'source-boundaries', '--shard', '1/2'],
    [...base, '--merge-coverage', 'blobs'],
    [...base, '--group', 'compiler', '--merge-coverage', 'blobs', '--no-coverage'],
    [...base, '--group', 'compiler', '--merge-coverage', 'blobs', '--shard', '1/4'],
    [...base, '--jobs', '0'],
    [...base, '--jobs', '1.5'],
    [...base, '--weight', 'medium'],
  ])
    assert.throws(() => parseArgs(args), undefined, args.join(' '));
});

test('a coverage shard writes a blob without gating; a run without coverage measures nothing', async (t) => {
  const root = await temporary(t);
  const compiler = COMMANDS.find((entry) => entry.id === 'compiler');
  const directory = path.join(root, 'compiler');
  const shard = { index: 2, count: 4 };
  const sharded = commandFor(compiler, directory, { shard });
  assert.ok(sharded.includes('--shard=2/4'));
  assert.ok(sharded.includes('--coverage'));
  assert.ok(sharded.includes('--reporter=blob'));
  assert.ok(sharded.includes('--reporter=default'));
  assert.ok(sharded.includes(`--outputFile.blob=${path.join(directory, 'blob', 'blob-2-4.json')}`));
  assert.ok(!sharded.some((arg) => arg.startsWith('--coverage.thresholds')));
  const plain = commandFor(compiler, directory, { shard, coverage: false });
  assert.ok(plain.includes('--shard=2/4'));
  assert.ok(!plain.some((arg) => arg.startsWith('--coverage') || arg.startsWith('--reporter')));
  assert.ok(
    !commandFor(compiler, directory, { coverage: false }).some((arg) =>
      arg.startsWith('--') ? arg.startsWith('--coverage') || arg.startsWith('--shard') : false,
    ),
  );
  const merge = commandFor(compiler, directory, { mergeFrom: '/blobs' });
  assert.ok(merge.includes('--merge-reports=/blobs'));
  for (const key of Object.keys(THRESHOLDS))
    assert.ok(merge.includes(`--coverage.thresholds.${key}=${THRESHOLDS[key]}`));
  assert.ok(!merge.some((arg) => arg.startsWith('--shard') || arg === '--reporter=blob'));

  const config = async (name, entry, options) => {
    const target = path.join(root, name);
    await mkdir(target);
    await prepareConfig(entry, target, 'linux', options);
    return readFile(path.join(target, 'vitest.config.mjs'), 'utf8');
  };
  const shardConfig = await config('shard', compiler, { shard });
  assert.ok(shardConfig.includes('coverage:{...base.test.coverage,thresholds:undefined}'));
  assert.ok(shardConfig.includes('NODE_V8_COVERAGE'));
  const unsharded = await config('full', compiler, {});
  assert.ok(!unsharded.includes('thresholds:undefined'));
  const off = await config('off', compiler, { shard, coverage: false });
  assert.ok(!off.includes('thresholds:undefined'));
  assert.ok(!off.includes('NODE_V8_COVERAGE'));
  // A spec group keeps the files it collects next to the dropped thresholds.
  const spec = await config(
    'spec',
    COMMANDS.find((entry) => entry.id === 'session'),
    { shard },
  );
  assert.ok(
    spec.includes(
      `coverage:{...base.test.coverage,include:${JSON.stringify(['generator/session/*.ts'])},thresholds:undefined}`,
    ),
  );
});

test('a merge needs exactly one blob per shard', async (t) => {
  const root = await temporary(t);
  assert.deepEqual(await runner.shardBlobProblems(path.join(root, 'missing'), 2), [
    `no blob directory: ${path.join(root, 'missing')}`,
  ]);
  await writeFile(path.join(root, 'blob-1-3.json'), '');
  await writeFile(path.join(root, 'blob-3-3.json'), '');
  await writeFile(path.join(root, 'blob-1-2.json'), '');
  assert.deepEqual(await runner.shardBlobProblems(root, 3), [
    'missing shard: blob-2-3.json',
    'unexpected file: blob-1-2.json',
  ]);
  await rm(path.join(root, 'blob-1-2.json'));
  await writeFile(path.join(root, 'blob-2-3.json'), '');
  assert.deepEqual(await runner.shardBlobProblems(root, 3), []);
});

test('light groups run concurrently up to --jobs, heavy groups one at a time after them', async (t) => {
  const root = await temporary(t);
  const commands = [
    { id: 'l1', lane: 'core', runner: 'vitest', config: 'x' },
    { id: 'h1', lane: 'core', runner: 'vitest', config: 'x', heavy: true },
    { id: 'l2', lane: 'core', runner: 'vitest', config: 'x' },
    { id: 'l3', lane: 'core', runner: 'vitest', config: 'x' },
    { id: 'h2', lane: 'core', runner: 'vitest', config: 'x', heavy: true },
  ].map(Object.freeze);
  let running = 0;
  let peak = 0;
  const events = [];
  const execute = async (argv, { logFile }) => {
    const id = path.basename(path.dirname(logFile));
    events.push(`start ${id}`);
    running++;
    peak = Math.max(peak, running);
    if (id.startsWith('h')) assert.equal(running, 1, `${id} runs alone`);
    await delay(id === 'l1' ? 60 : 20);
    running--;
    events.push(`end ${id}`);
    return { code: 0 };
  };
  const results = await runPlan({
    logDir: path.join(root, 'two'),
    jobs: 2,
    execute,
    commands,
  });
  assert.equal(peak, 2);
  assert.deepEqual(
    results.map((result) => result.id),
    ['l1', 'h1', 'l2', 'l3', 'h2'],
    'results keep the plan order',
  );
  const heavyStart = events.indexOf('start h1');
  for (const id of ['l1', 'l2', 'l3']) assert.ok(events.indexOf(`end ${id}`) < heavyStart, id);
  assert.ok(events.indexOf('end h1') < events.indexOf('start h2'));
  const written = JSON.parse(await readFile(path.join(root, 'two', 'results.json'), 'utf8'));
  assert.deepEqual(
    written.results.map((result) => result.id),
    ['l1', 'h1', 'l2', 'l3', 'h2'],
  );
  // One job is the serial order.
  events.length = 0;
  peak = 0;
  await runPlan({ logDir: path.join(root, 'one'), jobs: 1, execute, commands });
  assert.equal(peak, 1);
  assert.deepEqual(
    events.filter((event) => event.startsWith('start')),
    ['start l1', 'start l2', 'start l3', 'start h1', 'start h2'],
  );
});

test('a failing light group lets the running ones finish and starts nothing else', async (t) => {
  const root = await temporary(t);
  const commands = ['a', 'b', 'c', 'd']
    .map((id) => ({ id, lane: 'core', runner: 'vitest', config: 'x' }))
    .concat({ id: 'h', lane: 'core', runner: 'vitest', config: 'x', heavy: true })
    .map(Object.freeze);
  const started = [];
  const results = await runPlan({
    logDir: path.join(root, 'fail'),
    jobs: 2,
    commands,
    execute: async (argv, { logFile }) => {
      const id = path.basename(path.dirname(logFile));
      started.push(id);
      await delay(id === 'b' ? 50 : 10);
      return { code: id === 'a' ? 1 : 0 };
    },
  });
  assert.deepEqual(started.sort(), ['a', 'b']);
  assert.deepEqual(
    results.map((result) => [result.id, result.code]),
    [
      ['a', 1],
      ['b', 0],
    ],
  );
});

test('shard and merge runs pass their options to the command and refuse other plans', async (t) => {
  const root = await temporary(t);
  const commands = [
    { id: 's', lane: 'core', runner: 'vitest', config: 'x', shards: 2 },
    { id: 'u', lane: 'core', runner: 'vitest', config: 'x' },
  ].map(Object.freeze);
  const seen = [];
  const execute = async (argv, { env }) => {
    seen.push({ argv, env });
    return { code: 0 };
  };
  await runPlan({
    logDir: path.join(root, 'shard'),
    groups: ['s'],
    shard: { index: 1, count: 2 },
    coverage: false,
    execute,
    commands,
  });
  assert.ok(seen[0].argv.includes('--shard=1/2'));
  assert.ok(!seen[0].argv.includes('--coverage'));
  assert.equal(seen[0].env.NODE_V8_COVERAGE, undefined);
  const shardResults = JSON.parse(await readFile(path.join(root, 'shard', 'results.json'), 'utf8'));
  assert.equal(shardResults.shard, '1/2');
  assert.equal(shardResults.coverage, false);
  // The merge refuses an incomplete set of blobs before running anything.
  const blobs = path.join(root, 'blobs');
  await mkdir(blobs);
  await writeFile(path.join(blobs, 'blob-1-2.json'), '');
  const incomplete = await runPlan({
    logDir: path.join(root, 'incomplete'),
    groups: ['s'],
    mergeFrom: blobs,
    execute,
    commands,
  });
  assert.equal(incomplete[0].code, 1);
  assert.match(incomplete[0].error, /missing shard: blob-2-2\.json/);
  assert.equal(seen.length, 1);
  await writeFile(path.join(blobs, 'blob-2-2.json'), '');
  const merged = await runPlan({
    logDir: path.join(root, 'merged'),
    groups: ['s'],
    mergeFrom: blobs,
    execute,
    commands,
  });
  assert.equal(merged[0].code, 0);
  assert.ok(seen[1].argv.includes(`--merge-reports=${blobs}`));
  assert.ok(seen[1].argv.includes('--coverage.thresholds.lines=90'));
  await assert.rejects(
    runPlan({ logDir: path.join(root, 'x1'), groups: ['u'], mergeFrom: blobs, execute, commands }),
    /not a sharded group/,
  );
  await assert.rejects(
    runPlan({ logDir: path.join(root, 'x2'), shard: { index: 1, count: 2 }, execute, commands }),
    /exactly one Vitest --group/,
  );
  await assert.rejects(
    runPlan({
      logDir: path.join(root, 'x3'),
      groups: ['s'],
      mergeFrom: blobs,
      coverage: false,
      execute,
      commands,
    }),
    /gates coverage/,
  );
});

test(
  'real shards: merged coverage equals the unsharded run, and the merge enforces the gate',
  { timeout: 240000 },
  async (t) => {
    const root = await temporary(t);
    const graph = COMMANDS.find((entry) => entry.id === 'graph');
    // Split by weight: the heaviest file alone, the rest balanced around it.
    const shardWeights = {
      'generator/graph/testing/performance.vitest.ts': 10,
      'generator/graph/testing/graph.vitest.ts': 4,
      'generator/graph/testing/evaluated.vitest.ts': 3,
    };
    const sharded = Object.freeze({ ...graph, shards: 3, shardWeights });
    // The same tests, split by Vitest's hash, gated over a production file they never load: every
    // shard passes (a shard does not gate), and the merge fails the thresholds.
    const ungated = Object.freeze({ ...graph, shards: 3, collect: ['generator/compiler/plan.ts'] });
    const ran = (log) =>
      [...log.matchAll(/[✓√] (generator\/graph\/testing\/[\w-]+\.vitest\.ts)/g)]
        .map((match) => match[1])
        .sort();
    const run = async (name, entry, options) => {
      const results = await runPlan({
        logDir: path.join(root, name),
        groups: ['graph'],
        timeoutMs: 120000,
        commands: [entry],
        ...options,
      });
      return {
        result: results[0],
        // Vitest colours its report under CI (the CI variable), which splits the matched lines.
        log: stripVTControlCharacters(
          await readFile(path.join(root, name, 'graph/run.log'), 'utf8'),
        ),
      };
    };
    const summary = async (name) =>
      JSON.parse(
        await readFile(path.join(root, name, 'graph/coverage/coverage-summary.json'), 'utf8'),
      ).total;
    const all = (await readdir(path.join(ROOT, 'libs/builder/generator/graph/testing')))
      .filter((file) => file.endsWith('.vitest.ts'))
      .map((file) => `generator/graph/testing/${file}`);
    const files = new RegExp(`Test Files\\s+${all.length} passed \\(${all.length}\\)`);
    const full = await run('full', graph, {});
    assert.equal(full.result.code, 0, full.log);
    for (const [prefix, entry] of [
      ['graph', sharded],
      ['ungated', ungated],
    ]) {
      const blobs = path.join(root, `${prefix}-blobs`);
      await mkdir(blobs);
      for (let index = 1; index <= 3; index++) {
        const name = `${prefix}-shard-${index}`;
        const shard = await run(name, entry, { shard: { index, count: 3 } });
        assert.equal(shard.result.code, 0, shard.log);
        assert.match(shard.log, /--shard=\d\/3/);
        if (entry === sharded)
          assert.deepEqual(ran(shard.log), partition(all, shardWeights, 3)[index - 1], shard.log);
        await copyFile(
          path.join(root, name, 'graph/blob', `blob-${index}-3.json`),
          path.join(blobs, `blob-${index}-3.json`),
        );
      }
      const merged = await run(`${prefix}-merged`, entry, { mergeFrom: blobs });
      if (entry === sharded) {
        assert.equal(merged.result.code, 0, merged.log);
        // Every file ran in exactly one shard, and the gate saw the same coverage.
        assert.match(merged.log, files);
        assert.match(full.log, files);
        assert.deepEqual(await summary(`${prefix}-merged`), await summary('full'));
      } else {
        assert.notEqual(merged.result.code, 0, merged.log);
        assert.match(
          merged.log,
          /Coverage for lines \([\d.]+%\) does not meet global threshold \(90%\)/,
        );
      }
    }
  },
);
