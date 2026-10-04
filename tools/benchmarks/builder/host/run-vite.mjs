import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from 'vite';
import { viteConfiguration } from './vite.mjs';

const require = createRequire(import.meta.url);
const spec = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { root, packages, manifest } = JSON.parse(
  await readFile(path.join(spec.root, 'preparation.json'), 'utf8'),
);
const send = (event) => process.send?.(event);
let server, browserOwner, browser;
const errors = [];
const controller = new AbortController();
const stop = () => controller.abort(new Error('Host interrupted'));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
const until = async (fn, description) => {
  const limit = performance.now() + spec.readinessTimeoutMs;
  while (performance.now() < limit) {
    controller.signal.throwIfAborted();
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
};
try {
  server = await createServer(await viteConfiguration({ root, packages, mode: spec.mode }));
  await server.listen();
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  send({ type: 'milestone', name: 'listening', origin });
  const { chromium } = require(spec.playwrightModule);
  browserOwner = await chromium.launchServer({ executablePath: spec.chromePath, headless: true });
  await new Promise((resolve, reject) => {
    const id = 'browser';
    const timer = setTimeout(() => {
      process.off('message', receive);
      reject(new Error('Browser ownership acknowledgement timed out'));
    }, 5000);
    const receive = (event) => {
      if (event?.type === 'owner-accepted' && event.id === id) {
        clearTimeout(timer);
        process.off('message', receive);
        resolve();
      }
    };
    process.on('message', receive);
    send({ type: 'owner', id, pid: browserOwner.process().pid });
  });
  browser = await chromium.connect(browserOwner.wsEndpoint());
  const page = await browser.newPage();
  page.setDefaultTimeout(spec.readinessTimeoutMs);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(origin + manifest.foreground.route, { waitUntil: 'domcontentloaded' });
  await page.getByText(manifest.foreground.marker, { exact: false }).first().waitFor();
  await page.getByTestId(manifest.foreground.demoButtonTestId).click();
  await until(
    async () =>
      (await page.getByTestId(manifest.foreground.demoCountTestId).textContent())?.trim() === '1',
    'interactive demo',
  );
  assert.deepEqual(errors, []);
  send({ type: 'milestone', name: 'foreground' });
  // Connect the actual application's search service; HTTP snapshots alone need
  // not request background realization and cannot stand in for the UI lifecycle.
  const connect = page.getByTestId('connect-index');
  if (await connect.count()) await connect.click();
  const asset = async (name) => {
    const response = await fetch(`${origin}/preview/assets/ng-doc/${name}`, {
      signal: controller.signal,
    });
    assert.equal(response.status, 200, name);
    return {
      state: response.headers.get('x-ngdoc-content-state'),
      revision: response.headers.get('x-ngdoc-content-revision'),
      value: await response.json(),
    };
  };
  let lastProgress;
  const indexes = await until(async () => {
    const value = await asset('indexes.json');
    const ui = await page.getByTestId('index-state').evaluateAll((nodes) =>
      nodes.map((node) => ({
        state: node.getAttribute('data-state'),
        ready: node.getAttribute('data-ready'),
        total: node.getAttribute('data-total'),
      })),
    );
    const progress = JSON.stringify({
      state: value.state,
      revision: value.revision,
      rows: value.value.length,
      ui,
    });
    if (progress !== lastProgress) {
      send({ type: 'index-progress', ...JSON.parse(progress) });
      lastProgress = progress;
    }
    if (value.state === 'failed') throw new Error('Index generation failed');
    return spec.mode === 'c-d' ? value.state === 'complete' && value : value;
  }, 'complete search index');
  const keywords = await asset('keywords.json');
  if (spec.mode === 'c-d') {
    assert.equal(keywords.state, 'complete');
    assert.equal(keywords.revision, indexes.revision);
  }
  assert.ok(Array.isArray(indexes.value) && indexes.value.length >= manifest.guides);
  for (const keyword of manifest.expected.guideKeywords)
    assert.ok(JSON.stringify(keywords.value).includes(keyword), `Missing ${keyword}`);
  send({ type: 'milestone', name: 'index', rows: indexes.value.length });
  assert.deepEqual(errors, []);
  send({ type: 'milestone', name: 'full' });
  send({
    type: 'product-result',
    passed: true,
    oracle: 'startup-pilot-only',
    guideKeywords: manifest.expected.guideKeywords.length,
    searchRows: indexes.value.length,
    errors,
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  send({ type: 'product-result', passed: false, error: String(error), errors });
} finally {
  const outcomes = await Promise.allSettled([
    Promise.resolve().then(() => browser?.close()),
    Promise.resolve().then(() => browserOwner?.close()),
    Promise.resolve().then(() => server?.close()),
  ]);
  for (const outcome of outcomes)
    if (outcome.status === 'rejected') {
      console.error(outcome.reason);
      process.exitCode = 1;
    }
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  if (process.connected) process.disconnect();
}
