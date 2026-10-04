import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { prepareAnalogCompatibility } from '../../scripts/build-analog-compatibility.mjs';
import {
  analogResourcePolicy,
  applyAnalogResourcePatch,
} from '../../scripts/analog-resource-patch.mjs';
import { captureObserverSources, createWorkObserverPlugin } from './observer/plugin.mjs';
const sha = (value) => createHash('sha256').update(value).digest('hex');

/** Rebuild only the already copied private runtime, preserving the packaged tuple. */
export async function buildObservedRuntime({ repository, packages, expectedSourceDigest }) {
  const relative = path.relative(path.join(repository, 'tmp'), path.resolve(packages));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Observed builds require an owned private package root under repository/tmp');
  const output = path.join(packages, 'builder/generator');
  const provenance = JSON.parse(await readFile(path.join(output, 'build-provenance.json'), 'utf8'));
  if (provenance.sourceDigest !== expectedSourceDigest)
    throw new Error('Unexpected private runtime source');
  const sourceHash = createHash('sha256');
  for (const file of [
    'tools/scripts/build-generator.mjs',
    'tools/scripts/build-generator-types.mjs',
    'tools/scripts/build-analog-compatibility.mjs',
    'tools/scripts/analog-resource-patch.mjs',
    'tools/compatibility/analog-2.8.0-resources.json',
    'tools/licenses/analog-2.8.0.LICENSE',
    'libs/builder/package.json',
    'tsconfig.base.json',
  ])
    sourceHash.update(file).update(await readFile(path.join(repository, file)));
  for (const directory of [
    'libs/builder/generator',
    'libs/builder/helpers',
    'libs/builder/types',
    'libs/core',
    'libs/utils',
  ]) {
    const files = (await readdir(path.join(repository, directory), { recursive: true }))
      .filter(
        (file) =>
          file.endsWith('.ts') &&
          !/(^|[\\/])(testing|acceptance)[\\/]|\.(spec|test|vitest)\.ts$/.test(file),
      )
      .sort();
    for (const file of files)
      sourceHash
        .update(`${directory}/${file}`)
        .update(await readFile(path.join(repository, directory, file)));
  }
  if (sourceHash.digest('hex') !== expectedSourceDigest)
    throw new Error('Production sources differ from packaged runtime');
  const compatibility = await prepareAnalogCompatibility({
    root: repository,
    factoryEntry: path.join(repository, 'libs/builder/generator/vite/angular/index.ts'),
    compatibilityFormat: analogResourcePolicy.format,
    applyPatch: applyAnalogResourcePatch,
  });
  const expectedSources = await captureObserverSources(repository);
  const entries = [
    'contracts',
    'bootstrap/index',
    'bootstrap/cli',
    'bootstrap/bin',
    'compiler/index',
    'content/html-worker',
    'worker/index',
    'worker/entry',
    'angular/application',
    'angular/dev-server',
    'vite/index',
    'vite/ssr-renderer-entry',
    'vite/angular/index',
  ];
  const result = await build({
    absWorkingDir: repository,
    entryPoints: Object.fromEntries(
      entries.map((entry) => [
        entry,
        `libs/builder/generator/${entry}${['angular/application', 'angular/dev-server'].includes(entry) ? '/index' : ''}.ts`,
      ]),
    ),
    outbase: 'libs/builder/generator',
    outdir: output,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    metafile: true,
    define: compatibility.define,
    alias: {
      '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
    },
    plugins: [
      compatibility.plugin,
      {
        name: 'benchmark-preserved-provenance',
        setup(builder) {
          builder.onLoad({ filter: /generator\/bootstrap\/constants\.ts$/ }, () => ({
            loader: 'ts',
            contents: `export const GENERATOR_COMPILER_VERSION=${JSON.stringify(provenance.compilerVersion)};export const GENERATOR_TOOLCHAIN_DIGEST=${JSON.stringify(provenance.toolchainDigest)};`,
          }));
        },
      },
      createWorkObserverPlugin({ root: repository, expectedSources }),
    ],
  });
  const outputs = {};
  for (const file of Object.keys(result.metafile.outputs))
    outputs[path.relative(output, path.resolve(repository, file))] = sha(
      await readFile(path.resolve(repository, file)),
    );
  const record = {
    purpose: 'Instrumented diagnostic/work cohort only',
    uninstrumentedSourceDigest: expectedSourceDigest,
    expectedSources,
    outputs,
    metafile: result.metafile,
  };
  await writeFile(
    path.join(output, 'benchmark-observer-build.json'),
    JSON.stringify(record, null, 2) + '\n',
  );
  return record;
}
