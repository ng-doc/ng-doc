import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, symlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * The single definition of what the standalone generator build consumes and ships.
 * build-generator.mjs, the benchmark observed build and the production-c expected runtime all use
 * it, so the provenance digest cannot drift between them. build-generator.mjs also takes its copy
 * list from here (generatorCopyPlan), so every file it copies is, by construction, a hashed file.
 */

/** Bundle entry points, relative to libs/builder/generator (without extension). */
export const GENERATOR_ENTRY_POINTS = Object.freeze([
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
  'vite/prerender-entry',
  'vite/application-builder',
  'vite/dev-server-builder',
  'vite/angular/index',
]);

/** esbuild `entryPoints` map: output name -> workspace-relative source file. */
export function generatorEntryPointMap() {
  return Object.fromEntries(
    GENERATOR_ENTRY_POINTS.map((entry) => [
      entry,
      `libs/builder/generator/${entry}${entry === 'angular/application' || entry === 'angular/dev-server' ? '/index' : ''}.ts`,
    ]),
  );
}

/**
 * Single files that shape the bundle or the copied assets: the build scripts themselves, the
 * Analog compatibility inputs, the manifests, and every tsconfig/package.json esbuild consults
 * for the bundled source roots (decorator, target and sideEffects settings change the output).
 */
export const GENERATOR_SOURCE_FILES = Object.freeze([
  'tools/scripts/build-generator.mjs',
  'tools/scripts/generator-build-spec.mjs',
  'tools/scripts/generator-output.mjs',
  'tools/scripts/build-generator-types.mjs',
  'tools/scripts/build-analog-compatibility.mjs',
  'tools/scripts/analog-resource-patch.mjs',
  'tools/compatibility/analog-2.8.0-resources.json',
  'tools/licenses/analog-2.8.0.LICENSE',
  'tsconfig.base.json',
  'libs/builder/package.json',
  'libs/builder/tsconfig.json',
  'libs/core/package.json',
  'libs/core/tsconfig.json',
  'libs/utils/package.json',
  'libs/utils/tsconfig.json',
]);

/**
 * Hashed inputs build-generator.mjs loads as code or data before it can snapshot them: its local
 * static-import closure plus the data files those modules read via `new URL(..., import.meta.url)`.
 * build-generator.mjs fails if this list and localModuleClosure() ever disagree.
 */
export const GENERATOR_PROCESS_LOADED_INPUTS = Object.freeze([
  'tools/scripts/build-generator.mjs',
  'tools/scripts/generator-build-spec.mjs',
  'tools/scripts/generator-output.mjs',
  'tools/scripts/build-analog-compatibility.mjs',
  'tools/scripts/analog-resource-patch.mjs',
  'tools/compatibility/analog-2.8.0-resources.json',
]);

const LOCAL_IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|(?:^|[\s;])import\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const MODULE_RELATIVE_URL = /new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;

/**
 * The workspace-relative files `entry` loads before running: its relative static/dynamic imports,
 * recursively, plus files named by `new URL('<relative>', import.meta.url)` (directories, i.e.
 * specifiers without an extension, are skipped). Bare imports are packages (lockfile-covered).
 */
