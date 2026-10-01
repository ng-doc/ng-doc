import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import base from './vitest.config';

const workspace = path.resolve(import.meta.dirname, '../..');

/**
 * Vitest options for `nx run app:test-zoneless`: the same specs without zone.js. TestBed uses
 * zoneless change detection, and nothing patches timers or events. Applications created with
 * Angular 21 or later are zoneless, so the library must work there too.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: { coverage: { reportsDirectory: path.join(workspace, 'coverage/libs/app-zoneless') } },
  }),
);
