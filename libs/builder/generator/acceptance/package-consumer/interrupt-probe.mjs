import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const evidence = path.resolve(process.env.NGDOC_PACKAGE_CONSUMER_EVIDENCE ?? '');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(
  process.env.NGDOC_PACKAGE_CONSUMER_EVIDENCE,
  'NGDOC_PACKAGE_CONSUMER_EVIDENCE is required',
);
assert.match(
  process.env.NGDOC_EXPECTED_SOURCE_DIGEST ?? '',
  /^[a-f0-9]{64}$/,
  'NGDOC_EXPECTED_SOURCE_DIGEST is required',
);
await mkdir(evidence, { recursive: true });
assert.deepEqual(await readdir(evidence), [], 'Use a fresh evidence directory for the probe');

const harnessEvidence = path.join(evidence, 'harness');
await mkdir(harnessEvidence);
const log = path.join(harnessEvidence, 'outer.log');
const descriptor = openSync(log, 'w');
const child = spawn(process.execPath, [path.join(directory, 'run.mjs')], {
  cwd: process.cwd(),
  detached: true,
  env: {
    ...process.env,
    NGDOC_PACKAGE_CONSUMER_EVIDENCE: harnessEvidence,
    NGDOC_PACKAGE_CONSUMER_HOLD: 'after-browser-before-publication',
  },
  shell: false,
  stdio: ['ignore', descriptor, descriptor],
});
closeSync(descriptor);
assert.ok(child.pid, 'Package consumer harness did not expose a PID');
const exitPromise = new Promise((resolve) => {
  child.once('error', (error) => resolve({ code: null, signal: null, error: String(error) }));
  child.once('close', (code, signal) => resolve({ code, signal }));
});

const groupAlive = (group) => {
  try {
    process.kill(-group, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
const signalGroup = (group, signal) => {
  try {
    process.kill(-group, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
};
const discoverGroups = () => {
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,command='], {
    encoding: 'utf8',
  })
    .split('\n')
    .flatMap((row) => {
      const match = row.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      return match
        ? [{ pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]) }]
        : [];
    });
  const descendants = new Set([child.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!descendants.has(row.ppid) || descendants.has(row.pid)) continue;
      descendants.add(row.pid);
      changed = true;
    }
  }
  return [...new Set(rows.filter((row) => descendants.has(row.pid)).map((row) => row.pgid))].filter(
    (group) => group > 1,
  );
};
const joinGroup = async (group) => {
  if (!groupAlive(group)) return;
  signalGroup(group, 'SIGTERM');
  for (let attempt = 0; attempt < 100 && groupAlive(group); attempt++) await delay(50);
  if (groupAlive(group)) signalGroup(group, 'SIGKILL');
  for (let attempt = 0; attempt < 100 && groupAlive(group); attempt++) await delay(50);
  assert.equal(groupAlive(group), false, `Probe-owned process group ${group} survived cleanup`);
};
let interrupted;
let interruptCleanup = Promise.resolve();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (interrupted) return;
    interrupted = signal;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    interruptCleanup = Promise.allSettled(discoverGroups().map((group) => joinGroup(group)));
  });
}

const readyPath = path.join(harnessEvidence, 'interrupt-ready.json');
let ready;
let exit;
try {
  for (let attempt = 0; attempt < 3_600; attempt++) {
    assert.equal(interrupted, undefined, `Probe interrupted by ${interrupted}`);
    try {
      ready = JSON.parse(await readFile(readyPath, 'utf8'));
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    assert.equal(child.exitCode, null, 'Package consumer exited before the held launch stage');
    assert.equal(
      child.signalCode,
      null,
      'Package consumer was signalled before the held launch stage',
    );
    await delay(250);
  }
  assert.equal(
    ready?.stage,
    'after-browser-before-publication',
    'Smoke did not reach the held launch stage',
  );
  assert.ok(Number.isSafeInteger(ready.browserGroup) && ready.browserGroup > 1);

  process.kill(child.pid, 'SIGTERM');
  exit = await Promise.race([exitPromise, delay(30_000).then(() => ({ timeout: true }))]);
  assert.equal(exit.timeout, undefined, 'Interrupted package consumer did not settle');

  let browserAlive = true;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      process.kill(-ready.browserGroup, 0);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
      browserAlive = false;
      break;
    }
    await delay(50);
  }
  assert.equal(
    browserAlive,
    false,
    `Browser group ${ready.browserGroup} survived outer interruption`,
  );

  const summary = JSON.parse(await readFile(path.join(harnessEvidence, 'summary.json'), 'utf8'));
  assert.equal(summary.status, 'failed');
  assert.equal(summary.interrupted, 'SIGTERM');
  assert.deepEqual(summary.cleanup.activeGroups, []);
  assert.equal(summary.cleanup.removed, true);
  assert.equal(summary.cleanup.retained, false);
  assert.notEqual(exit.code, 0);

  const result = {
    status: 'passed',
    node: process.version,
    harnessPid: child.pid,
    browserGroup: ready.browserGroup,
    exit,
    harness: {
      status: summary.status,
      interrupted: summary.interrupted,
      signalCleanup: summary.signalCleanup,
      cleanup: summary.cleanup,
    },
  };
  await writeFile(path.join(evidence, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await interruptCleanup;
  const groups = discoverGroups();
  if (ready?.browserGroup) groups.push(ready.browserGroup);
  for (const group of new Set(groups)) await joinGroup(group);
  await Promise.race([exitPromise, delay(5_000)]);
}
