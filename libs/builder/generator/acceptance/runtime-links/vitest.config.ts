import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repository = path.resolve(import.meta.dirname, '../../../../..');

export default defineConfig({
  root: repository,
  resolve: {
    alias: [
      // The component under test, from source (the package link would load the built one).
      {
        find: '@ng-doc/app/components/page-link/page-link.component',
        replacement: path.join(repository, 'libs/app/components/page-link/page-link.component.ts'),
      },
      {
        find: '@ng-doc/ui-kit',
        replacement: path.join(
          repository,
          'libs/builder/generator/acceptance/runtime-links/ui-kit-stub.ts',
        ),
      },
    ],
  },
  plugins: [
    angular({
      tsconfig: path.join(repository, 'tsconfig.base.json'),
      workspaceRoot: repository,
      jit: true,
      include: ['libs/app/**/*.ts', 'libs/builder/generator/acceptance/runtime-links/**/*.ts'],
    }),
  ],
  test: {
    include: ['libs/builder/generator/acceptance/runtime-links/**/*.vitest.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['libs/app/components/page-link/page-link.component.ts'],
      // Untracked (root .gitignore /coverage).
      reportsDirectory: path.resolve(repository, 'coverage/builder-generator/runtime-links'),
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
