import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Compares the search and keyword assets of a retained Vite production fixture with those of an
// Angular CLI build of the same sources. Both inputs come from the caller's own run; nothing here
// reads a result recorded by an earlier one.
const [fixtureArgument, baselineArgument, output] = process.argv.slice(2);
assert.ok(
  fixtureArgument && baselineArgument && output,
  'Usage: compare-b.mjs <Vite fixture> <Angular CLI output> <evidence JSON>',
);
const fixture = path.resolve(fixtureArgument);
const baseline = path.resolve(baselineArgument);
const producers = {
  fixture:
    'run vite-main/run-bounded.mjs with KEEP_VITE_MAIN_FIXTURE=1 first; its results.json names the retained fixture',
  baseline: 'run `npx nx run ng-doc:build-modern` first; it writes dist/apps/ng-doc-modern',
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function input(file, producer) {
  if (!existsSync(file)) throw new Error(`Missing ${file}: ${producers[producer]}.`);
  return readFile(file);
}
const assets = {};
for (const name of ['indexes', 'keywords']) {
  const relative = `browser/assets/ng-doc/${name}.json`;
  const file = path.join(fixture, relative);
  const bytes = await input(file, 'fixture');
  const baselineFile = path.join(baseline, relative);
  const expected = sha(await input(baselineFile, 'baseline'));
  assert.equal(sha(bytes), expected, `${name} bytes differ from the Angular CLI build`);
  const value = JSON.parse(bytes);
  assets[name] = {
    file,
    baseline: baselineFile,
    sha256: sha(bytes),
    bytes: bytes.length,
    records: Array.isArray(value) ? value.length : Object.keys(value).length,
  };
}
await writeFile(output, JSON.stringify({ passed: true, assets }, null, 2) + '\n');
