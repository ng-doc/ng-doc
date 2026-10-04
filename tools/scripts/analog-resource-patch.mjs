import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { replaceExactlyOnce } from './build-analog-compatibility.mjs';

/** The upstream file a change applies to when it names none. */
export const ANALOG_MAIN_SOURCE = 'lib/angular-vite-plugin.js';

export const analogResourcePolicy = JSON.parse(
  await readFile(new URL('../compatibility/analog-2.8.0-resources.json', import.meta.url), 'utf8'),
);

/**
 * Apply the exact native-tested policy to one upstream file (its path below `src/`); the build
 * preparer validates all upstream inputs first.
 */
export function applyAnalogResourcePatch(source, file = ANALOG_MAIN_SOURCE) {
  const changes = analogResourcePolicy.changes.filter(
    (change) => (change.file ?? ANALOG_MAIN_SOURCE) === file,
  );
  let code = source;
  for (const { before, after, label } of changes) {
    code = replaceExactlyOnce(code, before, after, label);
  }
  const digest = createHash('sha256').update(code).digest('hex');
  if (digest !== analogResourcePolicy.patchedSourcesSha256[file]) {
    throw new Error(`Patched Analog source ${file} differs from the tested policy: ${digest}.`);
  }
  return { code, changes };
}
