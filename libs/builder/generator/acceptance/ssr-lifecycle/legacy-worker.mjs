import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  changedColor,
  healthyMarker,
  host,
  initialColor,
  otherRoute,
  prepareFixture,
  route,
} from './fixture.mjs';

const [root, repository, evidence] = process.argv.slice(2);
assert.ok(root && repository && evidence, 'fixture, repository and evidence paths are required');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorText = (error) =>
  error instanceof Error ? error.stack ?? error.message : String(error);
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');

async function eventually(label, read, accept, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await read();
      if (accept(latest)) return latest;
    } catch (error) {
      latest = { transientReadError: errorText(error) };
    }
    await wait(25);
  }
  throw new Error(`Timed out waiting for ${label}; latest=${JSON.stringify(latest)}`);
}

const report = {
  status: 'running',
  node: process.version,
  checks: [],
  events: [],
  diagnostics: [],
  browserErrors: [],
};
let server, browserOwner, browser;
try {
  await prepareFixture(root, repository);
  const [{ createLogger, createServer }, { chromium }] = await Promise.all([
    import('vite'),
    import(
      '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
    ),
  ]);
  const logger = createLogger('info', { prefix: '[ssr-lifecycle]' });
  for (const level of ['info', 'warn', 'error']) {
    const original = logger[level].bind(logger);
    logger[level] = (text, options) => {
      report.diagnostics.push({ at: Date.now(), level, text: String(text) });
      original(text, options);
    };
  }
  const observer = {
    name: 'ssr-lifecycle-observer',
    hotUpdate: {
      order: 'post',
      handler(context) {
        const relative = path.relative(root, context.file);
        if (
          (relative.startsWith(`src${path.sep}`) &&
            /\.(?:[cm]?ts|s[ac]ss|css|html)$/.test(relative)) ||
          relative === 'docs/outer/inner/guide/guide.md.nunj' ||
          relative === 'external/ssr-lifecycle-missing.nunj'
        )
          report.events.push({
            at: Date.now(),
            kind: 'hot-post',
            type: context.type,
            file: relative,
            modules: context.modules.length,
          });
      },
    },
    transform(code, id) {
      if (/(?:demo|theme)\.scss/.test(id))
        report.events.push({ at: Date.now(), kind: 'style-transform', id, bytes: code.length });
      return null;
    },
  };
  const setup = await host(root, repository, observer, logger, null);
  server = await createServer(setup.config);
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  report.origin = origin;
  browserOwner = await chromium.launchServer({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  process.send?.({ kind: 'owned-browser', pid: browserOwner.process().pid });
  browser = await chromium.connect(browserOwner.wsEndpoint());
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) =>
    report.browserErrors.push({ at: Date.now(), kind: 'pageerror', message: error.message }),
  );
  page.on('console', (entry) => {
    if (entry.type() === 'error')
      report.browserErrors.push({ at: Date.now(), kind: 'console', message: entry.text() });
  });
  await page.goto(`${origin}${route}`);
  await page.locator('body[data-bootstrapped="yes"]').waitFor();
  await page.getByText(healthyMarker, { exact: false }).waitFor();
  const markers = page.getByTestId('ts-marker');
  await eventually(
    'both initial demo markers',
    () => markers.allTextContents(),
    (values) => values.length === 2 && values.every((value) => value === 'TS_ONE'),
  );
  const color = () =>
    markers.first().evaluate((element) => getComputedStyle(element).backgroundColor);
  await eventually('initial external component style', color, (value) => value === initialColor);
  report.checks.push('Browser compiled the real external SCSS resource before SSR');

  const nativePromise = globalThis.Promise;
  // Vite's generic in-process SSR import (the D-only NgDoc loader is gone); the isolated renderer is worker.mjs.
  const loadServer = () => server.ssrLoadModule('/src/main.server.ts');
  const firstModule = await loadServer();
  const first = await firstModule.renderRoute(`http://localhost${route}`);
  assert.match(first, new RegExp(healthyMarker));
  assert.match(first, /TS_ONE/);
  report.zone = {
    globalPromise: globalThis.Promise.name,
    changed: globalThis.Promise !== nativePromise,
    nativeAsyncUsesCurrent: (async () => undefined)() instanceof globalThis.Promise,
    nativeAsyncUsesOriginal: (async () => undefined)() instanceof nativePromise,
  };
  assert.equal(report.zone.changed, true);
  report.checks.push(
    'Vite in-process SSR import rendered the route and installed Zone in this same process',
  );

  const other = await firstModule.renderRoute(`http://localhost${otherRoute}`);
  const again = await firstModule.renderRoute(`http://localhost${route}`);
  assert.match(other, /<title>Other page<\/title>/);
  assert.doesNotMatch(other, /<title>Content boundary ☃<\/title>/);
  assert.match(again, /<title>Content boundary ☃<\/title>/);
  assert.doesNotMatch(again, /<title>Other page<\/title>/);
  report.requests = { first: first.length, other: other.length, again: again.length };
  report.checks.push('Successive same-runner SSR requests retain route-local rendered content');

  const theme = path.join(root, 'src/_theme.scss');
  const beforeDiagnostics = report.diagnostics.length;
  const beforeErrors = report.browserErrors.length;
  await writeFile(theme, `$color:${changedColor};\n`);
  const boundary = await eventually(
    'post-SSR Sass boundary',
    async () =>
      [...report.diagnostics.slice(beforeDiagnostics), ...report.browserErrors.slice(beforeErrors)]
        .map((item) => item.text ?? item.message)
        .join('\n'),
    (value) =>
      /%5Bobject%20Promise%5D|\[object Promise\]|importer must return an absolute URL/i.test(value),
  );
  const colorAfterFailure = await color();
  assert.notEqual(colorAfterFailure, changedColor);
  report.scssBoundary = { message: boundary, colorAfterFailure };
  const afterFailure = await (await loadServer()).renderRoute(`http://localhost${route}`);
  assert.match(afterFailure, new RegExp(healthyMarker));
  report.checks.push(
    'Post-SSR external SCSS HMR reproduces the Zone/Sass Promise boundary while SSR remains callable',
  );
  report.status = 'reproduced-boundary';
} catch (error) {
  report.status = 'failed';
  report.error = errorText(error);
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
  } catch (error) {
    report.cleanupError = errorText(error);
  }
  try {
    if (browserOwner) await browserOwner.close();
  } catch (error) {
    report.cleanupError ??= errorText(error);
  }
  try {
    if (server) await server.close();
  } catch (error) {
    report.cleanupError ??= errorText(error);
  }
  report.cleanup = {
    browserClosed: !browser?.isConnected(),
    serverClosed: !server?.httpServer?.listening,
  };
  await save(path.join(evidence, 'results.json'), report);
  console.log(JSON.stringify(report));
}
