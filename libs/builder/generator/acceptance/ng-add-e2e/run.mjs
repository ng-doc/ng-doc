import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  commandEnvironment,
  filesContaining,
  npmCli,
  PACKAGES,
  packPackages,
  pinDependencies,
  removeTree,
  run,
  start,
  stopAll,
  startScopeRegistry,
  waitForHttp,
} from './lib.mjs';

/**
 * End-to-end check of the packed `@ng-doc/*` tarballs the way a user adopts them:
 *
 * - Scenario `a`: `ng new` (a standalone application), `ng add @ng-doc/add` (the Vite engine),
 *   a docs page, `ng build`, and an `ng serve` smoke that fetches the page.
 * - Scenario `b`: `ng new`, `ng add @ng-doc/add --engine legacy` (the legacy builders, as NgDoc 21
 *   set them up), a docs page, `ng g @ng-doc/builder:migrate-to-vite`, `ng build` and the same
 *   smoke.
 *
 * The packages are packed from `dist/libs` and served under their own names by a local registry
 * for the `@ng-doc` scope; everything else comes from the npm registry (through the npm cache).
 * Runs on Linux, macOS and Windows.
 *
 * Environment: NGDOC_NG_ADD_E2E_EVIDENCE (required, a new or empty directory for logs and
 * summary.json), NGDOC_NG_ADD_E2E_NPM_CACHE (npm cache; default: one inside the run),
 * NGDOC_NG_ADD_E2E_KEEP=1 (keep the temporary workspace).
 */

