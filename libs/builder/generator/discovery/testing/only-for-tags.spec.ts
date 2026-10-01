/** @vitest-environment node */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import type { DiscoveryRequest, DiscoverySnapshot } from '../../contracts';
import { DiscoveryServiceImpl } from '..';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A docs tree with a page and a category filtered by `onlyForTags`, a category below the filtered
 * one (with a page and an API) and an unfiltered page.
 */
function fixture(): { root: string; docs: string; request: DiscoveryRequest } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ng-doc-only-for-tags-')));
  roots.push(root);
  const docs = path.join(root, 'docs');
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022' } }));
  write('ng-doc.config.ts', `const config = { docsPath: 'docs' }; export default config;\n`);
  write(
    'docs/public/ng-doc.page.ts',
    `const Page = { title: 'Public', mdFile: './index.md' };\nexport default Page;\n`,
  );
  write('docs/public/index.md', '# Public\n');
  write(
    'docs/develop/ng-doc.page.ts',
    `const Page = { title: 'Develop', mdFile: './index.md', onlyForTags: ['development'] };\nexport default Page;\n`,
  );
  write('docs/develop/index.md', '---\nkeyword: DevelopPage\n---\n# Develop\n');
  write(
    'docs/beta/ng-doc.category.ts',
    `const Beta = { title: 'Beta', onlyForTags: [' preview ', 'development'] };\nexport default Beta;\n`,
  );
  write(
    'docs/beta/nested/ng-doc.category.ts',
    `import Beta from '../ng-doc.category';\nconst Nested = { title: 'Nested', category: Beta };\nexport default Nested;\n`,
  );
  write(
    'docs/beta/nested/page/ng-doc.page.ts',
    `import Nested from '../ng-doc.category';\nconst Page = { title: 'Nested page', category: Nested, mdFile: './index.md' };\nexport default Page;\n`,
  );
  write('docs/beta/nested/page/index.md', '# Nested\n');
  write(
    'docs/beta/ng-doc.api.ts',
    `import Beta from './ng-doc.category';\nconst Api = { title: 'Beta API', category: Beta, scopes: [] };\nexport default Api;\n`,
  );
  return {
    root,
    docs,
    request: {
      generation: 1,
      projectId: 'tags',
      workspaceRoot: root,
      configFile: path.join(root, 'ng-doc.config.ts'),
      defaults: {
        docsRoot: docs,
        tsConfig: path.join(root, 'tsconfig.json'),
        outputRoot: path.join(root, 'generated'),
        cacheRoot: path.join(root, '.cache'),
      },
      changes: [],
    },
  };
}

async function discover(
  request: DiscoveryRequest,
  tags?: readonly string[],
): Promise<{ snapshot?: DiscoverySnapshot; codes: string[]; service: DiscoveryServiceImpl }> {
  const service = new DiscoveryServiceImpl(tags === undefined ? {} : { tags });
  const result = await service.discover(request, new AbortController().signal);
  return {
    snapshot: result.value,
    codes: result.diagnostics.map((item) => item.code),
    service,
  };
}

const titles = (snapshot?: DiscoverySnapshot) =>
  (snapshot?.entries ?? []).map((entry) => entry.title).sort();

