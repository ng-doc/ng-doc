import assert from 'node:assert/strict';
import {
  copyFile,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GENERATOR_ENTRY_POINTS,
  GENERATOR_GENERATED_OUTPUTS,
  GENERATOR_MERGED_SCHEMAS,
  GENERATOR_PROCESS_LOADED_INPUTS,
  GENERATOR_SOURCE_FILES,
  GENERATOR_VIRTUAL_INPUTS,
  assertInventoryCoversBundle,
  assertInventoryCoversCopies,
  assertOutputAccountedFor,
  computeGeneratorDigests,
  computeSourceDigest,
  digestFiles,
  generatorCopyPlan,
  generatorEntryPointMap,
  generatorSourceInventory,
  localModuleClosure,
  snapshotGeneratorInputs,
} from '../generator-build-spec.mjs';

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function temporary(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (file, text) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  };
  return { root, write };
}

/** A minimal workspace carrying every kind of generator build input, plus files that are not. */
async function workspace(t) {
  const { root, write } = await temporary(t, 'ngdoc-generator-digest-');
  for (const file of GENERATOR_SOURCE_FILES) await write(file, `// ${file}\n`);
  await write(
    'libs/builder/package.json',
    JSON.stringify({ version: '1.0.0', dependencies: { nunjucks: '^3' } }),
  );
  await write(
    'package-lock.json',
    JSON.stringify({ packages: { 'node_modules/nunjucks': { version: '3.2.4' } } }),
  );
  await write('libs/builder/generator/contracts.ts', 'export const contracts = 1;\n');
  await write('libs/builder/generator/angular/application/schema.json', '{"properties":{}}\n');
  await write('libs/builder/generator/angular/dev-server/schema.json', '{"properties":{}}\n');
  await write('libs/builder/generator/angular/restore-theme.js', 'restore();\n');
  await write('libs/builder/generator/vite/application-builder.schema.json', '{"properties":{}}\n');
  await write('libs/builder/generator/vite/dev-server-builder.schema.json', '{"properties":{}}\n');
  await write('libs/builder/templates/page.ts.nunj', '{{ page.title }}\n');
  await write('libs/builder/templates/helpers/badge.html.nunj', '<span>{{ badge }}</span>\n');
  await write('libs/builder/helpers/index.ts', 'export {};\n');
  await write('libs/builder/types/index.ts', 'export {};\n');
  await write('libs/builder/parsers/index.ts', 'export {};\n');
  await write('libs/core/index.ts', 'export {};\n');
  await write('libs/utils/index.ts', 'export {};\n');
  // Never inputs: tests, test-runner configs, acceptance harnesses, scratch runtimes, dependencies,
  // OS metadata.
  await write('libs/builder/generator/compiler/compiler.vitest.ts', 'test\n');
  await write('libs/builder/generator/compiler/vitest.config.ts', 'export default {};\n');
  await write('libs/builder/generator/compiler/watch.vitest.config.ts', 'export default {};\n');
  await write('libs/builder/generator/outputs/vitest.config.ts', 'export default {};\n');
  await write('libs/core/jest.config.ts', 'export default {};\n');
  await write('libs/builder/generator/vite/testing/fixture.json', '{}\n');
  await write(
    'libs/builder/generator/worker/testing/actual-composition.vitest.config.ts',
    'export default {};\n',
  );
  await write('libs/builder/generator/acceptance/run.js', 'run();\n');
  await write('libs/builder/generator/vite/.runtime/scratch.ts', 'scratch\n');
  await write('libs/builder/generator/.DS_Store', 'finder\n');
  return { root, write };
}

test('a template-only change changes sourceDigest and toolchainDigest', async (t) => {
  const { root, write } = await workspace(t);
  const before = await computeGeneratorDigests(root);
  await write(
    'libs/builder/templates/helpers/badge.html.nunj',
    '<span class="new">{{ badge }}</span>\n',
  );
  const after = await computeGeneratorDigests(root);
  assert.deepEqual(after.files, before.files, 'only bytes changed, not the inventory');
  assert.equal(after.lockfileDigest, before.lockfileDigest);
  assert.notEqual(after.sourceDigest, before.sourceDigest);
  assert.notEqual(after.toolchainDigest, before.toolchainDigest);
});

