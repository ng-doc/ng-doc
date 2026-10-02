import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

/**
 * Visual harness: compares pages of a running docs site with the Hybrid prototype screenshots.
 *
 * It does not start a server. Serve the site on the library sources first, for example:
 *   NX_DAEMON=false npx nx run ng-doc:serve-legacy:development --excludeTaskDependencies --port 4251 --host 127.0.0.1
 * then run:
 *   NGDOC_VISUAL_BASE_URL=http://127.0.0.1:4251 npm run visual
 *
 * The reference screenshots are not part of the repository. By default they are read from
 * docs/design/ui-refresh/alternatives/hybrid/screenshots of this checkout (the design deliverable:
 * `audit-final/*.png` pages and `*-{light,dark}.png` close-ups). Point NGDOC_VISUAL_FIXTURES at
 * another copy when this checkout has none. Cases whose reference is missing are skipped.
 *
 * Environment:
 * - NGDOC_VISUAL_BASE_URL: the served site (default http://127.0.0.1:4251).
 * - NGDOC_VISUAL_FIXTURES: directory of the reference screenshots (default above).
 * - NGDOC_VISUAL_OUT: output directory (default tmp/visual/<timestamp>); holds report.md,
 *   report.json, index.html and one folder per case.
 * - NGDOC_VISUAL_TOLERANCE: allowed share of differing pixels in the first 900 rows (default 0.02).
 * - NGDOC_VISUAL_STRICT=1: fail cases above the tolerance (default: report only).
 * - NGDOC_VISUAL_CHANNEL: browser channel (default `chrome`, the installed Google Chrome); use
 *   `chromium` after `npx playwright install chromium`.
 * - NGDOC_VISUAL_WORKERS: parallel browsers (default 2).
 */
const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '../../../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

// Workers inherit the environment, so every process writes into the same run directory.
process.env.NGDOC_VISUAL_OUT ??= join(workspace, 'tmp', 'visual', stamp);
process.env.NGDOC_VISUAL_BASE_URL ??= 'http://127.0.0.1:4251';
process.env.NGDOC_VISUAL_FIXTURES ??= join(
  workspace,
  'docs/design/ui-refresh/alternatives/hybrid/screenshots',
);

export default defineConfig({
  testDir: here,
  testMatch: '*.visual.mjs',
  outputDir: join(process.env.NGDOC_VISUAL_OUT, 'test-results'),
  globalTeardown: join(here, 'report.mjs'),
  fullyParallel: true,
  workers: Number(process.env.NGDOC_VISUAL_WORKERS ?? '2'),
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.NGDOC_VISUAL_BASE_URL,
    channel: process.env.NGDOC_VISUAL_CHANNEL ?? 'chrome',
    headless: true,
    deviceScaleFactor: 1,
  },
});
