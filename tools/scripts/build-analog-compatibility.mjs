import { createHash } from 'node:crypto';
import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '../..');

export const ANALOG_COMPATIBILITY_UPSTREAM = Object.freeze({
  name: '@analogjs/vite-plugin-angular',
  version: '2.8.0',
  sourceFiles: 163,
  sourceInventorySha256: '59d7bbf119ca438674d11d3e1123b589f238d0d03ff34de9e46b284e0b7d0dc7',
  // The upstream files the policy patches (paths below `src/`), with their original digests.
  patchedSources: Object.freeze({
    'lib/angular-vite-plugin.js':
      '0d60401c25875de0aa06aeb991b8e27324f40cb51403dc061cc1c07db47fee5f',
    'lib/encapsulate-component-styles-plugin.js':
      '6dd369d15c54ed8070eb10d3876bdf2b4e8ceb60be39275c7acd497c50a7c1d0',
  }),
});

export const RETAINED_STATIC_EXTERNALS = Object.freeze([
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

// These are the resolved workspace lock versions for the selected tuple, not
// the different versions used by the earlier isolated packed-consumer probe.
export const STATIC_EXTERNAL_INVENTORY = Object.freeze([
  Object.freeze({ id: '@angular/compiler', owner: 'peer @angular/compiler@22.2.1' }),
  Object.freeze({ id: '@angular/compiler-cli', owner: 'peer @angular/compiler-cli@22.2.1' }),
  Object.freeze({ id: 'magic-string', owner: 'upstream dependency magic-string@0.30.21' }),
  Object.freeze({ id: 'node:crypto', owner: 'Node 24 runtime' }),
  Object.freeze({ id: 'node:fs', owner: 'Node 24 runtime' }),
  Object.freeze({ id: 'node:module', owner: 'Node 24 runtime' }),
  Object.freeze({ id: 'node:os', owner: 'Node 24 runtime' }),
  Object.freeze({ id: 'node:path', owner: 'Node 24 runtime' }),
  Object.freeze({ id: 'node:url', owner: 'Node 24 runtime' }),
  Object.freeze({ id: 'obug', owner: 'upstream dependency obug@2.1.3' }),
  Object.freeze({ id: 'oxc-parser', owner: 'upstream dependency oxc-parser@0.121.0' }),
  Object.freeze({ id: 'tinyglobby', owner: 'upstream dependency tinyglobby@0.2.17' }),
  Object.freeze({ id: 'typescript', owner: 'peer typescript@6.0.3' }),
  Object.freeze({ id: 'vite', owner: 'peer vite@8.3.2' }),
]);

export const RUNTIME_REQUIRES = Object.freeze([
  Object.freeze({
    id: 'typescript',
    source: 'lib/angular-vite-plugin.js',
    reason: 'Upstream createRequire imports TypeScript at runtime.',
  }),
  Object.freeze({
    id: '@angular/build/private',
    source: 'lib/utils/devkit.js',
    reason: 'Pinned Angular 22 branch retained from upstream implementation.',
  }),
  Object.freeze({
    id: '@angular/build/src/utils/hash.js',
    source: 'lib/utils/devkit.js',
    reason:
      'Angular 22.2 transformer hash initialization, required by path next to @angular/build/package.json.',
  }),
  Object.freeze({
    id: '@angular-devkit/build-angular/src/tools/esbuild/angular/*',
    source: 'lib/utils/devkit.js',
    reason:
      'Legacy upstream branch retained as provenance; it is not the supported Angular 22 path.',
    // devkit.js takes this branch for Angular 17 only (the source inventory pins that guard).
    maxAngularMajor: 17,
  }),
]);

/**
 * Fails when a retained runtime require that can run is not declared by the builder package.
 * A require behind an upstream branch for older Angular majors (`maxAngularMajor`) never runs on
 * the Angular major of the Vite engine's `@angular/compiler-cli` range (`ng-doc.viteEngine`, a
 * version or a caret range of one major; the optional peer dependency is wider, so that an install
 * never fails on it), so it needs no dependency.
 * @param {readonly { id: string, maxAngularMajor?: number }[]} requires - The retained requires.
 * @param {{ dependencies?: Record<string, string>, peerDependencies?: Record<string, string>, 'ng-doc'?: { viteEngine?: Record<string, string> } }} manifest -
 *   The builder's `package.json`.
 */
export function assertRuntimeRequiresDeclared(requires, manifest) {
  const compilerCli = manifest['ng-doc']?.viteEngine?.['@angular/compiler-cli'];
  const major = /^\^?([1-9]\d*)\.\d+\.\d+$/.exec(compilerCli ?? '')?.[1];
  if (!major) {
    throw new Error(
      `The builder must name the Vite engine's @angular/compiler-cli (ng-doc.viteEngine) as a version or a caret range of one major to check the retained Analog runtime requires, found ${compilerCli}`,
    );
  }
  for (const { id, maxAngularMajor } of requires) {
    if (maxAngularMajor !== undefined && Number(major) > maxAngularMajor) continue;
    const name = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0];
    if (!manifest.dependencies?.[name] && !manifest.peerDependencies?.[name]) {
      throw new Error(`Undeclared retained Analog runtime require: ${id}`);
    }
  }
}

// Orders directory entries as localeCompare does on an English machine, whatever the process locale:
// the inventory's digest is compared with the expected one, so another locale's order would fail
// the build.
const NAME_ORDER = new Intl.Collator('en');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => NAME_ORDER.compare(left.name, right.name))) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(candidate)));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
}