const directory = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY = path.resolve(directory, '../../../../..');
const MARKER = 'NgDoc packed end-to-end guide marker';
const PAGE_ROUTE = 'e2e-guide';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function readJson(file) {
  // Angular workspace files may carry comments; the CLI writes plain JSON, which is what we read.
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * One command of a scenario: refused once the run was cancelled, and bounded by what is left of
 * the scenario's budget as well as by its own timeout.
 */
export async function step(context, file, args, options) {
  context.signal.throwIfAborted();
  const left = context.deadline - Date.now();
  if (left < 1_000)
    throw new Error(`The scenario budget ran out before ${path.basename(file)} ${args.join(' ')}`);
  return run(file, args, { ...options, timeoutMs: Math.min(options.timeoutMs ?? 600_000, left) });
}

/** The packages `ng add` puts into `package.json`; their dependencies come along. */
export const REQUIRED_PACKAGES = Object.freeze(['app', 'builder', 'core', 'ui-kit']);

/**
 * Every installed `@ng-doc/*` package is a packed tarball installed from the local registry (the
 * lockfile names its URL and the tarball's integrity), the packages `ng add` adds are among them,
 * and `ng add` looked `@ng-doc/add` up there. Returns the installed names.
 */
export async function assertInstalledFromRegistry(context, application) {
  const lock = await readJson(path.join(application, 'package-lock.json'));
  const installed = Object.keys(lock.packages)
    .filter((key) => /(?:^|\/)node_modules\/@ng-doc\/[^/]+$/.test(key))
    .map((key) => key.slice(key.lastIndexOf('@ng-doc/')));
  for (const name of REQUIRED_PACKAGES.map((item) => `@ng-doc/${item}`)) {
    assert.ok(installed.includes(name), `${name} is not installed`);
  }
  for (const key of Object.keys(lock.packages)) {
    if (!/(?:^|\/)node_modules\/@ng-doc\/[^/]+$/.test(key)) continue;
    const name = key.slice(key.lastIndexOf('@ng-doc/'));
    const entry = lock.packages[key];
    assert.ok(context.packed[name], `${name} is not one of the packed packages`);
    assert.ok(
      entry.resolved?.startsWith(context.registry.url),
      `${name} was resolved from ${entry.resolved}, not the local registry`,
    );
    assert.equal(
      entry.integrity,
      context.packed[name].integrity,
      `${name} is not the packed tarball`,
    );
  }
  // `ng add` looked @ng-doc/add up in the local registry (the schematic then removes it).
  assert.ok(context.registry.requests.includes('GET /@ng-doc/add'), '@ng-doc/add was not served');
  return [...new Set(installed)].sort();
}

function ng(application) {
  return path.join(application, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
}

/** A new standalone application, created offline by the repository's Angular CLI. */
async function newApplication(context, name) {
  const repositoryCli = path.join(REPOSITORY, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  await step(
    context,
    process.execPath,
    [
      repositoryCli,
      'new',
      name,
      '--directory',
      name,
      '--defaults',
      '--skip-install',
      '--skip-git',
      '--ssr=false',
      '--style=css',
      '--package-manager=npm',
      '--interactive=false',
    ],
    {
      cwd: context.runtime,
      env: context.env,
      log: context.log(`${name}-ng-new`),
      timeoutMs: 180_000,
    },
  );
  const application = path.join(context.runtime, name);
  const manifestFile = path.join(application, 'package.json');
  const repositoryManifest = await readJson(path.join(REPOSITORY, 'package.json'));
  const manifest = pinDependencies(await readJson(manifestFile), repositoryManifest);
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  // Only the @ng-doc scope comes from the packed tarballs.
  await writeFile(path.join(application, '.npmrc'), `@ng-doc:registry=${context.registry.url}\n`);
  await step(context, process.execPath, [npmCli(), 'install'], {
    cwd: application,
    env: context.env,
    log: context.log(`${name}-npm-install`),
    timeoutMs: 600_000,
  });
  return application;
}

async function project(application, name) {
  const workspace = await readJson(path.join(application, 'angular.json'));
  const value = workspace.projects[name];
  assert.ok(value, `angular.json has no project ${name}`);
  return value;
}

async function addPage(application) {
  const page = path.join(application, 'src', 'app', PAGE_ROUTE);
  await mkdir(page, { recursive: true });
  await writeFile(
    path.join(page, 'ng-doc.page.ts'),
    `import { NgDocPage } from '@ng-doc/core';\n\nconst E2eGuidePage: NgDocPage = {\n  title: 'E2e guide',\n  mdFile: './index.md',\n  route: '${PAGE_ROUTE}',\n};\n\nexport default E2eGuidePage;\n`,
  );
  await writeFile(path.join(page, 'index.md'), `# E2e guide\n\n${MARKER}.\n`);
}

/** `ng build`: the production output holds the page's content. */
async function build(context, application, name) {
  await step(context, process.execPath, [ng(application), 'build'], {
    cwd: application,
    env: context.env,
    log: context.log(`${name}-ng-build`),
    timeoutMs: 900_000,
  });
  const output = path.join(application, 'dist', name);
  const browser = existsSync(path.join(output, 'browser')) ? path.join(output, 'browser') : output;
  assert.ok(
    existsSync(path.join(browser, 'index.html')) ||
      existsSync(path.join(browser, 'index.csr.html')),
    `${browser} has no index.html`,
  );
  const containing = await filesContaining(output, MARKER, (file) =>
    /\.(?:m?js|html|json)$/.test(file),
  );
  assert.ok(containing.length > 0, `No production file under ${output} contains the page content`);
  return { output: path.relative(application, output).replaceAll('\\', '/'), containing };
}

/**
 * `ng serve`: the application shell answers, the page's route answers, and the dev server serves
 * the generated module that holds the page content.
 */
async function serveSmoke(context, application, name) {
  const port = await freePort();
  const server = start(
    process.execPath,
    [ng(application), 'serve', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: application,
      env: context.env,
      log: context.log(`${name}-ng-serve`),
    },
  );
  const alive = () => server.child.exitCode === null && server.child.signalCode === null;
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Math.min(Date.now() + 300_000, context.deadline);
    const shell = await waitForHttp(`${base}/`, { deadline, isAlive: alive });
    assert.equal(shell.status, 200, `GET / answered ${shell.status}`);
    assert.match(shell.body, /<app-root/, 'GET / is not the application shell');
    const page = await waitForHttp(`${base}/${PAGE_ROUTE}`, { deadline, isAlive: alive });
    assert.equal(page.status, 200, `GET /${PAGE_ROUTE} answered ${page.status}`);
    assert.match(page.type, /text\/html/);
    // The generated folder (ng add maps @ng-doc/generated to ng-doc/<project>).
    const generated = path.join(application, 'ng-doc');
    let containing = [];
    while (Date.now() < deadline && !containing.length) {
      if (existsSync(generated)) containing = await filesContaining(generated, MARKER);
      if (!containing.length) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(containing.length, 'The dev server generated no file with the page content');
    // The page's content module, compiled and served by Vite like any source file.
    const module = containing.find((file) => /\.(?:m?js|ts)$/.test(file));
    assert.ok(module, `No generated module holds the page content: ${containing.join(', ')}`);
    const absolute = path.join(generated, module).replaceAll('\\', '/');
    const moduleUrl = `${base}/@fs${absolute.startsWith('/') ? '' : '/'}${absolute}`;
    const served = await waitForHttp(moduleUrl, { deadline, isAlive: alive });
    assert.equal(served.status, 200, `GET ${moduleUrl} answered ${served.status}`);
    assert.ok(served.body.includes(MARKER), `${moduleUrl} does not contain the page content`);
    // The search index, a generated asset the NgDoc plugin serves.
    const index = await waitForHttp(`${base}/assets/ng-doc/indexes.json`, {
      deadline,
      isAlive: alive,
    });
    assert.equal(index.status, 200, `GET /assets/ng-doc/indexes.json answered ${index.status}`);
    assert.ok(index.body.includes(MARKER), 'The served search index does not hold the page');
    return {
      port,
      generated: containing,
      served: [moduleUrl.slice(base.length), '/assets/ng-doc/indexes.json'],
    };
  } finally {
    const result = await server.stop();
    context.stopped.push({ name: `${name}-ng-serve`, ...result, error: result.error?.message });
  }
}

async function scenarioA(context) {
  const name = 'vite-app';
  const application = await newApplication(context, name);
  await step(
    context,
    process.execPath,
    [ng(application), 'add', '@ng-doc/add', '--skip-confirmation', '--interactive=false'],
    {
      cwd: application,
      env: context.env,
      log: context.log(`${name}-ng-add`),
      timeoutMs: 900_000,
    },
  );
  const targets = (await project(application, name)).architect;
  assert.equal(targets.build.builder, '@ng-doc/builder:vite-application');
  assert.equal(targets.serve.builder, '@ng-doc/builder:vite-dev-server');
  assert.ok(targets['build-angular'], 'ng add kept no build-angular target');
  assert.ok(
    existsSync(path.join(application, 'vite.config.mjs')),
    'ng add wrote no vite.config.mjs',
  );
  const manifest = await readJson(path.join(application, 'package.json'));
  assert.equal(
    manifest.dependencies?.['@ng-doc/add'] ?? manifest.devDependencies?.['@ng-doc/add'],
    undefined,
  );
  for (const name of ['@ng-doc/app', '@ng-doc/builder', '@ng-doc/core', '@ng-doc/ui-kit']) {
    assert.ok(manifest.dependencies?.[name], `ng add did not add ${name}`);
  }
  await addPage(application);
  const installed = await assertInstalledFromRegistry(context, application);
  for (const item of [...installed, '@ng-doc/add']) context.installed.add(item);
  const production = await build(context, application, name);
  const serve = await serveSmoke(context, application, name);
  return {
    application,
    targets: { build: targets.build.builder, serve: targets.serve.builder },
    installed,
    production,
    serve,
  };
}

async function scenarioB(context) {
  const name = 'legacy-app';
  const application = await newApplication(context, name);
  await step(
    context,
    process.execPath,
    [
      ng(application),
      'add',
      '@ng-doc/add',
      '--engine',
      'legacy',
      '--skip-confirmation',
      '--interactive=false',
    ],
    {
      cwd: application,
      env: context.env,
      log: context.log(`${name}-ng-add-legacy`),
      timeoutMs: 900_000,
    },
  );
  let targets = (await project(application, name)).architect;
  assert.equal(targets.build.builder, '@ng-doc/builder:application');
  assert.equal(targets.serve.builder, '@ng-doc/builder:dev-server');
  await addPage(application);
  await step(
    context,
    process.execPath,
    [
      ng(application),
      'g',
      '@ng-doc/builder:migrate-to-vite',
      '--project',
      name,
      '--interactive=false',
    ],
    {
      cwd: application,
      env: context.env,
      log: context.log(`${name}-migrate-to-vite`),
      timeoutMs: 300_000,
    },
  );
  targets = (await project(application, name)).architect;
  assert.equal(targets.build.builder, '@ng-doc/builder:vite-application');
  assert.equal(targets.serve.builder, '@ng-doc/builder:vite-dev-server');
  assert.equal(targets['build-legacy']?.builder, '@ng-doc/builder:application');
  assert.equal(targets['serve-legacy']?.builder, '@ng-doc/builder:dev-server');
  assert.ok(
    existsSync(path.join(application, 'vite.config.mjs')),
    'the migration wrote no vite.config.mjs',
  );
  const report = path.join(application, '.ng-doc-migration', name, 'report.md');
  assert.ok(existsSync(report), 'the migration wrote no report');
  // The migration adds the Vite dependencies to package.json; install them.
  await step(context, process.execPath, [npmCli(), 'install'], {
    cwd: application,
    env: context.env,
    log: context.log(`${name}-npm-install-vite`),
    timeoutMs: 600_000,
  });
  const installed = await assertInstalledFromRegistry(context, application);
  for (const item of [...installed, '@ng-doc/add']) context.installed.add(item);
  const production = await build(context, application, name);
  const serve = await serveSmoke(context, application, name);
  return {
    application,
    targets: { build: targets.build.builder, serve: targets.serve.builder },
    installed,
    production,
    serve,
  };
}

export const SCENARIOS = Object.freeze({ a: scenarioA, b: scenarioB });

/** The default budget of one scenario, within the 40 minute CI job and its setup. */
export const SCENARIO_BUDGET_MS = 28 * 60_000;

/**
 * Packs the packages once and runs the given scenarios in order, each in a fresh application and
 * within `budgetMs` (each command's timeout is cut to what is left). Aborting `signal`, SIGINT or
 * SIGTERM stops every command and removes the temporary workspace. Returns the summary, which is
 * also written to `<evidence>/summary.json`.
 */
export async function runScenarios({
  scenarios = ['a', 'b'],
  evidence,
  npmCache,
  keep = false,
  signal,
  budgetMs = SCENARIO_BUDGET_MS,
}) {
  assert.ok(evidence, 'An evidence directory is required');
  await mkdir(evidence, { recursive: true });
  assert.deepEqual(
    await readdir(evidence),
    [],
    `Use a new or empty evidence directory: ${evidence}`,
  );
  // The real path: macOS links /var to /private/var, and Windows may report an 8.3 short name,
  // while Vite allows files under the real path of its root.
  const runtime = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ngdoc-ng-add-e2e-')));
  const logs = path.join(evidence, 'logs');
  const env = commandEnvironment(npmCache ?? path.join(runtime, 'npm-cache'));
  const summary = {
    status: 'running',
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    runtime,
    scenarios: {},
    stopped: [],
  };
  const controller = new AbortController();
  const cancel = (reason) => {
    if (controller.signal.aborted) return;
    controller.abort(reason);
    summary.cancelled = String(reason?.message ?? reason);
    void stopAll();
  };
  const onAbort = () => cancel(signal.reason ?? new Error('The run was cancelled'));
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  // Interrupted runs still stop their process groups and remove the workspace (finally below).
  let interrupted;
  const onSignal = (name) => {
    interrupted ??= name;
    cancel(new Error(`Interrupted by ${name}`));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  const context = {
    runtime,
    env,
    registry: undefined,
    packed: undefined,
    installed: new Set(),
    signal: controller.signal,
    deadline: 0,
    stopped: summary.stopped,
    log: (name) => path.join(logs, `${name}.log`),
  };
  let failure;
  try {
    const provenance = await readJson(
      path.join(REPOSITORY, 'dist/libs/builder/generator/build-provenance.json'),
    );
    summary.sourceDigest = provenance.sourceDigest;
    // CI passes the digest of the packages built from its checkout; stale packages prove nothing.
    const expected = process.env.NGDOC_EXPECTED_SOURCE_DIGEST;
    if (expected)
      assert.equal(provenance.sourceDigest, expected, 'dist/libs was built from other sources');
    const packed = await packPackages({ repository: REPOSITORY, directory: runtime, env, logs });
    summary.packages = Object.fromEntries(
      Object.entries(packed).map(([name, item]) => [
        name,
        { version: item.manifest.version, sha256: item.sha256 },
      ]),
    );
    context.packed = packed;
    context.registry = await startScopeRegistry(packed);
    try {
      for (const id of scenarios) {
        const began = Date.now();
        context.deadline = began + budgetMs;
        try {
          controller.signal.throwIfAborted();
          summary.scenarios[id] = { status: 'passed', ...(await SCENARIOS[id](context)) };
        } catch (error) {
          summary.scenarios[id] = {
            status: 'failed',
            error: error instanceof Error ? error.stack : String(error),
          };
          failure ??= error;
        } finally {
          summary.scenarios[id].durationMs = Date.now() - began;
        }
      }
      // Every package that was installed was resolved through the local registry. (Its tarball
      // may come from the npm cache: `npm pack` already stored it there under its integrity.)
      if (!failure) {
        const missing = [...context.installed]
          .map((name) => `GET /${name}`)
          .filter((request) => !context.registry.requests.includes(request));
        assert.deepEqual(missing, [], 'Packages the local registry never resolved');
        summary.resolvedFromRegistry = [...context.installed].sort();
      }
    } finally {
      summary.registryRequests = context.registry.requests.length;
      await context.registry.close();
    }
  } catch (error) {
    failure ??= error;
    summary.error = error instanceof Error ? error.stack : String(error);
  } finally {
    await stopAll();
    signal?.removeEventListener('abort', onAbort);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    if (interrupted) {
      failure ??= new Error(`Interrupted by ${interrupted}`);
      process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
    }
    summary.status = failure ? 'failed' : 'passed';
    if (!keep) {
      try {
        await removeTree(runtime);
        summary.removed = true;
      } catch (error) {
        summary.removed = false;
        summary.cleanupError = String(error);
        failure ??= error;
        summary.status = 'failed';
      }
    }
    await writeFile(path.join(evidence, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (failure) throw failure;
  return summary;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf('--scenario');
  const chosen =
    index < 0 || process.argv[index + 1] === 'all' ? ['a', 'b'] : [process.argv[index + 1]];
  assert.ok(
    chosen.every((id) => id in SCENARIOS),
    'Usage: run.mjs [--scenario a|b|all]',
  );
  const evidence = process.env.NGDOC_NG_ADD_E2E_EVIDENCE;
  assert.ok(evidence, 'NGDOC_NG_ADD_E2E_EVIDENCE is required');
  try {
    const summary = await runScenarios({
      scenarios: chosen,
      evidence: path.resolve(evidence),
      npmCache: process.env.NGDOC_NG_ADD_E2E_NPM_CACHE,
      keep: process.env.NGDOC_NG_ADD_E2E_KEEP === '1',
    });
    console.log(
      JSON.stringify({ status: summary.status, scenarios: Object.keys(summary.scenarios) }),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
