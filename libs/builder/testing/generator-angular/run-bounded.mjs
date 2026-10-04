import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const deadlineMs = Number(process.env.NGDOC_GENERATOR_ANGULAR_TIMEOUT_MS ?? 180_000);
if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) {
  throw new Error('NGDOC_GENERATOR_ANGULAR_TIMEOUT_MS must be a positive safe integer.');
}

const child = spawn(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url))], {
  stdio: 'inherit',
  detached: process.platform !== 'win32',
  env: process.env,
});
let expired = false;
const stop = (signal) => {
  if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal);
  else child.kill(signal);
};
const deadline = setTimeout(() => {
  expired = true;
  console.error(`generator-angular exceeded ${deadlineMs}ms; terminating its process group`);
  stop('SIGTERM');
  setTimeout(() => stop('SIGKILL'), 2_000).unref();
}, deadlineMs);
const [code, signal] = await once(child, 'close');
clearTimeout(deadline);
if (expired) process.exitCode = 124;
else if (typeof code === 'number') process.exitCode = code;
else {
  console.error(`generator-angular stopped by ${signal}`);
  process.exitCode = 1;
}