export async function localModuleClosure(root, entry) {
  const found = new Set();
  const visit = async (file) => {
    if (found.has(file)) return;
    found.add(file);
    if (!/\.[cm]?js$/.test(file)) return;
    // A missing module is still reported (e.g. one the snapshot lacks because it is not hashed).
    const text = await readFile(path.join(root, file), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    for (const pattern of [LOCAL_IMPORT, MODULE_RELATIVE_URL]) {
      for (const match of text.matchAll(pattern)) {
        const specifier = match.slice(1).find(Boolean);
        // `new URL('../..', import.meta.url)` names a directory (a root), not a loaded file.
        if (!path.posix.extname(specifier)) continue;
        await visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
      }
    }
  };
  await visit(entry);
  return [...found];
}

/**
 * Source trees and the files in them that are build inputs.
 * - generator: TypeScript sources, plus the `*.json` (angular schema extensions merged into the
 *   output, per-folder tsconfig.json read by esbuild) and `*.js` (restore-theme.js, copied) assets.
 *   Test code (see `excludeTests`) is not an input.
 * - templates: shipped verbatim. Every file is an input and the copy ships exactly this list, so no
 *   directory or test-name exclude applies: what is hashed is what is copied, and vice versa.
 * - the remaining roots are bundled TypeScript only.
 */
export const GENERATOR_SOURCE_TREES = Object.freeze(
  [
    { root: 'libs/builder/generator', include: /\.(ts|json|js)$/, excludeTests: true },
    { root: 'libs/builder/templates', include: /(?:)/, excludeTests: false },
    { root: 'libs/builder/helpers', include: /\.ts$/, excludeTests: true },
    { root: 'libs/builder/types', include: /\.ts$/, excludeTests: true },
    { root: 'libs/builder/parsers', include: /\.ts$/, excludeTests: true },
    { root: 'libs/core', include: /\.ts$/, excludeTests: true },
    { root: 'libs/utils', include: /\.ts$/, excludeTests: true },
  ].map(Object.freeze),
);

/** Source trees the build copies verbatim: every inventory file under `source` lands under `target`. */
export const GENERATOR_COPIED_TREES = Object.freeze([
  Object.freeze({ source: 'libs/builder/templates', target: 'templates' }),
]);

/** Single workspace files the build copies verbatim into the generator output. */
export const GENERATOR_COPIED_FILES = Object.freeze([
  Object.freeze({
    source: 'libs/builder/generator/angular/restore-theme.js',
    target: 'angular/restore-theme.js',
  }),
  ...['application-builder', 'dev-server-builder'].map((name) =>
    Object.freeze({
      source: `libs/builder/generator/vite/${name}.schema.json`,
      target: `vite/${name}.schema.json`,
    }),
  ),
]);

/** Angular builder schema extensions merged over the installed @angular/build schema (lockfile-pinned). */
export const GENERATOR_MERGED_SCHEMAS = Object.freeze(
  ['application', 'dev-server'].map((name) =>
    Object.freeze({
      extension: `libs/builder/generator/angular/${name}/schema.json`,
      native: `node_modules/@angular/build/src/builders/${name}/schema.json`,
      target: `angular/${name}.schema.json`,
    }),
  ),
);

/** The package manifest, copied next to the generator output (`<output>/../package.json`). */
export const GENERATOR_PACKAGE_MANIFEST = 'libs/builder/package.json';

/** Output files the build writes itself; their content derives from hashed inputs or the lockfile. */
export const GENERATOR_GENERATED_OUTPUTS = Object.freeze([
  'package.json',
  'build-metafile.json',
  'build-provenance.json',
  'vite/angular/ANALOG-LICENSE',
  'vite/angular/analog-provenance.json',
]);

// Test/acceptance code, scratch runtimes and OS metadata are never build inputs.
const EXCLUDED_DIRECTORIES = new Set(['testing', 'acceptance', 'node_modules', '.runtime']);
const OS_METADATA = /^\.DS_Store$/;
const TEST_FILE = /\.(spec|test|vitest)\.ts$/;
// Test-runner configs (vitest.config.ts, watch.vitest.config.ts,
// actual-composition.vitest.config.ts, jest.config.ts). No entry point imports them and the build copies none of them; should a
// bundle ever import one, assertInventoryCoversBundle fails the build.
const TEST_RUNNER_CONFIG = /(?:^|\.)(?:vitest|jest)(?:[.-][\w-]+)?\.config\.[cm]?[jt]s$/;

export function isExcludedSourceFile(name, { excludeTests = true } = {}) {
  return (
    OS_METADATA.test(name) ||
    (excludeTests && (TEST_FILE.test(name) || TEST_RUNNER_CONFIG.test(name)))
  );
}

async function walk(root, relative, tree, files) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (tree.excludeTests && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    if (entry.isSymbolicLink()) {
      // Neither hashed (the digest would follow or skip it) nor copyable as-is (cp rewrites the
      // target); a link in a build input tree is always an error, never a silent gap.
      throw new Error(`Generator build input tree contains a symlink: ${tree.root}/${child}`);
    }
    if (entry.isDirectory()) await walk(root, child, tree, files);
    else if (!entry.isFile())
      throw new Error(`Generator build input is not a regular file: ${tree.root}/${child}`);
    else if (!isExcludedSourceFile(entry.name, tree) && tree.include.test(entry.name))
      files.push(child);
  }
}

/** Every workspace-relative (POSIX separators) file whose bytes are hashed into sourceDigest. */
export async function generatorSourceInventory(root) {
  const files = [...GENERATOR_SOURCE_FILES];
  for (const tree of GENERATOR_SOURCE_TREES) {
    const found = [];
    await walk(path.join(root, tree.root), '', tree, found);
    files.push(...found.map((file) => `${tree.root}/${file}`));
  }
  const unique = [...new Set(files)].sort();
  if (unique.length !== files.length)
    throw new Error('Generator source inventory lists a file twice');
  return unique;
}

