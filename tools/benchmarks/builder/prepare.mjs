import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { writeFixture } from './fixtures/index.mjs';
const libraries = ['app', 'builder', 'core', 'keywords-loaders', 'ui-kit', 'utils'];
/** All preparation occurs before the spawn-to-product timing interval. */
export async function prepareSynthetic({
  root,
  repository,
  guides,
  apiDeclarations = 0,
  expectedSourceDigest,
}) {
  const provenance = JSON.parse(
    await readFile(
      path.join(repository, 'dist/libs/builder/generator/build-provenance.json'),
      'utf8',
    ),
  );
  if (!expectedSourceDigest || provenance.sourceDigest !== expectedSourceDigest)
    throw new Error('Built generator provenance mismatch');
  await mkdir(root); // Deliberately reject reused cold roots.
  const manifest = await writeFixture(root, { guides, apiDeclarations });
  const packages = path.join(root, 'node_modules/@ng-doc');
  for (const library of libraries)
    await cp(path.join(repository, 'dist/libs', library), path.join(packages, library), {
      recursive: true,
    });
  await cp(path.join(packages, 'ui-kit/assets'), path.join(root, 'public/assets/ng-doc/ui-kit'), {
    recursive: true,
  });
  const configPath = path.join(root, 'tsconfig.json');
  const tsconfig = JSON.parse(await readFile(configPath, 'utf8'));
  tsconfig.compilerOptions.paths = {
    '@ng-doc/generated': ['./generated/index.ts'],
    '@ng-doc/generated/*': ['./generated/*'],
    ...Object.fromEntries(
      ['app', 'core', 'ui-kit'].flatMap((lib) => [
        [`@ng-doc/${lib}`, [path.join(packages, lib)]],
        [`@ng-doc/${lib}/*`, [path.join(packages, lib, '*')]],
      ]),
    ),
  };
  tsconfig.compilerOptions.types = ['vite/client', 'node'];
  await writeFile(configPath, JSON.stringify(tsconfig, null, 2) + '\n');
  const packageHashes = {};
  for (const library of libraries) {
    const base = path.join(packages, library);
    const entries = await readdir(base, { recursive: true, withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
    packageHashes[library] = Object.fromEntries(
      await Promise.all(
        files.map(async (file) => [
          path.relative(base, file),
          createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
        ]),
      ),
    );
  }
  const preparation = {
    root,
    packages,
    manifest,
    packageHashes,
    sourceDigest: provenance.sourceDigest,
    fixtureDigest: createHash('sha256').update(JSON.stringify(manifest.sourceHashes)).digest('hex'),
    wiring: {
      tsconfigPaths: tsconfig.compilerOptions.paths,
      types: tsconfig.compilerOptions.types,
    },
  };
  await writeFile(path.join(root, 'preparation.json'), JSON.stringify(preparation, null, 2) + '\n');
  return preparation;
}