export async function sourceInventory(sourceDirectory) {
  const files = await filesBelow(sourceDirectory);
  const entries = await Promise.all(
    files.map(async (file) => {
      const contents = await readFile(file);
      return Object.freeze({
        path: path.relative(sourceDirectory, file).split(path.sep).join('/'),
        sha256: sha256(contents),
      });
    }),
  );
  const text = `${entries.map((entry) => `${entry.sha256}  ${entry.path}`).join('\n')}\n`;
  return Object.freeze({ entries: Object.freeze(entries), sha256: sha256(text), text });
}

export function assertSourceInventory(inventory, expected = ANALOG_COMPATIBILITY_UPSTREAM) {
  if (
    inventory.entries.length !== expected.sourceFiles ||
    inventory.sha256 !== expected.sourceInventorySha256
  ) {
    throw new Error(
      `@analogjs/vite-plugin-angular source inventory mismatch: expected ${expected.sourceFiles} files ` +
        `and ${expected.sourceInventorySha256}, received ${inventory.entries.length} files and ${inventory.sha256}.`,
    );
  }
}

/** Replaces one and only one literal source anchor. Callers use this for their selected patch policy. */
export function replaceExactlyOnce(source, before, after, label = 'upstream patch anchor') {
  if (!before || before === after)
    throw new Error(`${label} must have distinct non-empty before and after text.`);
  const parts = source.split(before);
  if (parts.length !== 2) {
    throw new Error(`${label} must occur exactly once; found ${parts.length - 1}.`);
  }
  return `${parts[0]}${after}${parts[1]}`;
}

/**
 * Applies the caller's patch policy to one upstream source, which it must change.
 * @param {string} source - The upstream source text.
 * @param {(source: string, sourcePath: string) => string | { code: string, changes?: unknown }} applyPatch -
 *   The patch policy, called with the source and its path below `src/`.
 * @param {string} sourcePath - The source's path below `src/`.
 */
export function patchSource(source, applyPatch, sourcePath) {
  if (typeof applyPatch !== 'function') throw new TypeError('applyPatch must be a function.');
  const result = applyPatch(source, sourcePath);
  const patched = typeof result === 'string' ? result : result?.code;
  if (typeof patched !== 'string' || patched === source) {
    throw new Error(`applyPatch did not change ${sourcePath}.`);
  }
  return Object.freeze({
    code: patched,
    changes: typeof result === 'string' ? undefined : result.changes,
  });
}

function isBareImport(specifier) {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:');
}

async function readPinnedUpstream(upstreamRoot) {
  const packagePath = path.join(upstreamRoot, 'package.json');
  let upstreamPackage;
  try {
    upstreamPackage = JSON.parse(await readFile(packagePath, 'utf8'));
  } catch (cause) {
    throw new Error(`NgDoc Analog compatibility could not read ${packagePath}.`, { cause });
  }
  if (
    upstreamPackage.name !== ANALOG_COMPATIBILITY_UPSTREAM.name ||
    upstreamPackage.version !== ANALOG_COMPATIBILITY_UPSTREAM.version
  ) {
    throw new Error(
      `NgDoc Analog compatibility requires ${ANALOG_COMPATIBILITY_UPSTREAM.name}@${ANALOG_COMPATIBILITY_UPSTREAM.version}; ` +
        `found ${upstreamPackage.name ?? '<unknown>'}@${upstreamPackage.version ?? '<unknown>'}.`,
    );
  }
  return upstreamPackage;
}

