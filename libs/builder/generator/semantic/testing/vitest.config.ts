import path from 'node:path';
import { defineConfig } from 'vitest/config';
const builderRoot = path.resolve(import.meta.dirname, '../../..');
export default defineConfig({
  root: builderRoot,
  resolve: {
    alias: {
      '@ng-doc/core': path.resolve(builderRoot, '../core/index.ts'),
      '@ng-doc/utils': path.resolve(builderRoot, '../utils/index.ts'),
    },
  },
  test: {
    include: ['generator/semantic/testing/**/*.vitest.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    maxWorkers: 1,
    // Shiki sets its highlighter up with every bundled grammar the first time a process
    // highlights, which takes seconds on a loaded machine; it counts against whichever test
    // highlights first.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      // The stage-neutral kernel (digests, recorders, flags) is tested with the semantic recorder.
      include: ['generator/semantic/*.ts', 'generator/kernel/*.ts'],
      // Untracked (root .gitignore /coverage). The modernization runner passes its own directory.
      reportsDirectory: path.resolve(builderRoot, '../../coverage/builder-generator/semantic'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
