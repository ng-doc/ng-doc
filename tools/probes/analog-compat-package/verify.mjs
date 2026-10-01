import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(root, 'package');
const entry = path.join(packageRoot, 'dist/index.js');
const evidenceRoot = path.join(
  root,
  '../../../docs/architecture/evidence/t14/analog-compat-package/replay',
);
const expected = {
  entrySha256: '139f0448fadaf824f6eb20926c65175d6f233c27de9b062fd6d274d8fe693115',
  inputInventorySha256: '86be448127bc03f7b4635dc77dd924a8fdefb6839eb3e7aa63d76b206a36eb84',
  pluginNames: [
    '@analogjs/vite-plugin-angular',
    'analogjs-live-reload-plugin',
    '@analogjs/vite-plugin-angular-optimizer',
    'analogjs-router-optimization',
    'analogjs-nx-folder-plugin',
  ],
};
const timeoutMs = 120_000;
const commandRecords = [];

if (process.versions.node !== '24.19.0') {
  throw new Error(`Verifier requires Node 24.19.0; received ${process.versions.node}.`);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function assertOwnedGroupGone(pid) {
  if (process.platform === 'win32') return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(-pid, 0);
      process.kill(-pid, 'SIGKILL');
      await delay(50);
    } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
  }
  throw new Error(`Owned process group ${pid} remained after child close.`);
}

