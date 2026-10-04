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
  ANALOG_COMPATIBILITY_UPSTREAM,
  RUNTIME_REQUIRES,
  patchSource,
  prepareAnalogCompatibility,
  replaceExactlyOnce,
  sourceInventory,
} from '../build-analog-compatibility.mjs';
import {
  ANALOG_MAIN_SOURCE,
  analogResourcePolicy,
  applyAnalogResourcePatch,
} from '../analog-resource-patch.mjs';

// `fileURLToPath`, not `URL.pathname`: on Windows the pathname is `/D:/…`, which resolves to `D:\D:\…`.
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

test('patchSource requires caller patch policy to alter the source', () => {
  assert.throws(
    () => patchSource('source', (value) => value, 'lib/fixture.js'),
    /did not change lib\/fixture\.js/,
  );
  assert.deepEqual(
    patchSource(
      'source',
      (value, file) => ({ code: `${value} patched`, changes: [file] }),
      'lib/fixture.js',
    ),
    {
      code: 'source patched',
      changes: ['lib/fixture.js'],
    },
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
    const original = `await hotUpdates.schedule(ctx.file, [\n                        ...mods.map((mod) => mod.id),\n                        ...updates,\n                    ]);`;
    const replacement = `await hotUpdates.schedule(ctx.file, [\n                        ctx.file,\n                        ...mods.map((mod) => mod.id),\n                        ...updates,\n                    ]);`;
    const files = [];
    const prepared = await prepareAnalogCompatibility({
      root: workspace,
      factoryEntry: factory,
      compatibilityFormat: 'diagnostic-ctx-file',
      applyPatch: (source, file) => {
        files.push(file);
        return file === 'lib/angular-vite-plugin.js'
          ? replaceExactlyOnce(source, original, replacement, 'diagnostic ctx.file anchor')
          : `${source}\nexport const diagnosticStylesPatched = true;\n`;
      },
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
    assert.match(outputs['factory.js'], /await hotUpdates\.schedule\(ctx\.file, \[\s*ctx\.file,/);
    assert.deepEqual(files, [
      'lib/angular-vite-plugin.js',
      'lib/encapsulate-component-styles-plugin.js',
    ]);
    // Analog 2.8.0 no longer depends on ts-morph: nothing resolves it, and no shim is bundled.
    assert.doesNotMatch(outputs['factory.js'], /ts-morph/);
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
    assert.deepEqual(
      prepared.provenance.patchedSources.map(({ path: file }) => file),
      ['lib/angular-vite-plugin.js', 'lib/encapsulate-component-styles-plugin.js'],
    );
    for (const source of prepared.provenance.patchedSources) {
      assert.equal(source.patchedSha256.length, 64);
      assert.notEqual(source.patchedSha256, source.sha256);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('the shipped policy patches exactly the pinned Analog sources it names', async () => {
  const upstream = path.join(workspace, 'node_modules/@analogjs/vite-plugin-angular/src');
  const files = Object.keys(analogResourcePolicy.patchedSourcesSha256);
  assert.deepEqual(files, Object.keys(ANALOG_COMPATIBILITY_UPSTREAM.patchedSources));
  assert.equal(
    analogResourcePolicy.upstream,
    `${ANALOG_COMPATIBILITY_UPSTREAM.name}@${ANALOG_COMPATIBILITY_UPSTREAM.version}`,
  );
  const applied = [];
  for (const file of files) {
    const { changes } = applyAnalogResourcePatch(
      await readFile(path.join(upstream, file), 'utf8'),
      file,
    );
    applied.push(...changes.map(({ label }) => label));
  }
  assert.deepEqual(
    applied.sort(),
    analogResourcePolicy.changes.map(({ label }) => label).sort(),
    'every change applies to one of the named files',
  );
  // Fixed upstream in 2.8.0: hot-update passes are awaited, and component stylesheets are
  // encapsulated by a separate plugin outside the TypeScript transform.
  for (const label of [
    'unimported-resource-rejection-observer',
    'component-style-transform-filter',
    'component-style-transform-passthrough',
  ])
    assert.equal(applied.includes(label), false, label);
  assert.throws(
    () => applyAnalogResourcePatch('unrelated source', ANALOG_MAIN_SOURCE),
    /must occur exactly once; found 0/,
  );
});

test('assertRuntimeRequiresDeclared needs only the requires reachable on the pinned Angular major', () => {
  const manifest = (dependencies) => ({
    dependencies,
    peerDependencies: { '@angular/compiler-cli': '>=22.0.0 <23.0.0' },
    'ng-doc': { viteEngine: { '@angular/compiler-cli': '^22.2.0' } },
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
        'ng-doc': { viteEngine: { '@angular/compiler-cli': '17.3.0' } },
      }),
    /Undeclared retained Analog runtime require: @angular-devkit\/build-angular/,
  );
  // An exact version names its major as well.
  assert.doesNotThrow(() =>
    assertRuntimeRequiresDeclared(requires, {
      dependencies: { '@angular/build': '22.2.1' },
      'ng-doc': { viteEngine: { '@angular/compiler-cli': '22.2.1' } },
    }),
  );
  for (const range of ['>=22.0.0 <23.0.0', '~22.2.0', '^0.22.0', '22.x', 'latest'])
    assert.throws(
      () =>
        assertRuntimeRequiresDeclared(requires, {
          dependencies: { '@angular/build': '22.2.1' },
          'ng-doc': { viteEngine: { '@angular/compiler-cli': range } },
        }),
      /must name the Vite engine's @angular\/compiler-cli \(ng-doc.viteEngine\) as a version or a caret range of one major/,
      range,
    );
  // The peer range alone does not name the tested major.
  assert.throws(
    () =>
      assertRuntimeRequiresDeclared(requires, {
        dependencies: { '@angular/build': '22.0.6' },
        peerDependencies: { '@angular/compiler-cli': '22.0.6' },
      }),
    /must name the Vite engine's @angular\/compiler-cli/,
  );
});

test('the builder package declares every retained Analog runtime require it can reach', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(workspace, 'libs/builder/package.json'), 'utf8'),
  );
  assert.doesNotThrow(() => assertRuntimeRequiresDeclared(RUNTIME_REQUIRES, manifest));
});
