// The docs site's `serve` and `build` targets name the Vite builders through the alias in
// tools/builders. Nx reads the executor and options schema of every task in the task graph
// before it runs any of them, so a target that names ./dist/libs/builder fails on a fresh clone
// before its `link-libs` dependency can build dist. The alias reads the schemas from the sources
// and loads the implementations from dist, which the dependencies have built by then, so it must
// stay the published builders under another path.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GENERATOR_COPIED_FILES } from '../generator-build-spec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ALIAS = path.join(ROOT, 'tools/builders');
const PACKAGE = path.join(ROOT, 'libs/builder');
const DIST = path.join(ROOT, 'dist/libs/builder');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
/** The `builders` map of the collection whose package.json is in `directory`. */
const builders = (directory) =>
  readJson(path.join(directory, readJson(path.join(directory, 'package.json')).builders)).builders;

const alias = builders(ALIAS);
const published = builders(PACKAGE);
const site = readJson(path.join(ROOT, 'apps/ng-doc/project.json')).targets;

test('the site serves and builds with the Vite builders through the alias', () => {
  assert.equal(site.serve.executor, './tools/builders:vite-dev-server');
  assert.equal(site.build.executor, './tools/builders:vite-application');
});

test('every site target that uses the alias names one of its builders', () => {
  for (const [name, target] of Object.entries(site)) {
    const [collection, builder] = target.executor.split(':');
    if (collection === './tools/builders') assert.ok(alias[builder], `${name}: ${target.executor}`);
  }
});

test('each aliased builder loads the published implementation from dist', () => {
  assert.ok(Object.keys(alias).length > 0);
  for (const [name, entry] of Object.entries(alias)) {
    assert.ok(published[name], `${name} is a published builder`);
    assert.equal(
      path.resolve(ALIAS, entry.implementation),
      path.resolve(DIST, published[name].implementation),
      name,
    );
  }
});

test('each aliased builder reads the source schema that the build copies into dist', () => {
  // Published schema in dist -> its source, for the files the generator build copies verbatim.
  const sources = new Map(
    GENERATOR_COPIED_FILES.map(({ source, target }) => [
      path.join(DIST, 'generator', target),
      path.join(ROOT, source),
    ]),
  );
  for (const [name, entry] of Object.entries(alias)) {
    const schema = path.resolve(ALIAS, entry.schema);
    assert.ok(existsSync(schema), `${name}: ${schema} exists`);
    assert.equal(schema, sources.get(path.resolve(DIST, published[name].schema)), name);
  }
});
