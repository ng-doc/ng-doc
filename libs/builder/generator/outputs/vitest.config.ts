import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  root,
  // The real compiler (outputs/delta-commit.vitest.ts) imports these from source.
  resolve: {
    alias: {
      '@ng-doc/core': path.resolve(root, '../core/index.ts'),
      '@ng-doc/utils': path.resolve(root, '../utils/index.ts'),
    },
  },
  test: {
    include: ['generator/outputs/*.vitest.ts'],
    environment: 'node',
    pool: 'forks',
    execArgv: ['--experimental-vm-modules'],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: ['generator/outputs/index.ts'],
      reporter: ['text', 'json-summary'],
      // Untracked (root .gitignore /coverage). The modernization runner passes its own directory.
      reportsDirectory: path.resolve(root, '../../coverage/builder-generator/outputs'),
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
