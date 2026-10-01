import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const serverEntry = resolve(workspaceRoot, process.argv[2] ?? 'dist/apps/ng-doc/server/server.mjs');
const browserFolder = resolve(dirname(serverEntry), '../browser');
const mountServerEntry = fileURLToPath(new URL('./mount-built-server.mjs', import.meta.url));
const temporaryCwd = await mkdtemp(join(tmpdir(), 'ng-doc-ssr-entry-'));

function fetchBounded(url) {
  return fetch(url, { signal: AbortSignal.timeout(5_000) });
}

async function capture(command, args, options = {}) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));

  const result = await new Promise((settle, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timed out running ${command} ${args.join(' ')}`));
    }, 30_000);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      settle({ code, signal });
    });
  });

  return { ...result, stdout, stderr };
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Server exited with ${child.exitCode}.\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`,
      );
    }
    try {
      const response = await fetchBounded(url);
      if (response.status < 500) return;
    } catch {
      // The TCP listener may not be ready yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(
    `Server did not become ready.\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`,
  );
}

async function getHtml(origin, route, expectedContent) {
  const response = await fetchBounded(`${origin}${route}`);
  const body = await response.text();
  assert.equal(response.status, 200, `${route} returned ${response.status}`);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/);
  assert.match(body, /<html[\s>]/i);
  assert.match(body, /<ng-doc-root[\s>]/i);
  assert.match(body, expectedContent);
  assert.ok(body.length > 1_000, `${route} returned an unexpectedly small page`);
  return body;
}

async function stopServer(server) {
  server.kill('SIGTERM');
  await new Promise((resolveExit) => {
    if (server.exitCode !== null) return resolveExit();
    server.once('exit', resolveExit);
    setTimeout(() => {
      server.kill('SIGKILL');
      resolveExit();
    }, 5_000).unref();
  });
}

async function verifyRunningServer(command, args, env, prefix = '') {
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const output = { stdout: '', stderr: '' };
  const server = spawn(command, args, {
    cwd: temporaryCwd,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => (output.stdout += chunk));
  server.stderr.on('data', (chunk) => (output.stderr += chunk));

  try {
    const installationRoute = `${prefix}/docs/get-started/installation`;
    const demoRoute = `${prefix}/docs/demos-and-playgrounds/demos`;
    await waitForServer(`${origin}${installationRoute}`, server, output);
    // The heading anchor moves the heading's text into a label span that names the heading.
    const installation = await getHtml(
      origin,
      installationRoute,
      /<h1[^>]*id="installation"[^>]*>(?:<span[^>]*class="ng-doc-heading-label"[^>]*>)?Installation</i,
    );
    await getHtml(origin, demoRoute, /<ng-doc-button-demo[\s>]/i);

    if (prefix) {
      assert.match(installation, new RegExp(`href="${prefix}/docs/get-started/installation"`, 'i'));
      const baseHref = installation.match(/<base href="([^"]+)">/i)?.[1];
      assert.equal(baseHref, `${prefix}/`);
      const stylesheetHref = installation.match(/<link[^>]+href="([^"]*styles-[^"]+\.css)"/i)?.[1];
      assert(stylesheetHref, 'Rendered document has no stylesheet link');
      assert.equal(
        new URL(stylesheetHref, `${origin}${baseHref}`).pathname,
        `${prefix}/${stylesheetHref}`,
      );
    }

    const assetName = (await readdir(browserFolder)).find((name) => /^styles-.*\.css$/.test(name));
    assert(assetName, `No hashed stylesheet found in ${browserFolder}`);
    const assetResponse = await fetchBounded(`${origin}${prefix}/${assetName}`);
    const servedAsset = Buffer.from(await assetResponse.arrayBuffer());
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type') ?? '', /^text\/css\b/);
    assert.deepEqual(servedAsset, await readFile(join(browserFolder, assetName)));

    return assetName;
  } finally {
    await stopServer(server);
  }
}

try {
  assert.match(await readFile(serverEntry, 'utf8'), /index\.server\.html/);
  const moduleUrl = pathToFileURL(serverEntry).href;
  const importProbe = await capture(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const module = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify({ app: typeof module.app, default: typeof module.default }));`,
    ],
    { cwd: temporaryCwd },
  );
  assert.equal(importProbe.code, 0, importProbe.stderr);
  assert.doesNotMatch(importProbe.stdout, /Node Express server listening/);
  assert.deepEqual(JSON.parse(importProbe.stdout.trim()), {
    app: 'function',
    default: 'function',
  });

  const directAsset = await verifyRunningServer(process.execPath, [serverEntry], {
    NG_ALLOWED_HOSTS: '127.0.0.1,localhost',
  });
  const mountedAsset = await verifyRunningServer(
    process.execPath,
    [mountServerEntry],
    {
      NG_ALLOWED_HOSTS: '127.0.0.1,localhost',
      NG_DOC_SERVER_ENTRY: serverEntry,
    },
    '/preview',
  );

  console.log(
    JSON.stringify(
      {
        serverEntry: basename(serverEntry),
        importedWithoutListening: true,
        cwdIndependent: true,
        routes: ['/docs/get-started/installation', '/docs/demos-and-playgrounds/demos'],
        asset: directAsset,
        customMount: { baseHref: '/preview', asset: mountedAsset },
      },
      null,
      2,
    ),
  );
} finally {
  await rm(temporaryCwd, { recursive: true, force: true });
}