test('copied and merged generator assets are digest inputs', async (t) => {
  const { root, write } = await workspace(t);
  for (const [file, text] of [
    ['libs/builder/generator/angular/application/schema.json', '{"properties":{"x":{}}}\n'],
    ['libs/builder/generator/angular/restore-theme.js', 'restore(true);\n'],
    ['libs/builder/templates/page.ts.nunj', '{{ page.route }}\n'],
    ['libs/builder/parsers/index.ts', 'export const parsed = 1;\n'],
    ['tools/scripts/generator-output.mjs', '// staged publication changed\n'],
  ]) {
    const before = await computeSourceDigest(root);
    await write(file, text);
    assert.notEqual((await computeSourceDigest(root)).sourceDigest, before.sourceDigest, file);
  }
});

test('non-inputs, including test-runner configs, do not change the digest', async (t) => {
  const { root, write } = await workspace(t);
  const before = await computeSourceDigest(root);
  for (const file of [
    'libs/builder/generator/compiler/compiler.vitest.ts',
    'libs/builder/generator/compiler/vitest.config.ts',
    'libs/builder/generator/compiler/watch.vitest.config.ts',
    'libs/builder/generator/outputs/vitest.config.ts',
    'libs/core/jest.config.ts',
    'libs/builder/generator/vite/testing/fixture.json',
    'libs/builder/generator/worker/testing/actual-composition.vitest.config.ts',
    'libs/builder/generator/acceptance/run.js',
    'libs/builder/generator/vite/.runtime/scratch.ts',
    'libs/builder/generator/.DS_Store',
  ]) {
    assert.ok(!before.files.includes(file), file);
    await write(file, 'changed\n');
  }
  // A symlink loop inside an excluded scratch directory is never visited.
  const runtime = path.join(root, 'libs/builder/generator/vite/.runtime');
  await symlink(path.join(runtime, 'loop-b'), path.join(runtime, 'loop-a'));
  await symlink(path.join(runtime, 'loop-a'), path.join(runtime, 'loop-b'));
  assert.equal((await computeSourceDigest(root)).sourceDigest, before.sourceDigest);
});

test('templates are hashed and copied as one list: no directory or test-name excludes apply', async (t) => {
  const { root, write } = await workspace(t);
  for (const file of [
    'testing/shared.nunj',
    'acceptance/x.nunj',
    'node_modules/y.nunj',
    '.runtime/z.nunj',
    'page.spec.ts',
    'vitest.config.ts',
  ])
    await write(`libs/builder/templates/${file}`, `${file}\n`);
  const { files } = await computeSourceDigest(root);
  const templates = files.filter((file) => file.startsWith('libs/builder/templates/'));
  assert.deepEqual(templates, [
    'libs/builder/templates/.runtime/z.nunj',
    'libs/builder/templates/acceptance/x.nunj',
    'libs/builder/templates/helpers/badge.html.nunj',
    'libs/builder/templates/node_modules/y.nunj',
    'libs/builder/templates/page.spec.ts',
    'libs/builder/templates/page.ts.nunj',
    'libs/builder/templates/testing/shared.nunj',
    'libs/builder/templates/vitest.config.ts',
  ]);
  const copies = generatorCopyPlan(files);
  assert.deepEqual(
    copies.filter((copy) => copy.target.startsWith('templates/')).map((copy) => copy.source),
    templates,
    'the copy ships exactly the hashed template list',
  );
  assert.deepEqual(
    copies.find((copy) => copy.target === 'templates/testing/shared.nunj'),
    {
      source: 'libs/builder/templates/testing/shared.nunj',
      target: 'templates/testing/shared.nunj',
    },
  );
  assert.ok(
    copies.some((copy) => copy.source === 'libs/builder/generator/angular/restore-theme.js'),
  );
  assert.doesNotThrow(() => assertInventoryCoversCopies(files, copies));
  const before = await computeSourceDigest(root);
  await write('libs/builder/templates/testing/shared.nunj', 'edited\n');
  assert.notEqual((await computeSourceDigest(root)).sourceDigest, before.sourceDigest);
  // OS metadata is neither hashed nor shipped.
  await write('libs/builder/templates/.DS_Store', 'finder\n');
  assert.ok(!(await computeSourceDigest(root)).files.includes('libs/builder/templates/.DS_Store'));
});

test('a symlink in a build input tree fails the digest instead of being skipped', async (t) => {
  for (const link of [
    'libs/builder/templates/shared.nunj',
    'libs/builder/generator/vite/linked.ts',
  ]) {
    const { root } = await workspace(t);
    await symlink(path.join(root, 'libs/builder/templates/page.ts.nunj'), path.join(root, link));
    await assert.rejects(
      computeSourceDigest(root),
      new RegExp(`contains a symlink: ${link.replaceAll('/', '\\/')}`),
    );
  }
});

