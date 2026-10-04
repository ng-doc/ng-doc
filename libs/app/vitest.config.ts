import path from 'node:path';
import { defineConfig } from 'vitest/config';

const workspace = path.resolve(import.meta.dirname, '../..');

/**
 * Vitest options for `nx test app`, which runs the specs through `@angular/build:unit-test` with
 * zone.js loaded. The builder supplies the rest (the compiled specs, TestBed and the includes).
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      reportsDirectory: path.join(workspace, 'coverage/libs/app'),
      reporter: ['html'],
    },
  },
});
