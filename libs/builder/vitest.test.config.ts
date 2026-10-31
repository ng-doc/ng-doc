import { configDefaults, defineConfig } from 'vitest/config';

import base from './vitest.config';

/** The spec that runs the built legacy engine and its file watcher. */
const LEGACY_ENGINE_SPEC = 'testing/modernization/legacy-generator.spec.ts';

/**
 * The config of `nx test builder`: the builder's specs in two groups that run one after the other.
 * The first runs every spec file in parallel. The second runs the legacy engine's spec alone,
 * after the first has finished: its watcher must see a debounced rebuild within its deadline,
 * which a runner busy with the other files can't promise. The modernization runner spreads
 * `vitest.config.ts` itself, so this split stays out of it.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    // A project that extends this config adds its `include` and `exclude` to these, so each names
    // its own files.
    include: [],
    projects: [
      {
        extends: true,
        test: {
          name: 'specs',
          include: base.test?.include ?? [],
          exclude: [...configDefaults.exclude, LEGACY_ENGINE_SPEC],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'legacy engine',
          include: [LEGACY_ENGINE_SPEC],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
