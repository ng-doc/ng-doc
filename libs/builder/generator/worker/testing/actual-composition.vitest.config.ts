import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: path.resolve(import.meta.dirname, '../../..'),
  test: {
    include: ['generator/worker/testing/actual-composition.integration.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 1,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // A manual --coverage run writes here (root .gitignore /coverage), never into the checkout.
    coverage: {
      reportsDirectory: path.resolve(
        import.meta.dirname,
        '../../../../../coverage/builder-generator/worker-actual-composition',
      ),
    },
  },
});
