import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runScenarios } from './run.mjs';

// The `node --test` entry point of the packed `ng add` / `migrate-to-vite` end-to-end check. It
// needs the built package set in dist/libs and network access to the npm registry. Evidence goes
// to NGDOC_NG_ADD_E2E_EVIDENCE (default: a new temporary directory), one folder per scenario.
const evidence =
  process.env.NGDOC_NG_ADD_E2E_EVIDENCE ??
  path.join(os.tmpdir(), `ngdoc-ng-add-e2e-evidence-${process.pid}-${Date.now()}`);
// Each scenario has its own budget (runScenarios cuts every command to it); the test timeout
// allows for the packing before it and the cleanup after, and cancels the work through the
// test's signal. CI runs one scenario per job (--test-name-pattern).
const options = {
  npmCache: process.env.NGDOC_NG_ADD_E2E_NPM_CACHE,
  keep: process.env.NGDOC_NG_ADD_E2E_KEEP === '1',
};

test(
  'scenario A: ng new, ng add @ng-doc/add sets up the Vite engine, ng build, ng serve smoke',
  { timeout: 32 * 60_000 },
  async (t) => {
    await runScenarios({
      ...options,
      signal: t.signal,
      scenarios: ['a'],
      evidence: path.join(evidence, 'a'),
    });
  },
);

test(
  'scenario B: legacy builders, ng g @ng-doc/builder:migrate-to-vite, ng build, ng serve smoke',
  { timeout: 32 * 60_000 },
  async (t) => {
    await runScenarios({
      ...options,
      signal: t.signal,
      scenarios: ['b'],
      evidence: path.join(evidence, 'b'),
    });
  },
);
