import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepare } from '../../../../../plugins/semantic-release/update-dependencies.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const evidence = path.resolve(
  process.env.NGDOC_B_OPTIONAL_EVIDENCE ??
    path.join(repository, 'tmp/acceptance/packed-b-optional'),
);
const expected = process.env.NGDOC_EXPECTED_SOURCE_DIGEST;
const runtime = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-packed-b-optional-'));
const snapshot = path.join(runtime, 'snapshot');
const consumer = path.join(runtime, 'consumer');
const summary = { status: 'running', node: process.version, runtime, checks: [], commands: [] };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const active = new Set();
await mkdir(evidence, { recursive: true });

function liveGroup(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
async function endGroup(pid) {
  if (!liveGroup(pid)) return false;
  signalGroup(pid, 'SIGTERM');
  for (let i = 0; i < 50 && liveGroup(pid); i++) await delay(50);
  if (liveGroup(pid)) signalGroup(pid, 'SIGKILL');
  for (let i = 0; i < 50 && liveGroup(pid); i++) await delay(50);
  assert.equal(liveGroup(pid), false, `Owned group ${pid} did not exit`);
  return true;
}

async function run(name, command, args, cwd = consumer, timeout = 180_000) {
  const env = {
    ...process.env,
    CI: '1',
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_TUI: 'false',
    npm_config_cache: path.join(runtime, 'npm-cache'),
  };
  delete env.NODE_PATH;
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pid = child.pid;
  if (pid) active.add(pid);
  let stdout = '',
    stderr = '',
    timedOut = false,
    overflow = false;
  const collect = (kind, chunk) => {
    if (kind === 'stdout') stdout += chunk;
    else stderr += chunk;
    if (stdout.length + stderr.length > 20 * 1024 * 1024 && !overflow) {
      overflow = true;
      if (pid) signalGroup(pid, 'SIGKILL');
    }
  };
  child.stdout.on('data', (chunk) => collect('stdout', chunk));
  child.stderr.on('data', (chunk) => collect('stderr', chunk));
  let force;
  const timer = setTimeout(() => {
    timedOut = true;
    if (pid) signalGroup(pid, 'SIGTERM');
    force = setTimeout(() => {
      if (pid) signalGroup(pid, 'SIGKILL');
    }, 5_000);
  }, timeout);
  const began = Date.now();
  let exit;
  let forcedCleanup = false;
  try {
    exit = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(force);
    forcedCleanup = pid ? await endGroup(pid) : false;
    if (pid) active.delete(pid);
    const outcome = {
      name,
      command,
      args,
      cwd,
      pid,
      ...exit,
      timedOut,
      overflow,
      forcedCleanup,
      durationMs: Date.now() - began,
    };
    summary.commands.push(outcome);
    await writeFile(
      path.join(evidence, `${name}.log`),
      `${JSON.stringify(outcome)}\n${stdout}\n${stderr}`,
    );
  }
  // Checked after the finally block, so a failed spawn keeps its own error.
  if (forcedCleanup) throw new Error(`${name} retained an owned process group after child close`);
  assert.equal(timedOut || overflow, false, `${name} exceeded its process bounds`);
  assert.equal(exit.code, 0, `${name} failed: ${stderr.slice(-3000)}`);
  return { stdout, stderr };
}
async function put(relative, text) {
  const file = path.join(consumer, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

try {
  assert.equal(process.version, 'v24.19.0');
  assert.notEqual(
    process.platform,
    'win32',
    'This process-group fixture targets the current POSIX host only',
  );
  assert.match(expected ?? '', /^[a-f0-9]{64}$/, 'Require an explicit frozen source digest');
  const names = ['builder', 'core', 'utils'];
  for (const name of names)
    await cp(path.join(repository, 'dist/libs', name), path.join(snapshot, name), {
      recursive: true,
    });
  const manifests = async () =>
    Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [
          name,
          JSON.parse(await readFile(path.join(snapshot, name, 'package.json'), 'utf8')),
        ]),
      ),
    );
  const before = await manifests();
  assert.deepEqual([...new Set(Object.values(before).map((p) => p.version))], ['0.0.1']);
  prepare(
    { packages: names.map((name) => path.join(snapshot, name)) },
    { logger: { log: () => undefined } },
  );
  const after = await manifests();
  summary.releasePreparation = {
    before,
    after,
    helper: 'plugins/semantic-release/update-dependencies.js',
    snapshotOnly: true,
  };
  const provenance = JSON.parse(
    await readFile(path.join(snapshot, 'builder/generator/build-provenance.json'), 'utf8'),
  );
  assert.equal(provenance.sourceDigest, expected);
  summary.provenance = provenance;
  summary.harnessSha256 = sha(await readFile(fileURLToPath(import.meta.url)));
  const tarballs = {};
  summary.packages = {};
  for (const name of names) {
    const packed = await run(`pack-${name}`, 'npm', ['pack', '--json'], path.join(snapshot, name));
    const [info] = JSON.parse(packed.stdout);
    const file = path.join(snapshot, name, info.filename);
    tarballs[`@ng-doc/${name}`] = `file:${file}`;
    summary.packages[name] = {
      filename: info.filename,
      sha256: sha(await readFile(file)),
      integrity: info.integrity,
      fileCount: info.entryCount,
    };
  }
  const pinned = {
    '@angular/core': '22.2.1',
    '@angular/common': '22.2.1',
    '@angular/compiler': '22.2.1',
    '@angular/compiler-cli': '22.2.1',
    '@angular/build': '22.2.1',
    '@angular-devkit/build-angular': '22.2.1',
    '@angular-devkit/core': '22.2.1',
    '@angular-devkit/architect': '0.2202.1',
    '@angular-devkit/schematics': '22.2.1',
    '@angular/platform-browser': '22.2.1',
    typescript: '6.0.3',
  };
  const packageJson = {
    name: 'ngdoc-packed-b-without-analog',
    private: true,
    type: 'module',
    dependencies: { ...tarballs, ...pinned },
  };
  assert.equal('@analogjs/vite-plugin-angular' in packageJson.dependencies, false);
  assert.equal('vite' in packageJson.dependencies, false);
  await put('package.json', JSON.stringify(packageJson, null, 2));
  await writeFile(
    path.join(evidence, 'consumer-package.json'),
    JSON.stringify(packageJson, null, 2),
  );
  await run('npm-install', 'npm', ['install', '--no-audit', '--no-fund']);
  const installedLock = JSON.parse(
    await readFile(path.join(consumer, 'package-lock.json'), 'utf8'),
  );
  const analogKeys = Object.keys(installedLock.packages).filter((key) =>
    /(?:^|\/)node_modules\/@analogjs\/vite-plugin-angular$/.test(key),
  );
  assert.deepEqual(
    analogKeys,
    [],
    'Analog must not exist anywhere in the clean installed dependency tree',
  );
  summary.installed = {
    analogPackageKeys: analogKeys,
    vitePackages: Object.entries(installedLock.packages)
      .filter(([key]) => /(?:^|\/)node_modules\/vite$/.test(key))
      .map(([key, value]) => ({ path: key, version: value.version })),
    lockSha256: sha(JSON.stringify(installedLock)),
    packages: Object.fromEntries(
      Object.entries(installedLock.packages).map(([key, value]) => [
        key,
        { version: value.version, resolved: value.resolved, integrity: value.integrity },
      ]),
    ),
  };
  await put(
    'bootstrap-check.mjs',
    `import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
assert.throws(()=>require.resolve('@analogjs/vite-plugin-angular/package.json'), {code:'MODULE_NOT_FOUND'});
const bootstrap=await import('@ng-doc/builder/generator/bootstrap/index.js');
assert.equal(typeof bootstrap.createGeneratorBuildSession,'function');
console.log(JSON.stringify({bootstrapImported:true,analogResolvable:false,viteVersion:require('vite/package.json').version}));
`,
  );
  const imported = await run(
    'bootstrap-import',
    process.execPath,
    ['bootstrap-check.mjs'],
    consumer,
    30_000,
  );
  summary.bootstrap = JSON.parse(imported.stdout);
  summary.checks.push(
    'Clean tarball consumer has no installed or resolvable Analog and imports public B bootstrap',
  );
  await put(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
      },
      include: ['docs/**/*.ts'],
    }),
  );
  await put(
    'ng-doc.config.mjs',
    "export default { docsPath:'docs', tsConfig:'tsconfig.json', cache:true };\n",
  );
  await put(
    'docs/ng-doc.page.ts',
    "const page = { title:'B optional guide', route:'optional', mdFile:'./guide.md' }; export default page;\n",
  );
  await put(
    'docs/guide.md',
    '# B optional guide\n\nPacked production guide works without Analog installed.\n',
  );
  const output = path.join(consumer, 'generated');
  const generated = await run('cli-generate', process.execPath, [
    'node_modules/@ng-doc/builder/generator/bootstrap/bin.js',
    'generate',
    '--project',
    'b-optional',
    '--workspace',
    consumer,
    '--config',
    path.join(consumer, 'ng-doc.config.mjs'),
    '--docs-root',
    path.join(consumer, 'docs'),
    '--tsconfig',
    path.join(consumer, 'tsconfig.json'),
    '--output-root',
    output,
    '--cache-root',
    path.join(consumer, 'cache'),
    '--json',
  ]);
  const events = generated.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const result = events.findLast((event) => event.kind === 'result')?.result;
  assert.equal(result?.status, 'success');
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    false,
  );
  const manifest = JSON.parse(
    await readFile(path.join(output, '.ng-doc-output-manifest.json'), 'utf8'),
  );
  summary.outputs = [];
  let generatedHtml = '';
  for (const entry of manifest.files) {
    const data = await readFile(path.join(output, entry.path));
    assert.equal(sha(data), entry.digest, `Published bytes differ from manifest: ${entry.path}`);
    summary.outputs.push({ path: entry.path, sha256: sha(data), bytes: data.length });
    if (entry.path.endsWith('.ts')) generatedHtml += data.toString('utf8');
  }
  assert.match(
    generatedHtml,
    /<p class="ngde">Packed production guide works without Analog installed\.<\/p>/,
  );
  const search = JSON.parse(await readFile(path.join(output, 'assets/indexes.json'), 'utf8'));
  assert.match(JSON.stringify(search), /Packed production guide works without Analog installed/);
  assert.ok(manifest.files.some((file) => file.path === 'index.ts'));
  assert.ok(manifest.files.some((file) => file.path === 'routes.ts'));
  summary.generation = {
    status: result.status,
    generation: result.generation,
    artifactCount: result.snapshot.artifacts.length,
    manifest,
    searchRecords: search.length,
  };
  summary.checks.push(
    'Actual installed CLI production generation publishes manifest-matching files, rendered guide HTML and searchable content',
  );
  // Angular's own packages pull in Vite (`@angular/build` and Vitest). The builder's optional
  // peers must accept that tree, and only the Vite engine checks the version.
  const treeVite = summary.installed.vitePackages.map((item) => item.version).join(', ');
  summary.checks.push(
    `Installed and generated without Analog and with Vite ${treeVite || 'absent'} in the tree: no optional peer blocks the install`,
  );
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([...active].map(endGroup));
  summary.cleanup = {
    groupErrors: cleanup.filter((x) => x.status === 'rejected').map((x) => String(x.reason)),
  };
  await rm(runtime, { recursive: true, force: true });
  summary.cleanup.runtimeRemoved = !existsSync(runtime);
  if (summary.cleanup.groupErrors.length || !summary.cleanup.runtimeRemoved) {
    summary.status = 'failed';
    process.exitCode = 1;
  }
  await writeFile(path.join(evidence, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    JSON.stringify({ status: summary.status, checks: summary.checks, cleanup: summary.cleanup }),
  );
}