test('a copied or merged source outside the inventory is rejected', async (t) => {
  const { root } = await workspace(t);
  const { files } = await computeSourceDigest(root);
  const copies = [
    ...generatorCopyPlan(files),
    { source: 'libs/builder/generator/vite/overlay.css', target: 'vite/overlay.css' },
  ];
  assert.throws(
    () => assertInventoryCoversCopies(files, copies),
    /copied inputs missing from sourceDigest: libs\/builder\/generator\/vite\/overlay\.css/,
  );
  const withoutSchema = files.filter((file) => file !== GENERATOR_MERGED_SCHEMAS[0].extension);
  assert.throws(() => assertInventoryCoversCopies(withoutSchema), /application\/schema\.json/);
});

test('every output file must come from a hashed source or a known producer', async (t) => {
  const { root } = await workspace(t);
  const { files } = await computeSourceDigest(root);
  const { root: output, write } = await temporary(t, 'ngdoc-generator-output-');
  const bundleOutputs = ['contracts.js'];
  for (const file of [
    ...bundleOutputs,
    ...generatorCopyPlan(files).map((copy) => copy.target),
    ...GENERATOR_MERGED_SCHEMAS.map((schema) => schema.target),
    ...GENERATOR_GENERATED_OUTPUTS,
    'contracts.d.ts',
    'angular/application.d.ts',
  ])
    await write(file, 'x\n');
  const inventory = [...files, 'libs/builder/generator/angular/application/index.ts'].sort();
  await assertOutputAccountedFor(output, { files: inventory, bundleOutputs });

  await write('vite/overlay.css', 'body {}\n');
  await assert.rejects(
    assertOutputAccountedFor(output, { files: inventory, bundleOutputs }),
    /without a hashed source: vite\/overlay\.css/,
  );
  await rm(path.join(output, 'vite'), { recursive: true });

  await write('stray/leftover.d.ts', 'x\n');
  await assert.rejects(
    assertOutputAccountedFor(output, { files: inventory, bundleOutputs }),
    /stray\/leftover\.d\.ts/,
  );
  await rm(path.join(output, 'stray'), { recursive: true });

  await symlink(path.join(output, 'contracts.js'), path.join(output, 'linked.js'));
  await assert.rejects(
    assertOutputAccountedFor(output, { files: inventory, bundleOutputs }),
    /linked\.js/,
  );
  await rm(path.join(output, 'linked.js'));

  await rm(path.join(output, 'templates/page.ts.nunj'));
  await assert.rejects(
    assertOutputAccountedFor(output, { files: inventory, bundleOutputs }),
    /templates\/page\.ts\.nunj \(expected, not written\)/,
  );
});

test('the digest is stable across two runs on the same tree', async (t) => {
  const { root } = await workspace(t);
  assert.deepEqual(await computeGeneratorDigests(root), await computeGeneratorDigests(root));
});

test('the repository inventory covers templates and angular assets; its digest is stable on a snapshot', async (t) => {
  // One walk of the live tree, for membership only: other work may edit sources concurrently, so
  // determinism is asserted on a private snapshot of exactly the captured file list.
  // Membership only: generatorSourceInventory walks without reading any file's bytes.
  const files = await generatorSourceInventory(REPOSITORY);
  for (const file of [
    'libs/builder/templates/page.ts.nunj',
    'libs/builder/generator/angular/application/schema.json',
    'libs/builder/generator/angular/dev-server/schema.json',
    'libs/builder/generator/angular/restore-theme.js',
    'libs/builder/generator/vite/application-builder.schema.json',
    'libs/builder/generator/vite/dev-server-builder.schema.json',
    'libs/builder/parsers/parse-snippet.ts',
    'tools/scripts/generator-build-spec.mjs',
    'tools/scripts/generator-output.mjs',
  ])
    assert.ok(files.includes(file), file);
  assert.ok(
    !files.some((file) =>
      /^libs\/builder\/generator\/(.+\/)?(testing|acceptance|\.runtime|node_modules)\//.test(file),
    ),
  );
  assert.ok(!files.some((file) => /(^|\/|\.)(vitest|jest)([.-][\w-]+)?\.config\.ts$/.test(file)));
  const entries = generatorEntryPointMap();
  assert.deepEqual(Object.keys(entries), [...GENERATOR_ENTRY_POINTS]);
  for (const source of Object.values(entries)) assert.ok(files.includes(source), source);
  assertInventoryCoversCopies(files);

  const { root: snapshot } = await temporary(t, 'ngdoc-generator-snapshot-');
  const copied = [];
  for (const file of [...files, 'package-lock.json']) {
    await mkdir(path.dirname(path.join(snapshot, file)), { recursive: true });
    try {
      await copyFile(path.join(REPOSITORY, file), path.join(snapshot, file));
    } catch (error) {
      if (error.code === 'ENOENT') continue; // deleted after the walk: not part of the snapshot
      throw error;
    }
    if (file !== 'package-lock.json') copied.push(file);
  }
  const first = await computeGeneratorDigests(snapshot);
  const second = await computeGeneratorDigests(snapshot);
  assert.deepEqual(first.files, copied, 'the inventory of a snapshot is exactly the captured list');
  assert.deepEqual(second, first);
  assert.equal(first.sourceDigest, await digestFiles(snapshot, copied));
});

