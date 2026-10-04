import path from 'node:path';
import { defineConfig } from 'vitest/config';
const builderRoot = path.resolve(import.meta.dirname, '../../..');
export default defineConfig({
  root: builderRoot,
  test: {
    include: ['generator/worker/testing/**/*.vitest.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 1,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['generator/worker/index.ts', 'generator/worker/protocol.ts'],
      // Untracked (root .gitignore /coverage). The modernization runner passes its own directory.
      reportsDirectory: path.resolve(builderRoot, '../../coverage/builder-generator/worker'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
