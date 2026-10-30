import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  RELEASE_PACKAGES,
  SHARED_METADATA,
  copySharedMetadata,
  pinLocalDependencies,
} from '../release-manifests.mjs';

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function packages(t, manifests) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-release-manifests-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directories = [];
  for (const [name, manifest] of Object.entries(manifests)) {
    const directory = path.join(root, name);
    await mkdir(directory);
    await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest));
    directories.push(directory);
  }
  const read = async (index) =>
    JSON.parse(await readFile(path.join(directories[index], 'package.json'), 'utf8'));
  return { directories, read };
}

test('the release set is every published library, and only those', async () => {
  const libraries = [];
  for (const name of RELEASE_PACKAGES) {
    const project = JSON.parse(
      await readFile(path.join(REPOSITORY, 'libs', name, 'project.json'), 'utf8'),
    );
    assert.ok(project.tags.includes('type:lib'), name);
    const manifest = JSON.parse(
      await readFile(path.join(REPOSITORY, 'libs', name, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.name, `@ng-doc/${name}`);
    assert.equal(manifest.publishConfig?.access, 'public', name);
    libraries.push(project.name);
  }
  const nx = JSON.parse(await readFile(path.join(REPOSITORY, 'nx.json'), 'utf8'));
  assert.deepEqual([...nx.release.projects].sort(), [...libraries].sort());
});

test('shared metadata replaces the package fields with the root ones', async (t) => {
  const { directories, read } = await packages(t, {
    core: { name: '@ng-doc/core', version: '1.0.0', keywords: ['own'], description: 'kept' },
  });
  const root = {
    keywords: ['angular'],
    author: 'Author <a@b.c>',
    repository: { type: 'git', url: 'git+https://example.com/x.git' },
    bugs: { url: 'https://example.com/issues' },
    homepage: 'https://example.com',
    license: 'MIT',
  };
  copySharedMetadata(root, directories);
  const manifest = await read(0);
  for (const key of SHARED_METADATA) assert.deepEqual(manifest[key], root[key], key);
  assert.equal(manifest.description, 'kept');
  assert.equal(manifest.version, '1.0.0');
  // A field the root does not have is not left behind from the package.
  copySharedMetadata({ license: 'MIT' }, directories);
  assert.equal((await read(0)).keywords, undefined);
});

test('local dependencies are pinned to the dependent package version; others are kept', async (t) => {
  const { directories, read } = await packages(t, {
    core: { name: '@ng-doc/core', version: '2.0.0' },
    app: {
      name: '@ng-doc/app',
      version: '2.0.0',
      dependencies: { '@ng-doc/core': '0.0.0', tslib: '^2.6.2' },
      peerDependencies: { '@ng-doc/core': '*' },
    },
  });
  pinLocalDependencies(directories);
  const app = await read(1);
  assert.deepEqual(app.dependencies, { '@ng-doc/core': '2.0.0', tslib: '^2.6.2' });
  assert.deepEqual(app.peerDependencies, { '@ng-doc/core': '*' });
  assert.equal((await read(0)).dependencies, undefined);
});

test('every dependency between the packages is an edge of the Nx project graph', async (t) => {
  // `nx release version` rewrites a package's dependency on another package of the group only
  // along a graph edge. The graph comes from imports, so a package that depends on another one
  // without importing it (add on builder) needs `implicitDependencies`.
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-release-graph-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'graph.json');
  const nx = createRequire(import.meta.url).resolve('nx/package.json');
  const { bin } = JSON.parse(await readFile(nx, 'utf8'));
  execFileSync(process.execPath, [path.join(path.dirname(nx), bin.nx), 'graph', `--file=${file}`], {
    cwd: REPOSITORY,
    env: { ...process.env, NX_DAEMON: 'false', NX_NO_CLOUD: 'true', NX_TUI: 'false' },
    stdio: 'ignore',
  });
  const { graph } = JSON.parse(await readFile(file, 'utf8'));
  for (const name of RELEASE_PACKAGES) {
    const manifest = JSON.parse(
      await readFile(path.join(REPOSITORY, 'libs', name, 'package.json'), 'utf8'),
    );
    const edges = new Set(graph.dependencies[name].map(({ target }) => target));
    for (const dependency of Object.keys(manifest.dependencies ?? {}))
      if (dependency.startsWith('@ng-doc/'))
        assert.ok(edges.has(dependency.slice('@ng-doc/'.length)), `${name} -> ${dependency}`);
  }
});
