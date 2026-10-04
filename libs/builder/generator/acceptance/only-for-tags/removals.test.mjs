import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bundleDiscoveryRuntime,
  isOnlyForTagsKeywordRemoval,
  isOnlyForTagsRemoval,
  onlyForTagsRemovals,
  partitionRemovedRoutes,
} from './removals.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
let scratch;
let discoveryModule;
let request;

before(async () => {
  await mkdir(path.join(root, 'tmp'), { recursive: true });
  scratch = await mkdtemp(path.join(root, 'tmp/only-for-tags-removals-'));
  discoveryModule = await bundleDiscoveryRuntime(path.join(scratch, 'runtime'));
  const workspace = path.join(scratch, 'workspace');
  const put = async (file, text) => {
    await mkdir(path.dirname(path.join(workspace, file)), { recursive: true });
    await writeFile(path.join(workspace, file), text);
  };
  await put('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022' } }));
  await put(
    'ng-doc.config.ts',
    `const config = { docsPath: 'docs', routePrefix: 'docs' }; export default config;`,
  );
  const page = (dir, title, props = '', imports = '') =>
    Promise.all([
      put(
        `docs/${dir}/ng-doc.page.ts`,
        `${imports}\nconst Page = { title: '${title}', mdFile: './index.md'${props} };\nexport default Page;\n`,
      ),
      put(`docs/${dir}/index.md`, `# ${title}\n`),
    ]);
  const beta = `import Beta from '../ng-doc.category';`;
  await page('public', 'Public');
  await page('develop', 'Develop', `, onlyForTags: ['development']`);
  await page('never', 'Never', `, onlyForTags: []`);
  await put(
    'docs/beta/ng-doc.category.ts',
    `const Beta = { title: 'Beta', onlyForTags: ['preview'] };\nexport default Beta;\n`,
  );
  // A child with its own, different tag: kept only once widening reaches a fixpoint.
  await page('beta/child', 'Beta child', `, category: Beta, onlyForTags: ['beta-only']`, beta);
  await page('beta/open', 'Beta open', `, category: Beta`, beta);
  request = {
    projectId: 'removals',
    workspaceRoot: workspace,
    configFile: path.join(workspace, 'ng-doc.config.ts'),
    defaults: {
      docsRoot: path.join(workspace, 'docs'),
      tsConfig: path.join(workspace, 'tsconfig.json'),
      outputRoot: path.join(workspace, 'out'),
      cacheRoot: path.join(workspace, 'cache'),
    },
  };
});

after(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test('derives the removals of a build from discovery with and without its tags', async () => {
  const removals = await onlyForTagsRemovals({ discoveryModule, request, tags: ['production'] });
  assert.deepEqual(removals.tags, ['production']);
  assert.deepEqual(removals.widenedTags, ['beta-only', 'development', 'preview', 'production']);
  assert.deepEqual(removals.routes, [
    '/docs/beta',
    '/docs/beta/child',
    '/docs/beta/open',
    '/docs/develop',
    '/docs/never',
  ]);
  assert.deepEqual(removals.keptRoutes, ['/docs/public']);
  const development = await onlyForTagsRemovals({
    discoveryModule,
    request,
    tags: ['development'],
  });
  assert.deepEqual(development.routes, [
    '/docs/beta',
    '/docs/beta/child',
    '/docs/beta/open',
    '/docs/never',
  ]);
});

test('accepts only removed routes and the routes below them; every other loss is rejected', async () => {
  const removals = await onlyForTagsRemovals({ discoveryModule, request, tags: ['production'] });
  const { expected, unexpected } = partitionRemovedRoutes(removals, [
    '/docs/develop',
    'docs/develop/tab/index.html',
    '/docs/beta/child',
    '/docs/public',
    '/docs/developer',
    '/docs/other',
  ]);
  assert.deepEqual(expected, ['/docs/develop', 'docs/develop/tab/index.html', '/docs/beta/child']);
  assert.deepEqual(unexpected, ['/docs/public', '/docs/developer', '/docs/other']);
  assert.equal(isOnlyForTagsRemoval(removals, '/docs'), false);
  assert.equal(isOnlyForTagsKeywordRemoval(removals, { path: 'docs/develop#section' }), true);
  assert.equal(isOnlyForTagsKeywordRemoval(removals, { path: 'docs/public' }), false);
  // A kept entry below a removed route keeps its own routes.
  const nested = { ...removals, keptRoutes: [...removals.keptRoutes, '/docs/develop/kept'] };
  assert.equal(isOnlyForTagsRemoval(nested, '/docs/develop/kept/tab'), false);
  assert.equal(isOnlyForTagsRemoval(nested, '/docs/develop/tab'), true);
});

test('refuses to write the discovery runtime into shared dist or an existing directory', async () => {
  await assert.rejects(
    bundleDiscoveryRuntime(path.join(root, 'dist/only-for-tags-runtime')),
    /shared dist/,
  );
  await assert.rejects(bundleDiscoveryRuntime(path.join(scratch, 'runtime')), /EEXIST/);
});
