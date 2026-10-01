#!/usr/bin/env node
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const evidence = path.join(repository, 'docs/architecture/evidence/t12/presentation');
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'ngdoc-presentation-')));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  await mkdir(evidence, { recursive: true });
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  await symlink(path.join(repository, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  const bundle = await build({
    absWorkingDir: repository,
    entryPoints: {
      compiler: 'libs/builder/generator/compiler/index.ts',
      probe: 'libs/builder/generator/acceptance/presentation/probe.ts',
    },
    outdir: temporary,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    metafile: true,
    alias: {
      '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
    },
  });
  await build({
    absWorkingDir: repository,
    entryPoints: [
      'libs/builder/generator/worker/entry.ts',
      'libs/builder/generator/worker/protocol.ts',
    ],
    outdir: path.join(temporary, 'worker'),
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  const fixture = path.join(temporary, 'fixture');
  await mkdir(fixture);
  const args = [path.join(temporary, 'probe.mjs'), fixture, temporary, repository, evidence];
  const started = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: repository,
    timeout: 75_000,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      CI: '1',
      NX_DAEMON: 'false',
      NX_NO_CLOUD: 'true',
      NX_TUI: 'false',
      NODE_V8_COVERAGE: '',
    },
  });
  await writeFile(
    path.join(evidence, 'run.log'),
    JSON.stringify(
      {
        command: [process.execPath, ...args],
        elapsedMs: Date.now() - started,
        exitCode: result.status,
        signal: result.signal,
        error: result.error?.message,
      },
      null,
      2,
    ) +
      '\n' +
      result.stdout +
      result.stderr,
  );
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      Object.keys(bundle.metafile.inputs)
        .filter((p) => !p.startsWith('node_modules/'))
        .sort()
        .map(async (p) => [p, sha(await readFile(path.join(repository, p)))]),
    ),
  );
  await writeFile(
    path.join(evidence, 'runtime.json'),
    JSON.stringify(
      {
        node: process.version,
        command: [process.execPath, fileURLToPath(import.meta.url)],
        sourceHashes,
        bundleHashes: {
          compiler: sha(await readFile(path.join(temporary, 'compiler.mjs'))),
          probe: sha(await readFile(path.join(temporary, 'probe.mjs'))),
        },
        boundary:
          'Isolated ESM bundle with real installed external packages and actual templateRoot; no fresh package installation or Angular host claim',
      },
      null,
      2,
    ) + '\n',
  );
  const report = JSON.parse(await readFile(path.join(evidence, 'summary.json'), 'utf8'));
  console.log(
    JSON.stringify(
      {
        status: report.status,
        passed: report.checks.filter((c) => c.passed).length,
        total: report.checks.length,
        failed: report.checks.filter((c) => !c.passed).map((c) => c.name),
      },
      null,
      2,
    ),
  );
  process.exitCode = result.status ?? 2;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
