import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repository = path.resolve(import.meta.dirname, '../../../../..');

export default defineConfig({
  root: repository,
  resolve: {
    alias: {
      // The token under test, from source (the package link would load the built one).
      '@ng-doc/ui-kit/tokens/base-path': path.join(repository, 'libs/ui-kit/tokens/base-path.ts'),
    },
  },
  test: {
    include: ['libs/builder/generator/acceptance/base-path/**/*.vitest.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['libs/ui-kit/tokens/base-path.ts'],
      // Untracked (root .gitignore /coverage).
      reportsDirectory: path.resolve(repository, 'coverage/builder-generator/base-path'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
