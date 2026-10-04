import { spawn, execFileSync } from 'node:child_process';
import { openSync, closeSync, writeSync } from 'node:fs';
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function parseProcesses(text) {
  return text.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    return match
      ? [{ pid: +match[1], ppid: +match[2], pgid: +match[3], rssKiB: +match[4], command: match[5] }]
      : [];
  });
}
export function descendants(rows, groups) {
  const selected = new Set(rows.filter((row) => groups.has(row.pgid)).map((row) => row.pid));
  let changed;
  do {
    changed = false;
    for (const row of rows)
      if (selected.has(row.ppid) && !selected.has(row.pid)) {
        selected.add(row.pid);
        changed = true;
      }
  } while (changed);
  return rows.filter((row) => selected.has(row.pid));
}
function alive(group) {
  try {
    process.kill(-group, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
function signalGroup(group, signal) {
  try {
    process.kill(-group, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

/** The child owns the real host/browser and sends product-gated milestones via IPC.
 * This supervisor never promotes a socket or child exit into a product success. */
export async function supervise({
  command,
  args,
  cwd,
  env = {},
  evidence,
  lockFile,
  timeoutMs,
  sampleIntervalMs = 100,
  maxLogBytes = 64 * 1024 * 1024,
  shutdownMs = 5000,
  signal,
}) {
  if (process.platform === 'win32') throw new Error('POSIX benchmark supervisor only');
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(sampleIntervalMs) ||
    sampleIntervalMs < 10 ||
    !Number.isSafeInteger(shutdownMs) ||
    shutdownMs < 1 ||
    !Number.isSafeInteger(maxLogBytes) ||
    maxLogBytes < 1
  )
    throw new TypeError('Invalid measurement bounds');
  if (!path.isAbsolute(evidence) || !path.isAbsolute(lockFile))
    throw new TypeError('Use absolute evidence and lock paths');
  signal?.throwIfAborted();
  await mkdir(path.dirname(lockFile), { recursive: true });
  const lock = await open(lockFile, 'wx');
  let ownsEvidence = false;
  const files = [];
  const groups = new Set();
  const result = {
    exitCode: null,
    cleanupComplete: false,
    exclusiveOwnership: true,
    clockContinuous: true,
    correctnessPassed: false,
    milestones: {},
    peakTreeRssBytes: 0,
    rssSamples: 0,
    invalidations: [],
    cleanup: [],
  };
  let child,
    timer,
    deadline,
    stopping = false,
    logBytes = 0;
  let started = performance.now();
  let wallStarted = Date.now();
  let lastSample = started;
  const invalid = (reason) => {
    if (!result.invalidations.includes(reason)) result.invalidations.push(reason);
  };
  const elapsed = () => performance.now() - started;
  const sample = () => {
    const now = performance.now();
    if (Math.abs(Date.now() - wallStarted - (now - started)) > 2000 || now - lastSample > 5000) {
      result.clockContinuous = false;
      invalid('clock-or-sampler-discontinuity');
    }
    lastSample = now;
    const rows = descendants(
      parseProcesses(
        execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,rss=,command='], {
          encoding: 'utf8',
          timeout: 3000,
        }),
      ),
      groups,
    );
    for (const row of rows) if (row.pgid > 1) groups.add(row.pgid);
    const rssBytes = rows.reduce((sum, row) => sum + row.rssKiB * 1024, 0);
    result.peakTreeRssBytes = Math.max(result.peakTreeRssBytes, rssBytes);
    result.rssSamples++;
    writeSync(files[1], JSON.stringify({ elapsedMs: elapsed(), rssBytes, rows }) + '\n');
  };
  const stop = (reason) => {
    invalid(reason);
    if (stopping) return;
    stopping = true;
    try {
      sample();
    } catch (error) {
      invalid(`sampling: ${error.message}`);
    }
    for (const group of groups) signalGroup(group, 'SIGTERM');
    deadline = setTimeout(() => {
      for (const group of groups) signalGroup(group, 'SIGKILL');
    }, shutdownMs);
  };
  const abort = () => stop('aborted');
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, evidence, startedAt: new Date().toISOString() }),
    );
    await mkdir(evidence);
    ownsEvidence = true;
    await writeFile(
      path.join(evidence, 'command.json'),
      JSON.stringify(
        { command, args, cwd, env, timeoutMs, sampleIntervalMs, maxLogBytes, shutdownMs },
        null,
        2,
      ) + '\n',
    );
    for (const name of ['child.log', 'rss.jsonl', 'events.jsonl'])
      files.push(openSync(path.join(evidence, name), 'wx'));
    started = performance.now();
    wallStarted = Date.now();
    lastSample = started;
    child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      detached: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    if (child.pid) groups.add(child.pid);
    const exited = new Promise((resolve) => {
      child.once('error', (error) => {
        invalid(`spawn: ${error.message}`);
        resolve();
      });
      child.once('close', (code, exitSignal) => {
        result.exitCode = code;
        result.signal = exitSignal;
        resolve();
      });
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        logBytes += chunk.length;
        if (logBytes > maxLogBytes) {
          stop('log-overflow');
          return;
        }
        try {
          writeSync(files[0], chunk);
        } catch (error) {
          stop(`log-write: ${error.message}`);
        }
      });
    child.on('message', (event) => {
      try {
        if (!event || typeof event !== 'object') throw new Error('Invalid child event');
        const encoded = JSON.stringify({ elapsedMs: elapsed(), event });
        if (encoded.length > 64 * 1024) throw new Error('Oversized child event');
        writeSync(files[2], encoded + '\n');
        if (event.type === 'owner') {
          if (!Number.isSafeInteger(event.pid) || event.pid <= 1 || typeof event.id !== 'string')
            throw new Error('Invalid owner registration');
          const rows = parseProcesses(
            execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,rss=,command='], {
              encoding: 'utf8',
              timeout: 3000,
            }),
          );
          const owned = descendants(rows, groups).find((row) => row.pid === event.pid);
          if (!owned || owned.pgid <= 1) throw new Error('Owner is not an observed descendant');
          groups.add(owned.pgid);
          child.send({ type: 'owner-accepted', id: event.id, pid: event.pid });
        }
        if (event.type === 'milestone') {
          if (
            !['listening', 'foreground', 'index', 'full'].includes(event.name) ||
            result.milestones[event.name] !== undefined
          )
            throw new Error('Unknown or duplicate milestone');
          result.milestones[event.name] = elapsed();
        }
        if (event.type === 'product-result') {
          if (result.product !== undefined) throw new Error('Duplicate product result');
          result.product = event;
          result.correctnessPassed = event.passed === true;
        }
      } catch (error) {
        stop(`protocol: ${error.message}`);
      }
    });
    timer = setInterval(() => {
      try {
        sample();
      } catch (error) {
        stop(`sampling: ${error.message}`);
      }
    }, sampleIntervalMs);
    const timeout = setTimeout(() => stop('timeout'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    await exited;
    clearTimeout(timeout);
    clearInterval(timer);
    clearTimeout(deadline);
    try {
      sample();
    } catch (error) {
      invalid(`final-sampling: ${error.message}`);
    }
    if (result.exitCode !== 0) invalid('child-exit');
    if (!result.correctnessPassed) invalid('product-not-passed');
  } finally {
    clearInterval(timer);
    clearTimeout(deadline);
    signal?.removeEventListener('abort', abort);
    // Track escaped browser groups while their ancestry is visible, including before
    // the browser helper publishes readiness. Never trust a child-supplied PGID.
    const cleanupErrors = [];
    for (const group of groups) {
      try {
        if (!alive(group)) {
          result.cleanup.push({ group, natural: true });
          continue;
        }
        invalid('forced-cleanup');
        signalGroup(group, 'SIGTERM');
        for (let i = 0; i < shutdownMs / 50 && alive(group); i++) await delay(50);
        if (alive(group)) signalGroup(group, 'SIGKILL');
        for (let i = 0; i < 100 && alive(group); i++) await delay(50);
        result.cleanup.push({ group, natural: false, survived: alive(group) });
      } catch (error) {
        cleanupErrors.push(String(error));
        result.cleanup.push({ group, survived: true, error: String(error) });
      }
    }
    result.cleanupComplete = result.cleanup.every((item) => !item.survived);
    result.durationMs = elapsed();
    result.logBytes = logBytes;
    for (const fd of files) {
      try {
        closeSync(fd);
      } catch (error) {
        cleanupErrors.push(String(error));
      }
    }
    result.cleanupErrors = cleanupErrors;
    if (cleanupErrors.length) invalid('cleanup-errors');
    try {
      if (ownsEvidence)
        await writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    } catch (error) {
      cleanupErrors.push(String(error));
    }
    try {
      await lock.close();
    } catch (error) {
      cleanupErrors.push(String(error));
    }
    // A surviving owner or failed evidence write blocks all subsequent cells.
    if (result.cleanupComplete && !cleanupErrors.length) await rm(lockFile);
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Benchmark cleanup/evidence failed; lock retained');
  }
  return result;
}
