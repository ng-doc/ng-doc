import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatorRoot } from './fixture.mjs';

const filename = fileURLToPath(import.meta.url);
const directory = path.dirname(filename);
const repository = path.resolve(directory, '../../../../..');
const evidence = path.resolve(process.env.NGDOC_SSR_LIFECYCLE_EVIDENCE ?? '');
assert.ok(process.env.NGDOC_SSR_LIFECYCLE_EVIDENCE, 'NGDOC_SSR_LIFECYCLE_EVIDENCE is required');
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
assert.equal(process.version, 'v24.19.0');
const provenance = JSON.parse(
  await readFile(path.join(generatorRoot(repository), 'build-provenance.json'), 'utf8'),
);
assert.match(process.env.NGDOC_EXPECTED_SOURCE_DIGEST ?? '', /^[a-f0-9]{64}$/);
assert.equal(provenance.sourceDigest, process.env.NGDOC_EXPECTED_SOURCE_DIGEST);
const root = await mkdtemp(path.join(repository, 'tmp/ngdoc-ssr-lifecycle-'));
const child = fork(path.join(directory, 'worker.mjs'), [root, repository, evidence], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: process.env,
});
const groups = new Set([child.pid]);
child.on('message', (event) => {
  if (['owned-browser', 'owned-renderer'].includes(event?.kind) && Number.isInteger(event.pid))
    groups.add(event.pid);
});
let stdout = '',
  stderr = '',
  timedOut = false,
  overflow = false;
const collect = (kind, chunk) => {
  if (kind === 'stdout') stdout += chunk;
  else stderr += chunk;
  if (stdout.length + stderr.length > 30 * 1024 * 1024 && !overflow) {
    overflow = true;
    for (const pid of groups) kill(pid, 'SIGKILL');
  }
};
child.stdout.on('data', (chunk) => collect('stdout', chunk));
child.stderr.on('data', (chunk) => collect('stderr', chunk));
const timer = setTimeout(() => {
  timedOut = true;
  for (const pid of groups) kill(pid, 'SIGTERM');
}, 240_000);
const hard = setTimeout(() => {
  timedOut = true;
  for (const pid of groups) kill(pid, 'SIGKILL');
}, 250_000);
const exit = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code, signal) => resolve({ code, signal }));
});
clearTimeout(timer);
clearTimeout(hard);
const naturalDeadline = Date.now() + 5_000;
while ([...groups].some(alive) && Date.now() < naturalDeadline) await wait(50);
const forced = [...groups].filter(alive);
for (const pid of forced) kill(pid, 'SIGKILL');
const deadline = Date.now() + 10_000;
while (forced.some(alive) && Date.now() < deadline) await wait(50);
const supervisor = {
  ...exit,
  timedOut,
  overflow,
  requiredForcedCleanup: forced.length > 0,
  stillOwned: forced.filter(alive),
  joinedChild: true,
};
await writeFile(
  path.join(evidence, 'run.log'),
  JSON.stringify(supervisor) + '\n' + stdout + '\n' + stderr,
);
await save(path.join(evidence, 'supervisor.json'), supervisor);
const summary = {
  status:
    supervisor.code === 0 && !timedOut && !overflow && !supervisor.requiredForcedCleanup
      ? 'passed'
      : 'failed',
  node: process.version,
  provenance,
  sources: Object.fromEntries(
    await Promise.all(
      (await readdir(directory))
        .filter((file) => file.endsWith('.mjs'))
        .sort()
        .map(async (file) => [file, sha(await readFile(path.join(directory, file)))]),
    ),
  ),
  supervisor,
};
await rm(root, { recursive: true, force: true });
summary.fixtureRemoved = !existsSync(root);
await save(path.join(evidence, 'summary.json'), summary);
console.log(JSON.stringify(summary));
assert.equal(supervisor.code, 0, 'SSR lifecycle worker failed; inspect evidence');
assert.equal(timedOut || overflow || supervisor.requiredForcedCleanup, false);
