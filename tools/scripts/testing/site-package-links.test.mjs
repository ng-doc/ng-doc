// How the documentation site finds the built @ng-doc packages in a fresh clone, where
// node_modules/@ng-doc does not exist until `ng-doc:link-libs` creates it. A workstation that
// still has links made by hand passes the site builds without them, so these checks keep them
// from relying on links that only such a workstation has.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const APP = path.join(ROOT, 'apps/ng-doc');
const ts = createRequire(import.meta.url)('typescript');

/** A tsconfig file's own JSON, comments allowed. */
function readConfig(file) {
  const { config, error } = ts.readConfigFile(file, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return config;
}

/** The `paths` a tsconfig resolves with: TypeScript takes the nearest declaration whole. */
function effectivePaths(file) {
  const config = readConfig(file);
  if (config.compilerOptions?.paths) return config.compilerOptions.paths;
  return config.extends ? effectivePaths(path.resolve(path.dirname(file), config.extends)) : {};
}

/** True when `file` is `ancestor` or extends it, directly or through other tsconfigs. */
function extendsConfig(file, ancestor) {
  if (file === ancestor) return true;
  const parent = readConfig(file).extends;
  return !!parent && extendsConfig(path.resolve(path.dirname(file), parent), ancestor);
}

const BUILD_CONFIG = path.join(APP, 'tsconfig.build.json');
const buildPaths = effectivePaths(BUILD_CONFIG);
/** The library mappings of the site's builds; each configuration has its own generated module. */
const libraryPaths = Object.entries(buildPaths).filter(([key]) => key !== '@ng-doc/generated');

test('the site build configuration maps the built libraries', () => {
  assert.ok(libraryPaths.length > 0);
  for (const [key, [target]] of libraryPaths)
    assert.match(target, /^dist\/libs\//, `${key} maps into dist/libs`);
  for (const library of ['app', 'core', 'ui-kit', 'utils'])
    assert.ok(buildPaths[`@ng-doc/${library}`], `@ng-doc/${library} is mapped`);
});

test('every site configuration that extends the build configuration keeps its library mappings', async () => {
  const files = (await readdir(APP))
    .filter((name) => /^tsconfig\..*\.json$/.test(name))
    .map((name) => path.join(APP, name))
    .filter((file) => file !== BUILD_CONFIG && extendsConfig(file, BUILD_CONFIG));
  // tsconfig.vite.json (Vite engine) and tsconfig.modern.json (Angular CLI, new engine).
  assert.ok(files.length >= 2, files.join(', '));
  for (const file of files) {
    const paths = effectivePaths(file);
    for (const [key, target] of libraryPaths)
      assert.deepEqual(paths[key], target, `${path.relative(ROOT, file)} maps ${key}`);
  }
});

test('link-libs links every library the site maps by name into node_modules/@ng-doc', () => {
  const project = JSON.parse(ts.sys.readFile(path.join(APP, 'project.json')));
  const linked = new Set(
    project.targets['link-libs'].options.commands
      .map((command) =>
        command.match(/^symlink-dir dist\/libs\/([\w-]+) node_modules\/@ng-doc\/([\w-]+)$/),
      )
      .filter((match) => match && match[1] === match[2])
      .map((match) => match[1]),
  );
  // The fixtures of the acceptance harnesses and the packages' own imports resolve by package
  // name, as an application that installed them from npm does.
  for (const [key] of libraryPaths.filter(([key]) => !key.endsWith('/*')))
    assert.ok(linked.has(key.slice('@ng-doc/'.length)), `link-libs links ${key}`);
});
