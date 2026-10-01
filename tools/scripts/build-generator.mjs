import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertRuntimeRequiresDeclared,
  prepareAnalogCompatibility,
} from './build-analog-compatibility.mjs';
import { analogResourcePolicy, applyAnalogResourcePatch } from './analog-resource-patch.mjs';
import {
  GENERATOR_ENTRY_POINTS,
  GENERATOR_MERGED_SCHEMAS,
  GENERATOR_PACKAGE_MANIFEST,
  GENERATOR_PROCESS_LOADED_INPUTS,
  assertInventoryCoversBundle,
  assertInventoryCoversCopies,
  assertOutputAccountedFor,
  computeGeneratorDigests,
  digestFiles,
  generatorCopyPlan,
  generatorEntryPointMap,
  localModuleClosure,
  snapshotGeneratorInputs,
} from './generator-build-spec.mjs';
import { publishStaged, resolveOutputDirectory } from './generator-output.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
// Default: the shared package dist. `--outdir <dir>` / NGDOC_GENERATOR_OUT_DIR build elsewhere.
const output = resolveOutputDirectory(
  process.argv.slice(2),
  process.env,
  root,
  'dist/libs/builder/generator',
);
const entryPoints = GENERATOR_ENTRY_POINTS;

// Hashed inputs this process loaded as code or data before it could snapshot them. The snapshot
// holds their bytes; a write after this process started would mean the running code may differ.
const PROCESS_LOADED_INPUTS = GENERATOR_PROCESS_LOADED_INPUTS;
// Filesystem timestamps can lag the wall clock by a coarse kernel tick (Linux); stay well clear.
const CLOCK_MARGIN_NS = 50_000_000n;

async function assertLoadedInputsUnchanged(snapshot, files) {
  // The list must be exactly what this script loads (read from the snapshot's immutable copies),
  // and every entry must be hashed.
  const closure = (await localModuleClosure(snapshot, 'tools/scripts/build-generator.mjs')).sort();
  const listed = [...PROCESS_LOADED_INPUTS].sort();
  const unlisted = closure.filter((file) => !listed.includes(file));
  const unloaded = listed.filter((file) => !closure.includes(file));
  const unhashed = closure.filter((file) => !files.includes(file));
  if (unlisted.length || unloaded.length || unhashed.length)
    throw new Error(
      `GENERATOR_PROCESS_LOADED_INPUTS differs from what build-generator.mjs loads: ` +
        `unlisted [${unlisted.join(', ')}], not loaded [${unloaded.join(', ')}], unhashed [${unhashed.join(', ')}]`,
    );
  const started = BigInt(Math.floor(performance.timeOrigin * 1e6)) - CLOCK_MARGIN_NS;
  const changed = [];
  for (const file of PROCESS_LOADED_INPUTS) {
    if ((await lstat(path.join(root, file), { bigint: true })).ctimeNs > started)
      changed.push(file);
  }
  if (changed.length)
    throw new Error(
      `Build scripts changed after this build started; rerun it: ${changed.join(', ')}`,
    );
  const snapshotPolicy = JSON.parse(
    await readFile(path.join(snapshot, 'tools/compatibility/analog-2.6.3-resources.json'), 'utf8'),
  );
  if (JSON.stringify(snapshotPolicy) !== JSON.stringify(analogResourcePolicy))
    throw new Error(
      'The loaded Analog resource policy differs from the snapshotted one; rerun the build',
    );
}

/** esbuild metafile keys are relative to the snapshot; record them as if built in place at `output`. */
function relocateMetafile(metafile, snapshot, staged) {
  const from = `${path.relative(snapshot, staged).split(path.sep).join('/')}/`;
  const to = `${path.relative(root, output).split(path.sep).join('/')}/`;
  const move = (file) => (file.startsWith(from) ? to + file.slice(from.length) : file);
  return {
    ...metafile,
    outputs: Object.fromEntries(
      Object.entries(metafile.outputs).map(([file, details]) => [
        move(file),
        {
          ...details,
          imports: details.imports.map((item) => ({ ...item, path: move(item.path) })),
        },
      ]),
    ),
  };
}

