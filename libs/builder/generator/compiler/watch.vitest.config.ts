import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: path.resolve(import.meta.dirname, '../..'),
  resolve: {
    alias: {
      '@ng-doc/core': path.resolve(import.meta.dirname, '../../../core/index.ts'),
      '@ng-doc/utils': path.resolve(import.meta.dirname, '../../../utils/index.ts'),
    },
  },
  test: {
    include: ['generator/compiler/watch.integration.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // A manual --coverage run writes here (root .gitignore /coverage), never into the checkout.
    coverage: {
      reportsDirectory: path.resolve(
        import.meta.dirname,
        '../../../../coverage/builder-generator/compiler-watch',
      ),
    },
  },
});
