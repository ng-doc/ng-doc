import path from 'node:path';
import { defineConfig } from 'vitest/config';

// eslint-disable-next-line @nx/enforce-module-boundaries -- shared test tooling, not a library
import { workspaceAliases } from '../../tools/vitest/workspace-aliases';

const addRoot = import.meta.dirname;
const workspace = path.resolve(addRoot, '../..');

/** The `ng add` schematic specs (`nx test add`). */
export default defineConfig({
  root: addRoot,
  resolve: { alias: workspaceAliases(workspace) },
  test: {
    include: ['**/*.{spec,test}.{ts,js}'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    // SchematicTestRunner requires the schematic factories named in collection.json.
    setupFiles: [path.join(workspace, 'tools/vitest/typescript-require.ts')],
    coverage: {
      provider: 'v8',
      reportsDirectory: path.join(workspace, 'coverage/libs/add'),
      reporter: ['html'],
    },
  },
});
