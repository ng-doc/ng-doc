import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hostConfig, guideRoute } from './fixture.mjs';

export async function checkFragment(root, repository, evidence, report) {
  const [{ createServer }, { chromium }] = await Promise.all([
    import('vite'),
    import(
      '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
    ),
  ]);
  let server,
    owner,
    browser,
    release = () => undefined,
    closing = false;
  const errors = [];
  try {
    server = await createServer(await hostConfig(root, repository));
    await server.listen();
    const manifest = JSON.parse(
      await readFile(path.join(root, 'generated/.ng-doc-output-manifest.json'), 'utf8'),
    );
    let bodyPath;
    for (const file of manifest.files)
      if (
        file.path.endsWith('.content.mjs') &&
        (await readFile(path.join(root, 'generated', file.path), 'utf8')).includes(
          'data-native-fragment-spacer',
        )
      )
        bodyPath = file.path;
    assert.ok(bodyPath);
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
      (url) => url.pathname.endsWith('/' + bodyPath),
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
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    await page.goto(origin + guideRoute + '#delayed-section', { waitUntil: 'domcontentloaded' });
    let entryTimer;
    try {
      await Promise.race([
        entered,
        new Promise((_, reject) => {
          entryTimer = setTimeout(
            () => reject(new Error('Content request did not reach the explicit gate')),
            30_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(entryTimer);
    }
    await page.waitForFunction(() =>
      globalThis.__nativeScrollEvents?.some(
        (event) => event.anchor === 'delayed-section' && !event.targetExists,
      ),
    );
    report.beforeRelease = await page.evaluate(() => ({
      scrollY: window.scrollY,
      events: globalThis.__nativeScrollEvents,
      anchorCalls: globalThis.__nativeAnchorCalls,
      positionCalls: globalThis.__nativePositionCalls,
      targetExists: !!document.getElementById('delayed-section'),
    }));
    assert.equal(report.beforeRelease.targetExists, false);
    release();
    await page.locator('#delayed-section').waitFor();
    await page.locator('ng-doc-toc a[href*="delayed-section"]').waitFor();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    report.afterRelease = await page.evaluate(() => ({
      scrollY: window.scrollY,
      top: document.getElementById('delayed-section').getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      maxScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      events: globalThis.__nativeScrollEvents,
      anchorCalls: globalThis.__nativeAnchorCalls,
      positionCalls: globalThis.__nativePositionCalls,
      url: location.href,
    }));
    await page.screenshot({ path: path.join(evidence, 'fragment.png'), fullPage: false });
    assert.ok(
      report.afterRelease.scrollY > 600,
      'Delayed direct fragment must scroll after content/TOC processing',
    );
    assert.ok(
      report.afterRelease.top >= 0 && report.afterRelease.top < 160,
      'Target must reach viewport at the configured 120px offset',
    );
    report.checks.push(
      'Direct initial fragment scrolls to a genuinely below-fold heading after a held real content module is released and processed',
    );

    // Real popstate restoration must win over an old fragment in the same app.
    await page.evaluate(() => window.scrollTo(0, 450));
    await page.waitForFunction(() => Math.abs(window.scrollY - 450) < 2);
    await page.locator('ng-doc-sidebar a').filter({ hasText: 'Other page' }).first().click();
    await page.waitForURL(/other/);
    await page
      .locator('ng-doc-page')
      .getByRole('heading', { name: 'Other page', exact: true })
      .waitFor();
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.locator('#delayed-section').waitFor();
    await page.waitForFunction(() =>
      globalThis.__nativeScrollEvents?.some((event) => event.position?.[1] === 450),
    );
    await page.waitForFunction(() => Math.abs(window.scrollY - 450) < 2);
    await frames(page);
    report.restoredPosition = await measure(page);
    assert.ok(
      Math.abs(report.restoredPosition.scrollY - 450) < 2,
      'Popstate position must win over delayed fragment replay',
    );
    report.checks.push(
      'Real back navigation restores its stored position instead of replaying the old fragment',
    );
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await page.waitForURL(/other/);
    await page
      .locator('ng-doc-page')
      .getByRole('heading', { name: 'Other page', exact: true })
      .waitFor();
    // A partial native restoration is router movement, not subsequent user intent.
    const priorPositions = await page.evaluate(() => globalThis.__nativePositionCalls?.length ?? 0);
    const disableNativeAnchoring = process.env.NGDOC_NATIVE_DISABLE_SCROLL_ANCHOR === '1';
    if (disableNativeAnchoring)
      report.diagnostic = {
        scope: 'ng-doc-page-wrapper',
        overflowAnchor: 'none',
        purpose: 'isolate native anchoring only; not product acceptance',
      };
    await page.addStyleTag({
      content:
        'body {min-height:920px !important;}' +
        (disableNativeAnchoring ? 'ng-doc-page-wrapper {overflow-anchor:none !important;}' : ''),
    });
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.locator('#delayed-section').waitFor();
    await page.waitForFunction(() => Math.abs(window.scrollY - 450) < 2);
    await frames(page);
    report.partialRestoration = await measure(page);
    const partialCalls = report.partialRestoration.positionCalls.slice(priorPositions);
    assert.ok(
      partialCalls.some(
        (call) =>
          call.position[1] === 450 &&
          call.before.maxScroll > 0 &&
          call.before.maxScroll < 450 &&
          call.after.scrollY > 0 &&
          call.after.scrollY < 450,
      ),
      'Real initial restoration must clamp to a nonzero partial range',
    );
    assert.ok(
      Math.abs(report.partialRestoration.scrollY - 450) < 2,
      'A partial router movement must not cancel the eventual saved-position restoration',
    );
    report.checks.push(
      'Back restoration retries after a real nonzero partial browser clamp without misclassifying router movement as user intent',
    );
    if (!disableNativeAnchoring) {
      assert.ok(
        partialCalls.some(
          (call) =>
            call.position[1] === 450 &&
            call.before.scrollY === 200 &&
            call.before.overflowAnchorValue === 'none',
        ),
        'Actual runtime wrapper lease must be held during the eventual restoration',
      );
      assert.equal(
        report.partialRestoration.overflowAnchorValue,
        '',
        'Runtime wrapper lease must restore the absent inline property after successful replay',
      );
      assert.equal(report.partialRestoration.overflowAnchorPriority, '');
      report.checks.push(
        'Actual pending wrapper inline overflow-anchor lease is present during restoration and removed after completion',
      );
    }

    await page.close();

    // API body can finish before its independently loaded generated header.
    const { apiRoute } = JSON.parse(await readFile(path.join(root, 'native-routes.json'), 'utf8'));
    const headerPath = manifest.files.find((file) =>
      file.path.endsWith('/BoundaryApi/page.content.mjs'),
    )?.path;
    assert.ok(headerPath, 'Use the actual independently emitted API header payload');
    const headerPage = await browser.newPage();
    headerPage.setDefaultTimeout(30_000);
    headerPage.on('pageerror', (error) =>
      errors.push({ kind: 'pageerror', mode: 'header', message: error.message }),
    );
    headerPage.on('console', (event) => {
      if (event.type() === 'error')
        errors.push({ kind: 'console', mode: 'header', message: event.text() });
    });
    headerPage.on('response', (response) => {
      if (response.status() >= 400)
        errors.push({
          kind: 'http',
          mode: 'header',
          url: response.url(),
          status: response.status(),
        });
    });
    let headerEnter;
    const headerEntered = new Promise((resolve) => (headerEnter = resolve));
    const headerGate = new Promise((resolve) => (release = resolve));
    await headerPage.route(
      (url) => url.pathname.endsWith('/' + headerPath),
      async (route) => {
        headerEnter();
        try {
          await headerGate;
          await route.continue();
        } catch (error) {
          if (!closing) errors.push({ kind: 'route', mode: 'header', message: String(error) });
        }
      },
    );
    await headerPage.goto(origin + apiRoute + '#boundaryapi', { waitUntil: 'domcontentloaded' });
    await bounded(headerEntered, 'API header request');
    await headerPage.addStyleTag({
      content:
        'ng-doc-page-header {display:block;padding-top:1600px !important;padding-bottom:1000px !important;}',
    });
    await headerPage
      .locator('ng-doc-page')
      .getByText('Boundary API description.', { exact: false })
      .waitFor();
    await headerPage.waitForFunction(() =>
      globalThis.__nativeScrollEvents?.some(
        (event) => event.anchor === 'boundaryapi' && !event.targetExists,
      ),
    );
    report.headerBefore = await targetMeasure(headerPage, 'boundaryapi');
    assert.equal(report.headerBefore.targetExists, false);
    release();
    await headerPage.locator('ng-doc-page-header #boundaryapi').waitFor();
    await frames(headerPage);
    report.headerAfter = await targetMeasure(headerPage, 'boundaryapi');
    assert.ok(
      report.headerAfter.scrollY > 600,
      'Held generated header must replay its fragment after the body already finished',
    );
    assert.ok(
      report.headerAfter.top >= 0 && report.headerAfter.top < 160,
      'Header target must reach the configured offset',
    );
    report.checks.push(
      'A real fast API body does not consume the fragment intended for its independently held generated header',
    );
    await headerPage.close();

    report.guards = [];
    for (const mode of ['disabled', 'user-scroll', 'user-wheel-unscrollable']) {
      const guarded = await browser.newPage();
      guarded.setDefaultTimeout(30_000);
      guarded.on('pageerror', (error) =>
        errors.push({ kind: 'pageerror', mode, message: error.message }),
      );
      guarded.on('console', (event) => {
        if (event.type() === 'error') errors.push({ kind: 'console', mode, message: event.text() });
      });
      guarded.on('response', (response) => {
        if (response.status() >= 400)
          errors.push({ kind: 'http', mode, url: response.url(), status: response.status() });
      });
      let enteredResolve;
      const requestEntered = new Promise((resolve) => (enteredResolve = resolve));
      const contentGate = new Promise((resolve) => (release = resolve));
      await guarded.route(
        (url) => url.pathname.endsWith('/' + bodyPath),
        async (route) => {
          enteredResolve();
          try {
            await contentGate;
            await route.continue();
          } catch (error) {
            if (!closing) errors.push({ kind: 'route', mode, message: String(error) });
          }
        },
      );
      await guarded.goto(
        origin +
          guideRoute +
          (mode === 'disabled' ? '?native-anchor-disabled' : '') +
          '#delayed-section',
        { waitUntil: 'domcontentloaded' },
      );
      await bounded(requestEntered, 'guard content request: ' + mode);
      await guarded.waitForFunction(() =>
        globalThis.__nativeScrollEvents?.some(
          (event) => event.anchor === 'delayed-section' && !event.targetExists,
        ),
      );
      let expectedY = 0;
      if (mode === 'user-scroll') {
        // The fixture supplies scrollable space before the payload exists; the
        // input is an actual browser wheel event, not a fabricated Router event.
        await guarded.addStyleTag({ content: 'body { min-height: 4000px !important; }' });
        await guarded.mouse.move(900, 500);
        await guarded.mouse.wheel(0, 500);
        await guarded.waitForFunction(() => window.scrollY > 300);
        await frames(guarded);
        expectedY = await guarded.evaluate(() => window.scrollY);
      }
      if (mode === 'user-wheel-unscrollable') {
        assert.equal(
          await guarded.evaluate(
            () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
          ),
          0,
          'Wheel guard must be exercised at maxScroll0',
        );
        await guarded.mouse.move(900, 500);
        await guarded.mouse.wheel(0, 500);
        await guarded.waitForFunction(() =>
          globalThis.__nativeWheelEvents?.some(
            (event) => event.trusted && event.deltaY > 0 && event.maxScroll === 0,
          ),
        );
        assert.equal(await guarded.evaluate(() => window.scrollY), 0);
      }
      const before = await measure(guarded);
      assert.equal(before.targetExists, false);
      release();
      await guarded.locator('#delayed-section').waitFor();
      await guarded.locator('ng-doc-toc a[href*="delayed-section"]').waitFor();
      await frames(guarded);
      const after = await measure(guarded);
      report.guards.push({ mode, before, after, expectedY });
      if (mode === 'user-wheel-unscrollable') {
        assert.ok(
          before.wheelEvents?.some(
            (event) => event.trusted && event.deltaY > 0 && event.maxScroll === 0,
          ),
          'Capture the actual trusted gesture at zero range',
        );
        assert.equal(
          (after.anchorCalls ?? []).length,
          (before.anchorCalls ?? []).length,
          'No late anchor call may override trusted wheel intent',
        );
        assert.equal(
          (after.positionCalls ?? []).length,
          (before.positionCalls ?? []).length,
          'No late position call may override trusted wheel intent',
        );
      } else {
        assert.ok(
          Math.abs(after.scrollY - expectedY) < 2,
          mode + ': content completion must preserve position',
        );
      }
      assert.equal(
        after.overflowAnchorValue,
        '',
        'Cancelled/disabled anchor intent must leave no inline wrapper lease',
      );

      assert.ok(
        after.top > after.viewportHeight,
        mode + ': must not jump to the below-fold fragment',
      );
      report.checks.push(
        mode === 'disabled'
          ? 'Explicitly disabled NgDoc content anchor scrolling preserves the initial position despite Angular anchor scrolling being enabled'
          : mode === 'user-wheel-unscrollable'
            ? 'Trusted wheel input at maxScroll0 cancels a late anchor jump even without any viewport movement'
            : 'Actual user wheel scrolling while content is held prevents a late anchor jump',
      );
      await guarded.close();
    }
    assert.deepEqual(errors, []);
  } catch (error) {
    report.failurePages = [];
    for (const active of browser?.contexts().flatMap((context) => context.pages()) ?? []) {
      try {
        report.failurePages.push(await measure(active));
        await active.screenshot({
          path: path.join(evidence, 'fragment-failure-' + report.failurePages.length + '.png'),
        });
      } catch (captureError) {
        report.failurePages.push({ captureError: String(captureError) });
      }
    }
    throw error;
  } finally {
    closing = true;
    release();
    if (browser) await browser.close();
    if (owner) await owner.close();
    if (server) await server.close();
    report.errors = errors;
    report.cleanup = {
      browserClosed: !browser?.isConnected(),
      serverClosed: !server?.httpServer?.listening,
    };
  }
}

async function frames(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
async function measure(page) {
  return page.evaluate(() => ({
    scrollY: window.scrollY,
    targetExists: !!document.getElementById('delayed-section'),
    top: document.getElementById('delayed-section')?.getBoundingClientRect().top ?? null,
    viewportHeight: window.innerHeight,
    maxScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    wheelEvents: globalThis.__nativeWheelEvents,
    overflowAnchorValue:
      document.querySelector('ng-doc-page-wrapper')?.style.getPropertyValue('overflow-anchor') ??
      '',
    overflowAnchorPriority:
      document.querySelector('ng-doc-page-wrapper')?.style.getPropertyPriority('overflow-anchor') ??
      '',
    events: globalThis.__nativeScrollEvents,
    anchorCalls: globalThis.__nativeAnchorCalls,
    positionCalls: globalThis.__nativePositionCalls,
    url: location.href,
  }));
}
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(
        (_, reject) => (timer = setTimeout(() => reject(new Error('Timed out: ' + label)), 30_000)),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function targetMeasure(page, target) {
  return page.evaluate(
    (id) => ({
      scrollY: window.scrollY,
      targetExists: !!document.getElementById(id),
      top: document.getElementById(id)?.getBoundingClientRect().top ?? null,
      viewportHeight: window.innerHeight,
      maxScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      wheelEvents: globalThis.__nativeWheelEvents,
      events: globalThis.__nativeScrollEvents,
      anchorCalls: globalThis.__nativeAnchorCalls,
      positionCalls: globalThis.__nativePositionCalls,
      url: location.href,
    }),
    target,
  );
}
