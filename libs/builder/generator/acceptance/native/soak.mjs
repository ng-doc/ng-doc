import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertComplete,
  createProject,
  provenance,
  startProject,
  success,
  waitAfter,
} from './support.mjs';

const evidence = path.resolve(
  process.env.NGDOC_NATIVE_SOAK_EVIDENCE ??
    fileURLToPath(new URL('../../../../../tmp/acceptance/native-soak', import.meta.url)),
);
const root = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-native-soak-'));
const trace = [];
const memory = [];
const summary = {
  status: 'failure',
  node: process.version,
  pid: process.pid,
  root,
  startedAt: new Date().toISOString(),
  provenance: await provenance(),
  edits: 100,
};
if (process.env.NGDOC_EXPECTED_SOURCE_DIGEST) {
  assert.equal(
    summary.provenance.sourceDigest,
    process.env.NGDOC_EXPECTED_SOURCE_DIGEST,
    'Soak runtime does not match NGDOC_EXPECTED_SOURCE_DIGEST',
  );
}
let handle;
let error;

try {
  assert.equal(
    typeof globalThis.gc,
    'function',
    'Run the soak with Node --expose-gc so retained-heap samples are comparable',
  );
  const paths = await createProject(path.join(root, 'soak.project'), 'soak', {
    cacheParent: path.join(root, 'cache-parent'),
  });
  handle = await startProject(paths, trace, { resultHistoryLimit: 2 });
  let current = success(handle.reconciled);
  memory.push(await settledSample(0, current.generation, handle.observer));
  for (let edit = 1; edit <= 100; edit += 1) {
    const marker = `native soak edit ${edit}`;
    const pending = waitAfter(
      handle,
      current.generation,
      (result) =>
        result.status === 'success' &&
        result.snapshot.artifacts
          .flatMap((artifact) => artifact.content)
          .some((content) => content.html.includes(marker)),
      trace,
      `edit-${edit}`,
    );
    await writeFile(paths.shared, `${marker}.`);
    current = success(await pending);
    assertObserverBounded(handle.observer.state());
    if (edit % 10 === 0)
      memory.push(await settledSample(edit, current.generation, handle.observer));
  }
  const complete = await assertComplete(current, {
    html: ['native soak edit 100'],
    api: ['InitialApi'],
  });
  assert.equal(trace.filter((event) => event.event.startsWith('edit-')).length, 100);
  summary.status = 'passed';
  summary.final = {
    generation: current.generation,
    revision: current.snapshot.revision,
    manifestFiles: current.manifest.files.length,
    outputs: complete.outputs.length,
    searchRecords: complete.search.length,
    observer: handle.observer.state(),
  };
  assertObserverBounded(summary.final.observer);
  summary.heapTrend = heapTrend(memory);
} catch (caught) {
  error = caught;
  summary.error =
    caught instanceof Error ? { message: caught.message, stack: caught.stack } : caught;
  process.exitCode = 1;
} finally {
  if (handle) {
    try {
      await handle.stop();
      summary.cleanup = { status: 'fulfilled' };
      summary.postCleanup = await postGcProcessSample();
    } catch (cleanupError) {
      summary.cleanup = { status: 'rejected', reason: String(cleanupError) };
      error ??= cleanupError;
      process.exitCode = 1;
    }
  }
  summary.finishedAt = new Date().toISOString();
  summary.durationMs = Date.parse(summary.finishedAt) - Date.parse(summary.startedAt);
  summary.memory = memory;
  await mkdir(evidence, { recursive: true });
  await Promise.all([
    writeFile(path.join(evidence, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`),
    writeFile(path.join(evidence, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(path.join(evidence, 'fixture-path.txt'), `${root}\n`),
  ]);
}

if (error) throw error;
console.log(
  JSON.stringify({
    status: summary.status,
    sourceDigest: summary.provenance.sourceDigest,
    edits: summary.edits,
    durationMs: summary.durationMs,
    final: summary.final,
    cleanup: summary.cleanup,
    memory: summary.memory,
    heapTrend: summary.heapTrend,
    postCleanup: summary.postCleanup,
  }),
);

async function settledSample(edit, generation, observer) {
  await new Promise((resolve) => setImmediate(resolve));
  globalThis.gc();
  await new Promise((resolve) => setImmediate(resolve));
  globalThis.gc();
  const state = observer.state();
  assertObserverBounded(state);
  const processSample = processMemoryAndResources();
  return { edit, generation, ...processSample, observer: state };
}

async function postGcProcessSample() {
  await new Promise((resolve) => setImmediate(resolve));
  globalThis.gc();
  await new Promise((resolve) => setImmediate(resolve));
  globalThis.gc();
  return processMemoryAndResources();
}

function processMemoryAndResources() {
  const { rss, heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
  const activeResources = Object.fromEntries(
    Object.entries(
      process.getActiveResourcesInfo().reduce((counts, resource) => {
        counts[resource] = (counts[resource] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    rss,
    heapUsed,
    heapTotal,
    external,
    arrayBuffers,
    activeResourceCount: Object.values(activeResources).reduce((sum, count) => sum + count, 0),
    activeResources,
  };
}

function assertObserverBounded(state) {
  assert(state.historyCount <= 2, `Observer retained ${state.historyCount} full results`);
  assert.equal(state.historyLimit, 2);
  assert.equal(state.waiterCount, 0, 'Observer retained a settled result waiter');
  assert.equal(state.bufferedBytes, 0, 'Observer retained a partial result line');
}

function heapTrend(samples) {
  const count = samples.length;
  const meanX = samples.reduce((sum, sample) => sum + sample.edit, 0) / count;
  const meanY = samples.reduce((sum, sample) => sum + sample.heapUsed, 0) / count;
  const numerator = samples.reduce(
    (sum, sample) => sum + (sample.edit - meanX) * (sample.heapUsed - meanY),
    0,
  );
  const denominator = samples.reduce((sum, sample) => sum + (sample.edit - meanX) ** 2, 0);
  return {
    sampleCount: count,
    firstHeapUsed: samples[0].heapUsed,
    lastHeapUsed: samples.at(-1).heapUsed,
    minimumHeapUsed: Math.min(...samples.map((sample) => sample.heapUsed)),
    maximumHeapUsed: Math.max(...samples.map((sample) => sample.heapUsed)),
    leastSquaresBytesPerEdit: numerator / denominator,
  };
}
