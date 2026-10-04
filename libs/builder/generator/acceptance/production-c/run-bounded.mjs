import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function runBounded(entry, { timeoutMs = 1_200_000, killGraceMs = 3_000 } = {}) {
  if (![timeoutMs, killGraceMs].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new Error('Acceptance deadlines must be positive safe integers.');
  const child = spawn(process.execPath, [entry], {
    detached: process.platform !== 'win32',
    env: process.env,
    stdio: 'inherit',
  });
  let reason;
  let closed = false;
  let forced = false;
  let killTimer;
  const signalOwned = (signal) => {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const stop = (signal) => {
    if (closed || reason) return;
    reason = signal;
    signalOwned('SIGTERM');
    killTimer = setTimeout(() => {
      forced = true;
      signalOwned('SIGKILL');
    }, killGraceMs);
  };
  const interrupt = () => stop('SIGINT');
  const terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  const timer = setTimeout(() => {
    console.error(`production-c acceptance exceeded ${timeoutMs}ms; stopping owned process group`);
    stop('timeout');
  }, timeoutMs);
  try {
    const [code, signal] = await once(child, 'close');
    closed = true;
    // The leader can exit before a descendant that ignores TERM. Finish the owned group.
    if (reason && child.pid && process.platform !== 'win32') {
      const groupAlive = () => {
        try {
          process.kill(-child.pid, 0);
          return true;
        } catch (error) {
          if (error.code === 'ESRCH') return false;
          throw error;
        }
      };
      if (groupAlive()) {
        forced = true;
        signalOwned('SIGKILL');
      }
      const until = Date.now() + 5000;
      while (groupAlive()) {
        if (Date.now() >= until)
          throw new Error(`Owned process group ${child.pid} did not exit after KILL`);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    return {
      code:
        reason === 'timeout'
          ? 124
          : reason === 'SIGINT'
            ? 130
            : reason === 'SIGTERM'
              ? 143
              : code ?? 1,
      signal,
      reason: reason ?? 'completed',
      forced,
      childPid: child.pid,
    };
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}

export const TIMEOUT_ENV = 'NGDOC_PRODUCTION_C_TIMEOUT_MS';

/** The production-c deadline. It never reads another harness's variable (vite-main's is 600 s). */
export function timeoutFromEnv(env = process.env) {
  const timeoutMs = Number(env[TIMEOUT_ENV] ?? 1_200_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error(`${TIMEOUT_ENV} must be a positive safe integer.`);
  return timeoutMs;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await runBounded(fileURLToPath(new URL('./run.mjs', import.meta.url)), {
    timeoutMs: timeoutFromEnv(),
  });
  process.exitCode = result.code;
}