test('a bundled workspace file outside the inventory is rejected', () => {
  const files = ['libs/builder/generator/contracts.ts'];
  const metafile = (inputs) => ({ inputs: Object.fromEntries(inputs.map((input) => [input, {}])) });
  assertInventoryCoversBundle(
    files,
    metafile([
      'libs/builder/generator/contracts.ts',
      'node_modules/@analogjs/vite-plugin-angular/src/index.js',
    ]),
  );
  assert.throws(
    () => assertInventoryCoversBundle(files, metafile(['libs/builder/parsers/parse-snippet.ts'])),
    /missing from sourceDigest: libs\/builder\/parsers\/parse-snippet\.ts/,
  );
});

test('namespaced esbuild inputs pass only when allow-listed as virtual; unknown ones fail', () => {
  const files = ['libs/builder/generator/contracts.ts'];
  const metafile = (...inputs) => ({
    inputs: Object.fromEntries(inputs.map((input) => [input, {}])),
  });
  assert.deepEqual(Object.keys(GENERATOR_VIRTUAL_INPUTS), []);
  for (const input of [
    // A plugin that reads a workspace file into its own namespace (e.g. ?raw or inline CSS).
    'raw:libs/builder/generator/vite/overlay.css',
    'inline-css:libs/builder/templates/theme.css',
    // The namespace of the former Analog ts-morph shim, which Analog 2.8.0 no longer needs.
    'ngdoc-analog-compatibility:\0ngdoc-analog-ts-morph-context',
  ])
    assert.throws(
      () =>
        assertInventoryCoversBundle(files, metafile('libs/builder/generator/contracts.ts', input)),
      /unknown esbuild namespace/,
      input,
    );
  // A drive-letter path is a file outside the inventory, not a namespace: it must not be skipped.
  assert.throws(
    () => assertInventoryCoversBundle(files, metafile('C:/elsewhere/x.ts')),
    /missing from sourceDigest: C:\/elsewhere\/x\.ts/,
  );
  // An explicit allow-list entry admits exactly that virtual input, and no other path of it.
  assert.doesNotThrow(() =>
    assertInventoryCoversBundle(files, metafile('raw:\0virtual'), { raw: ['\0virtual'] }),
  );
  assert.throws(
    () =>
      assertInventoryCoversBundle(files, metafile('raw:libs/builder/generator/contracts.ts'), {
        raw: ['\0virtual'],
      }),
    /unknown esbuild namespace/,
  );
});

test('the real shared bundle has no namespaced input outside the allow-list', async (t) => {
  const metafile = await readFile(
    path.join(REPOSITORY, 'dist/libs/builder/generator/build-metafile.json'),
    'utf8',
  ).catch(() => undefined);
  if (!metafile) return t.skip('no shared generator dist');
  const namespaced = Object.keys(JSON.parse(metafile).inputs).filter((input) =>
    /^[A-Za-z][\w-]*:(?![\\/])/.test(input),
  );
  assert.deepEqual(namespaced, []);
});

test('the input snapshot holds exactly the inventory and the lockfile, links node_modules, and is private', async (t) => {
  const { root, write } = await workspace(t);
  await mkdir(path.join(root, 'node_modules/esbuild'), { recursive: true });
  const { root: scratch } = await temporary(t, 'ngdoc-generator-snapshot-');
  const { snapshot, files } = await snapshotGeneratorInputs(root, path.join(scratch, 'snapshot'));
  assert.deepEqual(files, await generatorSourceInventory(root));
  assert.deepEqual(await generatorSourceInventory(snapshot), files);
  assert.equal(
    await readFile(path.join(snapshot, 'package-lock.json'), 'utf8'),
    await readFile(path.join(root, 'package-lock.json'), 'utf8'),
  );
  assert.ok(
    (await lstat(path.join(snapshot, 'node_modules'))).isSymbolicLink(),
    'node_modules is linked, never copied',
  );
  assert.equal(
    await readlink(path.join(snapshot, 'node_modules')),
    path.join(root, 'node_modules'),
  );
  const digests = await computeGeneratorDigests(snapshot);
  assert.deepEqual(digests, await computeGeneratorDigests(root));
  // Editing (or editing and reverting) the live tree afterwards changes nothing in the snapshot.
  await write('libs/builder/generator/contracts.ts', 'export const contracts = 2;\n');
  await write('libs/builder/generator/added.ts', 'export {};\n');
  assert.deepEqual(await computeGeneratorDigests(snapshot), digests);
  assert.equal(
    await readFile(path.join(snapshot, 'libs/builder/generator/contracts.ts'), 'utf8'),
    'export const contracts = 1;\n',
  );
});

