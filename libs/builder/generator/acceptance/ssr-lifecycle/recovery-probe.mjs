import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { generatorRoot, host, prepareFixture } from './fixture.mjs';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const evidence = path.resolve(process.env.NGDOC_SSR_RECOVERY_EVIDENCE ?? '');
assert.ok(process.env.NGDOC_SSR_RECOVERY_EVIDENCE, 'NGDOC_SSR_RECOVERY_EVIDENCE is required');
assert.match(process.env.NGDOC_EXPECTED_SOURCE_DIGEST ?? '', /^[a-f0-9]{64}$/);
const execute = promisify(execFile);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorText = (error) =>
  error instanceof Error ? error.stack ?? error.message : String(error);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const deadline = (label, promise, ms = 10_000) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
const root = await mkdtemp(path.join(repository, 'tmp/ngdoc-ssr-recovery-probe-'));
const report = { status: 'running', node: process.version, events: [] };
let server, renderer, rendererPid;

async function eventually(label, read, accept, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (accept(latest)) return latest;
    await wait(20);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}
async function rendererProcess() {
  const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,command=']);
  const rows = stdout
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean);
  const row = rows.find(
    (value) => Number(value[2]) === process.pid && value[4].includes('ssr-renderer-entry'),
  );
  return row ? { pid: Number(row[1]), pgid: Number(row[3]), command: row[4] } : undefined;
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

try {
  await mkdir(evidence, { recursive: true });
  const provenance = JSON.parse(
    await readFile(path.join(generatorRoot(repository), 'build-provenance.json'), 'utf8'),
  );
  assert.equal(provenance.sourceDigest, process.env.NGDOC_EXPECTED_SOURCE_DIGEST);
  report.provenance = provenance;
  await prepareFixture(root, repository);
  const dependency = path.join(root, 'src/recovery-dependency.mjs');
  const entry = path.join(root, 'src/recovery-render.mjs');
  const facade = path.join(root, 'src/recovery-facade.mjs');
  await writeFile(dependency, 'BROKEN\n');
  await writeFile(
    facade,
    `let current; let failure;
+export async function load(){if(current)return current;if(failure)throw failure;try{const module=await import('virtual:recovery-probe');current=module.value;return current;}catch(error){failure=error;throw error;}}
+if(import.meta.hot)import.meta.hot.accept('virtual:recovery-probe',(module)=>{if(module){current=module.value;failure=undefined;}});
+`.replaceAll('\n+', '\n'),
  );
  await writeFile(
    entry,
    `import {load} from './recovery-facade.mjs'; const state=globalThis; state.__ngDocRecoveryProbe??=String(Math.random());
+export async function render(){return state.__ngDocRecoveryProbe+':'+await load();}
+`.replaceAll('\n+', '\n'),
  );
  const observer = {
    name: 'ssr-recovery-observer',
    hotUpdate: {
      order: 'post',
      handler(context) {
        if (context.file === dependency)
          report.events.push({
            at: Date.now(),
            type: context.type,
            modules: context.modules.length,
          });
      },
    },
  };
  const setup = await host(root, repository, observer, undefined, '/src/recovery-render.mjs');
  const virtualId = 'virtual:recovery-probe';
  const resolvedVirtualId = '/@probe/recovery.mjs';
  setup.config.plugins.unshift({
    name: 'ssr-recovery-load-failure',
    enforce: 'pre',
    resolveId(id) {
      return id === virtualId ? resolvedVirtualId : null;
    },
    async load(id) {
      if (id !== resolvedVirtualId) return null;
      const state = await readFile(dependency, 'utf8');
      if (state.trim() === 'BROKEN') throw new Error('RECOVERY_FIRST');
      return "export const value='RECOVERY_FIXED';\n";
    },
  });
  renderer = setup.renderer;
  const { createServer } = await import('vite');
  server = await createServer(setup.config);
  await server.listen();
  report.origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const request = {
    document: '<!doctype html><html><body></body></html>',
    url: `${report.origin}/preview/probe`,
  };
  let first;
  try {
    await renderer.render(request);
    throw new Error('Expected initial dependency evaluation to fail');
  } catch (error) {
    first = errorText(error);
  }
  assert.match(first, /RECOVERY_FIRST/);
  rendererPid = await eventually(
    'renderer child',
    rendererProcess,
    (value) => value?.pid === value?.pgid,
  );
  report.renderer = rendererPid;
  const environment = server.environments.ssr;
  const failedNode = environment.moduleGraph.getModuleById(resolvedVirtualId);
  assert.ok(failedNode, 'Failed dependency must remain in the public SSR module graph');
  report.failedNode = {
    url: failedNode.url,
    isSelfAccepting: failedNode.isSelfAccepting ?? null,
    hasSsrError: Boolean(failedNode.ssrError),
  };
  const fixed = 'FIXED\n';
  await writeFile(dependency, fixed);
  await eventually(
    'public dependency hot update',
    async () => report.events,
    (value) => value.length > 0,
  );
  await environment.reloadModule(failedNode);
  let second;
  try {
    second = { status: 'fulfilled', value: await renderer.render(request) };
  } catch (error) {
    second = { status: 'rejected', reason: errorText(error) };
  }
  environment.moduleGraph.invalidateModule(failedNode);
  await environment.transformRequest(failedNode.url);
  await environment.reloadModule(failedNode);
  let third;
  try {
    third = { status: 'fulfilled', value: await renderer.render(request) };
  } catch (error) {
    third = { status: 'rejected', reason: errorText(error) };
  }
  report.first = first;
  report.second = second;
  report.third = third;
  report.repairedNode = {
    url: failedNode.url,
    isSelfAccepting: failedNode.isSelfAccepting ?? null,
    hasSsrError: Boolean(failedNode.ssrError),
  };
  report.fixedSha256 = sha(fixed);
  report.status =
    second.status === 'rejected' &&
    third.status === 'fulfilled' &&
    third.value.endsWith(':RECOVERY_FIXED')
      ? 'passed'
      : 'unexpected-result';
  await save(path.join(evidence, 'result-before-cleanup.json'), report);
  await Promise.all(Object.values(server.environments).map((value) => value.waitForRequestsIdle()));
} catch (error) {
  report.status = 'failed';
  report.error = errorText(error);
  process.exitCode = 1;
} finally {
  try {
    if (renderer) await deadline('renderer close', renderer.close());
  } catch (error) {
    report.cleanupError = errorText(error);
  }
  try {
    if (server) await deadline('server close', server.close(), 30_000);
  } catch (error) {
    report.cleanupError ??= errorText(error);
  }
  if (rendererPid)
    await eventually(
      'renderer group exit',
      async () => groupAlive(rendererPid.pid),
      (value) => !value,
      10_000,
    ).catch((error) => {
      report.cleanupError ??= errorText(error);
    });
  report.cleanup = {
    serverClosed: !server?.httpServer?.listening,
    rendererGroupGone: !rendererPid || !groupAlive(rendererPid.pid),
  };
  await rm(root, { recursive: true, force: true });
  report.fixtureRemoved = true;
  await save(path.join(evidence, 'results.json'), report);
  console.log(JSON.stringify(report));
}