/**
 * Prepares an esbuild plugin without writing a vendor tree. The caller owns the
 * entry point and patch policy; only that entry's upstream import is redirected.
 */
export async function prepareAnalogCompatibility({
  root = workspaceRoot,
  factoryEntry,
  compatibilityFormat,
  applyPatch,
}) {
  if (!factoryEntry || !path.isAbsolute(factoryEntry)) {
    throw new Error('factoryEntry must be an absolute factory entry path.');
  }
  if (typeof compatibilityFormat !== 'string' || compatibilityFormat.length === 0) {
    throw new Error('compatibilityFormat must be an explicit non-empty build format.');
  }

  const resolvedRoot = path.resolve(root);
  const resolvedEntry = await realpath(factoryEntry);
  const resolvedUpstream = path.join(resolvedRoot, 'node_modules/@analogjs/vite-plugin-angular');
  const sourceDirectory = path.join(resolvedUpstream, 'src');
  const upstreamPackage = await readPinnedUpstream(resolvedUpstream);
  const inventory = await sourceInventory(sourceDirectory);
  assertSourceInventory(inventory);

  // The inventory pins every upstream file; the per-file digests name what the policy patches.
  const patched = new Map();
  for (const [relative, expected] of Object.entries(ANALOG_COMPATIBILITY_UPSTREAM.patchedSources)) {
    const file = path.join(sourceDirectory, relative);
    const original = await readFile(file, 'utf8');
    if (sha256(original) !== expected) {
      throw new Error(`@analogjs/vite-plugin-angular source hash mismatch: ${file}.`);
    }
    const result = patchSource(original, applyPatch, relative);
    patched.set(file, { relative, original, ...result });
  }
  const sourcePaths = new Set(
    inventory.entries.map((entry) => path.join(sourceDirectory, entry.path)),
  );
  const encounteredStaticExternals = new Set();
  const upstreamIndex = path.join(sourceDirectory, 'index.js');

  const plugin = {
    name: 'ngdoc-analog-compatibility',
    setup(build) {
      build.onResolve({ filter: /^@analogjs\/vite-plugin-angular$/ }, (args) => {
        if (path.resolve(args.importer) !== resolvedEntry) return undefined;
        return { path: upstreamIndex };
      });
      build.onResolve({ filter: /.*/ }, (args) => {
        if (!sourcePaths.has(path.resolve(args.importer)) || !isBareImport(args.path))
          return undefined;
        encounteredStaticExternals.add(args.path);
        return { path: args.path, external: true };
      });
      build.onLoad({ filter: /\.js$/ }, (args) => {
        const source = patched.get(path.resolve(args.path));
        return source ? { contents: source.code, loader: 'js' } : undefined;
      });
    },
  };

  const licensePath = path.join(
    resolvedRoot,
    `tools/licenses/analog-${ANALOG_COMPATIBILITY_UPSTREAM.version}.LICENSE`,
  );
  const licenseText = await readFile(licensePath, 'utf8');

  return Object.freeze({
    plugin,
    define: Object.freeze({ __NG_DOC_ANALOG_COMPATIBILITY__: JSON.stringify(compatibilityFormat) }),
    provenance: Object.freeze({
      upstream: ANALOG_COMPATIBILITY_UPSTREAM,
      package: Object.freeze({
        name: upstreamPackage.name,
        version: upstreamPackage.version,
        license: upstreamPackage.license,
      }),
      sourceInventory: inventory,
      patchedSources: Object.freeze(
        [...patched.values()].map(({ relative, original, code }) =>
          Object.freeze({ path: relative, sha256: sha256(original), patchedSha256: sha256(code) }),
        ),
      ),
      compatibilityFormat,
      changes: [...patched.values()].flatMap(({ changes }) => changes ?? []),
      licensePath,
      licenseSha256: sha256(licenseText),
    }),
    license: Object.freeze({ path: licensePath, text: licenseText, sha256: sha256(licenseText) }),
    retainedStaticExternals: RETAINED_STATIC_EXTERNALS,
    staticExternalInventory: STATIC_EXTERNAL_INVENTORY,
    encounteredStaticExternals,
    runtimeRequires: RUNTIME_REQUIRES,
  });
}
