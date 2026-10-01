#!/usr/bin/env node
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const evidence = path.join(repository, 'docs/architecture/evidence/t12/mutations');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const artifacts = 'libs/builder/generator/artifacts/index.ts';
const specifications = [
  {
    id: 'M-OWN',
    file: artifacts,
    // The ownership check of the commit's collision pass (it reads the batched lstat probe of the
    // commit fast path).
    needle: 'if (probedExists(item.target, probe) && !ownedPaths.has(item.relative)) {',
    replacement:
      'if (false && probedExists(item.target, probe) && !ownedPaths.has(item.relative)) {',
    expected: 'M_OWN_REJECT_UNOWNED',
  },
  {
    id: 'M-DEP',
    file: 'libs/builder/generator/content/content-compiler.ts',
    needle: 'dependencies.push(...rendered.dependencies);',
    replacement:
      "dependencies.push(...rendered.dependencies.filter(item => !('path' in item && item.path.endsWith('/shared.nunj'))));",
    occurrences: 2,
    expected: 'M_DEP_EVERY_CONSUMER_HTML',
  },
  {
    id: 'M-CACHE',
    file: artifacts,
    needle: "return { status: 'hit', artifact: value };",
    replacement:
      "return { status: 'hit', artifact: { ...value, exportedKeywords: [], usedKeywords: [], searchRecords: [], content: value.content.map(content => ({ ...content, searchRecords: [], ir: { ...content.ir, anchors: [], exportedKeywords: [], usedKeywords: [] } })) } };",
    expected: 'M_CACHE_COMPLETE_RECORD_RESTORE',
  },
  {
    id: 'M-STALE',
    file: artifacts,
    needle: 'return !signal.aborted && guard.isCurrent(generation);',
    replacement: 'return true;',
    expected: 'M_STALE_REAL_PRODUCT_ROLLBACK',
  },
  {
    id: 'M-PROD',
    file: 'libs/builder/generator/compiler/index.ts',
    needle: 'for (const entry of found.entries) {',
    // Production renders only the pages someone opened, which in a one-shot build is none.
    replacement:
      "for (const entry of found.entries) {\n    if (plan.request.mode === 'production') continue;",
    expected: 'M_PROD_UNVISITED_BROKEN_PAGE_FAILS',
  },
  // The delta commit: its base identity check ...
  {
    id: 'M-DELTA-BASE',
    file: artifacts,
    needle: "if (!trustedBase(last, request)) return { reason: 'base-identity' };",
    replacement: "if (false) return { reason: 'base-identity' };",
    expected: 'M_DELTA_BASE_IDENTITY',
  },
  // ... and the end of trust in a publication at every commit call: kept, a manifest stamp
  // and a publication would be trusted after a call that did not end `committed`.
  {
    id: 'M-DELTA-TRUST',
    file: artifacts,
    needle: '    const last = this.published;\n    this.published = undefined;',
    replacement: '    const last = this.published;',
    expected: 'M_DELTA_UNTRUSTED_AFTER_NONCOMMITTED',
  },
  // A separate defensive layer is tested rather than coupling two behavioral mutations.
  {
    id: 'M-STALE-SESSION',
    family: 'M-STALE',
    file: 'libs/builder/generator/session/build-session.ts',
    needle:
      'if (!this.isCurrent(job)) return this.cancelled(job.generation, diagnostics, whyRebuilt);',
    replacement: 'if (false) return this.cancelled(job.generation, diagnostics, whyRebuilt);',
    expected: 'M_STALE_SESSION_NO_ADMISSION',
  },
];
const selected = process.argv.slice(2);
const runs = [];
await mkdir(evidence, { recursive: true });
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'ngdoc-critical-mutants-')));
const productionHashes = new Map();
try {
  await symlink(path.join(repository, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  for (const spec of specifications.filter(
    (spec) => !selected.length || selected.includes(spec.id),
  )) {
    const original = await readFile(path.join(repository, spec.file), 'utf8');
    productionHashes.set(spec.file, sha(original));
    const count = original.split(spec.needle).length - 1;
    if (count !== (spec.occurrences ?? 1))
      throw Error(`${spec.id}: expected ${spec.occurrences ?? 1} exact anchors, found ${count}`);
    const mutated = original.replace(spec.needle, spec.replacement);
    const caseEvidence = path.join(evidence, spec.id);
    await mkdir(caseEvidence, { recursive: true });
    await writeFile(
      path.join(caseEvidence, 'mutation.json'),
      JSON.stringify(
        { ...spec, sourceSha256: sha(original), mutantSha256: sha(mutated), occurrenceChanged: 1 },
        null,
        2,
      ) + '\n',
    );
    const line = original.slice(0, original.indexOf(spec.needle)).split('\n').length;
    await writeFile(
      path.join(caseEvidence, 'mutation.patch'),
      `--- a/${spec.file}\n+++ b/${spec.file}\n@@ -${line},${spec.needle.split('\n').length} +${line},${spec.replacement.split('\n').length} @@\n${original
        .split('\n')
        .slice(line - 1, line - 1 + spec.needle.split('\n').length)
        .map((line) => '-' + line)
        .join('\n')}\n${mutated
        .split('\n')
        .slice(line - 1, line - 1 + spec.replacement.split('\n').length)
        .map((line) => '+' + line)
        .join('\n')}\n`,
    );
    for (const variant of ['baseline', 'mutant']) {
      const runtimeRoot = path.join(temporary, spec.id, variant);
      await mkdir(runtimeRoot, { recursive: true });
      const copy = path.join(runtimeRoot, 'isolated-source.ts');
      await writeFile(copy, variant === 'mutant' ? mutated : original);
      const plugin = {
        name: 'isolated-source-copy',
        setup(build) {
          build.onLoad({ filter: /\.ts$/ }, async (args) =>
            path.resolve(args.path) === path.join(repository, spec.file)
              ? {
                  contents: await readFile(copy, 'utf8'),
                  loader: 'ts',
                  resolveDir: path.dirname(args.path),
                }
              : undefined,
          );
        },
      };
      const common = {
        absWorkingDir: repository,
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'esm',
        target: 'node24',
        metafile: true,
        plugins: [plugin],
        alias: {
          '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
          '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
        },
      };
      const compiler = await build({
        ...common,
        entryPoints: ['libs/builder/generator/compiler/index.ts'],
        outfile: path.join(runtimeRoot, 'compiler.mjs'),
      });
      const runner = await build({
        ...common,
        entryPoints: ['libs/builder/generator/acceptance/mutations/scenarios.ts'],
        outfile: path.join(runtimeRoot, 'scenarios.mjs'),
      });
      await build({
        absWorkingDir: repository,
        entryPoints: [
          'libs/builder/generator/worker/entry.ts',
          'libs/builder/generator/worker/protocol.ts',
        ],
        outdir: path.join(runtimeRoot, 'worker'),
        platform: 'node',
        format: 'esm',
        target: 'node24',
      });
      const fixtureRoot = path.join(runtimeRoot, 'fixture');
      await mkdir(fixtureRoot);
      const stages = ['M-DEP', 'M-CACHE'].includes(spec.id) ? ['seed', 'verify'] : ['run'];
      const results = [];
      for (const stage of stages) {
        const reportPath = path.join(caseEvidence, `${variant}-${stage}.json`);
        const args = [
          path.join(runtimeRoot, 'scenarios.mjs'),
          spec.id,
          stage,
          fixtureRoot,
          runtimeRoot,
          repository,
          reportPath,
        ];
        const started = Date.now();
        const execution = spawnSync(process.execPath, args, {
          cwd: repository,
          encoding: 'utf8',
          timeout: 75_000,
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
          path.join(caseEvidence, `${variant}-${stage}.log`),
          JSON.stringify(
            {
              command: [process.execPath, ...args],
              milliseconds: Date.now() - started,
              exitCode: execution.status,
              signal: execution.signal,
              error: execution.error?.message,
            },
            null,
            2,
          ) +
            '\n' +
            execution.stdout +
            execution.stderr,
        );
        const report = JSON.parse(await readFile(reportPath, 'utf8'));
        results.push({
          stage,
          exitCode: execution.status,
          status: report.status,
          failedChecks: report.checks.filter((c) => !c.passed).map((c) => c.code),
        });
        if (report.status === 'setup-or-runtime-error' || execution.error)
          throw Error(`${spec.id} ${variant} ${stage}: setup/runtime failure; see retained report`);
      }
      const inputs = Object.keys({ ...compiler.metafile.inputs, ...runner.metafile.inputs }).sort();
      const sourceInputs = Object.fromEntries(
        await Promise.all(
          inputs
            .filter((input) => !input.startsWith('node_modules/'))
            .map(async (input) => [input, sha(await readFile(path.join(repository, input)))]),
        ),
      );
      const manifest = {
        id: spec.id,
        family: spec.family ?? spec.id,
        variant,
        sourceSha256: sha(original),
        mutantSha256: sha(mutated),
        compilerBundleSha256: sha(await readFile(path.join(runtimeRoot, 'compiler.mjs'))),
        runnerBundleSha256: sha(await readFile(path.join(runtimeRoot, 'scenarios.mjs'))),
        node: process.version,
        inputs: sourceInputs,
        results,
      };
      await writeFile(
        path.join(caseEvidence, `${variant}-runtime.json`),
        JSON.stringify(manifest, null, 2) + '\n',
      );
      runs.push(manifest);
      const intended = results.some(
        (r) =>
          r.exitCode === 1 &&
          r.status === 'assertion-failed' &&
          r.failedChecks.includes(spec.expected),
      );
      if (variant === 'baseline' && results.some((r) => r.exitCode !== 0))
        throw Error(`${spec.id} baseline failed product assertions`);
      if (variant === 'mutant' && !intended)
        throw Error(`${spec.id} mutant not killed by ${spec.expected}`);
      console.log(
        `${spec.id} ${variant}: ${variant === 'baseline' ? 'PASS' : 'KILLED'} ${results.flatMap((r) => r.failedChecks).join(', ')}`,
      );
    }
  }
  for (const [file, digest] of productionHashes)
    if (sha(await readFile(path.join(repository, file))) !== digest)
      throw Error(`Shared production source changed during run: ${file}`);
  await writeFile(
    path.join(evidence, 'summary.json'),
    JSON.stringify(
      {
        status: 'passed',
        node: process.version,
        command: [process.execPath, fileURLToPath(import.meta.url), ...selected],
        families: [...new Set(runs.map((r) => r.family))],
        runs: runs.map(({ inputs, ...rest }) => rest),
        sharedProductionUnchanged: true,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
