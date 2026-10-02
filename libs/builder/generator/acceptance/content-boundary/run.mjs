import assert from 'node:assert/strict';
import { fork, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  prepareFixture,
  hostConfig,
  guideRoute,
  bodyMarker,
  bodyReplacement,
  headerMarker,
  headerReplacement,
} from './fixture.mjs';
import { prepareSsr } from './ssr-fixture.mjs';

const filename = fileURLToPath(import.meta.url);
const repository = path.resolve(path.dirname(filename), '../../../../..');
const evidence = path.resolve(
  process.env.NGDOC_CONTENT_EVIDENCE ?? path.join(repository, 'tmp/acceptance/content-boundary'),
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorText = (error) => (error instanceof Error ? error.stack : String(error));
const execute = promisify(execFile);
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
// Linked dist is outside node_modules; retain the same public CJS conversion scope
// as the accepted main host. A packed consumer uses node_modules normally.
const linkedBuildOptions = { commonjsOptions: { include: [/node_modules/, /dist\/libs\/core\//] } };
// Event waits begin before the triggering write/navigation. Attach rejection handling
// immediately so a different failure cannot leave a timeout unhandled during cleanup.
const observeWait = (promise) => {
  const settled = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  return async () => {
    const result = await settled;
    if (result.error) throw result.error;
    return result.value;
  };
};

async function snapshot(root) {
  const manifest = await json(path.join(root, 'generated/.ng-doc-output-manifest.json'));
  const files = {};
  const payloads = {};
  for (const entry of manifest.files) {
    const bytes = await readFile(path.join(root, 'generated', entry.path));
    assert.equal(sha(bytes), entry.digest);
    files[entry.path] = entry.digest;
    if (entry.path.endsWith('.content.mjs')) {
      const text = bytes.toString('utf8');
      assert.ok(text.startsWith('export default '));
      payloads[entry.path] = JSON.parse(
        text.slice('export default '.length).trim().replace(/;$/, ''),
      );
    }
  }
  assert.ok(
    Object.keys(payloads).length > 0,
    'Assigned build must actually generate file content modules',
  );
  return { manifest, files, payloads };
}
function assertStable(before, after, label) {
  const select = (files) =>
    Object.fromEntries(
      Object.entries(files).filter(
        ([name]) => name.endsWith('.ts') || name.endsWith('.d.mts') || name.endsWith('.source.mjs'),
      ),
    );
  assert.deepEqual(
    select(after.files),
    select(before.files),
    label +
      ': Angular shells, wrappers, routing, demos, playgrounds, facades and declarations must remain byte-identical',
  );
  const changed = Object.keys(after.payloads).filter(
    (name) => before.files[name] !== after.files[name],
  );
  assert.ok(changed.length > 0, label + ': actual content payload must change');
  for (const name of changed) {
    assert.equal(after.payloads[name].id, before.payloads[name].id);
    assert.notEqual(after.payloads[name].revision, before.payloads[name].revision);
  }
  return changed;
}

async function dev(root, report) {
  const [{ createServer }, { chromium }] = await Promise.all([
    import('vite'),
    import(
      '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
    ),
  ]);
  let server, owner, browser;
  const responses = [],
    errors = [],
    loads = [];
  try {
    server = await createServer(await hostConfig(root, repository));
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    owner = await chromium.launchServer({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
    const pid = owner.process().pid;
    const { stdout } = await execute('/bin/ps', ['-o', 'pgid=', '-p', String(pid)]);
    assert.equal(Number(stdout.trim()), pid);
    process.send?.({ kind: 'owned-browser', pid });
    browser = await chromium.connect(owner.wsEndpoint());
    const page = await browser.newPage();
    page.setDefaultTimeout(60_000);
    page.on('pageerror', (error) => errors.push({ kind: 'pageerror', message: error.message }));
    page.on('console', (event) => {
      if (event.type() === 'error') errors.push({ kind: 'console', message: event.text() });
    });
    page.on('response', (response) => {
      responses.push({ url: response.url(), status: response.status() });
      if (response.status() >= 400)
        errors.push({ kind: 'http', url: response.url(), status: response.status() });
    });
    page.on('load', () => loads.push({ at: Date.now(), url: page.url() }));
    const ready = async () => {
      await page.locator('body[data-bootstrapped="yes"]').waitFor();
    };
    await page.goto(origin + guideRoute);
    await ready();
    await page.getByText(bodyMarker + '.', { exact: true }).waitFor();
    const demo = page.locator('ng-doc-demo [data-testid="counter"]');
    assert.equal(await demo.innerText(), 'Demo 2');
    await demo.click();
    await page.getByText('Demo 3', { exact: true }).waitFor();
    assert.equal(
      await page.locator('ng-doc-demo [data-testid="scope"]').innerText(),
      'inner-provider',
    );
    const playground = page.locator('ng-doc-playground [data-testid="counter"]');
    assert.equal(await playground.innerText(), 'Playground 4');
    await page.locator('ng-doc-playground input[type="number"]').first().fill('9');
    await page.getByText('Playground 9', { exact: true }).waitFor();
    await page.locator('ng-doc-playground').getByRole('button', { name: /reset/i }).click();
    await page.getByText('Reset 1', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Local section', exact: true }).click();
    assert.ok(page.url().endsWith('#delayed-section'));
    assert.ok(
      await page.locator('ng-doc-toc a[href*="delayed-section"]').count(),
      'TOC must follow processed content',
    );
    assert.ok(
      await page.locator('ng-doc-code').count(),
      'Code processor must create a real component',
    );
    const other = page.locator('ng-doc-page a').filter({ hasText: 'Other page' }).first();
    assert.match(await other.getAttribute('href'), /^\/preview\/docs\/outer\/other/);
    await other.click();
    await page
      .locator('ng-doc-demo [data-testid="scope"]')
      .getByText('outer-provider', { exact: true })
      .waitFor();
    await page.goto(origin + guideRoute);
    await ready();
    await page.getByText(bodyMarker + '.', { exact: true }).waitFor();
    report.checks.push(
      'Generated file sources render processors, TOC, anchors, base href, navigation, nested provider demo and playground interaction',
    );
    const before = await snapshot(root);
    await save(path.join(evidence, 'before.json'), before);
    const bodyFile = path.join(root, 'docs/outer/inner/guide/guide.md.nunj');
    const bodyLoad = observeWait(page.waitForEvent('load'));
    await writeFile(
      bodyFile,
      (await readFile(bodyFile, 'utf8')).replace(bodyMarker, bodyReplacement),
    );
    await bodyLoad();
    await ready();
    await page.getByText(bodyReplacement + '.', { exact: true }).waitFor();
    const afterBody = await snapshot(root);
    await save(path.join(evidence, 'after-body.json'), afterBody);
    report.bodyChanged = assertStable(before, afterBody, 'Guide prose edit');
    assert.ok(
      report.bodyChanged.some((name) => afterBody.payloads[name].html.includes(bodyReplacement)),
    );
    assert.equal(
      await page.locator('ng-doc-demo [data-testid="scope"]').innerText(),
      'inner-provider',
    );
    const apiLists = afterBody.manifest.files.filter((file) => file.role === 'api-list');
    const apiItems = (
      await Promise.all(apiLists.map((file) => json(path.join(root, 'generated', file.path))))
    )
      .flatMap((lists) => lists.flatMap((list) => list.items))
      .filter((item) => item.name === 'BoundaryApi');
    assert.equal(apiItems.length, 1, 'API navigation must resolve a single emitted route');
    assert.match(apiItems[0].route, /^\/docs\//);
    const apiRoute = '/preview' + apiItems[0].route;
    report.apiRoute = { path: apiRoute, source: apiLists.map((file) => file.path) };
    await save(path.join(root, 'native-routes.json'), { apiRoute });
    await page.goto(origin + apiRoute);
    await ready();
    await page
      .locator('ng-doc-page-header')
      .getByText(headerMarker + '.', { exact: false })
      .waitFor();
    const apiFile = path.join(root, 'src/api.ts');
    const headerLoad = observeWait(page.waitForEvent('load'));
    await writeFile(
      apiFile,
      (await readFile(apiFile, 'utf8')).replace(headerMarker, headerReplacement),
    );
    await headerLoad();
    await ready();
    await page
      .locator('ng-doc-page-header')
      .getByText(headerReplacement + '.', { exact: false })
      .waitFor();
    const afterHeader = await snapshot(root);
    await save(path.join(evidence, 'after-header.json'), afterHeader);
    report.headerChanged = assertStable(afterBody, afterHeader, 'API header prose edit');
    assert.ok(
      report.headerChanged.some(
        (name) =>
          name.endsWith('/BoundaryApi/page.content.mjs') &&
          afterHeader.payloads[name].html.includes(headerReplacement),
      ),
    );
    report.checks.push(
      'Body and API-header prose edits change payload revisions while every Angular shell, facade, route, demo and playground byte stays stable',
    );
    assert.ok(
      responses.some(
        (response) => response.url.includes('.content.mjs') && response.status === 200,
      ),
      'Browser must fetch real file-backed content modules',
    );
    const [bodyPath, payload] =
      Object.entries(afterHeader.payloads).find(([, value]) =>
        value.html.includes('Unopened source payload marker'),
      ) ?? [];
    assert.ok(bodyPath);
    const headerPath = Object.keys(afterHeader.payloads).find(
      (name) => name !== bodyPath && afterHeader.payloads[name].html.includes('Unopened payload'),
    );
    assert.ok(headerPath);
    const { default: source } = await import(
      pathToFileURL(
        path.join(root, 'generated', bodyPath.replace(/\.content\.mjs$/, '.source.mjs')),
      ).href
    );
    assert.equal(typeof source.load, 'function');
    assert.deepEqual(await source.load(new AbortController().signal), payload);
    report.probeSources = { bodyPath, headerPath };
    report.checks.push(
      'The emitted stable source function loads its emitted payload; SSR probe imports those same real facades',
    );
    const delayedPath = Object.entries(afterHeader.payloads).find(([, value]) =>
      value.html.includes(bodyReplacement),
    )?.[0];
    assert.ok(delayedPath);
    const delayedPage = await browser.newPage();
    delayedPage.setDefaultTimeout(60_000);
    delayedPage.on('response', (response) => {
      if (response.status() >= 400)
        errors.push({ kind: 'navigation-http', url: response.url(), status: response.status() });
    });
    delayedPage.on('pageerror', (error) =>
      errors.push({ kind: 'navigation-pageerror', message: error.message }),
    );
    delayedPage.on('console', (event) => {
      if (event.type() === 'error')
        errors.push({ kind: 'navigation-console', message: event.text() });
    });
    let enter,
      release,
      continued,
      closingDelayed = false;
    const entered = new Promise((resolve) => (enter = resolve));
    const gate = new Promise((resolve) => (release = resolve));
    const finished = new Promise((resolve) => (continued = resolve));
    await delayedPage.route(
      (url) => url.pathname.endsWith('/' + delayedPath),
      async (route) => {
        enter();
        try {
          await gate;
          await route.continue();
        } catch (error) {
          if (!closingDelayed) errors.push({ kind: 'navigation-route', message: errorText(error) });
        } finally {
          continued();
        }
      },
    );
    try {
      await delayedPage.goto(origin + guideRoute, { waitUntil: 'domcontentloaded' });
      await entered;
      assert.equal(await delayedPage.getByText(bodyReplacement + '.', { exact: true }).count(), 0);
      await delayedPage
        .locator('ng-doc-sidebar a')
        .filter({ hasText: 'Other page' })
        .first()
        .click();
      await delayedPage
        .locator('ng-doc-demo [data-testid="scope"]')
        .getByText('outer-provider', { exact: true })
        .waitFor();
      const fetched = observeWait(
        delayedPage.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith('/' + delayedPath),
        ),
      );
      release();
      await finished;
      await (await fetched()).finished();
      await delayedPage.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.ok(delayedPage.url().includes('/preview/docs/outer/other'));
      assert.equal(await delayedPage.getByText(bodyReplacement + '.', { exact: true }).count(), 0);
      assert.equal(await delayedPage.locator('ng-doc-toc a[href*="delayed-section"]').count(), 0);
      assert.equal(
        await delayedPage.locator('ng-doc-demo [data-testid="scope"]').innerText(),
        'outer-provider',
      );
      report.checks.push(
        'Actual delayed content-module request cannot publish its old body, TOC or provider scope after browser navigation',
      );
    } finally {
      closingDelayed = true;
      release();
      await delayedPage.close();
    }
    report.responses = responses;
    report.loads = loads;
    report.errors = errors;
    assert.deepEqual(errors, []);
    await page.goto(origin + guideRoute);
    await ready();
    await page.getByText(bodyReplacement + '.', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'browser.png'), fullPage: true });
  } catch (error) {
    // Retain the actual committed files and visible state before owned teardown removes
    // the fixture. Diagnostic capture must never replace the original assertion failure.
    try {
      await save(path.join(evidence, 'failure-output-snapshot.json'), await snapshot(root));
    } catch (cause) {
      report.snapshotCaptureError = errorText(cause);
    }
    try {
      const visible = browser?.contexts()[0]?.pages()[0];
      if (visible) {
        report.failureBrowser = {
          url: visible.url(),
          text: await visible.locator('body').innerText(),
        };
        await visible.screenshot({
          path: path.join(evidence, 'failure-browser.png'),
          fullPage: true,
        });
      }
    } catch (cause) {
      report.browserCaptureError = errorText(cause);
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (owner) await owner.close();
    if (server) await server.close();
    report.cleanup = {
      browserClosed: !browser?.isConnected(),
      serverClosed: !server?.httpServer?.listening,
    };
    report.responses = responses;
    report.loads = loads;
    report.errors = errors;
  }
  assert.deepEqual(errors, []);
  await prepareSsr(root, report.probeSources.bodyPath, report.probeSources.headerPath);
}

async function build(root, report, ssrOnly = false) {
  const { build } = await import('vite');
  if (!ssrOnly)
    await build({
      ...(await hostConfig(root, repository)),
      build: {
        ...linkedBuildOptions,
        outDir: path.join(root, 'browser'),
        sourcemap: true,
        emptyOutDir: true,
      },
    });
  await build({
    ...(await hostConfig(root, repository)),
    build: {
      ...linkedBuildOptions,
      ssr: path.join(root, 'server.ts'),
      outDir: path.join(root, 'server'),
      sourcemap: true,
      emptyOutDir: true,
    },
  });
  const files = await readdir(path.join(root, 'server'), { recursive: true });
  report.bundles = {};
  for (const file of files.filter((file) => String(file).endsWith('.js')))
    report.bundles[file] = sha(await readFile(path.join(root, 'server', file)));
  assert.ok(report.bundles['server.js']);
  report.checks.push(
    ssrOnly
      ? 'Actual production Angular AOT bundled SSR build consumes generated content source imports'
      : 'Actual production Angular AOT browser and bundled SSR builds consume generated content source imports',
  );
}

async function negative(root, report) {
  const file = path.join(root, 'docs/unopened/unopened.md.nunj'),
    original = await readFile(file, 'utf8');
  try {
    await writeFile(file, original + '\n{% include "missing-production-content.nunj" %}\n');
    const { build } = await import('vite');
    let failure;
    try {
      await build({
        ...(await hostConfig(root, repository)),
        build: { ...linkedBuildOptions, outDir: path.join(root, 'negative'), emptyOutDir: true },
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'Production must fail on a template never opened by the browser');
    report.failure = errorText(failure);
    assert.match(report.failure, /missing-production-content|CONTENT_|template/i);
    report.checks.push(
      'Unopened missing Nunjucks include rejects actual production generation/build',
    );
  } finally {
    await writeFile(file, original);
  }
}

function live(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
function signal(pid, value) {
  try {
    process.kill(-pid, value);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
async function stage(name, root) {
  const child = fork(filename, ['--stage', name, root], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, NGDOC_CONTENT_EVIDENCE: evidence },
  });
  const groups = new Set([child.pid]);
  child.on('message', (event) => {
    if (event?.kind === 'owned-browser' && Number.isInteger(event.pid)) groups.add(event.pid);
  });
  let stdout = '',
    stderr = '',
    timedOut = false,
    overflow = false;
  const collect = (kind, chunk) => {
    if (kind === 'out') stdout += chunk;
    else stderr += chunk;
    if (stdout.length + stderr.length > 30 * 1024 * 1024 && !overflow) {
      overflow = true;
      for (const pid of groups) signal(pid, 'SIGKILL');
    }
  };
  child.stdout.on('data', (chunk) => collect('out', chunk));
  child.stderr.on('data', (chunk) => collect('err', chunk));
  const timer = setTimeout(
    () => {
      timedOut = true;
      for (const pid of groups) signal(pid, 'SIGTERM');
    },
    name === 'build' ? 300_000 : 240_000,
  );
  const hard = setTimeout(
    () => {
      timedOut = true;
      for (const pid of groups) signal(pid, 'SIGKILL');
    },
    name === 'build' ? 315_000 : 255_000,
  );
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);
  clearTimeout(hard);
  const retained = [...groups].filter(live);
  for (const pid of retained) signal(pid, 'SIGKILL');
  const deadline = Date.now() + 10_000;
  while (retained.some(live) && Date.now() < deadline) await pause(50);
  const outcome = {
    ...result,
    timedOut,
    overflow,
    requiredForcedCleanup: retained.length > 0,
    stillOwned: retained.filter(live),
    joinedChild: true,
  };
  await writeFile(
    path.join(evidence, name + '.log'),
    JSON.stringify(outcome) + '\n' + stdout + '\n' + stderr,
  );
  await save(path.join(evidence, name + '-supervisor.json'), outcome);
  assert.equal(result.code, 0, `${name} failed; see raw log`);
  assert.equal(
    timedOut || overflow || retained.length > 0,
    false,
    `${name} did not cleanly join its owned process groups`,
  );
}

if (process.argv[2] === '--stage') {
  const name = process.argv[3],
    root = process.argv[4],
    report = { name, status: 'running', checks: [] };
  try {
    if (name === 'dev') await dev(root, report);
    else if (name === 'fragment') {
      const { checkFragment } = await import('./fragment-check.mjs');
      await checkFragment(root, repository, evidence, report);
    } else if (name === 'build') await build(root, report);
    else if (name === 'build-ssr') await build(root, report, true);
    else if (name === 'ssr') {
      const { checkSsr } = await import('./ssr-check.mjs');
      await checkSsr(root, report);
    } else if (name === 'hydration') {
      const { checkHydration } = await import('./hydration-check.mjs');
      await checkHydration(root, evidence, report);
    } else if (name === 'negative') await negative(root, report);
    else throw new Error('Unknown owned stage');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = errorText(error);
    process.exitCode = 1;
  } finally {
    await save(path.join(evidence, name + '-results.json'), report);
    console.log(JSON.stringify(report));
  }
} else {
  let root;
  const report = { status: 'running', checks: [], node: process.version };
  await mkdir(evidence, { recursive: true });
  try {
    assert.equal(process.version, 'v24.19.0');
    assert.notEqual(process.platform, 'win32');
    const expected = process.env.NGDOC_EXPECTED_SOURCE_DIGEST;
    assert.match(expected ?? '', /^[a-f0-9]{64}$/, 'Assigned frozen build required');
    const provenance = await json(
      path.join(repository, 'dist/libs/builder/generator/build-provenance.json'),
    );
    assert.equal(provenance.sourceDigest, expected);
    report.provenance = provenance;
    report.sources = {};
    for (const file of await readdir(path.dirname(filename)))
      if (file.endsWith('.mjs'))
        report.sources[file] = sha(await readFile(path.join(path.dirname(filename), file)));
    report.appBundles = {};
    for (const file of (await readdir(path.join(repository, 'dist/libs/app/fesm2022'))).sort())
      if (file.endsWith('.mjs'))
        report.appBundles[file] = sha(
          await readFile(path.join(repository, 'dist/libs/app/fesm2022', file)),
        );
    report.appBundleDigest = sha(JSON.stringify(report.appBundles));
    const expectedApp = process.env.NGDOC_EXPECTED_APP_DIGEST;
    assert.match(
      expectedApp ?? '',
      /^[a-f0-9]{64}$/,
      'Assigned app bundle manifest digest required',
    );
    assert.equal(
      report.appBundleDigest,
      expectedApp,
      'App runtime must match the combined frozen build assignment',
    );
    await mkdir(path.join(repository, 'tmp'), { recursive: true });
    const replay = process.env.NGDOC_CONTENT_REPLAY_ROOT;
    assert.ok(
      replay || process.env.NGDOC_NATIVE_DISABLE_SCROLL_ANCHOR !== '1',
      'Diagnostic anchoring CSS is forbidden in a fresh acceptance run',
    );
    if (process.env.NGDOC_NATIVE_DISABLE_SCROLL_ANCHOR === '1')
      report.fixtureDiagnostic = 'wrapper overflow-anchor:none; not production acceptance';
    const stages = replay
      ? (process.env.NGDOC_CONTENT_STAGES ?? 'ssr').split(',')
      : ['dev', 'fragment', 'build', 'ssr', 'hydration', 'negative'];
    assert.ok(
      stages.every((name) =>
        ['dev', 'fragment', 'build', 'build-ssr', 'ssr', 'hydration', 'negative'].includes(name),
      ),
    );
    if (replay) {
      root = path.resolve(replay);
      assert.ok(
        root.startsWith(path.join(repository, 'tmp/ngdoc-content-boundary-ssr-retained-')),
        'Replay must use this harness-owned retained fixture',
      );
      report.mode = 'diagnostic-replay';
      report.retainedSsrEntryDigest = sha(await readFile(path.join(root, 'server/server.js')));
      assert.equal(
        report.retainedSsrEntryDigest,
        process.env.NGDOC_EXPECTED_SSR_ENTRY_DIGEST,
        'Explicit retained AOT bundle identity required',
      );
    } else root = await mkdtemp(path.join(repository, 'tmp/ngdoc-content-boundary-'));
    report.fixture = root;
    if (!replay) await prepareFixture(root, repository);
    for (const name of stages) {
      await stage(name, root);
      report.checks.push(name);
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = errorText(error);
    process.exitCode = 1;
  } finally {
    if (root && !process.env.NGDOC_CONTENT_REPLAY_ROOT) {
      await rm(root, { recursive: true, force: true });
      report.fixtureRemoved = !existsSync(root);
    } else if (root) {
      report.fixtureRetainedForDiagnostic = true;
    }
    await save(path.join(evidence, 'summary.json'), report);
    console.log(JSON.stringify(report));
  }
}
