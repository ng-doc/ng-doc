import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const [fixture, output] = process.argv.slice(2);
assert.ok(fixture && output, 'Usage: compare-b.mjs <Vite fixture> <evidence JSON>');
const baselinePath = path.join(
  root,
  'docs/architecture/evidence/t12/runtime-links/main/main-parity.json',
);
const baselineBytes = await readFile(baselinePath);
const baseline = JSON.parse(baselineBytes);
assert.equal(baseline.passed, true);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assets = {};
for (const name of ['indexes', 'keywords']) {
  const file = path.join(fixture, `browser/assets/ng-doc/${name}.json`);
  const bytes = await readFile(file);
  const expected =
    baseline.inputSha256[`dist/apps/ng-doc-modern/browser/assets/ng-doc/${name}.json`];
  assert.ok(expected, `Accepted B digest missing for ${name}`);
  assert.equal(sha(bytes), expected, `${name} bytes differ from accepted B`);
  const value = JSON.parse(bytes);
  assets[name] = {
    file,
    sha256: sha(bytes),
    bytes: bytes.length,
    records: Array.isArray(value) ? value.length : Object.keys(value).length,
  };
}
await writeFile(
  output,
  JSON.stringify(
    { passed: true, baseline: { file: baselinePath, sha256: sha(baselineBytes) }, assets },
    null,
    2,
  ) + '\n',
);
