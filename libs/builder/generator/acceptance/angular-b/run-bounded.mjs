import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const timeoutMs = Number(process.env.NGDOC_ANGULAR_B_TIMEOUT_MS ?? 360_000);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
  throw new Error('NGDOC_ANGULAR_B_TIMEOUT_MS must be a positive safe integer.');
}

const child = spawn(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url))], {
  detached: process.platform !== 'win32',
  env: process.env,
  stdio: 'inherit',
});
const signalOwned = (signal) => {
  if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal);
  else child.kill(signal);
};
let expired = false;
const timer = setTimeout(() => {
  expired = true;
  console.error(`angular-b acceptance exceeded ${timeoutMs}ms; stopping owned process group`);
  signalOwned('SIGTERM');
  setTimeout(() => signalOwned('SIGKILL'), 3_000).unref();
}, timeoutMs);
const [code, signal] = await once(child, 'close');
clearTimeout(timer);
if (expired) process.exitCode = 124;
else if (typeof code === 'number') process.exitCode = code;
else {
  console.error(`angular-b acceptance stopped by ${signal}`);
  process.exitCode = 1;
}
