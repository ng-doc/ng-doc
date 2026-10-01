import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { preview } from 'vite';

import {
  bundleDiscoveryRuntime,
  isOnlyForTagsRemoval,
  onlyForTagsRemovals,
} from '../only-for-tags/removals.mjs';

// Audit an existing production bundle in a fresh process: do not load Zone before a build.
if (process.env.NGDOC_PRERENDER_AUDIT_CHILD !== '1') {
  const child = spawn(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    env: { ...process.env, NGDOC_PRERENDER_AUDIT_CHILD: '1' },
  });
  const timer = setTimeout(() => {
    console.error('Standalone prerender audit exceeded ten minutes');
    if (process.platform === 'win32') child.kill('SIGKILL');
    else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }, 600_000);
  const [code] = await once(child, 'close');
  clearTimeout(timer);
  process.exit(code ?? 1);
}
const [fixtureArgument, baselineArgument, productionEvidenceArgument, evidenceArgument] =
  process.argv.slice(2);
assert.ok(
  evidenceArgument,
  'Usage: prerender-all.mjs fixture baseline-output production-results evidence-dir',
);
const fixture = path.resolve(fixtureArgument);
const baseline = path.resolve(baselineArgument);
const evidence = path.resolve(evidenceArgument);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inventoryBytes = await readFile(path.join(baseline, 'prerendered-routes.json'));
const inventory = Object.keys(JSON.parse(inventoryBytes).routes).sort();
assert.equal(inventory.length, 656, 'Expected the accepted B route inventory');
// The accepted inventory predates `onlyForTags` in the new engine: it still lists entries a
// production build now leaves out on purpose (the Develop sandbox, `onlyForTags:
// ['development']`). Those routes are derived from discovery of the audited fixture with the
// build's tags (the Vite mode, `production`) and without them; they must no longer render their
// page, and every other route keeps full parity.
const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
const discoveryScratch = path.join(fixture, 'only-for-tags-runtime');
await rm(discoveryScratch, { recursive: true, force: true });
const removals = await onlyForTagsRemovals({
  discoveryModule: await bundleDiscoveryRuntime(discoveryScratch),
  request: {
    projectId: 'ng-doc-vite-main',
    workspaceRoot: repository,
    configFile: path.join(fixture, 'ng-doc.config.ts'),
    defaults: {
      docsRoot: path.join(repository, 'apps/ng-doc/docs'),
      tsConfig: path.join(fixture, 'tsconfig.json'),
      outputRoot: path.join(fixture, 'generated'),
      cacheRoot: path.join(fixture, 'cache'),
    },
  },
  tags: ['production'],
});
await rm(discoveryScratch, { recursive: true, force: true });
const sourceEvidenceBytes = await readFile(path.resolve(productionEvidenceArgument));
const sourceEvidence = JSON.parse(sourceEvidenceBytes);
assert.equal(sourceEvidence.fixture, fixture, 'Evidence must describe the audited fixture');
assert.ok(!sourceEvidence.failure, 'Cannot audit a failed production build as accepted');
assert.ok(sourceEvidence.checks.some((check) => check.name === 'production-ssr-build'));
const bundle = path.join(fixture, 'server/server.js');
const summary = {
  status: 'running',
  fixture,
  node: process.version,
  provenance: sourceEvidence.provenance,
  productionEvidence: {
    file: path.resolve(productionEvidenceArgument),
    sha256: hash(sourceEvidenceBytes),
  },
  baselineInventory: {
    file: path.join(baseline, 'prerendered-routes.json'),
    sha256: hash(inventoryBytes),
    count: inventory.length,
  },
  serverBundleSha256: hash(await readFile(bundle)),
  onlyForTags: removals,
  routes: [],
  errors: [],
};
await mkdir(evidence, { recursive: true });
function extract(html) {
  const values = { headings: [], pages: 0, pageText: [], hydration: false };
  function text(node) {
    return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
  }
  function walk(node) {
    if (node.tagName === 'h1') values.headings.push(text(node).replace(/\s+/g, ' ').trim());
    if (node.tagName === 'ng-doc-page') {
      values.pages++;
      values.pageText.push(text(node).replace(/\s+/g, ' ').trim());
    }
    if (node.attrs?.some((attribute) => attribute.name === 'ngh')) values.hydration = true;
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(parse(html));
  return values;
}
let server;
const originalError = console.error;
console.error = (...args) => {
  summary.errors.push(args.map(String).join(' '));
  originalError(...args);
};
try {
  server = await preview({
    configFile: false,
    root: fixture,
    build: { outDir: path.join(fixture, 'browser') },
    preview: { host: '127.0.0.1', port: 0 },
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const ssr = await import(pathToFileURL(bundle).href);
  assert.equal(ssr.developmentMode(), false);
  const document = await readFile(path.join(fixture, 'browser/index.html'), 'utf8');
  for (const route of inventory) {
    const rendered = await ssr.render(document, origin + route);
    const current = extract(rendered);
    assert.ok(current.hydration, `Missing hydration metadata: ${route}`);
    let baselineHtml;
    try {
      baselineHtml = await readFile(path.join(baseline, 'browser', route, 'index.html'), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const removed = isOnlyForTagsRemoval(removals, route);
    if (removed) {
      // Rendered by the application's fallback route, never as the left-out page itself.
      const titles = removals.entries.map((entry) => entry.title);
      assert.ok(
        !current.headings.some((heading) => titles.includes(heading)),
        `onlyForTags removal still renders its page: ${route}`,
      );
      if (baselineHtml)
        assert.notDeepEqual(
          current.pageText,
          extract(baselineHtml).pageText,
          `onlyForTags removal still renders its baseline body: ${route}`,
        );
    } else if (baselineHtml) {
      const previous = extract(baselineHtml);
      assert.deepEqual(current.headings, previous.headings, `SSR heading parity: ${route}`);
      assert.equal(current.pages, previous.pages, `SSR page presence: ${route}`);
      assert.deepEqual(
        current.pageText,
        previous.pageText,
        `SSR documentation body parity: ${route}`,
      );
    }
    assert.deepEqual(summary.errors, [], `SSR logged an error: ${route}`);
    const filename = path.join(fixture, 'prerender-audit', route, 'index.html');
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, rendered);
    const { pageText, ...structure } = current;
    summary.routes.push({
      route,
      bytes: Buffer.byteLength(rendered),
      sha256: hash(rendered),
      ...structure,
      pageText: pageText.map((text) => ({ characters: text.length, sha256: hash(text) })),
      baselineHtml: !!baselineHtml,
      ...(removed ? { onlyForTagsRemoval: true } : {}),
    });
    if (summary.routes.length % 50 === 0)
      process.stdout.write(`Prerendered ${summary.routes.length}/${inventory.length}\n`);
  }
  assert.equal(summary.routes.length, inventory.length);
  summary.comparedBaselineHtmlCount = summary.routes.filter(
    (route) => route.baselineHtml && !route.onlyForTagsRemoval,
  ).length;
  summary.onlyForTagsRemovedRoutes = summary.routes
    .filter((route) => route.onlyForTagsRemoval)
    .map((route) => route.route);
  const removedWithBaselineHtml = summary.routes.filter(
    (route) => route.baselineHtml && route.onlyForTagsRemoval,
  ).length;
  assert.equal(
    summary.comparedBaselineHtmlCount,
    650 - removedWithBaselineHtml,
    'Expected all accepted B HTML comparisons except onlyForTags removals',
  );
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  console.error = originalError;
  if (server)
    await new Promise((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  await writeFile(path.join(evidence, 'results.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(`${summary.status}: ${summary.routes.length}/${inventory.length}\n`);
}
