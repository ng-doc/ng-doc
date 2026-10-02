import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repository = path.resolve(import.meta.dirname, '../../../../..');

export default defineConfig({
  root: repository,
  // The sources, as the generator build bundles them: CI runs this group without linking the built
  // packages into node_modules.
  resolve: {
    alias: {
      '@ng-doc/core': path.resolve(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.resolve(repository, 'libs/utils/index.ts'),
    },
  },
  test: {
    include: ['libs/builder/generator/vite/testing/**/*.vitest.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['libs/builder/generator/vite/**/*.ts'],
      exclude: ['libs/builder/generator/vite/testing/**'],
      // Untracked (root .gitignore /coverage). The modernization runner passes its own directory.
      reportsDirectory: path.resolve(repository, 'coverage/builder-generator/vite'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
