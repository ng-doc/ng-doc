import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildObservedRuntime } from './observed-build.mjs';
import { readObserverTraces } from './observer/read-traces.mjs';
import { prepareSynthetic } from './prepare.mjs';
import { supervise } from './supervisor.mjs';

const { values } = parseArgs({
  options: {
    mode: { type: 'string' },
    root: { type: 'string' },
    evidence: { type: 'string' },
    guides: { type: 'string', default: '100' },
    'api-declarations': { type: 'string', default: '0' },
    warm: { type: 'boolean', default: false },
    observed: { type: 'boolean', default: false },
  },
});
if (
  !['c', 'c-d'].includes(values.mode) ||
  !path.isAbsolute(values.root ?? '') ||
  !path.isAbsolute(values.evidence ?? '')
)
  throw new Error('Required: --mode c|c-d --root ABSOLUTE --evidence ABSOLUTE');
if (process.version !== 'v24.19.0') throw new Error('Primary timing cohort requires Node 24.19.0');
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const expectedSourceDigest = process.env.NGDOC_EXPECTED_SOURCE_DIGEST;
if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest ?? ''))
  throw new Error('NGDOC_EXPECTED_SOURCE_DIGEST required');
if (!values.warm)
  await prepareSynthetic({
    root: values.root,
    repository,
    guides: Number(values.guides),
    apiDeclarations: Number(values['api-declarations']),
    expectedSourceDigest,
  });
else {
  const prepared = JSON.parse(await readFile(path.join(values.root, 'preparation.json'), 'utf8'));
  if (
    prepared.sourceDigest !== expectedSourceDigest ||
    prepared.manifest.guides !== Number(values.guides) ||
    prepared.manifest.apiDeclarations !== Number(values['api-declarations'])
  )
    throw new Error('Warm preparation does not match declared cohort');
}
if (values.observed)
  await buildObservedRuntime({
    repository,
    packages: path.join(values.root, 'node_modules/@ng-doc'),
    expectedSourceDigest,
  });
const observerDirectory = path.join(values.root, 'observer-traces');
const specPath = path.join(values.root, 'pilot-spec.json');
await writeFile(
  specPath,
  JSON.stringify(
    {
      root: values.root,
      mode: values.mode,
      readinessTimeoutMs: 120000,
      playwrightModule:
        process.env.PLAYWRIGHT_MODULE ??
        '/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
      chromePath:
        process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    null,
    2,
  ),
);
const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
try {
  const result = await supervise({
    command: process.execPath,
    args: [fileURLToPath(new URL('./host/run-vite.mjs', import.meta.url)), specPath],
    cwd: repository,
    evidence: values.evidence,
    lockFile: path.join(repository, 'tmp/t19-exclusive.lock'),
    timeoutMs: 300000,
    env: {
      CI: '1',
      NX_DAEMON: 'false',
      NX_NO_CLOUD: 'true',
      NX_TUI: 'false',
      ...(values.observed
        ? {
            NGDOC_BENCHMARK_RUN_ID: path.basename(values.evidence),
            NGDOC_BENCHMARK_OBSERVER_DIR: observerDirectory,
          }
        : {}),
    },
    signal: controller.signal,
  });
  if (values.observed) {
    try {
      const traces = await readObserverTraces(observerDirectory, {
        runId: path.basename(values.evidence),
      });
      await writeFile(
        path.join(values.evidence, 'work-counts-diagnostic.json'),
        JSON.stringify(traces, null, 2) + '\n',
      );
    } catch (error) {
      await writeFile(path.join(values.evidence, 'observer-error.txt'), String(error) + '\n');
    }
  }
  console.log(
    JSON.stringify(
      { purpose: 'Untimed correctness/startup pilot; not benchmark admission', ...result },
      null,
      2,
    ),
  );
  if (result.invalidations.length || !result.cleanupComplete) process.exitCode = 1;
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
}
