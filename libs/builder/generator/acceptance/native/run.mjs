import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  absent,
  artifactCacheFiles,
  assertComplete,
  createProject,
  fileState,
  provenance,
  startProject,
  success,
  waitAfter,
  writeTabs,
} from './support.mjs';

const evidence = path.resolve(
  process.env.NGDOC_NATIVE_EVIDENCE ??
    fileURLToPath(new URL('../../../../../tmp/acceptance/native', import.meta.url)),
);
const root = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-native-'));
const cacheParent = path.join(root, 'shared-cache-parent');
const trace = [];
const handles = [];
const summary = {
  status: 'failure',
  node: process.version,
  pid: process.pid,
  root,
  startedAt: new Date().toISOString(),
  provenance: await provenance(),
  checks: {},
};

async function stop(handle) {
  if (!handle) return;
  const index = handles.indexOf(handle);
  if (index >= 0) handles.splice(index, 1);
  await handle.stop();
}

async function main() {
  const alphaPaths = await createProject(path.join(root, 'alpha.project'), 'alpha', {
    cacheParent,
  });
  const betaPaths = await createProject(path.join(root, 'beta.project'), 'beta', { cacheParent });
  let [alpha, beta] = await Promise.all([
    startProject(alphaPaths, trace),
    startProject(betaPaths, trace),
  ]);
  handles.push(alpha, beta);
  let alphaResult = success(alpha.reconciled);
  let betaResult = success(beta.reconciled);
  await assertComplete(alphaResult, {
    html: ['alpha shared version 0'],
    api: ['InitialApi'],
    noApi: ['AddedApi'],
    routes: ['alpha', 'guide', 'api'],
  });
  await assertComplete(betaResult, {
    html: ['beta shared version 0'],
    api: ['InitialApi'],
    noApi: ['AddedApi'],
    routes: ['beta', 'guide', 'api'],
  });
  summary.checks.twoProjectsInitial = true;

  const createPending = waitAfter(
    alpha,
    alphaResult.generation,
    (result) => hasApi(result, 'AddedApi'),
    trace,
    'api-created',
  );
  await writeFile(
    alphaPaths.addedApi,
    '/** Added through a native glob membership event. */ export class AddedApi {}\n',
  );
  alphaResult = success(await createPending);
  const added = await assertComplete(alphaResult, {
    html: ['alpha shared version 0', 'AddedApi', '<a'],
    api: ['InitialApi', 'AddedApi'],
    keyword: 'AddedApi',
  });
  const addedArtifact = alphaResult.snapshot.artifacts.find((artifact) =>
    artifact.apiList.some((item) => item.name === 'AddedApi'),
  );
  assert(addedArtifact);
  const addedOutputs = addedArtifact.outputs.map((output) =>
    path.join(added.outputRoot, output.path),
  );

  const renamePending = waitAfter(
    alpha,
    alphaResult.generation,
    (result) => hasApi(result, 'RenamedApi') && !hasApi(result, 'AddedApi'),
    trace,
    'api-renamed',
  );
  await rename(alphaPaths.addedApi, alphaPaths.renamedApi);
  await writeFile(
    alphaPaths.renamedApi,
    '/** Renamed through native delete/create events. */ export class RenamedApi {}\n',
  );
  alphaResult = success(await renamePending);
  await assertComplete(alphaResult, {
    api: ['InitialApi', 'RenamedApi'],
    noApi: ['AddedApi'],
    keyword: 'RenamedApi',
    noKeyword: 'AddedApi',
  });
  for (const output of addedOutputs) assert.equal(await absent(output), true);
  const renamedArtifact = alphaResult.snapshot.artifacts.find((artifact) =>
    artifact.apiList.some((item) => item.name === 'RenamedApi'),
  );
  assert(renamedArtifact);
  const renamedOutputs = renamedArtifact.outputs.map((output) =>
    path.join(alphaResult.snapshot.configuration.outputRoot, output.path),
  );

  const deletePending = waitAfter(
    alpha,
    alphaResult.generation,
    (result) => result.status === 'success' && !hasApi(result, 'RenamedApi'),
    trace,
    'api-deleted',
  );
  await rm(alphaPaths.renamedApi);
  alphaResult = success(await deletePending);
  await assertComplete(alphaResult, {
    api: ['InitialApi'],
    noApi: ['AddedApi', 'RenamedApi'],
    noKeyword: 'RenamedApi',
  });
  for (const output of renamedOutputs) assert.equal(await absent(output), true);
  summary.checks.apiCreateRenameDelete = {
    addedOwnerOutputsRemoved: addedOutputs.length,
    renamedOwnerOutputsRemoved: renamedOutputs.length,
  };

  const rapidGeneration = alphaResult.generation;
  const rapidPending = waitAfter(
    alpha,
    rapidGeneration,
    (result) => hasHtml(result, 'alpha rapid final 8'),
    trace,
    'rapid-edits-converged',
  );
  for (let index = 1; index <= 8; index += 1) {
    await writeFile(alphaPaths.shared, `alpha rapid ${index === 8 ? 'final ' : ''}${index}.`);
  }
  alphaResult = success(await rapidPending);
  await assertComplete(alphaResult, { html: ['alpha rapid final 8'] });
  assert.equal(hasHtml(alphaResult, 'alpha rapid 7'), false);
  summary.checks.rapidLatestWins = true;

  const beforeFailure = await fileState(alphaPaths.output);
  const failurePending = waitAfter(
    alpha,
    alphaResult.generation,
    (result) => result.status === 'failure',
    trace,
    'include-missing-failure',
  );
  await rm(alphaPaths.shared);
  const failed = await failurePending;
  assert.equal(failed.status, 'failure');
  assert.equal(failed.lastGoodRevision, alphaResult.snapshot.revision);
  assert(failed.diagnostics.some((diagnostic) => diagnostic.severity === 'error'));
  assert.deepEqual(await fileState(alphaPaths.output), beforeFailure);

  const recoveryPending = waitAfter(
    alpha,
    failed.generation,
    (result) => hasHtml(result, 'alpha repaired at a new path'),
    trace,
    'include-repaired-new-path',
  );
  await writeFile(alphaPaths.repaired, 'alpha repaired at a new path.');
  await writeTabs(alphaPaths, './shared-repaired.nunj');
  alphaResult = success(await recoveryPending);
  await assertComplete(alphaResult, { html: ['alpha repaired at a new path'] });
  summary.checks.errorLastGoodAndNewPathRepair = true;

  const alphaIsolation = waitAfter(
    alpha,
    alphaResult.generation,
    (result) => hasHtml(result, 'alpha isolated update'),
    trace,
    'alpha-isolated-update',
  );
  const betaIsolation = waitAfter(
    beta,
    betaResult.generation,
    (result) => hasHtml(result, 'beta isolated update'),
    trace,
    'beta-isolated-update',
  );
  await Promise.all([
    writeFile(alphaPaths.repaired, 'alpha isolated update.'),
    writeFile(betaPaths.shared, 'beta isolated update.'),
  ]);
  [alphaResult, betaResult] = [success(await alphaIsolation), success(await betaIsolation)];
  const alphaComplete = await assertComplete(alphaResult, { html: ['alpha isolated update'] });
  const betaComplete = await assertComplete(betaResult, { html: ['beta isolated update'] });
  assert.doesNotMatch(alphaComplete.html, /beta isolated update/);
  assert.doesNotMatch(betaComplete.html, /alpha isolated update/);
  assert.notEqual(alphaResult.snapshot.projectId, betaResult.snapshot.projectId);
  summary.checks.twoProjectIsolation = true;

  await stop(beta);
  beta = undefined;
  await stop(alpha);
  alpha = undefined;
  const warmState = await fileState(alphaPaths.output);
  alpha = await startProject(alphaPaths, trace);
  handles.push(alpha);
  alphaResult = success(alpha.reconciled);
  assert(alpha.observer.results.every((result) => result.status === 'success'));
  assert(alpha.observer.results.every((result) => result.whyRebuilt.length === 0));
  await assertComplete(alphaResult, { html: ['alpha isolated update'], api: ['InitialApi'] });
  const restartedState = await fileState(alphaPaths.output);
  const previousManifest = warmState['.ng-doc-output-manifest.json'];
  const restartedManifest = restartedState['.ng-doc-output-manifest.json'];
  delete warmState['.ng-doc-output-manifest.json'];
  delete restartedState['.ng-doc-output-manifest.json'];
  assert.deepEqual(restartedState, warmState);
  assert.notEqual(previousManifest.digest, restartedManifest.digest);
  summary.checks.freshSessionWarmMtimes = {
    generatedFilesUnchanged: true,
    generatedFileCount: Object.keys(restartedState).length,
    manifestRepublishedForResetGeneration: true,
  };

  const beforeRepair = await fileState(alphaPaths.output);
  const guideOutput = alphaResult.snapshot.artifacts
    .flatMap((artifact) => artifact.outputs)
    .find((output) => output.role === 'content');
  const routesOutput = alphaResult.snapshot.artifacts
    .flatMap((artifact) => artifact.outputs)
    .find((output) => output.role === 'routes');
  assert(guideOutput && routesOutput);
  const missingGuide = path.join(alphaPaths.output, guideOutput.path);
  const missingRoutes = path.join(alphaPaths.output, routesOutput.path);
  const repairPending = waitAfter(
    alpha,
    alphaResult.generation,
    (result) =>
      result.status === 'success' &&
      result.whyRebuilt.some((reason) => reason.reason === 'output-missing'),
    trace,
    'missing-outputs-repaired',
  );
  await Promise.all([rm(missingGuide), rm(missingRoutes)]);
  await writeFile(alphaPaths.tsconfig, await readFile(alphaPaths.tsconfig));
  alphaResult = success(await repairPending);
  await assertComplete(alphaResult, { html: ['alpha isolated update'], api: ['InitialApi'] });
  assert.equal(await absent(missingGuide), false);
  assert.equal(await absent(missingRoutes), false);
  const afterRepair = await fileState(alphaPaths.output);
  for (const stable of ['context.ts', 'assets/keywords.json']) {
    assert.deepEqual(afterRepair[stable], beforeRepair[stable]);
  }
  summary.checks.missingOutputsRepair = {
    reasons: alphaResult.whyRebuilt.filter((reason) => reason.reason === 'output-missing'),
  };

  await stop(alpha);
  alpha = undefined;
  const corruptOutput = path.join(alphaPaths.output, guideOutput.path);
  await writeFile(corruptOutput, 'corrupt physical output');
  const cacheFiles = await artifactCacheFiles(alphaPaths.cache);
  assert(cacheFiles.length >= 2);
  const corruptCache = await pageCache(cacheFiles);
  await writeFile(corruptCache, '{not-json');
  alpha = await startProject(alphaPaths, trace);
  handles.push(alpha);
  alphaResult = success(alpha.reconciled);
  const corruptReasons = alpha.observer.results.flatMap((result) => result.whyRebuilt);
  assert(corruptReasons.some((reason) => reason.reason === 'cache-miss'));
  await assertComplete(alphaResult, { html: ['alpha isolated update'], api: ['InitialApi'] });
  JSON.parse(await readFile(corruptCache, 'utf8'));
  assert.notEqual(await readFile(corruptOutput, 'utf8'), 'corrupt physical output');
  summary.checks.corruptCacheAndOutputRepair = {
    reasons: corruptReasons.filter((reason) => reason.reason === 'cache-miss'),
  };

  await stop(alpha);
  alpha = undefined;
  const indexes = (await recursiveFiles(alphaPaths.cache)).filter((file) =>
    file.endsWith('.compilation-index.json'),
  );
  assert.equal(indexes.length, 1);
  await rm(indexes[0]);
  const missingSearch = path.join(alphaPaths.output, 'assets/indexes.json');
  await rm(missingSearch);
  alpha = await startProject(alphaPaths, trace);
  handles.push(alpha);
  alphaResult = success(alpha.reconciled);
  const missingCacheReasons = alpha.observer.results.flatMap((result) => result.whyRebuilt);
  assert(missingCacheReasons.some((reason) => reason.reason === 'initial'));
  const finalComplete = await assertComplete(alphaResult, {
    html: ['alpha isolated update'],
    api: ['InitialApi'],
    noApi: ['AddedApi', 'RenamedApi'],
  });
  assert.equal(await absent(missingSearch), false);
  summary.checks.missingCacheAndOutputRepair = {
    reasons: missingCacheReasons.filter((reason) => reason.reason === 'initial'),
  };
  summary.checks.final = {
    projectId: alphaResult.snapshot.projectId,
    revision: alphaResult.snapshot.revision,
    manifestFiles: alphaResult.manifest.files.length,
    outputs: finalComplete.outputs.length,
    searchRecords: finalComplete.search.length,
    apiEntries: finalComplete.api.length,
    resultCount: trace.filter((event) => event.generation !== undefined).length,
  };

  await stop(alpha);
  alpha = undefined;
  summary.status = 'passed';
}

