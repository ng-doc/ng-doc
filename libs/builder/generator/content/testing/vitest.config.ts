import path from 'node:path';
import { defineConfig } from 'vitest/config';

const builderRoot = path.resolve(import.meta.dirname, '../../..');

export default defineConfig({
  root: builderRoot,
  resolve: {
    alias: {
      '@ng-doc/utils': path.resolve(builderRoot, '../utils/index.ts'),
      '@ng-doc/core': path.resolve(builderRoot, '../core/index.ts'),
    },
  },
  test: {
    include: ['generator/content/testing/**/*.vitest.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    // Shiki sets its highlighter up with every bundled grammar the first time a process
    // highlights, which takes seconds on a loaded machine; it counts against whichever test
    // highlights first.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['generator/content/**/*.ts'],
      exclude: ['generator/content/testing/**', 'generator/content/**/*.d.ts'],
      // Untracked (root .gitignore /coverage). The modernization runner passes its own directory.
      reportsDirectory: path.resolve(builderRoot, '../../coverage/builder-generator/content'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
