import path from 'node:path';
import { defineConfig } from 'vitest/config';

const workspace = path.resolve(import.meta.dirname, '../..');

/**
 * Vitest options for `nx test ng-doc`, which runs the site's specs through
 * `@angular/build:unit-test` with zone.js loaded (`build-specs` declares the polyfill).
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      reportsDirectory: path.join(workspace, 'coverage/apps/ng-doc'),
      reporter: ['html'],
    },
  },
});
