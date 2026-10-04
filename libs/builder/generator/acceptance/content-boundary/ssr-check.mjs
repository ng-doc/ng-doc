import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { guideRoute, bodyReplacement, headerReplacement } from './fixture.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
export async function checkSsr(root, report) {
  const controls = [];
  const checkpoint = (label, details = {}) => {
    const entry = {
      at: Date.now(),
      label,
      ...details,
      requests: controls.map((state) => ({
        id: state.id,
        events: state.events,
        remainingListeners: state.listeners.size,
      })),
    };
    (report.checkpoints ??= []).push(entry);
    appendFileSync(
      path.join(process.env.NGDOC_CONTENT_EVIDENCE, 'ssr-checkpoints.jsonl'),
      JSON.stringify(entry) + '\n',
    );
  };
  const bounded = async (label, promise) => {
    checkpoint(label + ':start');
    let timer;
    try {
      const value = await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('NATIVE_SSR_STEP_TIMEOUT:' + label)), 30_000);
        }),
      ]);
      checkpoint(label + ':complete');
      return value;
    } catch (error) {
      checkpoint(label + ':failure', { error: String(error) });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  const enteredOrRejected = (label, waiting, renders) =>
    bounded(
      label,
      Promise.race([
        waiting,
        ...renders.map((render) =>
          render.then((result) => {
            throw (
              result.error ??
              new Error('Render completed before expected source checkpoint: ' + label)
            );
          }),
        ),
      ]),
    );
  const { apiRoute } = JSON.parse(await readFile(path.join(root, 'native-routes.json'), 'utf8'));
  const loggedErrors = [];
  const originalError = console.error;
  console.error = (...args) => {
    loggedErrors.push(args.map(String).join(' '));
    originalError(...args);
  };
  // This fresh child imports the AOT output only. No harness import of Angular,
  // compiler, Analog, Vite, or Zone can accidentally enable partial-JIT fallback.
  const { renderRoute, renderProbe } = await import(
    pathToFileURL(path.join(root, 'server/server.js')).href
  );
  const assetFailures = [];
  const assets = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const prefix = '/preview/assets/ng-doc/ui-kit/';
    if (!pathname.startsWith(prefix)) {
      assetFailures.push(pathname);
      res.writeHead(404).end();
      return;
    }
    const relative = pathname.slice(prefix.length);
    if (
      relative.split('/').some((part) => part === '..' || part === '.') ||
      relative.includes('\\')
    ) {
      res.writeHead(404).end();
      return;
    }
    try {
      res
        .writeHead(200, { 'content-type': 'image/svg+xml' })
        .end(await readFile(path.join(root, 'public/assets/ng-doc/ui-kit', relative)));
    } catch {
      assetFailures.push(pathname);
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => assets.listen(0, '127.0.0.1', resolve));
  const origin = `http://localhost:${assets.address().port}`;
  const control = (id, mode = 'success') => {
    const gate = deferred(),
      entered = deferred(),
      app = deferred(),
      processed = deferred();
    const seen = new Set();
    const state = {
      id,
      mode,
      version: 1,
      events: [],
      listeners: new Set(),
      fail: mode === 'failure',
      sameHtml: mode === 'same-html',
      failure: new Error('NATIVE_CONTENT_FAILURE:' + id),
      entered(part, version) {
        if (version === 1) {
          seen.add(part);
          if (seen.size === 2) entered.resolve();
        }
        checkpoint('loader-entered', { id, part, version });
      },
      wait(_part, version) {
        if (mode === 'same-html' && _part === 'body') return Promise.resolve();
        return version === 1 ? gate.promise : Promise.resolve();
      },
      processed() {
        processed.resolve();
      },
      appReady(value) {
        state.application = value;
        checkpoint('app-ready', { id });
        const subscription = value.isStable.subscribe((stable) => {
          state.events.push({ kind: 'app-is-stable', stable });
          checkpoint('app-is-stable', { id, stable });
        });
        value.onDestroy(() => {
          state.destroyed = true;
          subscription.unsubscribe();
        });
        app.resolve(value);
      },
      gate,
      started: entered.promise,
      app: app.promise,
      processorReady: processed.promise,
    };
    controls.push(state);
    return state;
  };
  const pending = [];
  const observe = (promise) => {
    const tracked = promise.then(
      (value) => {
        checkpoint('render-resolved');
        return { value };
      },
      (error) => {
        checkpoint('render-rejected', { error: String(error) });
        return { error };
      },
    );
    pending.push(tracked);
    return tracked;
  };
  try {
    const html = await bounded('normal-guide', renderRoute(origin + guideRoute));
    assert.match(html, new RegExp(bodyReplacement));
    assert.match(html, /inner-provider/);
    assert.match(html, /Playground/);
    assert.match(html, /Demo 2/);
    assert.match(html, /<button[^>]+data-testid="counter"[^>]*>Demo 2/);
    assert.match(html, /<button[^>]+data-testid="counter"[^>]*>Playground 4/);
    assert.match(html, /data-testid="scope"[^>]*>inner-provider/);
    assert.match(html, /ngh=/);
    assert.match(html, /ng-doc-demo/);
    assert.match(html, /delayed-section/);
    const api = await bounded('normal-api', renderRoute(origin + apiRoute));
    // The actual browser build document supplies its real hashed scripts/styles.
    // This stays in the fresh SSR child; Chrome hydrates in a separate stage.
    const browserDocument = await readFile(path.join(root, 'browser/index.html'), 'utf8');
    const hydrationHtml = await bounded(
      'hydration-document',
      renderRoute(origin + guideRoute + '#delayed-section', browserDocument),
    );
    assert.match(hydrationHtml, /ngh=/);
    assert.match(hydrationHtml, /id="delayed-section"/);
    assert.match(hydrationHtml, /<script[^>]+type="module"/);
    await writeFile(path.join(root, 'hydration.html'), hydrationHtml);
    report.hydrationDocument = {
      sha256: createHash('sha256').update(hydrationHtml).digest('hex'),
      bytes: hydrationHtml.length,
      source: 'actual AOT renderRoute using actual production browser index',
    };

    assert.match(api, new RegExp(headerReplacement));
    assert.match(api, /BoundaryApi/);
    report.checks.push(
      'Fresh-child AOT SSR renders generated body/header, processors, nested provider demo/playground and hydration metadata',
    );
    report.normalHtml = {
      guideBytes: html.length,
      apiBytes: api.length,
      guideSha256: createHash('sha256').update(html).digest('hex'),
      apiSha256: createHash('sha256').update(api).digest('hex'),
    };

    const good = control('request-good'),
      bad = control('request-bad', 'failure');
    let goodSettled = false,
      badSettled = false;
    const goodRun = observe(renderProbe(origin + '/preview/probe', good)).then((result) => {
      goodSettled = true;
      return result;
    });
    const badRun = observe(renderProbe(origin + '/preview/probe', bad)).then((result) => {
      badSettled = true;
      return result;
    });
    await enteredOrRejected('concurrent-source-entry', Promise.all([good.started, bad.started]), [
      goodRun,
      badRun,
    ]);
    assert.equal(goodSettled, false);
    assert.equal(badSettled, false);
    assert.equal(good.events.filter((e) => e.kind === 'real-payload-loaded').length, 2);
    assert.equal(bad.events.filter((e) => e.kind === 'real-payload-loaded').length, 2);
    good.gate.resolve();
    const goodResult = await bounded('good-render', goodRun);
    assert.equal(goodResult.error, undefined);
    assert.match(goodResult.value, /request-good:1/);
    assert.doesNotMatch(goodResult.value, /request-bad/);
    assert.match(goodResult.value, /data-testid="ssr-processed"[^>]*>request-good/);
    assert.equal(
      badSettled,
      false,
      'Unreleased request must remain pending after another request completes',
    );
    bad.gate.resolve();
    const badResult = await bounded('bad-render', badRun);
    assert.ok(badResult.error, 'withNgDocContentReady must reject, never render empty success');
    assert.match(String(badResult.error), /NATIVE_CONTENT_FAILURE:request-bad/);
    assert.ok(bad.events.some((e) => e.kind === 'app-destroyed'));
    assert.equal(good.listeners.size, 0);
    assert.equal(bad.listeners.size, 0);
    report.checks.push(
      'Concurrent AOT SSR waits for each actual source independently, includes completed processors, rejects request-owned load error and destroys failed app',
    );

    const overlap = control('request-overlap');
    const overlapRun = observe(renderProbe(origin + '/preview/probe', overlap));
    await enteredOrRejected('overlap-source-entry', overlap.started, [overlapRun]);
    overlap.version = 2;
    for (const listener of [...overlap.listeners]) listener();
    const overlapResult = await bounded('overlap-render', overlapRun);
    assert.equal(overlapResult.error, undefined);
    assert.match(overlapResult.value, /request-overlap:2/);
    assert.doesNotMatch(overlapResult.value, /request-overlap:1/);
    assert.ok(overlap.events.some((e) => e.kind === 'load-abort' && e.version === 1));
    // Deliberately finish the uncancellable old imports after serialization/destroy.
    overlap.gate.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(overlap.events.some((e) => e.kind === 'load-return' && e.version === 1 && e.aborted));
    assert.equal(overlap.listeners.size, 0);
    report.checks.push(
      'Source invalidation aborts obsolete work; newer revision serializes without waiting for ignored-abort old promises and stale completion cannot publish',
    );

    const same = control('request-same', 'same-html');
    const sameRun = observe(renderProbe(origin + '/preview/probe', same));
    await enteredOrRejected(
      'same-html-first-processor',
      Promise.all([same.started, same.processorReady]),
      [sameRun],
    );
    same.version = 2;
    for (const listener of [...same.listeners]) listener();
    const sameResult = await bounded('same-html-render', sameRun);
    assert.equal(sameResult.error, undefined);
    assert.match(sameResult.value, /request-same:1/);
    assert.ok(
      same.events.some(
        (event) => event.kind === 'load-return' && event.part === 'body' && event.version === 2,
      ),
    );
    same.gate.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(same.listeners.size, 0);
    report.checks.push(
      'A source revision with identical processed HTML settles PendingTasks even without a new Angular HTML input change',
    );

    const cancel = control('request-cancel');
    const cancelRun = observe(renderProbe(origin + '/preview/probe', cancel));
    await enteredOrRejected('cancel-source-entry', cancel.started, [cancelRun]);
    (await cancel.app).destroy();
    cancel.gate.resolve();
    const cancelResult = await bounded('cancel-render', cancelRun);
    report.cancelOutcome = cancelResult.error
      ? { kind: 'rejection', message: String(cancelResult.error) }
      : { kind: 'resolved-after-destroy', htmlBytes: cancelResult.value.length };
    assert.equal(cancel.listeners.size, 0);
    assert.ok(cancel.events.some((e) => e.kind === 'load-abort'));
    assert.ok(cancel.events.some((e) => e.kind === 'app-destroyed'));
    assert.equal(
      cancel.events.some((e) => e.kind === 'processor-created'),
      false,
    );
    report.checks.push(
      'Destroy during pending source load aborts and unsubscribes, joins bootstrap/render outcome, and creates no late processor view',
    );
    report.requests = controls.map(({ id, events, listeners }) => ({
      id,
      events,
      remainingListeners: listeners.size,
    }));
  } finally {
    checkpoint('cleanup:start');
    for (const state of controls) {
      state.gate.resolve();
    }
    try {
      for (const state of controls)
        if (state.application && !state.destroyed) state.application.destroy();
      await bounded('cleanup-pending-renders', Promise.all(pending));
    } catch (error) {
      report.cleanupError = String(error);
    }
    try {
      await new Promise((resolve, reject) =>
        assets.close((error) => (error ? reject(error) : resolve())),
      );
    } catch (error) {
      report.cleanupError = String(error);
    }
    report.assetsClosed = !assets.listening;
    console.error = originalError;
    report.loggedErrors = loggedErrors;
    report.assetFailures = assetFailures;
    checkpoint('cleanup:complete');
  }
  assert.equal(report.cleanupError, undefined);
  assert.deepEqual(assetFailures, []);
  assert.deepEqual(
    loggedErrors.filter((text) => !text.includes('NATIVE_CONTENT_FAILURE:request-bad')),
    [],
    'Unexpected SSR console errors must fail acceptance',
  );
}
