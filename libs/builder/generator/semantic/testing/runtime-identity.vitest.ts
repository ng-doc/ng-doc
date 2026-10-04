import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

import { packageVersions, runtimePackages } from '../../kernel/runtime-identity';

// The resolved versions of the packages that shape output (`kernel/runtime-identity.ts`): the fast
// start's record header and the highlight cache's keys name them.

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const version = (name: string, from = '../../../../../node_modules') =>
  (
    JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, from, name, 'package.json'), 'utf8'),
    ) as { version: string }
  ).version;

test('names the versions this process loads, Shiki from the plugin that loads it, once per process', () => {
  const packages = runtimePackages();
  for (const name of ['prettier', 'marked', 'ts-morph', 'typescript', '@shikijs/rehype'])
    expect(packages[name], name).toBe(version(name));
  // `@shikijs/rehype` carries its own Shiki, which is the one that highlights.
  const nested = '../../../../../node_modules/@shikijs/rehype/node_modules';
  expect(packages['shiki']).toBe(version('shiki', nested));
  expect(packages['@shikijs/core']).toBe(version('@shikijs/core', nested));
  expect(runtimePackages()).toBe(packages);
  expect(Object.isFrozen(packages)).toBe(true);
});

test('resolves upwards and through the package named second, and names null otherwise', () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'runtime-identity-')));
  roots.push(root);
  const write = (directory: string, value: string) => {
    mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(path.join(root, directory, 'package.json'), value);
  };
  write('node_modules/host', '{"version":"1.0.0"}');
  write('node_modules/host/node_modules/inner', '{"version":"2.0.0"}');
  write('node_modules/inner', '{"version":"9.9.9"}');
  write('node_modules/unversioned', '{"name":"unversioned"}');
  write('node_modules/numbered', '{"version":3}');
  write('node_modules/broken', '{');
  write('node_modules/null', 'null');
  const from = path.join(root, 'app', 'src');
  mkdirSync(from, { recursive: true });
  expect(
    packageVersions(
      [
        ['host'],
        ['inner', 'host'],
        ['inner-top', 'missing'],
        ['missing'],
        ['unversioned'],
        ['numbered'],
        ['broken'],
        ['null'],
      ],
      from,
    ),
  ).toEqual({
    host: '1.0.0',
    inner: '2.0.0',
    'inner-top': null,
    missing: null,
    unversioned: null,
    numbered: null,
    broken: null,
    null: null,
  });
});
