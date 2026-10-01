import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { preview } from 'vite';

import {
  isOnlyForTagsRemoval,
  onlyForTagsRemovals,
  partitionRemovedRoutes,
} from '../only-for-tags/removals.mjs';

// Audits the product's prerendered output in a fresh process: no Analog, Angular or compiler
// import. Every route was rendered by the product pipeline (buildNgDocViteApplication).
// The API routes of the narrowed @ng-doc/builder scope (`apps/ng-doc/docs/ng-doc.api.ts`).
const BUILDER_API_ROUTES = [
  '/docs/api/classes/builder/JSDoc',
  '/docs/api/classes/builder/NgDocActions',
  '/docs/api/classes/builder/NgDocApi',
  '/docs/api/interfaces/builder/Constructable',
  '/docs/api/interfaces/builder/NgDocActionOutput',
  '/docs/api/interfaces/builder/NgDocAsset',
  '/docs/api/interfaces/builder/NgDocBuildCategorySchema',
  '/docs/api/interfaces/builder/NgDocBuildPageSchema',
  '/docs/api/interfaces/builder/NgDocBuilderContext',
  '/docs/api/interfaces/builder/NgDocBuilderOutput',
  '/docs/api/interfaces/builder/NgDocCodeBlockParams',
  '/docs/api/interfaces/builder/NgDocConfiguration',
  '/docs/api/interfaces/builder/NgDocGuideConfiguration',
  '/docs/api/interfaces/builder/NgDocKeywordsConfiguration',
  '/docs/api/interfaces/builder/NgDocMigrateToViteSchema',
  '/docs/api/interfaces/builder/NgDocPageKeyword',
  '/docs/api/interfaces/builder/NgDocPathAnchor',
  '/docs/api/interfaces/builder/NgDocPlaygroundMetadata',
  '/docs/api/interfaces/builder/NgDocRendererOptions',
  '/docs/api/interfaces/builder/NgDocRepoConfig',
  '/docs/api/interfaces/builder/NgDocSchema',
  '/docs/api/interfaces/builder/NgDocSnippet',
  '/docs/api/interfaces/builder/NgDocSnippetConfig',
  '/docs/api/interfaces/builder/NgDocViteSetupSchema',
  '/docs/api/type-aliases/builder/NgDocAction',
  '/docs/api/type-aliases/builder/NgDocArtifactProcessor',
  '/docs/api/type-aliases/builder/NgDocBuildApiSchema',
  '/docs/api/type-aliases/builder/NgDocComponentAsset',
  '/docs/api/type-aliases/builder/NgDocPlatform',
  '/docs/api/type-aliases/builder/NgDocSupportedDeclaration',
];
// The API routes of declarations that 22.0.0 removed from @ng-doc/app and @ng-doc/ui-kit (the
// search dialog, the let directive, the pure-function decorator, the zone operators and the theme
// token). The baseline predates the removals; these routes must be gone.
const REMOVED_API_ROUTES = [
  '/docs/api/classes/app/NgDocSearchDialogComponent',
  '/docs/api/classes/ui-kit/NgDocLetContext',
  '/docs/api/classes/ui-kit/NgDocLetDirective',
  '/docs/api/functions/ui-kit/ngDocMakePure',
  '/docs/api/functions/ui-kit/ngDocZoneAttach',
  '/docs/api/functions/ui-kit/ngDocZoneDetach',
  '/docs/api/functions/ui-kit/ngDocZoneOptimize',
  '/docs/api/interfaces/app/NgDocSearchDialogData',
  '/docs/api/interfaces/app/NgDocTheme',
  '/docs/api/variables/app/NG_DOC_DEFAULT_THEME_ID',
  '/docs/api/variables/app/NG_DOC_THEME',
];
const [fixture, evidence, base = '/preview/', generatorJson] = process.argv.slice(2);
assert.ok(fixture && evidence && generatorJson);
const generatorOptions = JSON.parse(generatorJson);
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const hash = (x) => createHash('sha256').update(x).digest('hex');
const summary = { status: 'running', node: process.version, routes: [], errors: [], checks: [] };
// Node prints its process warnings (deprecations of the audit's own tooling) through
// console.error; send them to stderr so the capture below holds only real errors.
process.removeAllListeners('warning');
process.on('warning', (warning) =>
  process.stderr.write(`(node:${process.pid}) ${warning.name}: ${warning.message}\n`),
);
const originalError = console.error;
console.error = (...args) => {
  summary.errors.push(args.map(String).join(' '));
  originalError(...args);
};
let server, browser;
function structure(html) {
  const value = { headings: [], pages: [], assets: [], hydration: false };
  const text = (n) => (n.nodeName === '#text' ? n.value : (n.childNodes ?? []).map(text).join(''));
  function walk(n) {
    if (n.tagName === 'h1') value.headings.push(text(n).replace(/\s+/g, ' ').trim());
    if (n.tagName === 'ng-doc-page') value.pages.push(text(n).replace(/\s+/g, ' ').trim());
    if (n.attrs?.some((a) => a.name === 'ngh')) value.hydration = true;
    const attrs = Object.fromEntries((n.attrs ?? []).map((a) => [a.name, a.value]));
    if (['script', 'img', 'source', 'video', 'audio'].includes(n.tagName) && attrs.src)
      value.assets.push(attrs.src);
    if (
      n.tagName === 'link' &&
      ['stylesheet', 'modulepreload', 'icon'].includes(attrs.rel) &&
      attrs.href
    )
      value.assets.push(attrs.href);
    for (const child of n.childNodes ?? []) walk(child);
  }
  walk(parse(html));
  return value;
}
try {
  // Serve a route's prerendered index.html at the route's own URL, as the server entry and static
  // hosts do; Vite's preview would answer an extensionless path with the root page instead.
  const prerendered = {
    name: 'serve-prerendered-routes',
    configurePreviewServer(previewServer) {
      previewServer.middlewares.use((req, _res, next) => {
        const target = new URL(req.url, 'http://audit.invalid');
        const underBase = target.pathname.startsWith(base);
        const relative = (
          underBase ? target.pathname.slice(base.length) : target.pathname.slice(1)
        ).replace(/\/$/, '');
        if (
          relative &&
          !path.extname(relative) &&
          existsSync(path.join(fixture, 'browser', relative, 'index.html'))
        )
          req.url = `${underBase ? base : '/'}${relative}/index.html${target.search}`;
        next();
      });
    },
  };
  server = await preview({
    configFile: false,
    root: fixture,
    base,
    plugins: [prerendered],
    build: { outDir: path.join(fixture, 'browser') },
    preview: { host: '127.0.0.1', port: 0 },
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const url = (route) => origin + base.replace(/\/$/, '') + route;
  // The product keeps the client shell as index.csr.html and prerenders `/` into index.html.
  const document = await readFile(path.join(fixture, 'browser/index.csr.html'), 'utf8');
  assert.ok(
    document.includes('<base href="/preview/"'),
    'The application plugin sets <base href> from the Vite base',
  );
  assert.ok(!document.includes('<ng-doc-page'), 'The shell is not a prerendered page');
  const bundle = path.join(fixture, 'server/server.mjs');
  summary.serverBundleSha256 = hash(await readFile(bundle));
  // The server bundle runs in production mode: in a development build Angular sets the global
  // ngDevMode while it bootstraps; with the build's define it never does.
  const ssr = await import(pathToFileURL(bundle).href);
  const rendered = await ssr.renderApplication(ssr.bootstrap, {
    document,
    url: url('/'),
    allowedHosts: ['127.0.0.1'],
  });
  assert.ok(
    rendered.includes('<ng-doc-page') || rendered.includes('ngh'),
    'The server bundle renders the application',
  );
  assert.equal(
    Boolean(globalThis.ngDevMode),
    false,
    'The server bundle runs Angular in development mode',
  );
  summary.checks.push({ name: 'server-bundle-production-mode' });
  const inventory = JSON.parse(
    await readFile(path.join(fixture, 'prerendered-routes.json'), 'utf8'),
  );
  assert.ok(inventory.routes.length > 0);
  assert.ok(
    inventory.routes.every(
      (item) =>
        item.file === (item.path === '/' ? 'index.html' : `${item.path.slice(1)}/index.html`),
    ),
    'Route files follow the route paths',
  );
  await writeFile(path.join(evidence, 'route-inventory.json'), JSON.stringify(inventory, null, 2));
  const actual = new Set(inventory.routes.map((r) => r.path));
  const expected = JSON.parse(
    await readFile(path.join(evidence, 'expected-inventory.json'), 'utf8'),
  );
  for (const item of expected.routes)
    assert.ok(
      actual.has('/' + item.path.replace(/^\//, '')),
      `Expected discovery route absent from Angular: ${item.path}`,
    );
  assert.ok(
    inventory.excluded.every(
      (item) => item.reason === 'wildcard' || (item.reason === 'shadowed' && actual.has(item.path)),
    ),
    'Unresolved current route must not be silently omitted',
  );
  const generated = JSON.parse(
    await readFile(path.join(evidence, 'generator-inventory.json'), 'utf8'),
  );
  for (const item of generated.descriptors)
    assert.ok(
      actual.has('/' + item.absoluteRoute.replace(/^\//, '')),
      `Missing emitted content route ${item.absoluteRoute}`,
    );
  for (const item of generated.api)
    assert.ok(
      actual.has('/' + item.route.replace(/^\//, '')),
      `Missing emitted API route ${item.route}`,
    );
  summary.checks.push({
    name: 'independent-runtime-routes-reconcile-current-generator',
    routes: actual.size,
    descriptors: generated.descriptors.length,
    api: generated.api.length,
    excluded: inventory.excluded,
  });
  const baselineFile = path.join(
    root,
    'docs/architecture/evidence/t14/main/recoverable-diagnostics/prerender-all/results.json',
  );
  const baselineBytes = await readFile(baselineFile);
  const baseline = JSON.parse(baselineBytes);
  assert.equal(baseline.status, 'passed');
  const oldRoutes = baseline.routes.map((r) => r.route);
  summary.baselineEvidence = { file: baselineFile, sha256: hash(baselineBytes) };
  // The baseline predates onlyForTags in the new engine (the legacy engine ignores it). Routes of
  // entries that this build's tags (the Vite mode, `production`) leave out, e.g. the Develop
  // sandbox (`onlyForTags: ['development']`), are expected removals: derived by the run's own
  // discovery runtime with and without the build's tags, and required to be gone. Any other
  // missing route still fails.
  const removals = await onlyForTagsRemovals({
    discoveryModule: path.join(fixture, 'expected-runtime/discovery/index.js'),
    request: generatorOptions,
    tags: ['production'],
  });
  // The baseline also predates the documentation rework, which has no redirects, and the
  // narrowing of the @ng-doc/builder API scope to its public interfaces. Guide routes of the removed
  // sections are expected removals and must be gone. The builder scope must route exactly
  // BUILDER_API_ROUTES, so only the baseline builder routes outside that list are excused. Any other
  // missing route still fails.
  const removedSection = (r) =>
    /^\/docs\/(getting-started|writing-content|api-documentation|customization|recipes)(\/|$)/.test(
      r,
    );
  const builderApi = (r) => /^\/docs\/api\/[^/]+\/builder\//.test(r);
  assert.deepEqual(
    [...actual].filter(removedSection),
    [],
    'A section removed by the docs rework is still routed',
  );
  assert.deepEqual(
    [...actual].filter(builderApi).sort(),
    BUILDER_API_ROUTES,
    'The @ng-doc/builder API scope does not route exactly its public interfaces',
  );
  assert.deepEqual(
    [...actual].filter((r) => REMOVED_API_ROUTES.includes(r)),
    [],
    'An API route of a declaration removed in 22.0.0 is still routed',
  );
  const gone = oldRoutes.filter((r) => !actual.has(r));
  const missing = partitionRemovedRoutes(
    removals,
    gone.filter(
      (r) =>
        !removedSection(r) &&
        !(builderApi(r) && !BUILDER_API_ROUTES.includes(r)) &&
        !REMOVED_API_ROUTES.includes(r),
    ),
  );
  summary.baseline = {
    count: oldRoutes.length,
    missing: missing.unexpected,
    removedByOnlyForTags: missing.expected,
    removedByDocsRework: gone.filter((r) => removedSection(r) || builderApi(r)),
    removedApi: gone.filter((r) => REMOVED_API_ROUTES.includes(r)),
    onlyForTags: removals,
    added: [...actual].filter((r) => !oldRoutes.includes(r)),
  };
  assert.deepEqual(summary.baseline.missing, [], 'Previously supported static routes disappeared');
  assert.deepEqual(
    [...actual].filter((r) => isOnlyForTagsRemoval(removals, r)),
    [],
    'A route of an entry that onlyForTags leaves out is still routed',
  );
  const assets = new Set();
  for (const route of [...actual].sort()) {
    const html = await readFile(
      path.join(fixture, 'browser', route === '/' ? 'index.html' : `${route.slice(1)}/index.html`),
      'utf8',
    );
    const current = structure(html);
    if (route === '/docs/api/classes/app/NgDocSearchEngine')
      assert.ok(
        !current.pages.some((body) => /\bCustomSearch\b/.test(body)),
        'Application test fixture leaked into the public API Extended by list',
      );
    assert.ok(current.hydration, `Missing hydration ${route}`);
    const expectedRoute = expected.routes.find((item) => item.path === route);
    const previous = baseline.routes.find((r) => r.route === route);
    const header =
      expectedRoute?.kind === 'guide-tab'
        ? expected.routes.find(
            (item) => item.kind === 'guide' && item.entryId === expectedRoute.entryId,
          )
        : expectedRoute;
    if (header && ['guide', 'api-declaration'].includes(header.kind)) {
      assert.ok(
        current.headings.includes(header.title.replace(/\s+/g, ' ').trim()),
        `Incorrect content header for ${route}: ${current.headings.join(', ')}`,
      );
      assert.ok(current.pages.length > 0, `Missing documentation page element for ${route}`);
      assert.ok(
        current.pages.some((body) => body.length > 0) ||
          previous?.pageText.every((body) => body.characters === 0),
        `Unexpected empty documentation body for ${route}`,
      );
    }
    for (const asset of current.assets) {
      const resolved = new URL(asset, origin + base);
      if (resolved.origin === origin) {
        assert.ok(resolved.pathname.startsWith(base), `Asset escaped deployment base: ${asset}`);
        assets.add(resolved.href);
      }
    }
    const bodyHashes = current.pages.map(hash);
    const record = {
      route,
      sha256: hash(html),
      bytes: Buffer.byteLength(html),
      headings: current.headings,
      pageCount: current.pages.length,
      pageHashes: bodyHashes,
      baseline: previous
        ? {
            headingsMatch: JSON.stringify(previous.headings) === JSON.stringify(current.headings),
            pageCountMatch: previous.pages === current.pages.length,
            bodyMatch:
              JSON.stringify(previous.pageText.map((x) => x.sha256)) === JSON.stringify(bodyHashes),
          }
        : null,
    };
    // Body differences are retained for source-change adjudication, never silently discarded.
    summary.routes.push(record);
    if (summary.routes.length % 100 === 0)
      console.log(`Audited ${summary.routes.length}/${actual.size}`);
  }
  assert.equal(summary.routes.length, actual.size);
  summary.checks.push({
    name: 'all-current-routes-prerendered-by-the-product',
    count: summary.routes.length,
  });
  const verifiedAssets = [];
  for (const asset of assets) {
    const response = await fetch(asset);
    assert.equal(response.status, 200, `Missing production asset: ${asset}`);
    assert.ok(
      !(response.headers.get('content-type') ?? '').includes('text/html'),
      `Asset resolved to SPA fallback: ${asset}`,
    );
    verifiedAssets.push({
      path: new URL(asset).pathname,
      sha256: hash(Buffer.from(await response.arrayBuffer())),
    });
  }
  summary.checks.push({
    name: 'all-prerendered-html-assets-served-under-base',
    assets: verifiedAssets,
  });
  const require = createRequire(import.meta.url);
  const { chromium } = require(
    process.env.PLAYWRIGHT_MODULE ??
      '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
  );
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(90000);
  page.on('pageerror', (e) => summary.errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') summary.errors.push(e.text());
  });
  // From the first parsed byte of every document: the longest page body and header text, and the
  // shortest ones seen after them, both as text and as rendered (innerText: what is visible, so a
  // hidden body counts as missing). Skipped hosts render again in the browser, and their content
  // must never disappear while that happens.
  await page.addInitScript(() => {
    const metrics = [
      ['page', 'ng-doc-page', 'textContent'],
      ['pageVisible', 'ng-doc-page', 'innerText'],
      ['header', 'ng-doc-page-header h1', 'textContent'],
      ['headerVisible', 'ng-doc-page-header h1', 'innerText'],
    ];
    const state = (globalThis.__ngDocContent = Object.fromEntries(
      metrics.map(([key]) => [key, { max: 0, min: Infinity }]),
    ));
    const text = (selector, property) =>
      Math.max(
        0,
        ...[...document.querySelectorAll(selector)].map(
          (element) => (element[property] ?? '').trim().length,
        ),
      );
    const sample = () => {
      for (const [key, selector, property] of metrics) {
        const value = text(selector, property);
        const entry = state[key];
        if (entry.max > 0) entry.min = Math.min(entry.min, value);
        entry.max = Math.max(entry.max, value);
      }
    };
    new MutationObserver(sample).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    document.addEventListener('DOMContentLoaded', () => {
      sample();
      state.atLoad = Object.fromEntries(
        metrics.map(([key, selector, property]) => [key, text(selector, property)]),
      );
    });
  });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) summary.errors.push(`${r.status()} ${r.url()}`);
  });
  for (const route of [
    '/docs/get-started/installation',
    '/docs/demos-and-playgrounds/demos',
    '/docs/api/classes/app/NgDocPageLinkComponent',
  ]) {
    const response = await page.goto(url(route));
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, base.replace(/\/$/, '') + route);
    assert.equal(await page.evaluate(() => !!globalThis.ngDevMode), false);
    if (route.endsWith('/demos')) {
      await page.getByRole('button', { name: 'Just a button', exact: true }).first().click();
      await page.getByText('Button was clicked!', { exact: true }).waitFor();
    }
    if (route.includes('/api/'))
      await page.getByRole('heading', { name: 'NgDocPageLinkComponent', exact: true }).waitFor();
    assert.ok((await page.locator('ng-doc-page').innerText()).length > 100);
    // Let the lazy route, its content module and the processors finish before reading the record:
    // the server-rendered copy is gone once the loaded content has rendered.
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => !document.querySelector('[data-ng-doc-hydration-snapshot]'));
    const content = await page.evaluate(() => globalThis.__ngDocContent);
    for (const key of ['page', 'pageVisible']) {
      assert.ok(
        content.atLoad[key] > 100,
        `${route}: the prerendered page body is missing at load (${key} ${content.atLoad[key]})`,
      );
      assert.ok(
        content[key].min > 100,
        `${route}: the page body disappeared after load (${key} ${content[key].min} characters)`,
      );
    }
    for (const key of ['header', 'headerVisible']) {
      assert.ok(
        content.atLoad[key] > 0,
        `${route}: the prerendered heading is missing at load (${key})`,
      );
      assert.ok(content[key].min > 0, `${route}: the page heading disappeared after load (${key})`);
    }
    summary.checks.push({ name: 'production-direct-url-hydration', route, content });
  }
  const themes = [];
  for (let i = 0; i < 3; i++) {
    await page.locator('ng-doc-theme-toggle button').click();
    themes.push(
      await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-theme'),
        background: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.body).color,
      })),
    );
  }
  assert.deepEqual(themes.map((x) => x.theme).sort(), [null, 'auto', 'dark'].sort());
  assert.notDeepEqual(
    themes.find((x) => x.theme === null),
    themes.find((x) => x.theme === 'dark'),
  );
  assert.ok(
    themes.find((x) => x.theme === null).background !==
      themes.find((x) => x.theme === 'dark').background ||
      themes.find((x) => x.theme === null).text !== themes.find((x) => x.theme === 'dark').text,
    'Theme toggle must change actual computed colors',
  );
  summary.checks.push({ name: 'production-themes', themes });
  // The search palette's rows are options, not links: activating one navigates through the router.
  // The row names its destination (data-ng-doc-url), which must be a guide record of the emitted
  // index; the click must land exactly there, under the base, and render that page.
  const searchRecords = JSON.parse(
    await readFile(path.join(fixture, 'browser/assets/ng-doc/indexes.json'), 'utf8'),
  );
  const headingBefore = (await page.locator('ng-doc-page-header h1').first().textContent()).trim();
  await page.locator('ng-doc-search .ng-doc-search-field').click();
  await page.locator('ng-doc-command-palette input[role=combobox]').fill('installation');
  const searchRow = page
    .locator('.ng-doc-command-palette-row[role=option][data-ng-doc-type=guide]')
    .first();
  await searchRow.waitFor();
  const rowUrl = await searchRow.getAttribute('data-ng-doc-url');
  assert.ok(rowUrl, 'A guide row names no destination');
  const [rowPath, rowFragment] = rowUrl.split('#');
  const record = searchRecords.find(
    (item) =>
      item.pageType === 'guide' &&
      `/${item.route.replace(/^\/+/, '')}` === rowPath &&
      (item.fragment || undefined) === (rowFragment || undefined),
  );
  assert.ok(record, `The search row ${rowUrl} matches no guide record of indexes.json`);
  const expectedLocation = base.replace(/\/$/, '') + rowUrl;
  await searchRow.click();
  await page.waitForURL(
    (target) => target.origin === origin && target.pathname + target.hash === expectedLocation,
  );
  await page.waitForFunction(
    ({ before, title }) => {
      const heading = document.querySelector('ng-doc-page-header h1');
      const value = heading?.textContent.trim();
      return value !== before && value === title;
    },
    { before: headingBefore, title: record.title },
  );
  summary.checks.push({
    name: 'production-http-search-and-result-navigation',
    location: expectedLocation,
    title: record.title,
  });
  assert.ok(
    !requests.some((r) => r.includes('@vite/client')),
    'Production requested development transport',
  );
  const indexes = await fetch(url('/assets/ng-doc/indexes.json'));
  assert.equal(indexes.status, 200);
  assert.deepEqual(
    await indexes.json(),
    JSON.parse(await readFile(path.join(fixture, 'browser/assets/ng-doc/indexes.json'), 'utf8')),
  );
  await page.screenshot({ path: path.join(evidence, 'production.png') });
  assert.deepEqual(summary.errors, []);
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  console.error = originalError;
  await browser?.close();
  if (server)
    await new Promise((resolve, reject) =>
      server.httpServer.close((e) => (e ? reject(e) : resolve())),
    );
  summary.browserClosed = !browser?.isConnected();
  summary.previewClosed = !server?.httpServer.listening;
  await writeFile(path.join(evidence, 'audit-results.json'), JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify({
      status: summary.status,
      routes: summary.routes.length,
      failure: summary.failure,
    }),
  );
}
