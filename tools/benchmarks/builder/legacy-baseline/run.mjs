import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareOverlay } from './prepare-overlay.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../../..');
const evidence = path.resolve(
  process.env.NGDOC_LEGACY_BASELINE_EVIDENCE ??
    path.join(repository, 'tmp/benchmarks/legacy-baseline'),
);
const runtime = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-legacy-overlay-'));
const result = { status: 'failed', checks: [], node: process.version, runtime };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const put = (root, relative, content) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const byPath = (capture) => new Map(capture.files.map((file) => [file.path, file]));
const product = (capture) =>
  Object.fromEntries(capture.files.map(({ path: name, normalized }) => [name, normalized]));
const GUIDE_INDEX = `---\ntitle: Fixture tab\nkeyword: FixtureKeyword\n---\n# Fixture heading\n\nSearchable cold marker.\n\n{{ NgDocActions.demo('FixtureDemoComponent') }}\n`;
const GUIDE_INDEX_WARM = `---\ntitle: Fixture tab\nkeyword: FixtureKeyword\n---\n# Fixture heading\n\nWarm native cache marker.\n\n{{ NgDocActions.demo('FixtureDemoComponent') }}\n`;
const GUIDE_INDEX_WARMUP = `---\ntitle: Fixture tab\nkeyword: FixtureKeyword\n---\n# Fixture heading\n\nWatcher warm-up marker.\n\n{{ NgDocActions.demo('FixtureDemoComponent') }}\n`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function groupAlive(group) {
  try {
    process.kill(-group, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function signalGroup(group, signal) {
  try {
    process.kill(-group, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function fixture(root) {
  put(
    root,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        moduleResolution: 'node',
        experimentalDecorators: true,
        skipLibCheck: true,
      },
      include: ['docs/**/*.ts', 'src/**/*.ts'],
    }),
  );
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  put(root, 'ng-doc.config.ts', 'export default {};\n');
  put(
    root,
    'docs/ng-doc.category.ts',
    `import type { NgDocCategory } from '@ng-doc/core';\nconst category: NgDocCategory = { title: 'Fixture category', route: 'fixture', order: 1 };\nexport default category;\n`,
  );
  put(
    root,
    'docs/guide/demo.component.ts',
    `import { Component } from '@angular/core';\n@Component({ selector: 'fixture-demo', standalone: true, templateUrl: './demo.component.html', styleUrl: './demo.component.css' })\nexport class FixtureDemoComponent {}\n`,
  );
  put(root, 'docs/guide/demo.component.html', '<p>fixture demo</p>\n');
  put(root, 'docs/guide/demo.component.css', ':host { display:block; }\n');
  put(
    root,
    'docs/guide/playground.component.ts',
    `import { Component, Input } from '@angular/core';\n@Component({ selector:'fixture-playground', standalone:true, template:'<span>{{label}}</span>' })\nexport class FixturePlaygroundComponent { @Input() label='fixture'; }\n`,
  );
  put(
    root,
    'docs/guide/ng-doc.page.ts',
    `import { NgDocPage } from '@ng-doc/core';\nimport category from '../ng-doc.category';\nimport { FixtureDemoComponent } from './demo.component';\nimport { FixturePlaygroundComponent } from './playground.component';\nconst page: NgDocPage = { title:'Fixture guide', category, route:'guide', mdFile:['./index.md','./second.md'], demos:{FixtureDemoComponent}, playgrounds:{FixturePlayground:{target:FixturePlaygroundComponent,template:'<ng-doc-selector></ng-doc-selector>',data:{label:'fixture'}}} };\nexport default page;\n`,
  );
  put(root, 'docs/guide/index.md', GUIDE_INDEX);
  put(
    root,
    'docs/guide/second.md',
    `---\ntitle: Second tab\nroute: second\n---\n# Second heading\n\nA linked \`FixtureKeyword\`.\n`,
  );
  put(
    root,
    'src/api/base.ts',
    `/** Fixture API description */\nexport class FixtureApi { value='fixture'; }\nexport function fixtureFn(value:string):string{return value;}\n`,
  );
  put(
    root,
    'docs/ng-doc.api.ts',
    `import { NgDocApi } from '@ng-doc/core';\nconst api: NgDocApi = { title:'Fixture API', keyword:'FixtureApi', scopes:[{name:'fixture',route:'fixture-api',include:'src/api/**/*.ts'}] };\nexport default api;\n`,
  );
}

function runOnce(child, overlay, root, outDir, cache) {
  const executed = spawnSync(process.execPath, [child, root, outDir], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`,
      NGDOC_LEGACY_OVERLAY: overlay,
      NGDOC_TEST_CACHE: cache ? '1' : '0',
    },
  });
  return executed.status === 0 ? { ...executed, capture: JSON.parse(executed.stdout) } : executed;
}

function watch(child, overlay, root, outDir) {
  if (process.platform === 'win32') throw new Error('Legacy native-watch harness requires POSIX');
  const processOwner = spawn(process.execPath, [child, root, outDir, 'watch'], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`,
      NGDOC_LEGACY_OVERLAY: overlay,
      NGDOC_TEST_CACHE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buffer = '';
  let stderr = '';
  let failure;
  let disposing = false;
  const queue = [];
  let notify;
  processOwner.stdout.setEncoding('utf8');
  processOwner.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          queue.push(JSON.parse(line));
        } catch {
          failure = new Error(`Invalid watch protocol: ${line.slice(0, 300)}`);
        }
      }
    }
    notify?.();
  });
  processOwner.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-40_000)));
  let settleExit;
  const exited = new Promise((resolve) => (settleExit = resolve));
  processOwner.once('error', (error) => {
    if (!disposing) failure = error;
    settleExit();
    notify?.();
  });
  processOwner.once('exit', (code, signal) => {
    if (!disposing) {
      failure = new Error(`Watch exited before disposal: code=${code} signal=${signal}\n${stderr}`);
    }
    settleExit();
    notify?.();
  });
  return {
    pid: processOwner.pid,
    async waitFor(predicate, label, timeout = 30_000) {
      const deadline = Date.now() + timeout;
      let latest;
      while (Date.now() < deadline) {
        while (queue.length) {
          latest = queue.shift();
          if (predicate(latest)) return latest;
        }
        if (failure) throw failure;
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, Math.max(1, deadline - Date.now()));
          notify = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        notify = undefined;
      }
      throw new Error(`${label} timed out; latest=${JSON.stringify(latest)}\n${stderr}`);
    },
    async dispose() {
      disposing = true;
      const group = processOwner.pid;
      if (groupAlive(group)) signalGroup(group, 'SIGTERM');
      await Promise.race([exited, delay(3_000)]);
      for (let attempt = 0; attempt < 60 && groupAlive(group); attempt++) await delay(50);
      if (groupAlive(group)) {
        signalGroup(group, 'SIGKILL');
        for (let attempt = 0; attempt < 100 && groupAlive(group); attempt++) await delay(50);
        throw new Error(
          `Watch process group ${group} required SIGKILL; survived=${groupAlive(group)}`,
        );
      }
      failure = undefined;
      return { group, joined: true, requiredSigkill: false };
    },
    get stderr() {
      return stderr;
    },
  };
}

