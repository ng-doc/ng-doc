import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const reconcile = fileURLToPath(new URL('./reconcile.mjs', import.meta.url));

async function fixture({
  descriptors = ['alpha', 'beta'],
  content = descriptors,
  indexes,
  keywords,
  warmIndexes,
  warmKeywords,
} = {}) {
  const evidence = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-reconcile-'));
  const build = path.join(evidence, 'build');
  const page = path.join(build, 'browser/docs');
  const emitted = path.join(build, 'browser/assets/ng-doc');
  const warm = path.join(build, 'generated/assets');
  await Promise.all([
    mkdir(page, { recursive: true }),
    mkdir(emitted, { recursive: true }),
    mkdir(warm, { recursive: true }),
  ]);
  await writeFile(path.join(page, 'index.html'), '<main id="page"><h1 id="intro">Docs</h1></main>');
  await writeFile(
    path.join(evidence, 'build-results.json'),
    JSON.stringify({
      status: 'passed',
      fixture: build,
      provenance: { sourceDigest: 'test-source' },
    }),
  );
  await writeFile(
    path.join(evidence, 'audit-results.json'),
    JSON.stringify({ status: 'passed', routes: [{ route: '/docs' }] }),
  );
  await writeFile(
    path.join(evidence, 'generator-inventory.json'),
    JSON.stringify({
      descriptors: descriptors.map((id) => ({ id })),
      content: content.map((id) => ({ id })),
    }),
  );
  const indexValue = indexes ?? [{ title: 'Docs', route: '/docs', fragment: 'intro' }];
  const keywordValue = keywords ?? { docs: { path: '/docs#intro' } };
  await writeFile(path.join(emitted, 'indexes.json'), JSON.stringify(indexValue));
  await writeFile(path.join(emitted, 'keywords.json'), JSON.stringify(keywordValue));
  await writeFile(path.join(warm, 'indexes.json'), warmIndexes ?? JSON.stringify(indexValue));
  await writeFile(path.join(warm, 'keywords.json'), warmKeywords ?? JSON.stringify(keywordValue));
  return evidence;
}

async function run(evidence) {
  try {
    const result = await execute(process.execPath, [reconcile, evidence]);
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function withFixture(options, check) {
  const evidence = await fixture(options);
  try {
    await check(evidence);
  } finally {
    await rm(evidence, { recursive: true, force: true });
  }
}

test('reconciles equal materialized IDs, warm assets, and local route anchors', async () => {
  await withFixture({}, async (evidence) => {
    const result = await run(evidence);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(await readFile(path.join(evidence, 'reconciliation.json'), 'utf8'));
    assert.deepEqual(report, {
      status: 'passed',
      sourceDigest: 'test-source',
      materialized: 2,
      assets: {
        indexes: { sha256: report.assets.indexes.sha256, records: 1 },
        keywords: { sha256: report.assets.keywords.sha256, records: 1 },
      },
      localTargets: 2,
      externalTargets: 0,
      missingTargets: [],
    });
  });
});

test('rejects equal-count but different descriptor/content IDs', async () => {
  await withFixture(
    { descriptors: ['alpha', 'beta'], content: ['alpha', 'other'] },
    async (evidence) => {
      const result = await run(evidence);
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /deepStrictEqual/);
    },
  );
});

test('rejects duplicate materialized content IDs', async () => {
  await withFixture({ content: ['alpha', 'alpha', 'beta'] }, async (evidence) => {
    const result = await run(evidence);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /deepStrictEqual/);
  });
});

test('rejects missing search and keyword anchors in prerendered HTML', async () => {
  await withFixture(
    {
      indexes: [{ title: 'Missing search', route: '/docs', fragment: 'search-anchor' }],
      keywords: { missing: { path: '/docs#keyword-anchor' } },
    },
    async (evidence) => {
      const result = await run(evidence);
      assert.notEqual(result.code, 0);
      const report = JSON.parse(await readFile(path.join(evidence, 'reconciliation.json'), 'utf8'));
      assert.deepEqual(report.missingTargets, [
        {
          label: 'search:Missing search',
          route: '/docs',
          anchor: 'search-anchor',
          reason: 'anchor',
        },
        { label: 'keyword:missing', route: '/docs', anchor: 'keyword-anchor', reason: 'anchor' },
      ]);
    },
  );
});

test('rejects a keyword asset that differs from the warm production output', async () => {
  await withFixture(
    { warmKeywords: JSON.stringify({ docs: { path: '/docs#different' } }) },
    async (evidence) => {
      const result = await run(evidence);
      assert.notEqual(result.code, 0);
      assert.match(
        result.stderr,
        /keywords: original production emission must equal warm generation/,
      );
    },
  );
});
