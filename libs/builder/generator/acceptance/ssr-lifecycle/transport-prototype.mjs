import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer, createServerModuleRunnerTransport } from 'vite';

const filename = fileURLToPath(import.meta.url);
const directory = path.dirname(filename);
const repository = path.resolve(directory, '../../../../..');
const evidence = path.resolve(process.env.NGDOC_SSR_TRANSPORT_EVIDENCE ?? '');
assert.ok(process.env.NGDOC_SSR_TRANSPORT_EVIDENCE, 'NGDOC_SSR_TRANSPORT_EVIDENCE is required');
assert.equal(process.version, 'v24.19.0');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
const kill = (pid, signal) => {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
};

await mkdir(evidence, { recursive: true });
const provenance = JSON.parse(
  await readFile(
    path.join(repository, 'dist/libs/builder/generator/build-provenance.json'),
    'utf8',
  ),
);
assert.match(process.env.NGDOC_EXPECTED_SOURCE_DIGEST ?? '', /^[a-f0-9]{64}$/);
assert.equal(provenance.sourceDigest, process.env.NGDOC_EXPECTED_SOURCE_DIGEST);
const installed = Object.fromEntries(
  await Promise.all(
    ['vite', 'zone.js', 'sass-embedded'].map(async (name) => [
      name,
      JSON.parse(
        await readFile(path.join(repository, 'node_modules', name, 'package.json'), 'utf8'),
      ).version,
    ]),
  ),
);
const root = await mkdtemp(path.join(repository, 'tmp/ngdoc-ssr-transport-'));
const entry = path.join(root, 'entry.mjs');
const source = (version) => `import 'zone.js/node';
const state=globalThis.__ngDocSsrTransportProbe??={epoch:0,waiters:[]};
if(import.meta.hot){
  import.meta.hot.accept();
  import.meta.hot.on('ngdoc:ssr-barrier',(data)=>{
    state.epoch=data.epoch;
    for(const resolve of state.waiters.splice(0))resolve(state.epoch);
  });
}
export function render(input){return {version:${JSON.stringify(version)},promise:globalThis.Promise.name,epoch:state.epoch,input};}
`;
await writeFile(path.join(root, 'package.json'), '{' + '"private":true,"type":"module"' + '}\n');
await writeFile(entry, source('ONE'));

const nativePromise = globalThis.Promise;
const report = {
  status: 'running',
  node: process.version,
  provenance,
  installed,
  checks: [],
  payloads: [],
  parentPromiseBefore: nativePromise.name,
};
let server, serverTransport, child, childExit;
let childReady = false;
const serverQueue = [];
const pending = new Map();
let sequence = 0;
let stdout = '',
  stderr = '';
