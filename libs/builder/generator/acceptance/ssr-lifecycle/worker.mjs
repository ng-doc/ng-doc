import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  changedColor,
  healthyMarker,
  healthyReplacement,
  host,
  initialColor,
  otherRoute,
  prepareFixture,
  route,
} from './fixture.mjs';

const [root, repository, evidence] = process.argv.slice(2);
assert.ok(root && repository && evidence, 'fixture, repository and evidence paths are required');
const execute = promisify(execFile);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorText = (error) =>
  error instanceof Error ? error.stack ?? error.message : String(error);
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const document =
  '<!doctype html><html><head><base href="/preview/"></head><body><app-root></app-root></body></html>';

async function eventually(label, read, accept, timeout = 60_000) {
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

async function rendererProcess() {
  const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,command=']);
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (match && Number(match[2]) === process.pid && match[4].includes('ssr-renderer-entry')) {
      return { pid: Number(match[1]), pgid: Number(match[3]), command: match[4] };
    }
  }
  return undefined;
}

const groupAlive = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
const report = {
  status: 'running',
  node: process.version,
  checks: [],
  events: [],
  diagnostics: [],
  browserErrors: [],
};
const gates = new Map();
const gateServer = createHttpServer((request, response) => {
  const match = request.url?.match(/^\/([^/]+)\/(admit|wait)$/);
  const gate = match && gates.get(match[1]);
  if (!match || !gate) {
    response.writeHead(404).end();
    return;
  }
  if (match[2] === 'admit') {
    gate.admitted = true;
    response.writeHead(204).end();
    return;
  }
  gate.response = response;
  if (gate.released) response.writeHead(204).end();
});
const openGate = (id) => {
  const gate = { admitted: false, released: false, response: undefined };
  gates.set(id, gate);
  return gate;
};
const releaseGate = (gate) => {
  gate.released = true;
  if (gate.response && !gate.response.writableEnded) gate.response.writeHead(204).end();
};
let server,
  browserOwner,
  browser,
  renderer,
  rendererOwned,
  gateOrigin,
  phase = 'startup';
