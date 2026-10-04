import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bundleDiscoveryRuntime,
  isOnlyForTagsKeywordRemoval,
  isOnlyForTagsRemoval,
  onlyForTagsRemovals,
  partitionRemovedRoutes,
} from '../only-for-tags/removals.mjs';
import { KNOWN } from './known-differences.mjs';
import { sourceStamp, stampFile } from './source-stamp.mjs';

// Production parity of the new engine's output against the legacy engine's output of the same
// checkout, and against the reviewed search and keyword sets in `accepted/`.
//
// NGDOC_PARITY_LEGACY: the legacy production output (`ng-doc:build-legacy`, default
//   `dist/apps/ng-doc-legacy/browser`).
// NGDOC_PARITY_CURRENT: the Vite engine's production output (`ng-doc:build`, default
//   `dist/apps/ng-doc/browser`).
// NGDOC_PARITY_EVIDENCE: where `main-parity.json` is written (a new directory, never tracked).
// NGDOC_PARITY_ACCEPT=1: once the legacy comparison passes, replace the accepted sets with the
//   current output and write `accepted-diff.json` (previous against new) for review.
//
// Stamp each output right after its build (`source-stamp.mjs <browser folder>`): both must come
// from the same commit, uncommitted changes and built packages, so a stale output is never
// compared. Any local edit between the two builds, even an unrelated one, changes the stamp:
// build both again. What a site build adds inside `dist/libs` (the `link-libs` links, the legacy
// engine's page cache) is not part of the packages digest.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../..');
const legacy = path.resolve(
  root,
  process.env.NGDOC_PARITY_LEGACY || 'dist/apps/ng-doc-legacy/browser',
);
const current = path.resolve(root, process.env.NGDOC_PARITY_CURRENT || 'dist/apps/ng-doc/browser');
const evidence = path.resolve(
  process.env.NGDOC_PARITY_EVIDENCE || path.join(root, 'tmp/ngdoc-parity'),
);
const acceptedDirectory = path.join(here, 'accepted');
const acceptedSearchFile = path.join(acceptedDirectory, 'search.json');
const acceptedKeywordsFile = path.join(acceptedDirectory, 'keywords.json');
const accept = process.env.NGDOC_PARITY_ACCEPT === '1';

// Both outputs were built from the same sources: the same commit and uncommitted changes.
const stamps = {};
for (const [name, folder] of [
  ['legacy', legacy],
  ['current', current],
]) {
  const file = stampFile(folder);
  assert.ok(
    existsSync(file),
    `The ${name} output has no source stamp (${path.relative(root, file)})`,
  );
  stamps[name] = JSON.parse(await readFile(file, 'utf8'));
}
const sources = ({ commit, uncommitted, packages }) => ({ commit, uncommitted, packages });
assert.deepEqual(
  sources(stamps.current),
  sources(stamps.legacy),
  'The legacy and the new engine output were built from different sources',
);
stamps.checkout = sourceStamp();

const hashes = {};
async function bytes(file) {
  const result = await readFile(file);
  hashes[path.relative(root, file)] = createHash('sha256').update(result).digest('hex');
  return result;
}
async function json(file) {
  return JSON.parse((await bytes(file)).toString());
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const row = (value) => JSON.stringify(canonical(value));
const rows = (values) => values.map(row).sort();
async function routes(directory) {
  const result = [];
  async function walk(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const filename = path.join(folder, item.name);
      if (item.isDirectory()) await walk(filename);
      else if (item.name === 'index.html')
        result.push(path.relative(directory, filename).replaceAll(path.sep, '/'));
    }
  }
  await walk(directory);
  return result.sort();
}
/** Multiset difference of two row lists: the rows of `left` that `right` does not hold. */
function without(left, right) {
  const remaining = new Map();
  for (const value of right) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  return left.filter((value) => {
    const count = remaining.get(value) ?? 0;
    if (!count) return true;
    remaining.set(value, count - 1);
    return false;
  });
}