/**
 * sourceDigest: SHA-256 over every inventory file, each framed as `path\0length\0bytes` so no two
 * different trees share a byte stream. Returns the inventory as well so callers can prove coverage.
 */
export async function computeSourceDigest(root) {
  const files = await generatorSourceInventory(root);
  return { sourceDigest: await digestFiles(root, files), files };
}

/** The sourceDigest framing over an explicit, already captured file list. */
export async function digestFiles(root, files) {
  const hash = createHash('sha256');
  for (const file of files) {
    const bytes = await readFile(path.join(root, file));
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  return hash.digest('hex');
}

/** The dependency tuple and lockfile digest that, with sourceDigest, identify a toolchain. */
export async function readToolchainInputs(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'libs/builder/package.json'), 'utf8'));
  const lockText = await readFile(path.join(root, 'package-lock.json'), 'utf8');
  const lock = JSON.parse(lockText);
  const tuple = Object.fromEntries(
    Object.keys(manifest.dependencies ?? {})
      .sort()
      .map((name) => [
        name,
        lock.packages?.[`node_modules/${name}`]?.version ?? manifest.dependencies[name],
      ]),
  );
  return {
    manifest,
    compilerVersion: manifest.version,
    lockfileDigest: createHash('sha256').update(lockText).digest('hex'),
    tuple,
  };
}

export const GENERATOR_BUILD_FORMAT = 'generator-esm-v1';

/** toolchainDigest keys every compiler/artifact cache reuse decision. */
export function computeToolchainDigest({ compilerVersion, tuple, lockfileDigest, sourceDigest }) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        compilerVersion,
        tuple,
        lockfileDigest,
        sourceDigest,
        format: GENERATOR_BUILD_FORMAT,
      }),
    )
    .digest('hex');
}

/** Everything build-generator.mjs records as provenance, computed from one workspace root. */
export async function computeGeneratorDigests(root) {
  const { manifest, compilerVersion, lockfileDigest, tuple } = await readToolchainInputs(root);
  const { sourceDigest, files } = await computeSourceDigest(root);
  const toolchainDigest = computeToolchainDigest({
    compilerVersion,
    tuple,
    lockfileDigest,
    sourceDigest,
  });
  return { manifest, compilerVersion, lockfileDigest, tuple, sourceDigest, toolchainDigest, files };
}

/**
 * The verbatim copies the build makes, derived from the digest inventory itself: the copied
 * trees ship exactly their inventory files, so the copy and the digest share one file list.
 */
export function generatorCopyPlan(files) {
  const copies = [...GENERATOR_COPIED_FILES];
  for (const tree of GENERATOR_COPIED_TREES) {
    const prefix = `${tree.source}/`;
    for (const file of files) {
      if (file.startsWith(prefix))
        copies.push({ source: file, target: `${tree.target}/${file.slice(prefix.length)}` });
    }
  }
  return copies;
}

/** Fails when the build copies or merges a workspace file the digest does not cover. */
export function assertInventoryCoversCopies(files, copies = generatorCopyPlan(files)) {
  const covered = new Set(files);
  const sources = [
    ...copies.map((copy) => copy.source),
    ...GENERATOR_MERGED_SCHEMAS.map((schema) => schema.extension),
    GENERATOR_PACKAGE_MANIFEST,
  ];
  const missing = sources.filter((source) => !covered.has(source));
  if (missing.length)
    throw new Error(
      `Generator copied inputs missing from sourceDigest: ${[...new Set(missing)].sort().join(', ')}`,
    );
}

/**
 * Plugin namespaces whose inputs are virtual (generated in memory, reading no workspace file), with
 * the exact paths each may produce. Anything else in a non-file namespace fails the bundle guard:
 * a plugin that reads a workspace file into its own namespace would otherwise bundle unhashed bytes.
 */
export const GENERATOR_VIRTUAL_INPUTS = Object.freeze({});

const NAMESPACED_INPUT = /^([A-Za-z][\w-]*):(?![\\/])(.*)$/s;

/**
 * Fails when esbuild bundled a workspace file the digest does not cover (node_modules inputs are
 * covered by lockfileDigest), or an input in a namespace that is not an allow-listed virtual one.
 */
