import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  assertRuntimeRequiresDeclared,
  assertSourceInventory,
  RUNTIME_REQUIRES,
  createTsMorphShim,
  patchMainSource,
  prepareAnalogCompatibility,
  replaceExactlyOnce,
  sourceInventory,
} from '../build-analog-compatibility.mjs';

// `fileURLToPath`, not `URL.pathname`: on Windows the pathname is `/D:/…`, which resolves to `D:\D:\…`.
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function importShim(packageJson, includeTsMorph) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-analog-shim-'));
  try {
    const analogDirectory = path.join(fixture, 'node_modules/@analogjs/vite-plugin-angular');
    await mkdir(analogDirectory, { recursive: true });
    await writeFile(path.join(analogDirectory, 'package.json'), JSON.stringify(packageJson));
    if (includeTsMorph) {
      const tsMorphDirectory = path.join(analogDirectory, 'node_modules/ts-morph');
      await mkdir(tsMorphDirectory, { recursive: true });
      await writeFile(path.join(tsMorphDirectory, 'package.json'), '{"main":"./index.cjs"}');
      await writeFile(
        path.join(tsMorphDirectory, 'index.cjs'),
        'exports.Project = class Project {}; exports.SyntaxKind = {};',
      );
    }
    const shim = path.join(fixture, 'shim.mjs');
    await writeFile(shim, createTsMorphShim());
    return await import(`${pathToFileURL(shim).href}?fixture=${Date.now()}`);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

test('source inventory rejects a changed upstream input', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-analog-inventory-'));
  try {
    await mkdir(path.join(fixture, 'lib'));
    await writeFile(path.join(fixture, 'lib/input.js'), 'original');
    const before = await sourceInventory(fixture);
    const expected = { sourceFiles: before.entries.length, sourceInventorySha256: before.sha256 };
    await writeFile(path.join(fixture, 'lib/input.js'), 'changed');
    const after = await sourceInventory(fixture);
    assert.throws(() => assertSourceInventory(after, expected), /source inventory mismatch/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('replaceExactlyOnce rejects missing and duplicate patch anchors', () => {
  assert.throws(
    () => replaceExactlyOnce('unrelated', 'anchor', 'replacement'),
    /exactly once; found 0/,
  );
  assert.throws(
    () => replaceExactlyOnce('anchor anchor', 'anchor', 'replacement'),
    /exactly once; found 2/,
  );
  assert.equal(
    replaceExactlyOnce('before anchor after', 'anchor', 'replacement'),
    'before replacement after',
  );
});

test('patchMainSource requires caller patch policy to alter the source', () => {
  assert.throws(() => patchMainSource('source', (value) => value), /did not change/);
  assert.deepEqual(
    patchMainSource('source', (value) => ({ code: `${value} patched`, changes: ['fixture'] })),
    {
      code: 'source patched',
      changes: ['fixture'],
    },
  );
});

test('ts-morph shim checks the upstream package before requiring its dependency', () => {
  const shim = createTsMorphShim();
  assert.ok(
    shim.indexOf('upstreamPackage.version !== expected.version') <
      shim.indexOf("upstreamRequire('ts-morph')"),
  );
  assert.match(shim, /import\.meta\.resolve\('@analogjs\/vite-plugin-angular\/package\.json'\)/);
});

test('ts-morph shim rejects a wrong Analog peer before attempting ts-morph', async () => {
  await assert.rejects(
    () =>
      importShim(
        {
          name: '@analogjs/vite-plugin-angular',
          version: '9.9.9',
          exports: { './package.json': './package.json' },
        },
        false,
      ),
    (error) =>
      /requires @analogjs\/vite-plugin-angular@2\.6\.3; found @analogjs\/vite-plugin-angular@9\.9\.9/.test(
        error.message,
      ) && !/ts-morph/.test(error.message),
  );
});

test('ts-morph shim rejects a missing nested dependency after accepting the exact peer', async () => {
  await assert.rejects(
    () =>
      importShim(
        {
          name: '@analogjs/vite-plugin-angular',
          version: '2.6.3',
          exports: { './package.json': './package.json' },
        },
        false,
      ),
    /could not resolve ts-morph from @analogjs\/vite-plugin-angular@2\.6\.3/,
  );
});

test('esbuild redirects only the factory entry and retains ordinary Analog imports as externals', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-analog-esbuild-'));
  try {
    const factory = path.join(fixture, 'factory.mjs');
    const ordinary = path.join(fixture, 'ordinary.mjs');
    await writeFile(
      factory,
      "import angular from '@analogjs/vite-plugin-angular'; export const selected = __NG_DOC_ANALOG_COMPATIBILITY__; export default angular;",
    );
    await writeFile(
      ordinary,
      "import angular from '@analogjs/vite-plugin-angular'; export default angular;",
    );
    const resolvedOrdinary = await realpath(ordinary);
    const original = `pendingCompilation = performCompilation(resolvedConfig, [\n                        ...mods.map((mod) => mod.id),\n                        ...updates,\n                    ]);`;
    const replacement = `pendingCompilation = performCompilation(resolvedConfig, [\n                        ctx.file,\n                        ...mods.map((mod) => mod.id),\n                        ...updates,\n                    ]);`;
    const prepared = await prepareAnalogCompatibility({
      root: workspace,
      factoryEntry: factory,
      compatibilityFormat: 'diagnostic-ctx-file',
      applyPatch: (source) =>
        replaceExactlyOnce(source, original, replacement, 'diagnostic ctx.file anchor'),
    });
    const result = await build({
      entryPoints: [factory, ordinary],
      outdir: path.join(fixture, 'out'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node24',
      write: false,
      metafile: true,
      define: prepared.define,
      plugins: [
        prepared.plugin,
        {
          name: 'ordinary-analog-import-remains-external',
          setup(buildApi) {
            buildApi.onResolve({ filter: /^@analogjs\/vite-plugin-angular$/ }, (args) =>
              path.resolve(args.importer) === resolvedOrdinary
                ? { path: args.path, external: true }
                : undefined,
            );
          },
        },
      ],
    });
    const outputs = Object.fromEntries(
      result.outputFiles.map((file) => [path.basename(file.path), file.text]),
    );
    assert.match(outputs['factory.js'], /diagnostic-ctx-file/);
    assert.match(
      outputs['factory.js'],
      /pendingCompilation = performCompilation\(resolvedConfig, \[\s*ctx\.file,/,
    );
    assert.doesNotMatch(outputs['factory.js'], /from ["']@analogjs\/vite-plugin-angular["']/);
    assert.match(outputs['ordinary.js'], /from ["']@analogjs\/vite-plugin-angular["']/);
    assert.deepEqual([...prepared.encounteredStaticExternals].sort(), [
      '@angular/compiler',
      '@angular/compiler-cli',
      'magic-string',
      'node:crypto',
      'node:fs',
      'node:module',
      'node:os',
      'node:path',
      'node:url',
      'obug',
      'oxc-parser',
      'tinyglobby',
      'typescript',
      'vite',
    ]);
    assert.equal(prepared.provenance.compatibilityFormat, 'diagnostic-ctx-file');
    assert.equal(prepared.provenance.patchedMainSourceSha256.length, 64);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('assertRuntimeRequiresDeclared needs only the requires reachable on the pinned Angular major', () => {
  const manifest = (dependencies) => ({
    dependencies,
    peerDependencies: { '@angular/compiler-cli': '22.0.6' },
  });
  const requires = [
    { id: '@angular/build/private' },
    { id: '@angular-devkit/build-angular/src/tools/esbuild/angular/*', maxAngularMajor: 17 },
  ];

  assert.doesNotThrow(() =>
    assertRuntimeRequiresDeclared(requires, manifest({ '@angular/build': '22.0.6' })),
  );
  assert.throws(
    () => assertRuntimeRequiresDeclared(requires, manifest({})),
    /Undeclared retained Analog runtime require: @angular\/build\/private/,
  );
  assert.throws(
    () =>
      assertRuntimeRequiresDeclared(requires, {
        dependencies: { '@angular/build': '17.3.0' },
        peerDependencies: { '@angular/compiler-cli': '17.3.0' },
      }),
    /Undeclared retained Analog runtime require: @angular-devkit\/build-angular/,
  );
  assert.throws(
    () =>
      assertRuntimeRequiresDeclared(requires, {
        dependencies: { '@angular/build': '22.0.6' },
        peerDependencies: { '@angular/compiler-cli': '^22.0.0' },
      }),
    /must pin @angular\/compiler-cli to an exact version/,
  );
});

test('the builder package declares every retained Analog runtime require it can reach', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(workspace, 'libs/builder/package.json'), 'utf8'),
  );
  assert.doesNotThrow(() => assertRuntimeRequiresDeclared(RUNTIME_REQUIRES, manifest));
});