// Everything is built and checked in a staging directory; only a build that passes every guard
// replaces `output`, atomically. A failure leaves the existing output untouched.
// Every hashed input is read from a private snapshot taken first (snapshotGeneratorInputs): the
// digest is computed over that snapshot, so it describes exactly the bytes bundled, copied and
// declared, even if the live tree is edited (or edited and reverted) during the build.
await publishStaged(output, async ({ output: stagedPath, sibling, scratch }) => {
  // Real paths: esbuild reports paths relative to the (real) snapshot.
  const staged = await realpath(stagedPath);
  const { snapshot, files } = await snapshotGeneratorInputs(root, path.join(scratch, 'snapshot'));
  await assertLoadedInputsUnchanged(snapshot, files);
  const { manifest, compilerVersion, lockfileDigest, tuple, sourceDigest, toolchainDigest } =
    await computeGeneratorDigests(snapshot);
  // One list: the verbatim copies are the digest inventory's own files (see generatorCopyPlan).
  const copies = generatorCopyPlan(files);
  assertInventoryCoversCopies(files, copies);
  const analogCompatibility = await prepareAnalogCompatibility({
    root: snapshot,
    factoryEntry: path.join(snapshot, 'libs/builder/generator/vite/angular/index.ts'),
    compatibilityFormat: analogResourcePolicy.format,
    applyPatch: applyAnalogResourcePatch,
  });
  /** A snapshot path as the workspace path it was copied from (recorded provenance stays stable). */
  const workspacePath = (file) => path.join(root, path.relative(snapshot, file));
  const result = await build({
    absWorkingDir: snapshot,
    // The snapshot links node_modules; keep those inputs under node_modules/ (as in the workspace).
    preserveSymlinks: true,
    entryPoints: generatorEntryPointMap(),
    outbase: 'libs/builder/generator',
    outdir: staged,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    metafile: true,
    define: analogCompatibility.define,
    alias: {
      '@ng-doc/core': path.join(snapshot, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(snapshot, 'libs/utils/index.ts'),
    },
    plugins: [
      analogCompatibility.plugin,
      {
        name: 'immutable-generator-build-provenance',
        setup(builder) {
          builder.onLoad({ filter: /generator\/bootstrap\/constants\.ts$/ }, () => ({
            loader: 'ts',
            contents: `export const GENERATOR_COMPILER_VERSION = ${JSON.stringify(compilerVersion)}; export const GENERATOR_TOOLCHAIN_DIGEST = ${JSON.stringify(toolchainDigest)};`,
          }));
        },
      },
    ],
  });
  assertInventoryCoversBundle(files, result.metafile);
  const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
  const imports = new Set();
  for (const [file, details] of Object.entries(result.metafile.outputs)) {
    if (
      /generator\/(compiler|bootstrap|worker)\//.test(file) &&
      Object.keys(details.inputs).some((input) =>
        /libs\/builder\/(engine\/|index\.ts$|application\/|dev-server\/)/.test(input),
      )
    ) {
      throw new Error(`Generator runtime entered the legacy host/engine boundary: ${file}`);
    }
    for (const item of details.imports) {
      if (!item.external || builtins.has(item.path)) continue;
      const name = item.path.startsWith('@')
        ? item.path.split('/').slice(0, 2).join('/')
        : item.path.split('/')[0];
      imports.add(name);
      if (!manifest.dependencies[name] && !manifest.peerDependencies?.[name])
        throw new Error(`Undeclared runtime dependency ${name} in ${file}`);
      if (
        /generator\/(compiler|bootstrap|worker)\//.test(file) &&
        /@angular\/build|@angular-devkit/.test(name)
      )
        throw new Error(`Generator host boundary imports ${name}`);
    }
  }
  assertRuntimeRequiresDeclared(analogCompatibility.runtimeRequires, manifest);
  await writeFile(path.join(staged, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));
  await copyFile(path.join(snapshot, GENERATOR_PACKAGE_MANIFEST), sibling('package.json'));
  await mkdir(path.join(staged, 'vite/angular'), { recursive: true });
  await writeFile(
    path.join(staged, 'vite/angular/ANALOG-LICENSE'),
    analogCompatibility.license.text,
  );
  await writeFile(
    path.join(staged, 'vite/angular/analog-provenance.json'),
    JSON.stringify(
      {
        ...analogCompatibility.provenance,
        mainSourcePath: workspacePath(analogCompatibility.provenance.mainSourcePath),
        licensePath: workspacePath(analogCompatibility.provenance.licensePath),
        runtimeRequires: analogCompatibility.runtimeRequires,
        staticExternalInventory: analogCompatibility.staticExternalInventory,
        encounteredStaticExternals: [...analogCompatibility.encounteredStaticExternals].sort(),
      },
      null,
      2,
    ),
  );
  for (const { source, target } of copies) {
    await mkdir(path.dirname(path.join(staged, target)), { recursive: true });
    await copyFile(path.join(snapshot, source), path.join(staged, target));
  }
  for (const { extension: extensionFile, native: nativeFile, target } of GENERATOR_MERGED_SCHEMAS) {
    const native = JSON.parse(await readFile(path.join(root, nativeFile), 'utf8'));
    const extension = JSON.parse(await readFile(path.join(snapshot, extensionFile), 'utf8'));
    await writeFile(
      path.join(staged, target),
      JSON.stringify(
        { ...native, ...extension, properties: { ...native.properties, ...extension.properties } },
        null,
        2,
      ),
    );
  }
  await chmod(path.join(staged, 'bootstrap/bin.js'), 0o755);
  await writeFile(
    path.join(staged, 'build-metafile.json'),
    JSON.stringify(relocateMetafile(result.metafile, snapshot, staged), null, 2),
  );
  await writeFile(
    path.join(staged, 'build-provenance.json'),
    JSON.stringify(
      {
        compilerVersion,
        toolchainDigest,
        sourceDigest,
        lockfileDigest,
        tuple,
        runtimeExternals: [...imports].sort(),
        angularCompatibility: {
          format: analogResourcePolicy.format,
          upstream: analogCompatibility.provenance.package,
          sourceInventorySha256: analogCompatibility.provenance.sourceInventory.sha256,
          patchedMainSourceSha256: analogCompatibility.provenance.patchedMainSourceSha256,
        },
      },
      null,
      2,
    ),
  );
  // The snapshot's own copy of the declaration script, reading hashed sources from the snapshot.
  execFileSync(
    process.execPath,
    [
      path.join(snapshot, 'tools/scripts/build-generator-types.mjs'),
      ...['--outdir', staged, '--workspace', root, '--snapshot', snapshot],
    ],
    { cwd: root, stdio: 'inherit' },
  );
  await assertOutputAccountedFor(staged, {
    files,
    copies,
    bundleOutputs: Object.keys(result.metafile.outputs).map((file) =>
      path.relative(staged, path.resolve(snapshot, file)).split(path.sep).join('/'),
    ),
  });
  // Nothing may have written into the snapshot: the recorded digest describes the bytes used.
  if ((await digestFiles(snapshot, files)) !== sourceDigest)
    throw new Error(
      'The generator input snapshot changed during the build; the output was not published',
    );
});
console.log(`Built standalone NgDoc ESM runtime (${entryPoints.length} entries) into ${output}.`);
