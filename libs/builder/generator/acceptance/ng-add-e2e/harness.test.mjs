import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  commandEnvironment,
  filesContaining,
  listFiles,
  npmCli,
  OUTPUT_GRACE_MS,
  PACKAGES,
  pinDependencies,
  run,
  start,
  startScopeRegistry,
  stopAll,
} from './lib.mjs';
import { assertInstalledFromRegistry, step } from './run.mjs';

// Fast checks of the harness itself; the scenarios are in scenarios.e2e.mjs.

const roots = [];
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});
async function temporary() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-ng-add-harness-'));
  roots.push(root);
  return root;
}

test('the scope registry serves packuments and tarballs by name, and nothing else', async () => {
  const root = await temporary();
  const file = path.join(root, 'ng-doc-core-0.0.1.tgz');
  const bytes = Buffer.from('tarball bytes');
  await writeFile(file, bytes);
  const registry = await startScopeRegistry({
    '@ng-doc/core': {
      file,
      manifest: { name: '@ng-doc/core', version: '0.0.1', dependencies: { tslib: '^2.0.0' } },
      integrity: 'sha512-test',
      shasum: createHash('sha1').update(bytes).digest('hex'),
    },
  });
  try {
    const packument = await (await fetch(`${registry.url}@ng-doc%2fcore`)).json();
    assert.equal(packument['dist-tags'].latest, '0.0.1');
    const version = packument.versions['0.0.1'];
    assert.deepEqual(version.dependencies, { tslib: '^2.0.0' });
    assert.equal(version.dist.integrity, 'sha512-test');
    const tarball = await fetch(version.dist.tarball);
    assert.equal(tarball.status, 200);
    assert.deepEqual(Buffer.from(await tarball.arrayBuffer()), bytes);
    assert.equal((await fetch(`${registry.url}@ng-doc/core`)).status, 200);
    assert.equal((await fetch(`${registry.url}left-pad`)).status, 404);
    assert.equal((await fetch(`${registry.url}-/other.tgz`)).status, 404);
    assert.ok(registry.requests.length >= 5);
  } finally {
    await registry.close();
  }
});

test('an application is pinned to the exact versions the repository pins', () => {
  const pinned = pinDependencies(
    {
      dependencies: { '@angular/core': '^22.0.0', rxjs: '~7.8.0', other: '1.0.0' },
      devDependencies: { typescript: '~6.0.2' },
    },
    {
      dependencies: { '@angular/core': '22.0.6', rxjs: '^7.0.0' },
      devDependencies: { typescript: '6.0.3' },
    },
  );
  assert.deepEqual(pinned, {
    dependencies: { '@angular/core': '22.0.6', rxjs: '~7.8.0', other: '1.0.0' },
    devDependencies: { typescript: '6.0.3' },
  });
});

test('npm runs through Node, and the running Node comes first on PATH', () => {
  assert.ok(existsSync(npmCli()));
  assert.throws(() => npmCli('/nowhere/node', () => false), /npm CLI/);
  const env = commandEnvironment('/cache', {
    Path: 'elsewhere',
    NODE_OPTIONS: '--inspect',
    NODE_PATH: 'x',
  });
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH');
  assert.equal(env[key].split(path.delimiter)[0], path.dirname(process.execPath));
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.NODE_PATH, undefined);
  assert.equal(env.npm_config_cache, '/cache');
  assert.equal(env.NG_CLI_ANALYTICS, 'false');
});

