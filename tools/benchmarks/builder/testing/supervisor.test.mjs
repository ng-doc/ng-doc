import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseProcesses, descendants, supervise } from '../supervisor.mjs';
async function run(source, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-measure-test-'));
  try {
    const result = await supervise({
      command: process.execPath,
      args: ['-e', source],
      cwd: root,
      evidence: path.join(root, 'evidence'),
      lockFile: path.join(root, 'exclusive.lock'),
      timeoutMs: 2000,
      sampleIntervalMs: 30,
      shutdownMs: 100,
      ...options,
    });
    assert.deepEqual(
      JSON.parse(await readFile(path.join(root, 'evidence/result.json'), 'utf8')),
      result,
    );
    await assert.rejects(access(path.join(root, 'exclusive.lock')));
    return result;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('process selection includes escaped descendants and excludes unrelated groups', () => {
  const rows = parseProcesses(
    ' 10 1 10 50 node parent\n 11 10 11 70 browser\n 12 11 11 30 renderer\n 40 1 40 999 unrelated\n',
  );
  assert.deepEqual(
    descendants(rows, new Set([10])).map((r) => r.pid),
    [10, 11, 12],
  );
});
test('actual child IPC/product/log/RSS and natural cleanup', async () => {
  const result = await run(
    "console.log('real child'); process.send({type:'milestone',name:'foreground'}); process.send({type:'product-result',passed:true}); setTimeout(()=>process.disconnect(),120);",
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.correctnessPassed, true);
  assert.deepEqual(result.invalidations, []);
  assert.ok(result.peakTreeRssBytes > 0);
  assert.ok(result.milestones.foreground > 0);
  assert.equal(result.cleanupComplete, true);
});
test('natural zero exit without product gate cannot pass', async () => {
  const result = await run('process.disconnect()');
  assert.equal(result.correctnessPassed, false);
  assert.ok(result.invalidations.includes('product-not-passed'));
});
test('timeout and ignored TERM are bounded and cleaned', async () => {
  const result = await run("process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)", {
    timeoutMs: 150,
  });
  assert.ok(result.invalidations.includes('timeout'));
  assert.equal(result.cleanupComplete, true);
});
test('duplicate milestone invalidates rather than overriding fast timestamp', async () => {
  const result = await run(
    "process.send({type:'milestone',name:'full'}); process.send({type:'milestone',name:'full'}); setInterval(()=>{},1000)",
  );
  assert.ok(result.invalidations.some((s) => s.includes('duplicate')));
});
test('log overflow stops actual writer', async () => {
  const result = await run("setInterval(()=>console.log('x'.repeat(2000)),10)", {
    maxLogBytes: 1000,
  });
  assert.ok(result.invalidations.includes('log-overflow'));
  assert.equal(result.cleanupComplete, true);
});
test('active exclusive lock rejects a second consumer', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-lock-test-'));
  const options = {
    command: process.execPath,
    args: [
      '-e',
      "setTimeout(()=>{process.send({type:'product-result',passed:true});process.disconnect()},250)",
    ],
    cwd: root,
    evidence: path.join(root, 'one'),
    lockFile: path.join(root, 'lock'),
    timeoutMs: 2000,
  };
  try {
    const first = supervise(options);
    for (let i = 0; i < 100; i++) {
      try {
        await access(options.lockFile);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    await assert.rejects(supervise({ ...options, evidence: path.join(root, 'two') }), {
      code: 'EEXIST',
    });
    assert.deepEqual((await first).invalidations, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('escaped detached descendant cannot survive leader exit', async () => {
  const result = await run(
    "const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});c.unref();process.send({type:'product-result',passed:true});setTimeout(()=>process.disconnect(),250)",
  );
  assert.equal(result.cleanupComplete, true);
  assert.ok(result.invalidations.includes('forced-cleanup'));
  assert.ok(result.cleanup.some((item) => !item.natural));
});
test('abort joins owned group and preserves invalid sample', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150);
  try {
    const result = await run('setInterval(()=>{},1000)', { signal: controller.signal });
    assert.ok(result.invalidations.includes('aborted'));
    assert.equal(result.cleanupComplete, true);
  } finally {
    clearTimeout(timer);
  }
});
test('owner handshake retains detached child before first periodic sample', async () => {
  const result = await run(
    "const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});c.unref();process.on('message',m=>{if(m.type==='owner-accepted'){process.send({type:'product-result',passed:true});process.disconnect()}});process.send({type:'owner',id:'escaped',pid:c.pid})",
    { sampleIntervalMs: 1000 },
  );
  assert.equal(result.cleanupComplete, true);
  assert.ok(result.invalidations.includes('forced-cleanup'));
  assert.equal(result.cleanup.length, 2);
});
test('unrelated process cannot be registered as an owned group', async () => {
  const result = await run(
    "process.send({type:'owner',id:'unrelated',pid:process.ppid});setInterval(()=>{},1000)",
  );
  assert.ok(result.invalidations.some((s) => s.includes('not an observed descendant')));
});

test('invalid resource bounds fail before creating a lease or child', async () => {
  for (const name of ['timeoutMs', 'shutdownMs', 'maxLogBytes', 'sampleIntervalMs'])
    for (const value of [NaN, Infinity, -1, 0, 1.5])
      await assert.rejects(supervise({ timeoutMs: 1000, [name]: value }), /measurement bounds/);
});
