import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(fileURLToPath(new URL('../../../../..', import.meta.url)));
const evidence = path.resolve(
  process.env.NGDOC_PRODUCTION_EVIDENCE || path.join(root, 'tmp/acceptance/production'),
);
const execute = promisify(execFile);
await mkdir(evidence, { recursive: true });
const packedRoot = (
  await readFile(
    path.join(
      process.env.NGDOC_PACKED_EVIDENCE || path.join(evidence, 'packed'),
      'consumer-path.txt',
    ),
    'utf8',
  )
).trim();
const consumer = path.join(packedRoot, 'consumer');
const workspace = await mkdtemp(path.join(consumer, 't12-production-'));
const outputRoot = path.join(workspace, 'generated');
const cacheRoot = path.join(workspace, 'cache');
const cli = path.join(consumer, 'node_modules/.bin/ng-doc');
const summary = {
  node: process.version,
  workspace,
  checks: [],
  runs: [],
  package: JSON.parse(
    await readFile(
      path.join(consumer, 'node_modules/@ng-doc/builder/generator/build-provenance.json'),
      'utf8',
    ),
  ),
};

async function put(relative, text) {
  const filename = path.join(workspace, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, text);
}
async function inventory(directory) {
  const result = {};
  async function walk(current) {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, item.name);
      if (item.isDirectory()) await walk(filename);
      else
        result[path.relative(directory, filename)] = {
          hash: createHash('sha256')
            .update(await readFile(filename))
            .digest('hex'),
          mtimeMs: (await stat(filename)).mtimeMs,
        };
    }
  }
  try {
    await walk(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return result;
}
async function run(name, expectedCode) {
  const args = [
    'generate',
    '--project',
    'production-negative',
    '--workspace',
    workspace,
    '--config',
    path.join(workspace, 'ng-doc.config.mjs'),
    '--docs-root',
    path.join(workspace, 'docs'),
    '--tsconfig',
    path.join(workspace, 'tsconfig.json'),
    '--output-root',
    outputRoot,
    '--cache-root',
    cacheRoot,
    '--json',
  ];
  let observation;
  const start = performance.now();
  try {
    observation = {
      ...(await execute(cli, args, {
        cwd: workspace,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        maxBuffer: 30 * 1024 * 1024,
        timeout: 90000,
      })),
      code: 0,
    };
  } catch (error) {
    observation = {
      code: error.code,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
    };
  }
  await writeFile(
    path.join(evidence, `${name}.log`),
    `$ ${cli} ${args.join(' ')}\nexit=${observation.code}\n${observation.stdout}\n${observation.stderr}`,
  );
  assert.equal(observation.code, expectedCode, `${name}: ${observation.stderr}`);
  const result = JSON.parse(observation.stdout.trim()).result;
  summary.runs.push({
    name,
    exitCode: observation.code,
    elapsedMs: performance.now() - start,
    status: result.status,
    diagnostics: result.diagnostics,
    revision: result.snapshot?.revision,
    whyRebuilt: result.whyRebuilt,
  });
  return result;
}

try {
  await put('package.json', JSON.stringify({ private: true, type: 'module' }));
  await put(
    'ng-doc.config.mjs',
    "export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true };\n",
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
        types: [],
      },
      include: ['docs/**/*.ts'],
    }),
  );
  await put(
    'docs/visible/ng-doc.page.ts',
    "const description = { title: 'Visible guide', route: 'visible', mdFile: './index.md' }; export default description;\n",
  );
  await put(
    'docs/visible/index.md',
    '---\nkeyword: Visible\n---\n# Visible heading\n\nVisible links to `*Hidden` and `Actual`.\n',
  );
  await put(
    'docs/unopened/ng-doc.page.ts',
    "const description = { title: 'Never opened guide', route: 'unopened', mdFile: './missing.md' }; export default description;\n",
  );
  await put(
    'docs/ng-doc.api.ts',
    "const description = { title: 'Complete API', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default description;\n",
  );
  await put(
    'docs/api.ts',
    '/** Actual declaration. */ export class Actual { /** Searchable value. */ value = 1; }\n/** A second symbol in the same file. */ export interface Secondary { name: string; }\n',
  );

  const broken = await run('unopened-broken-cold', 1);
  assert.equal(broken.status, 'failure');
  assert.ok(
    broken.diagnostics.some(
      (item) => item.severity === 'error' && JSON.stringify(item).includes('missing.md'),
    ),
  );
  await assert.rejects(access(path.join(outputRoot, '.ng-doc-output-manifest.json')));
  assert.deepEqual(await inventory(outputRoot), {});
  summary.checks.push(
    'Never-opened missing Markdown fails installed production CLI before any published output or manifest',
  );

  await put(
    'docs/unopened/missing.md',
    '---\nkeyword: Hidden\n---\n# Hidden repaired heading\n\nNever opened searchable content links to `Actual`.\n',
  );
  const cold = await run('repaired-complete-cold', 0);
  assert.equal(cold.status, 'success');
  assert.ok(
    cold.snapshot.artifacts.flatMap((item) => item.apiList).some((item) => item.name === 'Actual'),
  );
  assert.ok(
    cold.snapshot.artifacts
      .flatMap((item) => item.apiList)
      .some((item) => item.name === 'Secondary'),
  );
  const outputs = await inventory(outputRoot);
  const caches = await inventory(cacheRoot);
  const search = JSON.parse(await readFile(path.join(outputRoot, 'assets/indexes.json'), 'utf8'));
  const keywords = JSON.parse(
    await readFile(path.join(outputRoot, 'assets/keywords.json'), 'utf8'),
  );
  assert.match(JSON.stringify(search), /Hidden repaired heading/);
  assert.ok(keywords['*Hidden']);
  assert.ok(keywords.Actual);
  assert.ok(keywords.Secondary);
  const generated = (
    await Promise.all(
      Object.keys(outputs)
        .filter((name) => name.endsWith('.ts'))
        .map((name) => readFile(path.join(outputRoot, name), 'utf8')),
    )
  ).join('\n');
  assert.match(generated, /Never opened searchable content/);
  assert.match(generated, /href="unopened"/);
  assert.match(generated, /Secondary/);
  summary.checks.push(
    'Clean repair publishes unopened guide plus every symbol, routes, linked content, search and keywords',
  );

  const warm = await run('complete-fresh-process-warm', 0);
  assert.equal(warm.status, 'success');
  assert.deepEqual(warm.whyRebuilt, []);
  assert.deepEqual(await inventory(outputRoot), outputs);
  const warmCaches = await inventory(cacheRoot);
  assert.deepEqual(
    Object.fromEntries(Object.entries(warmCaches).map(([name, value]) => [name, value.hash])),
    Object.fromEntries(Object.entries(caches).map(([name, value]) => [name, value.hash])),
  );
  summary.cacheFilesRewrittenOnWarm = Object.keys(caches).filter(
    (name) => caches[name].mtimeMs !== warmCaches[name].mtimeMs,
  ).length;
  assert.deepEqual(warm.snapshot, cold.snapshot);
  summary.checks.push(
    'Fresh-process warm snapshot and output/cache hashes equal cold; published output mtimes remain stable',
  );

  await put('docs/unopened/missing.md', '{% include "does-not-exist.nunj" %}\n');
  const failedUpdate = await run('unopened-broken-after-success', 1);
  assert.equal(failedUpdate.status, 'failure');
  assert.ok(failedUpdate.diagnostics.some((item) => item.severity === 'error'));
  assert.deepEqual(await inventory(outputRoot), outputs);
  summary.checks.push(
    'A broken never-opened Nunjucks dependency returns failure and preserves the exact last-good manifest and files',
  );

  await put(
    'docs/unopened/missing.md',
    '---\nkeyword: Hidden\n---\n# Hidden repaired heading\n\nNever opened searchable content links to `Actual`.\n',
  );
  const repairedAgain = await run('repair-after-failed-production', 0);
  assert.equal(repairedAgain.status, 'success');
  assert.deepEqual(await inventory(outputRoot), outputs);
  summary.checks.push(
    'Repair after production failure succeeds without rewriting unchanged last-good files',
  );
  summary.passed = true;
} catch (error) {
  summary.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(evidence, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        passed: summary.passed,
        failure: summary.failure,
        checks: summary.checks,
        runs: summary.runs.map(({ name, status, elapsedMs }) => ({ name, status, elapsedMs })),
      },
      null,
      2,
    ),
  );
}