test('a command runs to completion, fails with its output, and a timeout ends its tree', async () => {
  const root = await temporary();
  const log = path.join(root, 'logs', 'ok.log');
  assert.equal(
    (
      await run(process.execPath, ['-e', 'console.log("hello")'], {
        cwd: root,
        env: process.env,
        log,
      })
    ).trim(),
    'hello',
  );
  assert.ok(existsSync(log));
  await assert.rejects(
    run(process.execPath, ['-e', 'console.error("broken"); process.exit(3)'], {
      cwd: root,
      env: process.env,
    }),
    /code 3[\s\S]*broken/,
  );
  const pidFile = path.join(root, 'grandchild.pid');
  const grandchild = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
  const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' }); setInterval(() => {}, 1000);`;
  await assert.rejects(
    run(process.execPath, ['-e', parent], { cwd: root, env: process.env, timeoutMs: 1_500 }),
    /timed out/,
  );
  const pid = Number((await import('node:fs')).readFileSync(pidFile, 'utf8'));
  const deadline = Date.now() + 10_000;
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  while (alive() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(alive(), false, 'the grandchild survived the timeout');
});

test('a started server is stopped with its tree', async () => {
  const root = await temporary();
  const server = start(process.execPath, ['-e', 'console.log("up"); setInterval(() => {}, 1000)'], {
    cwd: root,
    env: process.env,
  });
  while (!server.output().includes('up')) await new Promise((resolve) => setTimeout(resolve, 20));
  const result = await server.stop();
  assert.ok(result.code !== 0 || result.signal !== null);
});

test('files are listed with forward slashes and searched for a marker', async () => {
  const root = await temporary();
  await mkdir(path.join(root, 'a', 'b'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'x'), { recursive: true });
  await writeFile(path.join(root, 'a', 'b', 'page.js'), 'const text = "MARK";');
  await writeFile(path.join(root, 'a', 'other.css'), 'MARK');
  await writeFile(path.join(root, 'node_modules', 'x', 'index.js'), 'MARK');
  assert.deepEqual(await listFiles(root), ['a/b/page.js', 'a/other.css']);
  assert.deepEqual(await filesContaining(root, 'MARK', (file) => file.endsWith('.js')), [
    'a/b/page.js',
  ]);
});

test('a command whose descendant keeps its pipes open still settles, and a timeout still fires', async () => {
  const root = await temporary();
  const pidFile = path.join(root, 'holder.pid');
  // The descendant leaves the process group and inherits the pipes: on Windows no descendant can
  // be found once its parent exited, and this is the same situation on POSIX.
  const holder = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 120000);`;
  const parent = (stay) =>
    `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(holder)}], { stdio: 'inherit', detached: true }).unref();${stay ? ' setInterval(() => {}, 1000);' : ''}`;
  const killHolder = () => {
    try {
      process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL');
    } catch {
      // Already gone.
    }
  };
  try {
    let began = Date.now();
    await run(process.execPath, ['-e', parent(false)], { cwd: root, env: process.env });
    assert.ok(Date.now() - began < OUTPUT_GRACE_MS + 5_000, 'run() waited for the pipes');
    killHolder();
    began = Date.now();
    await assert.rejects(
      run(process.execPath, ['-e', parent(true)], {
        cwd: root,
        env: process.env,
        timeoutMs: 1_000,
      }),
      /timed out/,
    );
    assert.ok(
      Date.now() - began < 1_000 + OUTPUT_GRACE_MS + 5_000,
      'the timeout waited for the pipes',
    );
  } finally {
    killHolder();
  }
});

test('stopAll stops every running command', async () => {
  const root = await temporary();
  const one = start(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: root,
    env: process.env,
  });
  const two = start(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: root,
    env: process.env,
  });
  await stopAll();
  for (const command of [one, two]) {
    const result = await command.exit;
    assert.ok(result.code !== 0 || result.signal !== null);
  }
});

test('a scenario step is refused after cancellation and cut to the budget', async () => {
  const root = await temporary();
  const controller = new AbortController();
  const context = { signal: controller.signal, deadline: Date.now() + 60_000 };
  assert.equal(
    (
      await step(context, process.execPath, ['-e', 'console.log("ok")'], {
        cwd: root,
        env: process.env,
      })
    ).trim(),
    'ok',
  );
  context.deadline = Date.now() + 1_500;
  await assert.rejects(
    step(context, process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd: root,
      env: process.env,
      timeoutMs: 600_000,
    }),
    /timed out after \d{3,4} ms/,
  );
  context.deadline = Date.now();
  await assert.rejects(
    step(context, process.execPath, ['-e', ''], { cwd: root }),
    /budget ran out/,
  );
  context.deadline = Date.now() + 60_000;
  controller.abort(new Error('cancelled by the test'));
  await assert.rejects(
    step(context, process.execPath, ['-e', ''], { cwd: root }),
    /cancelled by the test/,
  );
});

test('installed @ng-doc packages must come from the local registry as the packed tarballs', async () => {
  const root = await temporary();
  const url = 'http://127.0.0.1:1234/';
  const names = ['app', 'builder', 'core', 'ui-kit', 'utils'].map((name) => `@ng-doc/${name}`);
  const packed = Object.fromEntries(
    PACKAGES.map((name) => [`@ng-doc/${name}`, { integrity: `sha512-${name}` }]),
  );
  const write = (packages) =>
    writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ packages }));
  const entry = (name, override = {}) => ({
    resolved: `${url}-/${name.slice(8)}.tgz`,
    integrity: `sha512-${name.slice(8)}`,
    ...override,
  });
  const entries = (override = {}) =>
    Object.fromEntries(names.map((name) => [`node_modules/${name}`, entry(name, override[name])]));
  const context = { registry: { url, requests: ['GET /@ng-doc/add'] }, packed };
  await write(entries());
  assert.deepEqual(await assertInstalledFromRegistry(context, root), [...names].sort());
  // A nested copy is checked too.
  await write({
    ...entries(),
    'node_modules/x/node_modules/@ng-doc/core': entry('@ng-doc/core', {
      integrity: 'sha512-other',
    }),
  });
  await assert.rejects(assertInstalledFromRegistry(context, root), /not the packed tarball/);
  await write(
    entries({
      '@ng-doc/app': { resolved: 'https://registry.npmjs.org/@ng-doc/app/-/app-0.0.1.tgz' },
    }),
  );
  await assert.rejects(assertInstalledFromRegistry(context, root), /not the local registry/);
  await write({ ...entries(), 'node_modules/@ng-doc/other': entry('@ng-doc/other') });
  await assert.rejects(
    assertInstalledFromRegistry(context, root),
    /not one of the packed packages/,
  );
  const withoutCore = entries();
  delete withoutCore['node_modules/@ng-doc/core'];
  await write(withoutCore);
  await assert.rejects(
    assertInstalledFromRegistry(context, root),
    /@ng-doc\/core is not installed/,
  );
  await write(entries());
  await assert.rejects(
    assertInstalledFromRegistry({ ...context, registry: { url, requests: [] } }, root),
    /@ng-doc\/add was not served/,
  );
});
