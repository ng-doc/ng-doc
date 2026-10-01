import path from 'node:path';
import { defineConfig } from 'vitest/config';
const root = path.resolve(import.meta.dirname, '../..');
export default defineConfig({
  root,
  resolve: {
    alias: {
      '@ng-doc/core': path.resolve(root, '../core/index.ts'),
      '@ng-doc/utils': path.resolve(root, '../utils/index.ts'),
    },
  },
  test: {
    include: ['generator/compiler/*.vitest.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      // The compile phases: index orchestrates plan, describe, render, link, assemble and fold;
      // memo and retention hold the reuse facts and the retained program; classify, targeted and
      // dry-run are the targeted rebuild's classifier, closure, replay and report; semantic-closure
      // is the scoped semantic invalidation's mode, reasons and verify; closure-store persists its
      // closure records beside the cache; fast-start records a start and restores it; progress
      // reports the phases.
      include: [
        'generator/compiler/{index,common,plan,describe,render,link,assemble,fold,memo,retention,classify,dry-run,targeted,semantic-closure,closure-store,fast-start,progress}.ts',
      ],
      reporter: ['text', 'json-summary'],
      // Untracked (root .gitignore /coverage). The modernization runner passes its own directory.
      reportsDirectory: path.resolve(root, '../../coverage/builder-generator/compiler'),
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
