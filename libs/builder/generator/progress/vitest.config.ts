import path from 'node:path';
import { defineConfig } from 'vitest/config';

const builderRoot = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  root: builderRoot,
  test: {
    include: ['generator/progress/testing/**/*.vitest.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    maxWorkers: 2,
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      // The harness (testing/harness) is test code; the gate covers the product module.
      include: ['generator/progress/*.ts'],
      exclude: ['generator/progress/vitest.config.ts'],
      // Untracked (root .gitignore /coverage). The modernization runner passes its own directory.
      reportsDirectory: path.resolve(builderRoot, '../../coverage/builder-generator/progress'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
