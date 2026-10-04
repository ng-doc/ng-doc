import path from 'node:path';
import { defineConfig } from 'vitest/config';
const root = path.resolve(import.meta.dirname, '../../../../..');
export default defineConfig({
  root,
  resolve: {
    alias: {
      '@ng-doc/app/tokens': path.join(root, 'libs/app/tokens/shiki-theme.ts'),
      // The service under test, from source (the package link would load the built one).
      '@ng-doc/app/services/highlighter/highlighter.service': path.join(
        root,
        'libs/app/services/highlighter/highlighter.service.ts',
      ),
    },
  },
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
  test: {
    include: ['libs/builder/generator/acceptance/production/highlighter.vitest.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: ['libs/app/services/highlighter/highlighter.service.ts'],
      reporter: ['text', 'json-summary'],
      // Untracked (root .gitignore /coverage); absolute, so it no longer depends on the cwd.
      reportsDirectory: path.join(root, 'coverage/builder-generator/production-highlighter'),
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
