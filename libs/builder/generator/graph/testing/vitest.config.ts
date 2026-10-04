import path from 'node:path';
import { defineConfig } from 'vitest/config';

const builderRoot = path.resolve(import.meta.dirname, '../../..');

export default defineConfig({
  root: builderRoot,
  test: {
    include: ['generator/graph/testing/**/*.vitest.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['generator/graph/**/*.ts'],
      exclude: ['generator/graph/testing/**'],
      // Untracked (root .gitignore /coverage). The modernization runner passes its own directory.
      reportsDirectory: path.resolve(builderRoot, '../../coverage/builder-generator/graph'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