// The legacy engine ignores `onlyForTags`; the new engine leaves those entries out of a build
// whose tags they do not name (`production` here), for example the internal Develop sandbox.
// These removals come from discovery of the same configuration, not a list.
await mkdir(path.join(root, 'tmp'), { recursive: true });
const scratch = await mkdtemp(path.join(root, 'tmp/ngdoc-parity-only-for-tags-'));
let removals;
try {
  removals = await onlyForTagsRemovals({
    discoveryModule: await bundleDiscoveryRuntime(path.join(scratch, 'runtime')),
    request: {
      projectId: 'ng-doc',
      workspaceRoot: root,
      configFile: path.join(root, 'apps/ng-doc/ng-doc.config.ts'),
      defaults: {
        docsRoot: path.join(root, 'apps/ng-doc/src'),
        tsConfig: path.join(root, 'apps/ng-doc/tsconfig.vite.json'),
        outputRoot: path.join(root, 'ng-doc/ng-doc'),
        cacheRoot: path.join(root, '.cache/ng-doc/ng-doc'),
      },
    },
    tags: ['production'],
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}
const removedByTags = (value) => isOnlyForTagsRemoval(removals, value.route);

const legacySearch = await json(path.join(legacy, 'assets/ng-doc/indexes.json'));
const legacyKeywords = await json(path.join(legacy, 'assets/ng-doc/keywords.json'));
const currentSearch = await json(path.join(current, 'assets/ng-doc/indexes.json'));
const currentKeywords = await json(path.join(current, 'assets/ng-doc/keywords.json'));

// 1. Keywords: every legacy keyword is exported unchanged, except the ones of entries that
// onlyForTags leaves out (required to be gone) and the attributed differences in KNOWN.
const removedKeywords = [];
for (const [key, value] of Object.entries(legacyKeywords)) {
  if (isOnlyForTagsKeywordRemoval(removals, value)) {
    assert.equal(currentKeywords[key], undefined, `onlyForTags keyword still exported: ${key}`);
    removedKeywords.push(key);
  } else if (key in KNOWN.keywords.changed) {
    assert.deepEqual(
      canonical({ legacy: value, current: currentKeywords[key] ?? null }),
      canonical(KNOWN.keywords.changed[key]),
      `Attributed keyword difference changed: ${key}`,
    );
  } else assert.deepEqual(currentKeywords[key], value, `Lost/changed legacy keyword ${key}`);
}
const addedKeywords = Object.keys(currentKeywords)
  .filter((key) => !(key in legacyKeywords))
  .sort();
assert.deepEqual(addedKeywords, [...KNOWN.keywords.added].sort(), 'Unattributed keyword additions');

// 2. Search: the rows of both indexes are equal, except the rows of entries that onlyForTags
// leaves out and the attributed differences in KNOWN. The fields only the new engine writes are
// left out of its rows for this comparison.
const currentRows = rows(currentSearch);
const withoutNewFields = (value) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !KNOWN.search.fields.includes(key)));
const symbolView = (value) => KNOWN.search.symbolView.test(value.route);
const comparableRows = rows(
  currentSearch.filter((value) => !symbolView(value)).map(withoutNewFields),
);
const legacyRows = rows(
  legacySearch.filter((value) => !removedByTags(value) && !symbolView(value)),
);
const lostRows = without(legacyRows, comparableRows);
const addedRows = without(comparableRows, legacyRows);
// Symbol-view pages: every legacy text is still indexed on its page, in any section.
const pageText = ({ breadcrumbs, pageType, title, route, content }) =>
  row({ breadcrumbs, pageType, title, route, content });
const symbolTexts = new Set(currentSearch.filter(symbolView).map(pageText));
const lostSymbolTexts = [
  ...new Set(
    legacySearch
      .filter((value) => !removedByTags(value) && symbolView(value))
      .map(pageText)
      .filter((value) => !symbolTexts.has(value)),
  ),
].sort();
assert.deepEqual(lostSymbolTexts, [], 'Legacy API texts lost from symbol-view pages');
assert.deepEqual(lostRows, rows(KNOWN.search.removed), 'Legacy search rows lost');
assert.deepEqual(addedRows, rows(KNOWN.search.added), 'Unattributed search rows');
assert.deepEqual(
  currentSearch.filter(removedByTags),
  [],
  'A search row of an entry that onlyForTags leaves out is still indexed',
);

// 3. Routes: the same `**/index.html` set, except the onlyForTags removals (required) and the
// attributed additions and removals in KNOWN.
const legacyRoutes = await routes(legacy);
const currentRoutes = await routes(current);
const allAdded = currentRoutes.filter((route) => !legacyRoutes.includes(route));
// Host-specific additions (for example the category redirect pages the Vite host prerenders)
// are all present or all absent.
const optional = allAdded.filter((route) => KNOWN.routes.optional.includes(route));
assert.ok(
  optional.length === 0 || optional.length === KNOWN.routes.optional.length,
  `Host-specific routes are partly built: ${optional.join(', ')}`,
);
const added = allAdded.filter((route) => !KNOWN.routes.optional.includes(route));
const removed = legacyRoutes.filter((route) => !currentRoutes.includes(route));
const { expected: removedByOnlyForTags, unexpected: lost } = partitionRemovedRoutes(
  removals,
  removed,
);
assert.deepEqual(lost, [...KNOWN.routes.removed].sort(), 'Legacy routes disappeared');
assert.deepEqual(
  removedByOnlyForTags,
  legacyRoutes.filter((route) => isOnlyForTagsRemoval(removals, route)),
  'A route of an entry that onlyForTags leaves out of a production build is still built',
);
assert.deepEqual(added, [...KNOWN.routes.added].sort(), 'Unattributed route additions');

