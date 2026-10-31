import path from 'node:path';
import { defineConfig } from 'vitest/config';

// eslint-disable-next-line @nx/enforce-module-boundaries -- shared test tooling, not a library
import { workspaceAliases } from '../../tools/vitest/workspace-aliases';

const builderRoot = import.meta.dirname;
const workspace = path.resolve(builderRoot, '../..');

/**
 * The builder's `*.spec.ts` suites: the legacy engine, the shared helpers, the schematics and the
 * generator's session, discovery, artifact and contract specs (`nx test builder`). The generator's
 * `*.vitest.ts` suites have their own configs and run through the modernization runner.
 */
export default defineConfig({
  // The root holds `__mocks__/fs.js`, the memfs mock that `vi.mock('fs')` loads.
  root: builderRoot,
  resolve: { alias: workspaceAliases(workspace) },
  test: {
    include: ['**/*.{spec,test}.{ts,js}'],
    environment: 'node',
    globals: false,
    // Files run in parallel, each in its own worker process: a file's module mocks, spies on globals
    // (`Date.now`), `process.env` and `process.cwd()` stay its own. Every spec writes only below
    // its own `mkdtemp` directory. The one spec that runs the built legacy engine
    // (`legacy-generator.spec.ts`) keeps its builds serial inside its file, because they share the
    // engine's module cache next to the built package.
    pool: 'forks',
    // SchematicTestRunner requires the schematic factories named in collection.json.
    setupFiles: [path.join(workspace, 'tools/vitest/typescript-require.ts')],
    coverage: {
      provider: 'v8',
      reportsDirectory: path.join(workspace, 'coverage/libs/builder'),
      reporter: ['html'],
    },
  },
});