test('an input that disappears while it is snapshotted fails the build', async (t) => {
  const { root } = await workspace(t);
  const { root: scratch } = await temporary(t, 'ngdoc-generator-snapshot-');
  await rm(path.join(root, 'package-lock.json'));
  await assert.rejects(
    snapshotGeneratorInputs(root, path.join(scratch, 'snapshot')),
    /disappeared while it was being snapshotted: package-lock\.json/,
  );
});

test("the process-loaded list is exactly build-generator.mjs's local import closure", async () => {
  const closure = await localModuleClosure(REPOSITORY, 'tools/scripts/build-generator.mjs');
  assert.deepEqual([...closure].sort(), [...GENERATOR_PROCESS_LOADED_INPUTS].sort());
  const inventory = new Set(await generatorSourceInventory(REPOSITORY));
  for (const file of GENERATOR_PROCESS_LOADED_INPUTS)
    assert.ok(inventory.has(file), `${file} is hashed`);
});

test('a new local import, dynamic import or module-relative data file is found (the list would fail)', async (t) => {
  const { root, write } = await temporary(t, 'ngdoc-generator-closure-');
  await write(
    'tools/scripts/build-generator.mjs',
    [
      "import { build } from 'esbuild';",
      "import { a } from './a.mjs';",
      "import './side-effect.mjs';",
      "export { b } from './b.mjs';",
      "const root = new URL('../..', import.meta.url);",
      "const lazy = await import('./lazy.mjs');",
    ].join('\n'),
  );
  for (const file of ['a', 'side-effect', 'b', 'lazy'])
    await write(`tools/scripts/${file}.mjs`, `export const ${file.replace('-', '')} = 1;\n`);
  await write(
    'tools/scripts/a.mjs',
    "import './nested/c.mjs';\nconst data = await readFile(new URL('../data/policy.json', import.meta.url));\n",
  );
  await write('tools/scripts/nested/c.mjs', "import { a } from '../a.mjs';\n");
  await write('tools/data/policy.json', '{}\n');
  assert.deepEqual((await localModuleClosure(root, 'tools/scripts/build-generator.mjs')).sort(), [
    'tools/data/policy.json',
    'tools/scripts/a.mjs',
    'tools/scripts/b.mjs',
    'tools/scripts/build-generator.mjs',
    'tools/scripts/lazy.mjs',
    'tools/scripts/nested/c.mjs',
    'tools/scripts/side-effect.mjs',
  ]);
});

test('builder:build is cached on every non-library build input (nx cannot restore a stale output)', async () => {
  const project = JSON.parse(
    await readFile(path.join(REPOSITORY, 'libs/builder/project.json'), 'utf8'),
  );
  const inputs = project.targets.build.inputs ?? [];
  assert.ok(inputs.includes('production') && inputs.includes('^production'));
  const covers = (file) =>
    inputs.some((input) => {
      if (typeof input !== 'string' || !input.startsWith('{workspaceRoot}/')) return false;
      const pattern = input.slice('{workspaceRoot}/'.length);
      return pattern.endsWith('/**/*')
        ? file.startsWith(pattern.slice(0, -'**/*'.length))
        : pattern === file;
    });
  // libs/** files are covered by the projects' own production inputs; everything else must be listed.
  for (const file of [...GENERATOR_SOURCE_FILES, ...GENERATOR_PROCESS_LOADED_INPUTS].filter(
    (item) => !item.startsWith('libs/'),
  ))
    assert.ok(covers(file), `${file} is a builder:build input`);
  for (const command of project.targets.build.options.commands)
    for (const [, script] of command.matchAll(/\bnode\s+([\w./-]+\.m?js)\b/g))
      assert.ok(covers(script), `${script} (run by builder:build) is an input`);
});