function hasApi(result, name) {
  return (
    result.status === 'success' &&
    result.snapshot.artifacts
      .flatMap((artifact) => artifact.apiList)
      .some((item) => item.name === name)
  );
}

function hasHtml(result, text) {
  return (
    result.status === 'success' &&
    result.snapshot.artifacts
      .flatMap((artifact) => artifact.content)
      .some((content) => content.html.includes(text))
  );
}

async function pageCache(files) {
  for (const file of files) {
    const artifact = JSON.parse(await readFile(file, 'utf8'));
    if (artifact.identity?.role === 'page-shell') return file;
  }
  throw new Error('No page-shell artifact cache file found');
}

async function recursiveFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(absolute);
    }
  }
  await visit(root);
  return files;
}

let error;
try {
  await main();
} catch (caught) {
  error = caught;
  summary.error =
    caught instanceof Error ? { message: caught.message, stack: caught.stack } : caught;
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled(handles.splice(0).map((handle) => handle.stop()));
  summary.cleanup = {
    stoppedWatches: trace.filter((event) => event.event === 'stopped').length,
    pendingHandles: handles.length,
    lateSettlements: cleanup.map((result) =>
      result.status === 'fulfilled'
        ? { status: result.status }
        : { status: result.status, reason: String(result.reason) },
    ),
  };
  summary.finishedAt = new Date().toISOString();
  summary.rssBytes = process.memoryUsage().rss;
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
    checks: summary.checks,
    cleanup: summary.cleanup,
  }),
);
