import { afterEach, expect, test } from 'vitest';

import { disposeAll, targetedArms } from './testing/incremental-support';
import { fixture as corpusFixture, seededSteps } from './testing/targeted-corpus';

// The targeted rebuild on, off and cold builds of every step, byte for byte (seeded random edit sequences); the
// arms and what they compare are described at `targetedArms` in testing/incremental-support.ts.

afterEach(disposeAll);

const TARGETED_SEEDS = [0x5eed01, 0x5eed02, 0x5eed03];
const TARGETED_STEPS = Number(process.env['NGDOC_TEST_TARGETED_SEEDED_STEPS'] ?? 30);

test.each(TARGETED_SEEDS)(
  'targeted differential, seed %i: every step equals the targeted rebuild off and a cold build',
  async (seed) => {
    const f = corpusFixture(seed === TARGETED_SEEDS[1]);
    const steps = seededSteps(seed, TARGETED_STEPS);
    const outcome = await targetedArms(f, steps);
    expect(outcome.targeted).toBe(steps.filter((step) => step.expect === 'content').length);
  },
  600_000,
);