const setPhase = async (value) => {
  phase = value;
  await save(path.join(evidence, 'progress.json'), {
    at: Date.now(),
    phase,
    checks: report.checks,
  });
};
try {
  await new Promise((resolve, reject) => {
    gateServer.once('error', reject);
    gateServer.listen(0, '127.0.0.1', resolve);
  });
  gateOrigin = `http://127.0.0.1:${gateServer.address().port}`;
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
      report.diagnostics.push({ at: Date.now(), phase, level, text: String(text) });
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
          relative.startsWith(`external${path.sep}`)
        ) {
          report.events.push({
            at: Date.now(),
            phase,
            kind: 'hot-post',
            type: context.type,
            file: relative,
            modules: context.modules.length,
          });
        }
      },
    },
    transform(code, id) {
      if (/(?:demo|theme)\.scss/.test(id))
        report.events.push({
          at: Date.now(),
          phase,
          kind: 'style-transform',
          id,
          bytes: code.length,
        });
      return null;
    },
  };
  const setup = await host(root, repository, observer, logger);
  renderer = setup.renderer;
  server = await createServer(setup.config);
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  report.origin = origin;
  const bodyFacadeIdentity = async () => {
    const relative = 'guides/outer/inner/guide/index/page.source.mjs';
    const manifest = JSON.parse(
      await readFile(path.join(root, 'generated/.ng-doc-output-manifest.json'), 'utf8'),
    );
    const entry = manifest.files.find((candidate) => candidate.path === relative);
    assert.ok(entry, `Missing accepted body facade ${relative}`);
    const bytes = await readFile(path.join(root, 'generated', relative));
    assert.equal(sha(bytes), entry.digest);
    return {
      path: relative,
      digest: entry.digest,
      generation: manifest.generation,
      revision: manifest.revision,
    };
  };
  const render = (pathname, data, options) =>
    renderer.render(
      { document, url: `${origin}${pathname}`, ...(data === undefined ? {} : { data }) },
      options,
    );

  await setPhase('cold-unopened-ssr');
  const nativePromise = globalThis.Promise;
  const coldOtherPromise = render(otherRoute);
  void coldOtherPromise.catch(() => undefined);
  rendererOwned = await eventually(
    'owned renderer child process',
    rendererProcess,
    (value) => value && value.pid === value.pgid,
  );
  process.send?.({ kind: 'owned-renderer', pid: rendererOwned.pid });
  report.rendererProcess = rendererOwned;
  const coldOther = await coldOtherPromise;
  assert.match(coldOther, /<title>Other page<\/title>/);
  assert.equal(globalThis.Promise, nativePromise);
  report.coldSsr = { route: otherRoute, bytes: coldOther.length };
  report.zone = {
    globalPromise: globalThis.Promise.name,
    changed: globalThis.Promise !== nativePromise,
  };
  report.checks.push(
    'The isolated child rendered an unopened route before any browser demand while the Vite owner retained its native Promise',
  );

  browserOwner = await chromium.launchServer({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  process.send?.({ kind: 'owned-browser', pid: browserOwner.process().pid });
  browser = await chromium.connect(browserOwner.wsEndpoint());
  const page = await browser.newPage();
  page.setDefaultTimeout(90_000);
  page.on('pageerror', (error) =>
    report.browserErrors.push({ at: Date.now(), phase, kind: 'pageerror', message: error.message }),
  );
  page.on('console', (entry) => {
    if (entry.type() === 'error')
      report.browserErrors.push({ at: Date.now(), phase, kind: 'console', message: entry.text() });
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
  report.checks.push('Browser compiled the real external SCSS resource before isolated SSR');

  await setPhase('initial-ssr');
  const first = await render(route);
  assert.match(first, new RegExp(healthyMarker));
  assert.match(first, /TS_ONE/);
  assert.equal(globalThis.Promise, nativePromise);
  report.checks.push(
    'The same isolated child rendered the browser-demanded route without changing the Vite owner Promise',
  );

  const [concurrentGuide, concurrentOther] = await Promise.all([render(route), render(otherRoute)]);
  assert.match(concurrentGuide, /<title>Content boundary ☃<\/title>/);
  assert.doesNotMatch(concurrentGuide, /<title>Other page<\/title>/);
  assert.match(concurrentOther, /<title>Other page<\/title>/);
  assert.doesNotMatch(concurrentOther, /<title>Content boundary ☃<\/title>/);
  assert.equal((await rendererProcess()).pid, rendererOwned.pid);
  report.concurrentAngular = {
    guide: concurrentGuide.length,
    other: concurrentOther.length,
    pid: rendererOwned.pid,
  };
  report.checks.push(
    'Concurrent real Angular application renders remained route-local in the same isolated child',
  );

  await setPhase('request-isolation');
  const gate = openGate('held');
  const held = render(route, { gateUrl: `${gateOrigin}/held` });
  await eventually('held render child admission', async () => gate.admitted, Boolean);
  const other = await render(otherRoute);
  assert.match(other, /<title>Other page<\/title>/);
  assert.doesNotMatch(other, /<title>Content boundary ☃<\/title>/);
  releaseGate(gate);
  const heldResult = await held;
  assert.match(heldResult, /<title>Content boundary ☃<\/title>/);

  const cancelGate = openGate('cancelled');
  const controller = new AbortController();
  const cancelled = render(
    route,
    { gateUrl: `${gateOrigin}/cancelled` },
    { signal: controller.signal },
  );
  await eventually('cancelled render child admission', async () => cancelGate.admitted, Boolean);
  const reason = new Error('native request cancelled');
  controller.abort(reason);
  await assert.rejects(cancelled, (error) => error === reason);
  const afterCancel = await render(otherRoute);
  assert.match(afterCancel, /<title>Other page<\/title>/);
  report.requests = {
    first: first.length,
    other: other.length,
    held: heldResult.length,
    afterCancel: afterCancel.length,
  };
  report.checks.push(
    'Held admitted entry work did not block a healthy Angular render, and cancellation did not contaminate the next request',
  );

  await setPhase('accepted-update-failure');
  const healthyFile = path.join(root, 'docs/outer/inner/guide/guide.md.nunj');
  const beforeAcceptedFailure = report.diagnostics.length;
  const acceptedBodyFacade = await bodyFacadeIdentity();
  await writeFile(
    healthyFile,
    (await readFile(healthyFile, 'utf8')).replace(healthyMarker, healthyReplacement) +
      '\n{% include "../../../../external/healthy-late.nunj" %}\n',
  );
  const retained = await render(route);
  assert.match(retained, new RegExp(healthyMarker));
  assert.doesNotMatch(retained, new RegExp(healthyReplacement));
  const acceptedFailure = await eventually(
    'accepted update exact diagnostic',
    async () =>
      report.diagnostics
        .slice(beforeAcceptedFailure)
        .map((item) => item.text)
        .join('\n'),
    (value) => /healthy-late\.nunj/.test(value),
  );
  const retainedAfterFailure = await render(route);
  assert.match(retainedAfterFailure, new RegExp(healthyMarker));
  assert.doesNotMatch(retainedAfterFailure, new RegExp(healthyReplacement));
  await page.getByText(`${healthyMarker}.`, { exact: true }).waitFor();
  assert.equal(await page.getByText(`${healthyReplacement}.`, { exact: true }).count(), 0);
  // The rejected generation must not have committed anything: the accepted body facade is untouched.
  const failedBodyFacade = await bodyFacadeIdentity();
  assert.deepEqual(failedBodyFacade, acceptedBodyFacade);
  await writeFile(path.join(root, 'external/healthy-late.nunj'), 'Healthy repair payload.\n');
  const acceptedRepair = await eventually(
    'accepted update browser repair',
    async () => {
      const current = {
        bodyFacade: await bodyFacadeIdentity(),
        oldBody: await page.getByText(`${healthyMarker}.`, { exact: true }).count(),
        newBody: await page.getByText(`${healthyReplacement}.`, { exact: true }).count(),
        include: await page.getByText('Healthy repair payload.', { exact: true }).count(),
      };
      report.acceptedRepairLatest = current;
      return current;
    },
    (value) => value.newBody === 1 && value.include === 1,
    120_000,
  );
  assert.ok(
    acceptedRepair.bodyFacade.generation > failedBodyFacade.generation,
    'The repair must commit a newer generation',
  );
  const repaired = await render(route);
  assert.match(repaired, new RegExp(healthyReplacement));
  assert.doesNotMatch(repaired, new RegExp(healthyMarker));
  report.acceptedFailure = {
    diagnostic: acceptedFailure,
    acceptedBodyFacade,
    retainedBytes: retained.length,
    retainedAfterFailureBytes: retainedAfterFailure.length,
    failedBodyFacade,
    repairedBodyFacade: acceptedRepair.bodyFacade,
    repairedBytes: repaired.length,
  };
  report.checks.push(
    'A rejected update preserved accepted browser and SSR HTML with its exact diagnostic, then repaired without replacing the renderer',
  );

  // C builds every page eagerly, so a page that was never accepted can only appear after startup: it
  // must fail its generation without disturbing accepted routes, and repair in the same renderer child.
  await setPhase('never-accepted-page-failure');
  const brokenRoute = '/preview/docs/broken';
  const brokenPayload = /Broken never-accepted page|Recovered deferred include/;
  const beforeNewPage = report.diagnostics.length;
  const acceptedBeforeNewPage = await bodyFacadeIdentity();
  // The Markdown goes first so the page file is discovered complete, with its missing include.
  await mkdir(path.join(root, 'docs/broken'), { recursive: true });
  await writeFile(
    path.join(root, 'docs/broken/broken.md.nunj'),
    '---\nkeyword: RecoveredBroken\n---\n# Broken never-accepted page\n\n{% include "../../external/future.nunj" %}\n',
  );
  await writeFile(
    path.join(root, 'docs/broken/ng-doc.page.ts'),
    "const page={title:'Broken never-accepted page',route:'broken',mdFile:'./broken.md.nunj'}; export default page;\n",
  );
  const newPageFailure = await eventually(
    'never-accepted page diagnostic',
    async () =>
      report.diagnostics
        .slice(beforeNewPage)
        .map((item) => item.text)
        .join('\n'),
    (value) => /future\.nunj/.test(value),
    120_000,
  );
  const otherAfterNewPageFailure = await render(otherRoute);
  assert.match(otherAfterNewPageFailure, /<title>Other page<\/title>/);
  const guideAfterNewPageFailure = await render(route);
  assert.match(guideAfterNewPageFailure, new RegExp(healthyReplacement));
  assert.deepEqual(await bodyFacadeIdentity(), acceptedBeforeNewPage);
  const brokenBeforeRepair = await render(brokenRoute).then(
    (html) => ({ html }),
    (error) => ({ error: errorText(error) }),
  );
  assert.ok(
    brokenBeforeRepair.error || !brokenPayload.test(brokenBeforeRepair.html),
    'A never-accepted page must not be served',
  );
  await writeFile(path.join(root, 'external/future.nunj'), 'Recovered deferred include.\n');
  const repairedBroken = await eventually(
    'never-accepted page repair',
    () => render(brokenRoute),
    (html) => typeof html === 'string' && /Recovered deferred include/.test(html),
    120_000,
  );
  assert.match(repairedBroken, /<title>Broken never-accepted page<\/title>/);
  assert.match(await render(otherRoute), /<title>Other page<\/title>/);
  assert.equal((await rendererProcess()).pid, rendererOwned.pid);
  report.neverAccepted = {
    diagnostic: newPageFailure,
    beforeRepair: brokenBeforeRepair.error
      ? { error: brokenBeforeRepair.error }
      : { bytes: brokenBeforeRepair.html.length },
    repairedBytes: repairedBroken.length,
    rendererPid: rendererOwned.pid,
  };
  report.checks.push(
    'A new page that failed its first generation left accepted routes and output untouched, was not served, and repaired in the same renderer child',
  );

  await setPhase('typescript-hmr');
  const demo = path.join(root, 'src/demo.ts');
  await writeFile(demo, (await readFile(demo, 'utf8')).replaceAll('TS_ONE', 'TS_TWO'));
  await eventually(
    'browser TypeScript HMR',
    () => markers.allTextContents(),
    (values) => values.length === 2 && values.every((value) => value === 'TS_TWO'),
    120_000,
  );
  const afterTypeScript = await render(route);
  assert.match(afterTypeScript, /TS_TWO/);
  assert.doesNotMatch(afterTypeScript, /TS_ONE/);
  report.checks.push(
    'The persistent child fenced real TypeScript HMR and rendered the current Angular module',
  );

  await setPhase('post-ssr-sass');
  const theme = path.join(root, 'src/_theme.scss');
  const beforeErrors = report.browserErrors.length;
  await writeFile(theme, `$color:${changedColor};\n`);
  await eventually('post-SSR Sass HMR', color, (value) => value === changedColor, 120_000);
  const sassErrors = report.browserErrors
    .slice(beforeErrors)
    .filter((item) =>
      /\[object Promise\]|importer must return an absolute URL/i.test(item.message),
    );
  assert.deepEqual(sassErrors, []);
  const afterSass = await render(route);
  assert.match(afterSass, /TS_TWO/);
  assert.equal(globalThis.Promise, nativePromise);
  report.scssBoundary = {
    color: await color(),
    zonePromise: globalThis.Promise.name,
    errors: sassErrors,
  };
  report.checks.push(
    'External alias SCSS compiled after multiple SSR requests without Zone contaminating the Vite/Sass owner',
  );

  await setPhase('complete');
  const unexpected = report.browserErrors.filter(
    (item) => !['accepted-update-failure', 'never-accepted-page-failure'].includes(item.phase),
  );
  assert.deepEqual(unexpected, []);
  report.status = 'passed';
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
  if (!rendererOwned) {
    try {
      rendererOwned = await rendererProcess();
      if (rendererOwned) {
        process.send?.({ kind: 'owned-renderer', pid: rendererOwned.pid });
        report.rendererProcess = rendererOwned;
      }
    } catch (error) {
      report.cleanupError ??= errorText(error);
    }
  }
  try {
    if (renderer) await renderer.close();
  } catch (error) {
    report.cleanupError ??= errorText(error);
  }
  try {
    if (server) await server.close();
  } catch (error) {
    report.cleanupError ??= errorText(error);
  }
  try {
    gateServer.closeAllConnections();
    await new Promise((resolve, reject) =>
      gateServer.close((error) => (error ? reject(error) : resolve())),
    );
  } catch (error) {
    report.cleanupError ??= errorText(error);
  }
  if (rendererOwned) {
    try {
      await eventually(
        'renderer process group exit',
        async () => groupAlive(rendererOwned.pid),
        (value) => !value,
        10_000,
      );
    } catch (error) {
      report.cleanupError ??= errorText(error);
    }
  }
  report.cleanup = {
    browserClosed: !browser?.isConnected(),
    serverClosed: !server?.httpServer?.listening,
    rendererGroupGone: !rendererOwned || !groupAlive(rendererOwned.pid),
    gateClosed: !gateServer.listening,
  };
  if (report.cleanupError) process.exitCode = 1;
  await save(path.join(evidence, 'results.json'), report);
  console.log(JSON.stringify(report));
}