test('leaves out filtered pages and categories with everything under them', async () => {
  const f = fixture();
  const production = await discover(f.request, ['production']);
  expect(production.codes).toEqual([]);
  expect(titles(production.snapshot)).toEqual(['Public']);
  expect(production.snapshot?.configuration.tags).toEqual(['production']);
  // Their descriptions stay observed (an edit re-runs discovery); a left-out guide's markdown is
  // read only for its front matter keyword, which names it in a broken-link diagnostic.
  const paths = JSON.stringify(
    (
      await new DiscoveryServiceImpl({ tags: ['production'] }).discover(
        f.request,
        new AbortController().signal,
      )
    ).dependencies,
  );
  expect(paths).toContain(path.join(f.docs, 'develop/ng-doc.page.ts'));
  expect(paths).toContain(path.join(f.docs, 'develop/index.md'));
  const develop = {
    title: 'Develop',
    source: path.join(f.docs, 'develop/ng-doc.page.ts'),
    onlyForTags: ['development'],
  };
  const beta = {
    title: 'Beta',
    source: path.join(f.docs, 'beta/ng-doc.category.ts'),
    onlyForTags: ['preview', 'development'],
  };
  // Sorted by source.
  expect(production.snapshot?.filtered).toEqual([
    {
      kind: 'category',
      title: 'Nested',
      source: path.join(f.docs, 'beta/nested/ng-doc.category.ts'),
      absoluteRoute: 'beta/nested',
      filteredBy: beta,
    },
    {
      kind: 'guide',
      title: 'Nested page',
      source: path.join(f.docs, 'beta/nested/page/ng-doc.page.ts'),
      absoluteRoute: 'beta/nested/page',
      filteredBy: beta,
    },
    {
      kind: 'api',
      title: 'Beta API',
      source: path.join(f.docs, 'beta/ng-doc.api.ts'),
      absoluteRoute: 'beta/api',
      filteredBy: beta,
    },
    {
      kind: 'category',
      title: 'Beta',
      source: beta.source,
      absoluteRoute: 'beta',
      onlyForTags: beta.onlyForTags,
      filteredBy: beta,
    },
    {
      kind: 'guide',
      title: 'Develop',
      source: develop.source,
      absoluteRoute: 'develop',
      onlyForTags: develop.onlyForTags,
      filteredBy: develop,
      keywords: ['*DevelopPage'],
    },
  ]);

  const development = await discover(f.request, ['development']);
  expect(development.codes).toEqual([]);
  expect(titles(development.snapshot)).toEqual([
    'Beta',
    'Beta API',
    'Develop',
    'Nested',
    'Nested page',
    'Public',
  ]);
  const nested = development.snapshot?.entries.find((entry) => entry.title === 'Nested page');
  expect(nested?.absoluteRoute).toBe('beta/nested/page');
  // Nothing is left out, so the snapshot has no `filtered` key at all.
  expect(development.snapshot).not.toHaveProperty('filtered');

  // A category tag keeps the category and its children, but not a page tagged otherwise.
  const preview = await discover(f.request, ['preview']);
  expect(titles(preview.snapshot)).toEqual(['Beta', 'Beta API', 'Nested', 'Nested page', 'Public']);

  // No tags (the engine default): every entry that declares onlyForTags is left out.
  expect(titles((await discover(f.request)).snapshot)).toEqual(['Public']);
  expect(titles((await discover(f.request, [])).snapshot)).toEqual(['Public']);
});

test('keeps no live values for a filtered page', async () => {
  const f = fixture();
  const development = await discover(f.request, ['development']);
  const develop = development.snapshot?.entries.find((entry) => entry.title === 'Develop');
  expect(develop).toBeDefined();
  expect(development.service.readGuideValues(develop!.id).diagnostics).toEqual([]);
  const production = await discover(f.request, ['production']);
  expect(production.service.readGuideValues(develop!.id).diagnostics[0]?.code).toBe(
    'DISCOVERY_GUIDE_VALUES_MISSING',
  );
});

test('changes the configuration digest only when the tags select other entries', async () => {
  const f = fixture();
  const digest = async (tags?: string[]) =>
    (await discover(f.request, tags)).snapshot?.configuration.digest;
  const none = await digest();
  expect(await digest([])).toBe(none);
  // `production` and `staging` select exactly what no tags select: same digest, same cache.
  expect(await digest(['production'])).toBe(none);
  expect(await digest(['staging', 'production'])).toBe(none);
  // `development` selects the Develop page and the Beta category: a FULL generation.
  const development = await digest(['development']);
  expect(development).not.toBe(none);
  expect(await digest(['production', 'development'])).toBe(development);
  expect(await digest(['preview'])).not.toBe(development);
  expect(await digest(['preview'])).not.toBe(none);
  // Trimmed, unique and sorted, so the same set gives the same digest.
  expect(await digest([' development ', 'development'])).toBe(development);
  const normalized = await discover(f.request, ['b', ' a ', 'b']);
  expect(normalized.snapshot?.configuration.tags).toEqual(['a', 'b']);
});

