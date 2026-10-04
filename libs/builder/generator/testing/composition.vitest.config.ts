import path from 'node:path';
import { defineConfig } from 'vitest/config';
const root = path.resolve(import.meta.dirname, '../..');
export default defineConfig({
  root,
  resolve: {
    alias: {
      '@ng-doc/core': path.resolve(root, '../core/index.ts'),
      '@ng-doc/utils': path.resolve(root, '../utils/index.ts'),
    },
  },
  test: {
    include: ['generator/testing/service-composition.vitest.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 1,
    // A manual --coverage run writes here (root .gitignore /coverage), never into the checkout.
    coverage: {
      reportsDirectory: path.resolve(root, '../../coverage/builder-generator/composition'),
    },
  },
});
