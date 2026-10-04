import { afterEach, expect, test } from 'vitest';

import { targetedDryRun } from './index';
import { disposeAll, targetedArms } from './testing/incremental-support';
import { corpus, fixture as corpusFixture } from './testing/targeted-corpus';

// The targeted rebuild on, off and cold builds of every step, byte for byte (the edit corpus); the
// arms and what they compare are described at `targetedArms` in testing/incremental-support.ts.

afterEach(disposeAll);

test('targeted differential: the edit corpus equals the targeted rebuild off and cold builds, committed tree included', async () => {
  const f = corpusFixture();
  const outcome = await targetedArms(f, corpus);
  expect(outcome.targeted).toBe(corpus.filter((step) => step.expect === 'content').length);
  expect(outcome.delta).toBe(outcome.targeted);
  expect(targetedDryRun().counters).toMatchObject({ errors: 0, mismatches: 0 });
}, 600_000);
