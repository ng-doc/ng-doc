import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runBounded, timeoutFromEnv } from './run-bounded.mjs';

const runner = new URL('./run-bounded.mjs', import.meta.url).href;
async function fixture(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-owned-process-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('preserves completed child exit and rejects invalid deadlines before spawning', async () => {
  await assert.rejects(runBounded('/unused', { timeoutMs: 0 }));
  await fixture(async (dir) => {
    const entry = path.join(dir, 'child.mjs');
    await writeFile(entry, 'process.exitCode = 7;');
    const result = await runBounded(entry, { timeoutMs: 3000 });
    assert.equal(result.code, 7);
    assert.equal(result.reason, 'completed');
  });
});

test('times out and joins a real child process', async () => {
  await fixture(async (dir) => {
    const entry = path.join(dir, 'child.mjs');
    await writeFile(entry, 'setInterval(() => {}, 1000);');
    const result = await runBounded(entry, { timeoutMs: 300, killGraceMs: 100 });
    assert.equal(result.code, 124);
    assert.equal(result.reason, 'timeout');
    assert.throws(() => process.kill(result.childPid, 0), { code: 'ESRCH' });
  });
});

test(
  'external termination reaches the detached owned child group',
  { skip: process.platform === 'win32', timeout: 10000 },
  async () => {
    await fixture(async (dir) => {
      const entry = path.join(dir, 'child.mjs');
      const wrapper = path.join(dir, 'wrapper.mjs');
      await writeFile(
        entry,
        `import {spawn} from 'node:child_process'; const nested=spawn(process.execPath,['-e','setInterval(() => {}, 1000)'],{stdio:'ignore'}); nested.once('spawn',()=>console.log('READY')); setInterval(() => {}, 1000);`,
      );
      await writeFile(
        wrapper,
        `import {runBounded} from ${JSON.stringify(runner)}; const result=await runBounded(${JSON.stringify(entry)},{timeoutMs:5000,killGraceMs:100}); console.log('RESULT '+JSON.stringify(result));`,
      );
      const child = spawn(process.execPath, [wrapper], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let signalled = false;
      child.stdout.on('data', (chunk) => {
        output += chunk;
        if (!signalled && output.includes('READY')) {
          signalled = true;
          child.kill('SIGTERM');
        }
      });
      const [code] = await once(child, 'close');
      assert.equal(code, 0);
      assert.ok(signalled);
      const result = JSON.parse(output.split('RESULT ')[1]);
      assert.equal(result.code, 143);
      assert.equal(result.reason, 'SIGTERM');
      assert.throws(() => process.kill(-result.childPid, 0), { code: 'ESRCH' });
    });
  },
);

test(
  'records forced cleanup of a noncooperative real child',
  { skip: process.platform === 'win32' },
  async () => {
    await fixture(async (dir) => {
      const entry = path.join(dir, 'child.mjs');
      await writeFile(entry, "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);");
      const result = await runBounded(entry, { timeoutMs: 300, killGraceMs: 100 });
      assert.equal(result.code, 124);
      assert.equal(result.forced, true);
      assert.throws(() => process.kill(result.childPid, 0), { code: 'ESRCH' });
    });
  },
);

test('reads its own timeout variable and ignores the vite-main one', () => {
  assert.equal(timeoutFromEnv({}), 1_200_000);
  assert.equal(timeoutFromEnv({ NGDOC_VITE_MAIN_TIMEOUT_MS: '600000' }), 1_200_000);
  assert.equal(
    timeoutFromEnv({
      NGDOC_PRODUCTION_C_TIMEOUT_MS: '45000',
      NGDOC_VITE_MAIN_TIMEOUT_MS: '600000',
    }),
    45_000,
  );
  for (const value of ['0', '-1', '1.5', 'soon', ''])
    assert.throws(
      () => timeoutFromEnv({ NGDOC_PRODUCTION_C_TIMEOUT_MS: value }),
      /NGDOC_PRODUCTION_C_TIMEOUT_MS must be a positive safe integer/,
    );
});
