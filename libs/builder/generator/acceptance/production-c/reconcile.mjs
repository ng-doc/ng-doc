import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';

// Reconcile retained native outputs without rebuilding or changing the evidence.
const [evidence] = process.argv.slice(2);
assert.ok(evidence, 'Pass a completed production-c evidence directory');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const build = await json(path.join(evidence, 'build-results.json'));
const audit = await json(path.join(evidence, 'audit-results.json'));
assert.equal(build.status, 'passed');
assert.equal(audit.status, 'passed');
const inventory = await json(path.join(evidence, 'generator-inventory.json'));
const ids = inventory.descriptors.map((item) => item.id).sort();
assert.equal(new Set(ids).size, ids.length);
assert.deepEqual(inventory.content.map((item) => item.id).sort(), ids);
const routes = new Set(audit.routes.map((item) => item.route));
const report = {
  status: 'running',
  sourceDigest: build.provenance.sourceDigest,
  materialized: ids.length,
  assets: {},
  localTargets: 0,
  externalTargets: 0,
  missingTargets: [],
};
const pages = new Map();
async function target(label, value, fragment) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) {
    report.externalTargets++;
    return;
  }
  const url = new URL(value, 'http://fixture.invalid/');
  const route = url.pathname.replace(/\/$/, '') || '/';
  const anchor = fragment ?? decodeURIComponent(url.hash.slice(1));
  report.localTargets++;
  if (!routes.has(route)) {
    report.missingTargets.push({ label, route, anchor, reason: 'route' });
    return;
  }
  if (!anchor) return;
  let pageIds = pages.get(route);
  if (!pageIds) {
    pageIds = new Set();
    const html = await readFile(path.join(build.fixture, 'browser', route, 'index.html'), 'utf8');
    const walk = (node) => {
      for (const attr of node.attrs ?? []) if (attr.name === 'id') pageIds.add(attr.value);
      for (const child of node.childNodes ?? []) walk(child);
    };
    walk(parse(html));
    pages.set(route, pageIds);
  }
  if (!pageIds.has(anchor)) report.missingTargets.push({ label, route, anchor, reason: 'anchor' });
}
for (const name of ['indexes', 'keywords']) {
  const emitted = await readFile(path.join(build.fixture, 'browser/assets/ng-doc', `${name}.json`));
  const warm = await readFile(path.join(build.fixture, 'generated/assets', `${name}.json`));
  assert.deepEqual(
    warm,
    emitted,
    `${name}: original production emission must equal warm generation`,
  );
  const value = JSON.parse(emitted);
  report.assets[name] = { sha256: hash(emitted), records: Object.keys(value).length };
  if (name === 'indexes')
    for (const item of value) await target(`search:${item.title}`, item.route, item.fragment);
  else for (const [key, item] of Object.entries(value)) await target(`keyword:${key}`, item.path);
}
report.status = report.missingTargets.length ? 'failed' : 'passed';
await writeFile(path.join(evidence, 'reconciliation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, missingTargets: report.missingTargets.slice(0, 15) }));
assert.equal(
  report.missingTargets.length,
  0,
  'Search/keyword targets missing from prerendered output',
);
