#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Edits the manifests of the built packages (dist/libs/*) the way a release publishes them. Nx
// Release sets each package's version and the versions of its dependencies on the other packages;
// this script adds what Nx Release does not: the shared metadata of the root package.json.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The published packages, in the order the release publishes them (dependencies first). */
export const RELEASE_PACKAGES = Object.freeze([
  'core',
  'utils',
  'ui-kit',
  'keywords-loaders',
  'builder',
  'app',
  'add',
]);

/** The root package.json fields every published manifest carries, replacing its own. */
export const SHARED_METADATA = Object.freeze([
  'keywords',
  'author',
  'repository',
  'bugs',
  'homepage',
  'license',
]);

function readManifest(directory) {
  return JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
}

function writeManifest(directory, manifest) {
  writeFileSync(path.join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Replaces the {@link SHARED_METADATA} fields of every manifest with the root's. */
export function copySharedMetadata(rootManifest, packageDirectories) {
  for (const directory of packageDirectories) {
    const manifest = readManifest(directory);
    for (const key of SHARED_METADATA) {
      if (rootManifest[key] === undefined) delete manifest[key];
      else manifest[key] = structuredClone(rootManifest[key]);
    }
    writeManifest(directory, manifest);
  }
}

/**
 * Pins every dependency of a package on another package of the set to that package's own version,
 * as the release does with one shared version. The acceptance harnesses use it to pack the built
 * packages the way they are published.
 */
export function pinLocalDependencies(packageDirectories) {
  const manifests = packageDirectories.map((directory) => [directory, readManifest(directory)]);
  const local = new Set(manifests.map(([, manifest]) => manifest.name));
  for (const [directory, manifest] of manifests) {
    for (const name of Object.keys(manifest.dependencies ?? {}))
      if (local.has(name)) manifest.dependencies[name] = manifest.version;
    writeManifest(directory, manifest);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directories = RELEASE_PACKAGES.map((name) => path.join(ROOT, 'dist/libs', name));
  copySharedMetadata(readManifest(ROOT), directories);
  for (const directory of directories) {
    const { name, version } = readManifest(directory);
    console.log(`${name}@${version}: shared metadata from package.json`);
  }
}
