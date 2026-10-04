import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { getNgDocViteSsrRenderer } from '@ng-doc/builder/generator/vite/index.js';
import { createServer } from 'vite';

import { setup } from './vite.config.mjs';

const { config, ngDocPlugins } = setup('serve');
const errors = [];
const cleanupErrors = [];
let server;
let renderer;
let browser;
let launching;
let primaryError;
let stopping;
let cleanupChain = Promise.resolve();
let rejectStopped;
const stopped = new Promise((_, reject) => {
  rejectStopped = reject;
});
void stopped.catch(() => undefined);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const ensureRunning = () => {
  if (stopping) throw new Error(`Package consumer smoke interrupted by ${stopping}`);
};

async function ownedGroup(label, predicate, publish = true) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,command='], {
      encoding: 'utf8',
    });
    for (const row of rows.split('\n')) {
      const match = row.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (match && Number(match[2]) === process.pid && predicate(match[4])) {
        const group = Number(match[3]);
        if (publish) console.log(`NGDOC_OWNED ${group}`);
        return group;
      }
    }
    await wait(25);
  }
  throw new Error(`${label} process was not observed`);
}

function closeOwned() {
  cleanupChain = cleanupChain.then(async () => {
    if (!browser && launching) {
      try {
        browser = await launching;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    const currentBrowser = browser;
    const currentRenderer = renderer;
    browser = undefined;
    renderer = undefined;
    for (const result of await Promise.allSettled([
      Promise.resolve().then(() => currentBrowser?.close()),
      Promise.resolve().then(() => currentRenderer?.close()),
    ])) {
      if (result.status === 'rejected') cleanupErrors.push(result.reason);
    }
    const currentServer = server;
    server = undefined;
    const [serverResult] = await Promise.allSettled([
      Promise.resolve().then(() => currentServer?.close()),
    ]);
    if (serverResult.status === 'rejected') cleanupErrors.push(serverResult.reason);
  });
  return cleanupChain;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = signal;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    rejectStopped(new Error(`Package consumer smoke interrupted by ${signal}`));
    void closeOwned().catch((error) => cleanupErrors.push(error));
  });
}

try {
  server = await createServer({ ...config, server: { host: '127.0.0.1', port: 0 } });
  ensureRunning();
  await server.listen();
  ensureRunning();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const playwright = process.env.PLAYWRIGHT_MODULE;
  const chrome = process.env.CHROME_PATH;
  assert.ok(playwright, 'PLAYWRIGHT_MODULE is required');
  assert.ok(chrome, 'CHROME_PATH is required');
  const chromium = createRequire(import.meta.url)(playwright).chromium;
  launching = chromium.launch({ executablePath: chrome, headless: true });
  void launching.catch(() => undefined);
  const holdBeforePublication =
    process.env.NGDOC_PACKAGE_CONSUMER_HOLD === 'after-browser-before-publication';
  const browserGroup = await ownedGroup(
    'browser',
    (command) => command.includes('remote-debugging-pipe'),
    !holdBeforePublication,
  );
  if (holdBeforePublication) {
    const evidence = process.env.NGDOC_PACKAGE_CONSUMER_EVIDENCE;
    assert.ok(evidence, 'Evidence path is required for the interruption probe');
    await writeFile(
      `${evidence}/interrupt-ready.json`,
      `${JSON.stringify({ stage: 'after-browser-before-publication', browserGroup })}\n`,
    );
    await stopped;
  }
  browser = await launching;
  ensureRunning();
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (error) => {
    const item = { kind: 'pageerror', message: error.message };
    errors.push(item);
    console.log(`NGDOC_BROWSER_ERROR ${JSON.stringify(item)}`);
  });
  page.on('console', (entry) => {
    if (entry.type() !== 'error') return;
    const item = { kind: 'console', message: entry.text(), url: entry.location().url };
    errors.push(item);
    console.log(`NGDOC_BROWSER_ERROR ${JSON.stringify(item)}`);
  });
  page.on('requestfailed', (request) => {
    const item = {
      kind: 'requestfailed',
      message: `${request.url()} ${request.failure()?.errorText ?? ''}`,
    };
    errors.push(item);
    console.log(`NGDOC_BROWSER_ERROR ${JSON.stringify(item)}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const item = { kind: 'http', message: `${response.status()} ${response.url()}` };
    errors.push(item);
    console.log(`NGDOC_BROWSER_ERROR ${JSON.stringify(item)}`);
  });
  const response = await page.goto(`${origin}/preview/docs/packed`);
  assert.equal(response.status(), 200);
  await page.locator('body[data-bootstrapped="yes"]').waitFor();
  try {
    await page.getByText('External tarball content two.', { exact: true }).waitFor();
  } catch (error) {
    const index = await page.request.get(`${origin}/preview/assets/ng-doc/indexes.json`);
    const diagnostic = {
      url: page.url(),
      body: (await page.locator('body').innerText()).slice(0, 8_000),
      errors,
      index: {
        status: index.status(),
        body: (await index.text()).slice(0, 8_000),
      },
    };
    console.log(`NGDOC_DIAGNOSTIC ${JSON.stringify(diagnostic)}`);
    const evidence = process.env.NGDOC_PACKAGE_CONSUMER_EVIDENCE;
    if (evidence)
      await page.screenshot({ path: `${evidence}/browser-failure.png`, fullPage: true });
    throw error;
  }
  // The guide opens the demo with `expanded`, which shows its source file first and keeps the
  // preview in a hidden tab panel until the Preview tab is chosen.
  await page.locator('.ng-doc-demo-source').waitFor();
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  const button = page.locator('[data-testid="packed-demo"]');
  await button.waitFor();
  assert.equal(
    await button.evaluate((element) => getComputedStyle(element).backgroundColor),
    'rgb(12, 34, 56)',
  );
  await button.click();
  await page.getByText('Packed demo 1', { exact: true }).waitFor();
  const asset = await page.request.get(`${origin}/preview/packed.svg`);
  assert.equal(asset.status(), 200);
  renderer = getNgDocViteSsrRenderer(ngDocPlugins, { entry: '/src/ssr-render.ts' });
  const rendering = renderer.render({
    document:
      '<!doctype html><html><head><base href="/preview/"></head><body><app-root></app-root></body></html>',
    url: `${origin}/preview/docs/packed`,
  });
  void rendering.catch(() => undefined);
  const rendererGroup = await ownedGroup('renderer', (command) =>
    command.includes('ssr-renderer-entry'),
  );
  const html = await rendering;
  assert.match(html, /External tarball content two\./);
  assert.match(html, /Packed demo/);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      origin,
      browser: {
        body: true,
        demoStyle: 'rgb(12, 34, 56)',
        demoCount: 1,
        assetStatus: 200,
        browserGroup,
      },
      ssr: { bytes: html.length, marker: true, rendererGroup },
      errors,
    }),
  );
} catch (error) {
  primaryError = error;
}
await closeOwned();
if (cleanupErrors.length)
  throw new AggregateError(
    primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
    'Package consumer smoke cleanup failed',
  );
if (primaryError) throw primaryError;