export function assertInventoryCoversBundle(
  files,
  metafile,
  virtualInputs = GENERATOR_VIRTUAL_INPUTS,
) {
  const covered = new Set(files);
  const missing = [];
  const unknown = [];
  for (const input of Object.keys(metafile.inputs)) {
    const namespaced = NAMESPACED_INPUT.exec(input);
    if (namespaced) {
      if (
        !Object.hasOwn(virtualInputs, namespaced[1]) ||
        !virtualInputs[namespaced[1]].includes(namespaced[2])
      )
        unknown.push(JSON.stringify(input));
      continue;
    }
    const file = input.split(path.sep).join('/');
    if (!file.startsWith('node_modules/') && !covered.has(file)) missing.push(file);
  }
  if (unknown.length)
    throw new Error(
      `Generator bundle inputs in an unknown esbuild namespace (allow-list a virtual one in GENERATOR_VIRTUAL_INPUTS): ${unknown.sort().join(', ')}`,
    );
  if (missing.length)
    throw new Error(
      `Generator bundle inputs missing from sourceDigest: ${missing.sort().join(', ')}`,
    );
}

/** Files the build reads from its snapshot besides the digest inventory (lockfileDigest). */
export const GENERATOR_SNAPSHOT_EXTRA_FILES = Object.freeze(['package-lock.json']);

/**
 * Copies the digest inventory (walked once, from the live tree) plus the lockfile into `destination`
 * and links `node_modules` (never copied). The build then reads, bundles, copies and hashes only
 * this private snapshot, so the recorded digest describes exactly the bytes it used, whatever
 * happens to the live tree meanwhile. Returns the snapshot's real path and the captured list.
 */
export async function snapshotGeneratorInputs(root, destination) {
  const files = await generatorSourceInventory(root);
  for (const file of [...files, ...GENERATOR_SNAPSHOT_EXTRA_FILES]) {
    await mkdir(path.dirname(path.join(destination, file)), { recursive: true });
    try {
      await copyFile(path.join(root, file), path.join(destination, file));
    } catch (error) {
      if (error.code === 'ENOENT')
        throw new Error(
          `Generator build input disappeared while it was being snapshotted: ${file}`,
          { cause: error },
        );
      throw error;
    }
  }
  await symlink(
    path.join(root, 'node_modules'),
    path.join(destination, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const snapshot = await realpath(destination);
  const captured = await generatorSourceInventory(snapshot);
  if (captured.join('\0') !== files.join('\0'))
    throw new Error('The generator input snapshot does not hold exactly the captured inventory');
  return { snapshot, files };
}

async function outputFiles(directory, relative = '', found = []) {
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await outputFiles(directory, child, found);
    else found.push({ file: child, link: entry.isSymbolicLink() });
  }
  return found;
}

/**
 * Every file in a built generator output must come from a known producer: an esbuild output, a
 * copy from the plan, a merged schema, a generated file, or a declaration of a hashed generator
 * source. A file written by anything else (an ad-hoc `cp` of an unhashed asset) fails the build.
 * `bundleOutputs` are output-relative paths of the esbuild outputs.
 */
export async function assertOutputAccountedFor(
  output,
  { files, bundleOutputs, copies = generatorCopyPlan(files) },
) {
  const inventory = new Set(files);
  const known = new Set([
    ...bundleOutputs,
    ...copies.map((copy) => copy.target),
    ...GENERATOR_MERGED_SCHEMAS.map((schema) => schema.target),
    ...GENERATOR_GENERATED_OUTPUTS,
  ]);
  const declarationSource = (file) => {
    const stem = `libs/builder/generator/${file.slice(0, -'.d.ts'.length)}`;
    return inventory.has(`${stem}.ts`) || inventory.has(`${stem}/index.ts`);
  };
  const unaccounted = [];
  for (const { file, link } of await outputFiles(output)) {
    if (link || !(known.has(file) || (file.endsWith('.d.ts') && declarationSource(file))))
      unaccounted.push(file);
  }
  // The converse: every declared product was actually written (a partial output never publishes).
  for (const file of known) {
    const stat = await lstat(path.join(output, file)).catch(() => undefined);
    if (!stat?.isFile()) unaccounted.push(`${file} (expected, not written)`);
  }
  if (unaccounted.length)
    throw new Error(
      `Generator output files without a hashed source: ${[...new Set(unaccounted)].sort().join(', ')}`,
    );
}
