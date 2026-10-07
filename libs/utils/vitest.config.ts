import path from 'node:path';
import { defineConfig } from 'vitest/config';

// eslint-disable-next-line @nx/enforce-module-boundaries -- shared test tooling, not a library
import { workspaceAliases } from '../../tools/vitest/workspace-aliases';

const projectRoot = import.meta.dirname;
const workspace = path.resolve(projectRoot, '../..');

/** The `utils` specs (`nx test utils`). The library has none yet, which is not a failure. */
export default defineConfig({
  root: projectRoot,
  resolve: { alias: workspaceAliases(workspace) },
  test: {
    include: ['**/*.{spec,test}.{ts,js}'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    passWithNoTests: true,
    // Shiki sets its highlighter up with every bundled grammar the first time a process
    // highlights, which takes seconds on a loaded machine; it counts against whichever test
    // highlights first.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: path.join(workspace, 'coverage/libs/utils'),
      reporter: ['html'],
    },
  },
});
