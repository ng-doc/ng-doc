import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { guideRoute, bodyReplacement } from './fixture.mjs';

// No Vite, Angular, compiler or Zone imports: the SSR document was produced by
// the preceding fresh AOT child. This child serves immutable build files only.
export async function checkHydration(root, evidence, report) {
  const { chromium } = await import(
    '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  const html = await readFile(path.join(root, 'hydration.html'), 'utf8');
  assert.match(html, /ngh=/);
  assert.match(html, /id="delayed-section"/);
  assert.ok(html.includes(bodyReplacement));
  const assets = path.join(root, 'browser');
  const payloadChunks = [];
  for (const name of await readdir(assets, { recursive: true })) {
    if (
      name.endsWith('.js') &&
      (await readFile(path.join(assets, name), 'utf8')).includes('data-native-fragment-spacer')
    )
      payloadChunks.push(name);
  }
  assert.equal(
    payloadChunks.length,
    1,
    'One emitted production payload chunk must contain the actual guide spacer',
  );
  report.documentSha256 = createHash('sha256').update(html).digest('hex');
  report.payloadChunk = payloadChunks[0];
  const errors = [];
  let browser,
    owner,
    release = () => undefined,
    closing = false;
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === guideRoute) {
        res.writeHead(200, { 'content-type': 'text/html' }).end(html);
        return;
      }
      if (!pathname.startsWith('/preview/') || pathname.includes('\\'))
        throw new Error('Unowned request path: ' + pathname);
      const relative = pathname.slice('/preview/'.length);
      const file = path.resolve(assets, relative);
      if (!file.startsWith(assets + path.sep)) throw new Error('Outside static root: ' + pathname);
      const mime = file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.svg')
            ? 'image/svg+xml'
            : file.endsWith('.json')
              ? 'application/json'
              : 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime }).end(await readFile(file));
    } catch (error) {
      errors.push({ kind: 'server', url: req.url, message: String(error) });
      res.writeHead(404).end();
    }
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    owner = await chromium.launchServer({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const pid = owner.process().pid;
    const { stdout } = await promisify(execFile)('/bin/ps', ['-o', 'pgid=', '-p', String(pid)]);
    assert.equal(Number(stdout.trim()), pid);
    process.send?.({ kind: 'owned-browser', pid });
    browser = await chromium.connect(owner.wsEndpoint());
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    page.on('pageerror', (error) => errors.push({ kind: 'pageerror', message: error.message }));
    page.on('console', (event) => {
      if (event.type() === 'error') errors.push({ kind: 'console', message: event.text() });
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        errors.push({ kind: 'http', url: response.url(), status: response.status() });
    });
    let enter;
    const entered = new Promise((resolve) => (enter = resolve));
    const gate = new Promise((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === '/preview/' + payloadChunks[0],
      async (route) => {
        enter();
        try {
          await gate;
          await route.continue();
        } catch (error) {
          if (!closing) errors.push({ kind: 'route', message: String(error) });
        }
      },
    );
    await page.goto(`http://127.0.0.1:${server.address().port}` + guideRoute + '#delayed-section', {
      waitUntil: 'domcontentloaded',
    });
    let timer;
    try {
      await Promise.race([
        entered,
        new Promise(
          (_, reject) =>
            (timer = setTimeout(
              () => reject(new Error('Hydration did not request the actual payload chunk')),
              30_000,
            )),
        ),
      ]);
    } finally {
      clearTimeout(timer);
    }
    report.held = await measure(page);
    release();
    await page.locator('body[data-bootstrapped="yes"]').waitFor();
    await page.locator('#delayed-section').waitFor();
    await page.locator('ng-doc-toc a[href*="delayed-section"]').waitFor();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    report.hydrated = await measure(page);
    await page.screenshot({ path: path.join(evidence, 'hydration-fragment.png') });
    assert.ok(
      report.hydrated.scrollY > 600,
      'Hydrated direct fragment must be visible after payload processing',
    );
    assert.ok(
      report.hydrated.top >= 0 && report.hydrated.top < 160,
      'Hydrated target must reach the viewport offset',
    );
    const demo = page.locator('ng-doc-demo [data-testid="counter"]').first();
    await demo.click();
    await demo.getByText('Demo 3', { exact: true }).waitFor();
    assert.equal(
      await page.locator('ng-doc-demo [data-testid="scope"]').first().innerText(),
      'inner-provider',
    );
    assert.deepEqual(errors, []);
    report.checks.push(
      'Actual AOT SSR HTML hydrates with production browser chunks under non-root base; a held real payload settles to the below-fold fragment and hydrated demo/provider interaction works',
    );
  } finally {
    closing = true;
    release();
    if (browser) await browser.close();
    if (owner) await owner.close();
    await new Promise((resolve) => server.close(resolve));
    report.errors = errors;
    report.cleanup = { browserClosed: !browser?.isConnected(), serverClosed: !server.listening };
  }
}
async function measure(page) {
  return page.evaluate(() => ({
    scrollY: window.scrollY,
    top: document.getElementById('delayed-section')?.getBoundingClientRect().top ?? null,
    targetExists: !!document.getElementById('delayed-section'),
    events: globalThis.__nativeScrollEvents ?? [],
    base: document.querySelector('base')?.getAttribute('href'),
    url: location.href,
  }));
}