const sendToChild = (message) => {
  if (childReady) child.send(message);
  else serverQueue.push(message);
};
const request = (command, data = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for child command ${command}`));
    }, 30_000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    sendToChild({ kind: 'command', id, command, ...data });
  });

try {
  server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const environment = server.environments.ssr;
  assert.ok(environment && 'api' in environment.hot);
  child = fork(path.join(directory, 'transport-child.mjs'), [], {
    detached: true,
    serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: process.env,
  });
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  childExit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  child.on('message', (message) => {
    if (message?.kind === 'ready') {
      childReady = true;
      for (const queued of serverQueue.splice(0)) child.send(queued);
      return;
    }
    if (message?.kind === 'child-to-server') {
      void serverTransport.send(message.payload);
      return;
    }
    if (message?.kind === 'response') {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) {
        const error = Object.assign(new Error(message.error.message), message.error);
        waiter.reject(error);
      } else waiter.resolve(message.value);
    }
  });
  serverTransport = createServerModuleRunnerTransport({ channel: environment.hot });
  serverTransport.connect({
    onMessage(payload) {
      report.payloads.push({
        type: payload.type,
        ...(payload.type === 'update'
          ? {
              updates: payload.updates.map((update) => ({
                type: update.type,
                path: update.path,
                acceptedPath: update.acceptedPath,
              })),
            }
          : {}),
      });
      sendToChild({ kind: 'server-to-child', payload });
    },
    onDisconnection() {
      sendToChild({ kind: 'server-disconnected' });
    },
  });

  const first = await request('render', { entry: '/entry.mjs', input: { url: '/one' } });
  assert.deepEqual(first, {
    version: 'ONE',
    promise: 'ZoneAwarePromise',
    epoch: 0,
    input: { url: '/one' },
  });
  assert.equal(globalThis.Promise, nativePromise);
  report.first = first;
  report.checks.push(
    'The child public ModuleRunner evaluates zoned SSR while the parent Promise constructor remains native',
  );

  const updatePayload = new Promise((resolve) => {
    const inspect = () => {
      const payload = report.payloads.find(
        (item) =>
          item.type === 'update' && item.updates.some((update) => update.path === '/entry.mjs'),
      );
      if (payload) resolve(payload);
      else setTimeout(inspect, 10);
    };
    inspect();
  });
  await writeFile(entry, source('TWO'));
  report.updatePayload = await Promise.race([
    updatePayload,
    wait(30_000).then(() => {
      throw new Error('Timed out waiting for the real Vite entry update');
    }),
  ]);
  sendToChild({
    kind: 'server-to-child',
    payload: { type: 'custom', event: 'ngdoc:ssr-barrier', data: { epoch: 1 } },
  });
  report.childEpoch = await request('wait-epoch', { target: 1 });
  const second = await request('render', { entry: '/entry.mjs', input: { url: '/two' } });
  assert.equal(second.version, 'TWO');
  assert.equal(second.promise, 'ZoneAwarePromise');
  assert.ok(second.epoch >= 1);
  assert.equal(globalThis.Promise, nativePromise);
  report.second = second;
  report.checks.push(
    'A real file edit crosses the relayed public HMR transport and the same child returns the fresh export after an ordered public custom barrier',
  );

  report.childClose = await request('close');
  const exit = await childExit;
  assert.deepEqual(exit, { code: 0, signal: null });
  report.childExit = exit;
  child = undefined;
  serverTransport.disconnect();
  serverTransport = undefined;
  await server.close();
  server = undefined;
  report.checks.push(
    'The child runner, relayed transport and sole parent Vite server close and join',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
} finally {
  for (const waiter of pending.values())
    waiter.reject(new Error('SSR transport prototype disposed'));
  pending.clear();
  try {
    serverTransport?.disconnect();
  } catch {
    /* already disconnected */
  }
  if (child) {
    try {
      await request('close');
    } catch {
      /* the child may be gone; it is killed below */
    }
    const naturalDeadline = Date.now() + 3_000;
    while (alive(child.pid) && Date.now() < naturalDeadline) await wait(25);
    if (alive(child.pid)) kill(child.pid, 'SIGKILL');
    try {
      report.childExit = await childExit;
    } catch {
      /* no exit report for a failed child */
    }
  }
  try {
    await server?.close();
  } catch (error) {
    report.cleanupError = String(error);
  }
  report.parentPromiseAfter = globalThis.Promise.name;
  report.parentPromiseUnchanged = globalThis.Promise === nativePromise;
  report.cleanup = {
    childAlive: child ? alive(child.pid) : false,
    serverListening: server?.httpServer?.listening ?? false,
  };
  report.stdout = stdout;
  report.stderr = stderr;
  report.sources = {
    child: sha(await readFile(path.join(directory, 'transport-child.mjs'))),
    prototype: sha(await readFile(filename)),
  };
  await save(path.join(evidence, 'results.json'), report);
  await rm(root, { recursive: true, force: true });
  report.fixtureRemoved = !existsSync(root);
  await save(path.join(evidence, 'summary.json'), report);
  console.log(JSON.stringify(report));
}
