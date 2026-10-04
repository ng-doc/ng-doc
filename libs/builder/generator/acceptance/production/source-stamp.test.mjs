import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { packagesDigest } from './source-stamp.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const scratches = [];
let libs;

const put = async (file, text) => {
  await mkdir(path.dirname(path.join(libs, file)), { recursive: true });
  await writeFile(path.join(libs, file), text);
};
/** Links `link` to `target` as `symlink-dir` does (`ng-doc:link-libs`): a relative folder link. */
const link = async (target, link) => {
  await mkdir(path.dirname(path.join(libs, link)), { recursive: true });
  await symlink(
    path.relative(path.dirname(path.join(libs, link)), path.join(libs, target)),
    path.join(libs, link),
    'junction',
  );
};

/** Fresh packages as the build job uploads them, in a new `libs`. */
async function builtPackages() {
  await mkdir(path.join(root, 'tmp'), { recursive: true });
  const scratch = await mkdtemp(path.join(root, 'tmp/source-stamp-'));
  scratches.push(scratch);
  libs = path.join(scratch, 'libs');
  for (const name of ['app', 'builder', 'core', 'keywords-loaders', 'ui-kit', 'utils'])
    await put(`${name}/package.json`, JSON.stringify({ name: `@ng-doc/${name}` }));
  await put('builder/engine/variables.js', 'exports.CACHE_PATH = __dirname + "/.cache";');
  await put('app/fesm2022/ng-doc-app.mjs', 'export const app = 1;');
}

beforeEach(builtPackages);

after(async () => {
  for (const scratch of scratches) await rm(scratch, { recursive: true, force: true });
});

test('what the site jobs add inside the packages after the build keeps the digest', async () => {
  const built = packagesDigest(libs);
  // `ng-doc:link-libs`.
  await link('core', 'builder/node_modules/@ng-doc/core');
  await link('core', 'utils/node_modules/@ng-doc/core');
  await link('utils', 'builder/node_modules/@ng-doc/utils');
  // The legacy engine's page cache (`ng-doc:build-legacy`).
  await put('builder/engine/.cache/apps/ng-doc/docs/ng-doc.api.mjs', 'export default {};');
  assert.equal(packagesDigest(libs), built);
});

test('file modes and times, which the packages artifact does not keep, keep the digest', async () => {
  const built = packagesDigest(libs);
  await chmod(path.join(libs, 'app/fesm2022/ng-doc-app.mjs'), 0o755);
  await utimes(path.join(libs, 'app/fesm2022/ng-doc-app.mjs'), 1, 1);
  assert.equal(packagesDigest(libs), built);
});

test('different package bytes change the digest', async (t) => {
  const changes = {
    'an edited file': () => put('app/fesm2022/ng-doc-app.mjs', 'export const app = 2;'),
    'an added file': () => put('builder/engine/added.js', ''),
    'a cache folder outside the legacy engine': () => put('app/.cache/page.mjs', ''),
    'an engine file beside the cache': () => put('builder/engine/.cache.js', ''),
    'a link outside node_modules': () => link('core', 'builder/core'),
    'a missing package': () => rm(path.join(libs, 'keywords-loaders'), { recursive: true }),
  };
  for (const [name, change] of Object.entries(changes))
    await t.test(name, async () => {
      // Each change on fresh packages, so that no earlier change makes the digests differ.
      await builtPackages();
      const built = packagesDigest(libs);
      await change();
      assert.notEqual(packagesDigest(libs), built);
    });
});

test('a moved file changes the digest', async () => {
  const built = packagesDigest(libs);
  await rm(path.join(libs, 'app/fesm2022/ng-doc-app.mjs'));
  await put('app/ng-doc-app.mjs', 'export const app = 1;');
  assert.notEqual(packagesDigest(libs), built);
});
