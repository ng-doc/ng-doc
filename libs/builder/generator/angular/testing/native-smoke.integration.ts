import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Real Angular builders behind the NgDoc runner, scheduled by a real Architect in a child process
 * group the test owns. The child must exit on its own once its run is over (after a stop, as on
 * Ctrl-C, or after a fatal watcher error): a teardown that leaves Angular running keeps it alive,
 * and the group is then killed and the test fails.
 */
const fixtureRoot = path.join(import.meta.dirname, '.runtime', `smoke-${process.pid}`);
const entry = path.join(fixtureRoot, 'smoke-entry.mjs');
const restoreTheme = path.join(import.meta.dirname, '..', 'restore-theme.js');

function write(relative: string, value: string): void {
  const target = path.join(fixtureRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

beforeAll(async () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  write(
    'tsconfig.app.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'bundler',
        experimentalDecorators: true,
        useDefineForClassFields: false,
        skipLibCheck: true,
        strict: true,
        lib: ['ES2022', 'DOM'],
      },
      files: ['src/main.ts'],
    }),
  );
  write(
    'src/main.ts',
    `import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

@Component({ selector: 'app-root', template: '<h1>Native smoke</h1>' })
class AppComponent {}

void bootstrapApplication(AppComponent);
`,
  );
  write(
    'src/index.html',
    '<!doctype html><html><head><title>Native smoke</title></head><body><app-root></app-root></body></html>',
  );
  write('ng-doc/fixture/assets/marker.json', '{"generated":true}\n');
  // Inside the checkout, so the bundle's external imports resolve the installed packages.
  await build({
    entryPoints: [path.join(import.meta.dirname, 'native-smoke-entry.ts')],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  });
}, 60_000);

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

async function reservePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to reserve a TCP port.');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

/**
 * Whether the process group still exists. macOS answers EPERM for a group whose members have all
 * exited but are not reaped yet: that counts as present, and callers keep polling.
 */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** Runs the entry in its own process group; `outputs()` resolves with its builder outputs. */
function start(args: string[]) {
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: fixtureRoot,
    detached: true,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += String(chunk)));
  child.stderr.on('data', (chunk) => (stderr += String(chunk)));
  const exited = new Promise<number | null>((resolve) => child.once('close', resolve));
  const outputs = () =>
    stdout
      .split('\n')
      .filter((line) => line.startsWith('NGDOC_SMOKE {'))
      .map((line) => JSON.parse(line.slice('NGDOC_SMOKE '.length)) as Record<string, unknown>);
  const send = (command: string) => child.stdin.write(`${command}\n`);
  /** Waits for the group to end by itself; kills it (and fails) after `timeoutMs`. */
  const ended = async (timeoutMs: number) => {
    const end = Date.now() + timeoutMs;
    while (groupAlive(child.pid!) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    const leaked = groupAlive(child.pid!);
    if (leaked) {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        // Already gone between the probe and the signal.
      }
    }
    await exited;
    return !leaked;
  };
  return { exited, outputs, send, ended, log: () => `${stdout}\n${stderr}` };
}

async function assertPortFree(port: number): Promise<void> {
  const reuse = net.createServer();
  await new Promise<void>((resolve, reject) => {
    reuse.once('error', reject);
    reuse.listen(port, '127.0.0.1', resolve);
  });
  await new Promise<void>((resolve) => reuse.close(() => resolve()));
}

async function serve(port: number) {
  const run = start(['dev-server', fixtureRoot, restoreTheme, String(port)]);
  await until(() => run.outputs().length > 0, 90_000, `dev-server readiness\n${run.log()}`);
  expect(run.outputs()[0], run.log()).toMatchObject({ success: true });
  return run;
}

async function until(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(`${label} timed out`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('native Angular builders behind the NgDoc runner', () => {
  it('builds the application with generated assets and the theme script, then exits', async () => {
    const run = start(['application', fixtureRoot, restoreTheme]);
    expect(await run.ended(90_000), run.log()).toBe(true);
    expect(await run.exited, run.log()).toBe(0);
    expect(run.outputs()).toEqual([expect.objectContaining({ success: true })]);
    expect(run.log()).toContain('NGDOC_SMOKE_DONE');
    const index = fs.readFileSync(path.join(fixtureRoot, 'dist/browser/index.html'), 'utf8');
    expect(index).toContain('data-ng-doc-theme-restore');
    expect(
      fs.readFileSync(path.join(fixtureRoot, 'dist/browser/assets/ng-doc/marker.json'), 'utf8'),
    ).toContain('generated');
  }, 120_000);

  it('serves and rebuilds an edit, then stops and exits as on Ctrl-C', async () => {
    const port = await reservePort();
    const run = await serve(port);
    const origin = `http://127.0.0.1:${port}`;
    const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(10_000) });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<app-root></app-root>');
    expect(html).toContain('data-ng-doc-theme-restore');
    const asset = await fetch(`${origin}/assets/ng-doc/marker.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    expect(await asset.json()).toEqual({ generated: true });
    const main = path.join(fixtureRoot, 'src/main.ts');
    fs.writeFileSync(main, fs.readFileSync(main, 'utf8').replace('Native smoke', 'Edited smoke'));
    // Angular's dev server reports rebuilds in its log, not as builder outputs: the bundle it
    // serves changes.
    let rebuilt = false;
    const deadline = Date.now() + 60_000;
    while (!rebuilt && Date.now() < deadline) {
      const bundle = await fetch(`${origin}/main.js`, { signal: AbortSignal.timeout(10_000) });
      rebuilt = (await bundle.text()).includes('Edited smoke');
      if (!rebuilt) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(rebuilt, `rebuild after an edit\n${run.log()}`).toBe(true);
    run.send('stop');
    expect(await run.ended(20_000), `left running after a stop\n${run.log()}`).toBe(true);
    expect(run.log()).toContain('NGDOC_SMOKE_DONE');
    await assertPortFree(port);
  }, 180_000);

  it('ends the run and exits after a fatal watcher error', async () => {
    const port = await reservePort();
    const run = await serve(port);
    run.send('fatal');
    await until(() => run.outputs().length > 1, 20_000, `fatal output\n${run.log()}`);
    expect(run.outputs()[1]).toMatchObject({ success: false, error: '[WATCHER_ERROR] smoke' });
    expect(await run.ended(20_000), `left running after a fatal error\n${run.log()}`).toBe(true);
    expect(run.log()).toContain('NGDOC_SMOKE_DONE');
    await assertPortFree(port);
  }, 180_000);
});
