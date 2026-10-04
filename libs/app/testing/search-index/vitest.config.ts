import path from 'node:path';
import { defineConfig } from 'vitest/config';

const workspace = path.resolve(import.meta.dirname, '../../../..');

export default defineConfig({
  root: workspace,
  resolve: {
    alias: [
      { find: /^@ng-doc\/app\/(.+)$/, replacement: `${path.join(workspace, 'libs/app')}/$1` },
      { find: '@ng-doc/app', replacement: path.join(workspace, 'libs/app/index.ts') },
      { find: /^@ng-doc\/core\/(.+)$/, replacement: `${path.join(workspace, 'libs/core')}/$1` },
      { find: '@ng-doc/core', replacement: path.join(workspace, 'libs/core/index.ts') },
      { find: /^@ng-doc\/ui-kit\/(.+)$/, replacement: `${path.join(workspace, 'libs/ui-kit')}/$1` },
      { find: '@ng-doc/ui-kit', replacement: path.join(workspace, 'libs/ui-kit/index.ts') },
    ],
  },
  test: {
    include: ['libs/app/testing/search-index/**/*.spec.ts'],
    environment: 'jsdom',
    globals: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: [
        'libs/app/classes/default-search-engine/**/*.ts',
        'libs/app/providers/search-engine/**/*.ts',
      ],
      exclude: ['libs/app/testing/**'],
      reportsDirectory: path.join(workspace, 'coverage/libs/app-search-index'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