function command(label, executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let closed = false;
    let hardTimer;
    child.stdout.on('data', (value) => {
      stdout += value;
    });
    child.stderr.on('data', (value) => {
      stderr += value;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      } catch {}
      hardTimer = setTimeout(() => {
        if (!closed) {
          try {
            if (process.platform === 'win32') child.kill('SIGKILL');
            else process.kill(-child.pid, 'SIGKILL');
          } catch {}
        }
      }, 2_000).unref();
    }, timeoutMs);
    timer.unref();
    child.on('error', (error) => {
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      commandRecords.push({ label, executable, args, error: error.message, stdout, stderr });
      reject(error);
    });
    child.on('close', async (code, signal) => {
      closed = true;
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      let groupError;
      try {
        await assertOwnedGroupGone(child.pid);
      } catch (error) {
        groupError = error;
      }
      const record = { label, executable, args, code, signal, timedOut, stdout, stderr };
      commandRecords.push(record);
      if (groupError) {
        reject(groupError);
      } else if (timedOut) {
        reject(
          new Error(
            `${executable} exceeded the ${timeoutMs}ms owned-child timeout.\n${stdout}\n${stderr}`,
          ),
        );
      } else if (code !== 0) {
        reject(new Error(`${executable} exited ${code ?? signal}.\n${stdout}\n${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

const entryHash = createHash('sha256')
  .update(await readFile(entry))
  .digest('hex');
if (entryHash !== expected.entrySha256) {
  throw new Error(
    `Frozen entry mismatch: expected ${expected.entrySha256}, received ${entryHash}.`,
  );
}
if (!(await exists(path.join(packageRoot, 'UPSTREAM-INPUT-INVENTORY.sha256')))) {
  throw new Error('Frozen package is missing its upstream input inventory.');
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-analog-compat-verify-'));
let summary;
let failure;
try {
  await command('pack', process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'pack',
    '--pack-destination',
    temporary,
    packageRoot,
  ]);
  const tarball = (await readdir(temporary))
    .filter((value) => value.endsWith('.tgz'))
    .map((value) => path.join(temporary, value))[0];
  if (!tarball) throw new Error('npm pack produced no tarball.');

  await writeFile(
    path.join(temporary, 'package.json'),
    JSON.stringify(
      {
        name: 'ngdoc-analog-compat-verify-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@ng-doc/analog-compat-prototype': `file:${tarball}`,
          '@angular-devkit/build-angular': '22.0.6',
          '@angular/build': '22.0.6',
          '@angular/compiler': '22.0.6',
          '@angular/compiler-cli': '22.0.6',
          '@angular/core': '22.0.6',
          typescript: '6.0.3',
          'ts-morph': '28.0.0',
          vite: '7.3.5',
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(temporary, 'index.mjs'),
    `
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import factory, { createNgDocAngularCompatibilityPlugins } from '@ng-doc/analog-compat-prototype';
const require = createRequire(import.meta.url);
const plugins = factory({ liveReload: true });
const named = createNgDocAngularCompatibilityPlugins({ liveReload: true });
const expectedNames = ${JSON.stringify(expected.pluginNames)};
const names = plugins.map((plugin) => plugin.name);
if (!Array.isArray(plugins) || !Array.isArray(named) || JSON.stringify(names) !== JSON.stringify(expectedNames)) throw new Error('Unexpected complete Plugin[] factory result: ' + JSON.stringify(names));
const entry = require.resolve('@ng-doc/analog-compat-prototype');
const candidateRoot = dirname(dirname(entry));
const upstreamRequire = createRequire(require.resolve('@analogjs/vite-plugin-angular/package.json'));
const inventory = readFileSync(join(candidateRoot, 'UPSTREAM-INPUT-INVENTORY.sha256'), 'utf8');
if (!existsSync(join(candidateRoot, 'LICENSE')) || !existsSync(join(candidateRoot, 'UPSTREAM-PROVENANCE.md'))) throw new Error('Installed package lacks upstream license/provenance.');
if (createHash('sha256').update(readFileSync(entry)).digest('hex') !== ${JSON.stringify(expected.entrySha256)}) throw new Error('Installed entry differs from frozen candidate.');
if (createHash('sha256').update(inventory).digest('hex') !== ${JSON.stringify(expected.inputInventorySha256)}) throw new Error('Installed upstream inventory differs from frozen candidate.');
console.log(JSON.stringify({ names, count: plugins.length, consumerTsMorph: require('ts-morph/package.json').version, upstreamTsMorph: upstreamRequire('ts-morph/package.json').version, license: true, provenance: true, inventory: true }, null, 2));
`,
  );
  await writeFile(
    path.join(temporary, 'index.ts'),
    `
import type { Plugin } from 'vite';
import { createNgDocAngularCompatibilityPlugins } from '@ng-doc/analog-compat-prototype';
const plugins: Plugin[] = createNgDocAngularCompatibilityPlugins({ liveReload: true });
void plugins;
`,
  );
  await writeFile(
    path.join(temporary, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
      },
      include: ['index.ts'],
    }),
  );
  await command(
    'install',
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: temporary },
  );
  const runtime = await command('runtime', process.execPath, ['index.mjs'], { cwd: temporary });
  const factory = JSON.parse(runtime.stdout);
  if (
    factory.count !== expected.pluginNames.length ||
    JSON.stringify(factory.names) !== JSON.stringify(expected.pluginNames) ||
    factory.consumerTsMorph !== '28.0.0' ||
    factory.upstreamTsMorph !== '21.0.1' ||
    factory.license !== true ||
    factory.provenance !== true ||
    factory.inventory !== true
  ) {
    throw new Error(`Packed consumer assertions failed: ${runtime.stdout}`);
  }
  await command(
    'typecheck',
    path.join(temporary, 'node_modules/.bin/tsc'),
    ['--project', 'tsconfig.json'],
    { cwd: temporary },
  );
  summary = {
    entrySha256: entryHash,
    packedConsumer: true,
    factory,
    typecheck: true,
    cleanup: false,
  };
} catch (error) {
  failure = error;
} finally {
  await rm(temporary, { recursive: true, force: true });
  if (await exists(temporary)) {
    failure ??= new Error(`Verifier failed to remove owned temporary directory ${temporary}.`);
  }
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(
    path.join(evidenceRoot, 'commands.json'),
    `${JSON.stringify(commandRecords, null, 2)}\n`,
  );
}
if (failure) throw failure;
summary.cleanup = true;
await writeFile(path.join(evidenceRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
