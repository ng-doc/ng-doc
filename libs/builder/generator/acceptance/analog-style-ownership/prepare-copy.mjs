import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ANALOG_MAIN_SOURCE,
  analogResourcePolicy,
} from '../../../../../tools/scripts/analog-resource-patch.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

async function inventory(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile())
        files.push([path.relative(root, file), digest(await readFile(file))]);
      else throw new Error(`Unexpected package entry ${file}`);
    }
  };
  await visit(root);
  return files;
}

function replaceOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export async function prepareAnalogCopy({
  packageRoot,
  destination,
  mode,
  resourceIdentity = true,
}) {
  assert.match(mode, /^(baseline|full-reset)$/);
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(packageRoot, destination, { recursive: true });
  // `full-reset` applies the whole shipped policy, so this harness runs exactly the Analog source
  // NgDoc builds and ships. `baseline` keeps only the resource identity correction, which the
  // independent Vite resource acceptance fixture already proves: it preserves the real native
  // resource identity when Analog asks Angular for an incremental compilation.
  const selected = analogResourcePolicy.changes.filter(({ label }) =>
    mode === 'full-reset' ? true : resourceIdentity && label === 'native-resource-identity',
  );
  const sources = new Map();
  const changes = [];
  for (const change of selected) {
    const relativeFile = `src/${change.file ?? ANALOG_MAIN_SOURCE}`;
    const source =
      sources.get(relativeFile) ?? (await readFile(path.join(destination, relativeFile), 'utf8'));
    sources.set(relativeFile, replaceOnce(source, change.before, change.after, change.label));
    changes.push(change);
  }
  for (const [relativeFile, source] of sources)
    await writeFile(path.join(destination, relativeFile), source);
  const baselineFiles = await inventory(packageRoot);
  const copiedFiles = await inventory(destination);
  const changedFiles = copiedFiles.filter(
    ([name, hash]) => baselineFiles.find(([candidate]) => candidate === name)?.[1] !== hash,
  );
  assert.deepEqual(
    changedFiles.map(([name]) => name),
    [...sources.keys()].sort(),
  );
  return {
    mode,
    packageVersion: JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
      .version,
    originalPackageDigest: digest(JSON.stringify(baselineFiles)),
    copiedPackageDigest: digest(JSON.stringify(copiedFiles)),
    changedFiles,
    changes,
    baselineFiles,
    copiedFiles,
  };
}
