import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { replaceExactlyOnce } from './build-analog-compatibility.mjs';

export const analogResourcePolicy = JSON.parse(
  await readFile(new URL('../compatibility/analog-2.6.3-resources.json', import.meta.url), 'utf8'),
);

/** Apply the exact native-tested policy; the build preparer validates all upstream inputs first. */
export function applyAnalogResourcePatch(source) {
  let code = source;
  for (const { before, after, label } of analogResourcePolicy.changes) {
    code = replaceExactlyOnce(code, before, after, label);
  }
  const digest = createHash('sha256').update(code).digest('hex');
  if (digest !== analogResourcePolicy.patchedMainSourceSha256) {
    throw new Error(`Patched Analog source differs from the tested policy: ${digest}.`);
  }
  return { code, changes: analogResourcePolicy.changes };
}