const sourceFiles = [
  'engine/build-ng-doc.ts',
  'engine/builders/page/guide-template.builder.ts',
  'engine/builders/api-list/api-page-template.builder.ts',
  'engine/builders/shared/page-wrapper.builder.ts',
  'engine/builders/global/search-indexes.builder.ts',
  'engine/builders/global/keywords.builder.ts',
  'engine/builders/global/context-and-routes.builder.ts',
  'engine/builders/page/index.ts',
  'engine/builders/api-list/index.ts',
  'engine/builders/shared/content.builder.ts',
];

await mkdir(evidence, { recursive: true });
const before = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (file) => [
      file,
      sha256(await readFile(path.join(repository, 'libs/builder', file))),
    ]),
  ),
);

let watched;
try {
  const { packageRoot, provenance } = await prepareOverlay(runtime);
  result.overlay = provenance;
  const child = path.join(directory, 'legacy-child.cjs');

  const coldRoot = fs.realpathSync(fs.mkdtempSync(path.join(runtime, 'cold-')));
  fixture(coldRoot);
  const coldOut = path.join(coldRoot, 'generated/ng-doc/fixture');
  const cold = runOnce(child, packageRoot, coldRoot, coldOut, true);
  assert.equal(cold.status, 0, cold.stderr);
  const warm = runOnce(child, packageRoot, coldRoot, coldOut, true);
  assert.equal(warm.status, 0, warm.stderr);
  assert.deepEqual(cold.capture.diagnostics, []);
  assert.deepEqual(warm.capture.diagnostics, []);
  for (const capture of [cold.capture, warm.capture]) {
    const outputs = byPath(capture);
    assert.equal(outputs.has('api/api/classes/fixture-api/FixtureApi/page.ts'), true);
    assert.equal(outputs.has('api/api/functions/fixture-api/fixtureFn/page.ts'), true);
  }
  assert.deepEqual(product(warm.capture), product(cold.capture));
  const coldIndexes = JSON.parse(byPath(cold.capture).get('assets/indexes.json').normalized);
  const warmIndexes = JSON.parse(byPath(warm.capture).get('assets/indexes.json').normalized);
  assert.ok(coldIndexes.length > 0);
  assert.deepEqual(warmIndexes, coldIndexes);
  assert.deepEqual(
    JSON.parse(byPath(warm.capture).get('assets/keywords.json').normalized),
    JSON.parse(byPath(cold.capture).get('assets/keywords.json').normalized),
  );
  result.checks.push({ name: 'warm-search-and-product-parity', records: warmIndexes.length });
  await writeFile(path.join(evidence, 'cold.json'), JSON.stringify(cold.capture, null, 2) + '\n');
  await writeFile(path.join(evidence, 'warm.json'), JSON.stringify(warm.capture, null, 2) + '\n');

  const watchRoot = fs.realpathSync(fs.mkdtempSync(path.join(runtime, 'watch-')));
  fixture(watchRoot);
  const watchOut = path.join(watchRoot, 'generated/ng-doc/fixture');
  watched = watch(child, packageRoot, watchRoot, watchOut);
  const initialNative = await watched.waitFor(
    (capture) => capture.event === 'ready',
    'initial native readiness',
  );
  const warmPath = path.join(watchRoot, 'docs/guide/index.md');
  const hasMarker = (capture, marker) => {
    const outputs = byPath(capture);
    return (
      outputs.get('guides/guide/index/page.ts')?.normalized.includes(marker) &&
      outputs.get('assets/indexes.json')?.normalized.includes(marker)
    );
  };
  put(watchRoot, 'docs/guide/index.md', GUIDE_INDEX_WARMUP);
  const firstWarmupObservation = await watched.waitFor(
    (capture) =>
      hasMarker(capture, 'Watcher warm-up marker') ||
      capture.nativeEvents?.some((event) => event.path === warmPath),
    'watcher warm-up observation',
  );
  const firstWarmupEvent = firstWarmupObservation.nativeEvents?.find(
    (event) => event.path === warmPath,
  );
  const warmed = hasMarker(firstWarmupObservation, 'Watcher warm-up marker')
    ? firstWarmupObservation
    : await watched.waitFor(
        (capture) => hasMarker(capture, 'Watcher warm-up marker'),
        'first post-ready single-write HTML and search update',
      );
  put(watchRoot, 'docs/guide/index.md', GUIDE_INDEX);
  const warmupRestored = await watched.waitFor(
    (capture) => hasMarker(capture, 'Searchable cold marker'),
    'watcher warm-up restore',
  );
  assert.deepEqual(product(warmupRestored), product(initialNative));

  put(watchRoot, 'docs/guide/index.md', GUIDE_INDEX_WARM);
  const warmEdited = await watched.waitFor(
    (capture) => hasMarker(capture, 'Warm native cache marker'),
    'single measured same-process warm Markdown edit',
  );
  for (const unchanged of [
    'guides/guide/second/page.ts',
    'api/api/classes/fixture-api/FixtureApi/page.ts',
  ]) {
    assert.equal(
      byPath(warmEdited).get(unchanged)?.normalized,
      byPath(initialNative).get(unchanged)?.normalized,
    );
  }
  put(watchRoot, 'docs/guide/index.md', GUIDE_INDEX);
  const warmRestored = await watched.waitFor((capture) => {
    const outputs = byPath(capture);
    return (
      outputs.get('guides/guide/index/page.ts')?.normalized.includes('Searchable cold marker') &&
      outputs.get('assets/indexes.json')?.normalized.includes('Searchable cold marker') &&
      !outputs.get('assets/indexes.json')?.normalized.includes('Warm native cache marker')
    );
  }, 'same-process warm Markdown restore');
  assert.deepEqual(product(warmRestored), product(initialNative));
  assert.deepEqual(warmEdited.diagnostics, []);
  assert.deepEqual(warmRestored.diagnostics, []);
  result.checks.push({
    name: 'native-warm-edit-cache-replay',
    warmupFirstEvent: firstWarmupEvent?.type ?? 'output',
    warmupEmissions: warmed.emissions,
    editEmissions: warmEdited.emissions,
    restoreEmissions: warmRestored.emissions,
  });
  await writeFile(
    path.join(evidence, 'native-watcher-warmup.json'),
    JSON.stringify(
      { firstObservation: firstWarmupObservation, warmed, restored: warmupRestored },
      null,
      2,
    ) + '\n',
  );
  put(watchRoot, 'src/api/discovered/added.ts', 'export class AddedByGlob { value=1; }\n');
  const apiCreated = await watched.waitFor(
    (capture) => byPath(capture).get('assets/api-list.json')?.normalized.includes('AddedByGlob'),
    'native API glob create',
  );
  assert.equal(byPath(apiCreated).has('api/api/classes/fixture-api/AddedByGlob/page.ts'), true);
  assert.deepEqual(apiCreated.diagnostics, []);
  fs.rmSync(path.join(watchRoot, 'src/api/discovered/added.ts'));
  const apiDeleted = await watched.waitFor((capture) => {
    const outputs = byPath(capture);
    return (
      !outputs.get('assets/api-list.json')?.normalized.includes('AddedByGlob') &&
      !outputs.get('assets/indexes.json')?.normalized.includes('AddedByGlob') &&
      !outputs.get('assets/keywords.json')?.normalized.includes('AddedByGlob') &&
      !outputs.has('api/api/classes/fixture-api/AddedByGlob/page.ts')
    );
  }, 'native API glob delete');
  assert.equal(
    fs.existsSync(path.join(watchOut, 'api/api/classes/fixture-api/AddedByGlob')),
    false,
  );
  assert.deepEqual(apiDeleted.diagnostics, []);
  result.checks.push({
    name: 'native-api-glob-create-delete',
    createEmissions: apiCreated.emissions,
    deleteEmissions: apiDeleted.emissions,
  });
  put(watchRoot, 'docs/watched/index.md', '# Watched overlay page\n');
  put(
    watchRoot,
    'docs/watched/ng-doc.page.ts',
    `import { NgDocPage } from '@ng-doc/core';\nconst page:NgDocPage={title:'Watched',route:'watched',mdFile:'./index.md'};export default page;\n`,
  );
  await watched.waitFor(
    (capture) => byPath(capture).has('guides/watched/index/page.ts'),
    'native page create',
  );
  fs.rmSync(path.join(watchRoot, 'docs/watched'), { recursive: true, force: true });
  const deleted = await watched.waitFor(
    (capture) =>
      !byPath(capture).has('guides/watched/index/page.ts') &&
      !byPath(capture).get('routes.ts')?.normalized.includes("path: 'watched'"),
    'native page physical delete',
  );
  assert.equal(fs.existsSync(path.join(watchOut, 'guides/watched')), false);
  assert.deepEqual(deleted.diagnostics, []);
  result.checks.push({
    name: 'native-physical-delete',
    generationEmissions: deleted.emissions,
  });
  await writeFile(
    path.join(evidence, 'native-warm-edit.json'),
    JSON.stringify(warmEdited, null, 2) + '\n',
  );
  await writeFile(
    path.join(evidence, 'native-warm-restore.json'),
    JSON.stringify(warmRestored, null, 2) + '\n',
  );
  await writeFile(
    path.join(evidence, 'native-api-create.json'),
    JSON.stringify(apiCreated, null, 2) + '\n',
  );
  await writeFile(
    path.join(evidence, 'native-api-delete.json'),
    JSON.stringify(apiDeleted, null, 2) + '\n',
  );
  await writeFile(
    path.join(evidence, 'native-page-delete.json'),
    JSON.stringify(deleted, null, 2) + '\n',
  );
  result.watchCleanup = await watched.dispose();
  watched = undefined;

  const errorRoot = fs.realpathSync(fs.mkdtempSync(path.join(runtime, 'error-')));
  fixture(errorRoot);
  put(errorRoot, 'docs/guide/index.md', '{% if broken %}unterminated');
  const errorOut = path.join(errorRoot, 'generated/ng-doc/fixture');
  const failed = runOnce(child, packageRoot, errorRoot, errorOut, false);
  assert.equal(
    failed.error,
    undefined,
    `Malformed generation did not exit naturally: ${failed.error}`,
  );
  assert.equal(failed.signal, null, `Malformed generation exited by signal ${failed.signal}`);
  assert.equal(Number.isInteger(failed.status) && failed.status !== 0, true);
  assert.match(failed.stderr, /Template render error|Error while building entry|unterminated/i);
  put(errorRoot, 'docs/guide/index.md', '# Repaired generation\n\nRecovered output.\n');
  const repaired = runOnce(child, packageRoot, errorRoot, errorOut, false);
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.deepEqual(repaired.capture.diagnostics, []);
  assert.match(
    byPath(repaired.capture).get('guides/guide/index/page.ts').normalized,
    /Recovered output/,
  );
  result.checks.push({
    name: 'error-rejects-and-fresh-repair-succeeds',
    failureExit: failed.status,
  });
  await writeFile(path.join(evidence, 'error.log'), failed.stderr);
  await writeFile(
    path.join(evidence, 'repaired.json'),
    JSON.stringify(repaired.capture, null, 2) + '\n',
  );

  const after = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [
        file,
        sha256(await readFile(path.join(repository, 'libs/builder', file))),
      ]),
    ),
  );
  assert.deepEqual(after, before);
  result.originalSourceHashes = { before, after };
  result.checks.push({ name: 'original-legacy-source-unchanged' });
  result.status = 'passed';
} catch (error) {
  result.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (watched) {
    try {
      await watched.dispose();
    } catch (error) {
      result.cleanupFailure = String(error);
      process.exitCode = 1;
    }
  }
  result.runtimeRemoved = process.env.KEEP_NGDOC_LEGACY_OVERLAY === '1' ? false : true;
  if (result.runtimeRemoved) await rm(runtime, { recursive: true, force: true });
  result.harnessSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
  result.childSha256 = sha256(await readFile(path.join(directory, 'legacy-child.cjs')));
  result.prepareOverlaySha256 = sha256(await readFile(path.join(directory, 'prepare-overlay.mjs')));
  result.repositoryHead = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).stdout.trim();
  await writeFile(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2) + '\n');
}

if (result.status !== 'passed')
  throw new Error(result.failure ?? 'Legacy overlay acceptance failed');
