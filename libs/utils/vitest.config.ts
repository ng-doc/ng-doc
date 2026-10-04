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
    coverage: {
      provider: 'v8',
      reportsDirectory: path.join(workspace, 'coverage/libs/utils'),
      reporter: ['html'],
    },
  },
});