test('a project without onlyForTags has the same digest for every tag set', async () => {
  const f = fixture();
  for (const file of ['develop/ng-doc.page.ts', 'beta/ng-doc.category.ts']) {
    rmSync(path.join(f.docs, file));
  }
  rmSync(path.join(f.docs, 'beta'), { recursive: true, force: true });
  const digests = new Set<string | undefined>();
  for (const tags of [undefined, ['production'], ['development'], ['a', 'b']]) {
    const found = await discover(f.request, tags);
    expect(found.codes).toEqual([]);
    expect(titles(found.snapshot)).toEqual(['Public']);
    digests.add(found.snapshot?.configuration.digest);
  }
  expect(digests.size).toBe(1);
});

test('accepts a single string like the legacy engine and ignores filtered invalid entries', async () => {
  const f = fixture();
  writeFileSync(
    path.join(f.docs, 'develop/ng-doc.page.ts'),
    // An empty title under a filter is not validated: the entry does not exist in production.
    `const Page = { title: '', mdFile: './missing.md', onlyForTags: 'development' };\nexport default Page;\n`,
  );
  const production = await discover(f.request, ['production']);
  expect(production.codes).toEqual([]);
  expect(titles(production.snapshot)).toEqual(['Public']);
  const development = await discover(f.request, ['development']);
  expect(development.codes).toEqual(['DISCOVERY_INVALID_ENTRY']);
});

test('rejects invalid onlyForTags values and invalid host tags', async () => {
  const f = fixture();
  writeFileSync(
    path.join(f.docs, 'develop/ng-doc.page.ts'),
    `const Page = { title: 'Develop', mdFile: './index.md', onlyForTags: ['development', 3] };\nexport default Page;\n`,
  );
  const invalidEntry = await discover(f.request, ['development']);
  expect(invalidEntry.snapshot).toBeUndefined();
  expect(invalidEntry.codes).toEqual(['DISCOVERY_INVALID_ENTRY']);

  for (const tags of [[''], ['  '], [7], 'development', ['a\0b']]) {
    const invalidTags = await discover(f.request, tags as never);
    expect(invalidTags.snapshot).toBeUndefined();
    expect(invalidTags.codes).toEqual(['DISCOVERY_TAGS_INVALID']);
  }
});

test('treats null and an empty string as no filter, like the legacy engine, and [] as hidden', async () => {
  const f = fixture();
  const page = (onlyForTags: string) =>
    writeFileSync(
      path.join(f.docs, 'develop/ng-doc.page.ts'),
      `const Page = { title: 'Develop', mdFile: './index.md', onlyForTags: ${onlyForTags} };\nexport default Page;\n`,
    );
  for (const value of ['null', "''"]) {
    page(value);
    const found = await discover(f.request, ['production']);
    expect({ value, codes: found.codes }).toEqual({ value, codes: [] });
    expect(titles(found.snapshot)).toContain('Develop');
  }
  page('[]');
  for (const tags of [[], ['production'], ['development']]) {
    const found = await discover(f.request, tags);
    expect(titles(found.snapshot)).not.toContain('Develop');
    expect(found.snapshot?.filtered?.find((entry) => entry.title === 'Develop')).toMatchObject({
      onlyForTags: [],
      filteredBy: { title: 'Develop', onlyForTags: [] },
    });
  }
});

test('names a left-out entry even when its category import or front matter is broken', async () => {
  const f = fixture();
  writeFileSync(path.join(f.docs, 'develop/index.md'), '---\nkeyword: [unclosed\n---\n');
  const broken = await discover(f.request, ['production']);
  expect(broken.codes).toEqual([]);
  const develop = broken.snapshot?.filtered?.find((entry) => entry.title === 'Develop');
  expect(develop).toBeDefined();
  expect(develop).not.toHaveProperty('keywords');
});
