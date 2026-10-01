import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import { computeSourceDigest } from '../../../../../tools/scripts/generator-build-spec.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The exact source inventory build-generator.mjs records (acceptance helpers are excluded there).
const sourceDigest = async () => (await computeSourceDigest(root)).sourceDigest;

/** The generator build under test: NGDOC_PRODUCTION_C_GENERATOR (a private `--outdir` build) or shared dist. */
export function generatorRootFromEnv(env = process.env) {
  return path.resolve(root, env.NGDOC_PRODUCTION_C_GENERATOR || 'dist/libs/builder/generator');
}

/** Rejects a generator build that was not made from this checkout's sources and lockfile. Returns its provenance. */
export async function assertGeneratorMatchesSource(generatorRoot = generatorRootFromEnv()) {
  const provenance = JSON.parse(
    await readFile(path.join(generatorRoot, 'build-provenance.json'), 'utf8'),
  );
  assert.equal(
    await sourceDigest(),
    provenance.sourceDigest,
    'Source no longer matches frozen generator',
  );
  assert.equal(
    sha(await readFile(path.join(root, 'package-lock.json'))),
    provenance.lockfileDigest,
    'Lock no longer matches frozen generator',
  );
  return provenance;
}

/** Build only discovery and semantic entrypoints into a new harness-owned directory. */
export async function prepareExpectedRuntime(
  outputRoot,
  { generatorRoot = generatorRootFromEnv() } = {},
) {
  const output = path.resolve(outputRoot);
  assert.ok(
    !output.startsWith(path.join(root, 'dist') + path.sep) && output !== path.join(root, 'dist'),
    'Expected runtime must not write shared dist',
  );
  const provenance = await assertGeneratorMatchesSource(generatorRoot);
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output); // Refuse replacing an existing runtime or anyone else's directory.
  await writeFile(path.join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(path.join(root, 'node_modules'), path.join(output, 'node_modules'), 'dir');
  const result = await build({
    absWorkingDir: root,
    entryPoints: {
      'discovery/index': 'libs/builder/generator/discovery/index.ts',
      'semantic/semantic-service': 'libs/builder/generator/semantic/semantic-service.ts',
    },
    outdir: output,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    metafile: true,
    alias: {
      '@ng-doc/core': path.join(root, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(root, 'libs/utils/index.ts'),
    },
  });
  const inputs = {};
  for (const input of Object.keys(result.metafile.inputs).sort()) {
    assert.ok(
      !/libs\/builder\/generator\/(compiler|outputs)\//.test(input),
      `Expected inventory must not import compiler/output assembly: ${input}`,
    );
    inputs[input] = sha(await readFile(path.resolve(root, input)));
  }
  assert.equal(
    await sourceDigest(),
    provenance.sourceDigest,
    'Source changed while preparing expected runtime',
  );
  await writeFile(path.join(output, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
  await writeFile(
    path.join(output, 'provenance.json'),
    JSON.stringify(
      {
        sourceDigest: provenance.sourceDigest,
        lockfileDigest: provenance.lockfileDigest,
        node: process.version,
        inputs,
        outputs: Object.fromEntries(
          await Promise.all(
            Object.keys(result.metafile.outputs)
              .sort()
              .map(async (file) => [
                path.relative(output, path.resolve(root, file)),
                sha(await readFile(path.resolve(root, file))),
              ]),
          ),
        ),
      },
      null,
      2,
    ),
  );
  return output;
}