// 4. The accepted sets: the search index and keywords equal the reviewed snapshot. The previous
// snapshot may be a keyword array (`{ key, ...value }` rows); the accepted file is an object.
const keywordObject = (value) =>
  Array.isArray(value) ? Object.fromEntries(value.map(({ key, ...item }) => [key, item])) : value;
const previousSearchFile = existsSync(acceptedSearchFile)
  ? acceptedSearchFile
  : path.resolve(root, process.env.NGDOC_PARITY_PREVIOUS_SEARCH ?? acceptedSearchFile);
const previousKeywordsFile = existsSync(acceptedKeywordsFile)
  ? acceptedKeywordsFile
  : path.resolve(root, process.env.NGDOC_PARITY_PREVIOUS_KEYWORDS ?? acceptedKeywordsFile);
const acceptedSearch = await json(previousSearchFile);
const acceptedKeywords = keywordObject(await json(previousKeywordsFile));
let acceptedDiff;
if (accept) {
  const acceptedRows = rows(acceptedSearch);
  acceptedDiff = {
    previous: {
      search: path.relative(root, previousSearchFile),
      keywords: path.relative(root, previousKeywordsFile),
    },
    search: {
      before: acceptedSearch.length,
      after: currentSearch.length,
      removed: without(acceptedRows, currentRows).map((value) => JSON.parse(value)),
      added: without(currentRows, acceptedRows).map((value) => JSON.parse(value)),
    },
    keywords: {
      before: Object.keys(acceptedKeywords).length,
      after: Object.keys(currentKeywords).length,
      removed: Object.keys(acceptedKeywords)
        .filter((key) => !(key in currentKeywords))
        .sort(),
      added: Object.keys(currentKeywords)
        .filter((key) => !(key in acceptedKeywords))
        .sort(),
      changed: Object.keys(currentKeywords)
        .filter(
          (key) =>
            key in acceptedKeywords && row(acceptedKeywords[key]) !== row(currentKeywords[key]),
        )
        .sort()
        .map((key) => ({ key, before: acceptedKeywords[key], after: currentKeywords[key] })),
    },
  };
  await mkdir(acceptedDirectory, { recursive: true });
  // One sorted row per line, so a later acceptance reviews as a line diff.
  await writeFile(acceptedSearchFile, `[\n${currentRows.join(',\n')}\n]\n`);
  const keywordLines = Object.keys(currentKeywords)
    .sort()
    .map((key) => `${JSON.stringify(key)}: ${row(currentKeywords[key])}`);
  await writeFile(acceptedKeywordsFile, `{\n${keywordLines.join(',\n')}\n}\n`);
} else {
  assert.deepEqual(
    currentRows,
    rows(acceptedSearch),
    'The search index differs from the accepted set (accepted/search.json)',
  );
  assert.deepEqual(
    canonical(currentKeywords),
    canonical(acceptedKeywords),
    'The keywords differ from the accepted set (accepted/keywords.json)',
  );
}

await mkdir(evidence, { recursive: true });
if (acceptedDiff)
  await writeFile(
    path.join(evidence, 'accepted-diff.json'),
    JSON.stringify(acceptedDiff, null, 2) + '\n',
  );
await writeFile(
  path.join(evidence, 'main-parity.json'),
  JSON.stringify(
    {
      passed: true,
      accepted: accept ? 'replaced from the current output' : 'equal',
      node: process.version,
      sources: stamps,
      legacy: path.relative(root, legacy),
      current: path.relative(root, current),
      inputSha256: hashes,
      search: {
        legacy: legacySearch.length,
        current: currentSearch.length,
        added: addedRows.length,
        removed: lostRows.length,
      },
      keywords: {
        legacy: Object.keys(legacyKeywords).length,
        current: Object.keys(currentKeywords).length,
        added: addedKeywords,
        changed: Object.keys(KNOWN.keywords.changed).sort(),
        removedByOnlyForTags: removedKeywords,
      },
      routes: {
        inventory: '**/index.html; index.csr.html is an Angular fallback, not a route',
        legacy: legacyRoutes.length,
        current: currentRoutes.length,
        added,
        hostSpecific: optional,
        removed,
        removedByOnlyForTags,
        onlyForTags: removals,
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `PASS: route/search/keyword parity with the legacy output (${added.length} attributed route addition(s), ${lost.length} attributed removal(s), ${removedByOnlyForTags.length} onlyForTags removal(s)); ${accept ? 'accepted sets replaced' : 'equal to the accepted sets'}.`,
);
