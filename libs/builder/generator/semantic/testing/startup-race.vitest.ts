import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, expect, test } from 'vitest';

import { createGeneratorBuildSession } from '../../bootstrap';
import {
  type SourceCompilerBundle,
  bundleSourceCompiler,
} from '../../compiler/testing/source-bundle';
import type { BuildResult } from '../../contracts';

let bundle: Promise<SourceCompilerBundle> | undefined;
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
afterAll(async () => {
  await (await bundle)?.dispose();
});

function files(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * End to end: a new, unimported root file created between buildOnce and watcher readiness must
 * regenerate, whatever tsconfig spec syntax selected it.
 */
test.each([
  ['plain include', '../src/**/*.ts'],
  ['${configDir} include', '${configDir}/src/**/*.ts'],
])(
  'a root file raced in before watcher readiness regenerates with %s',
  async (_name, include) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'semantic-startup-race-')));
    directories.push(root);
    const write = (file: string, text: string) => {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), text);
    };
    write('config/tsconfig.base.json', JSON.stringify({ include: [include] }));
    write(
      'tsconfig.json',
      JSON.stringify({
        extends: './config/tsconfig.base.json',
        compilerOptions: { target: 'ES2022', strict: true, skipLibCheck: true, types: [] },
      }),
    );
    write('ng-doc.config.ts', "export default { docsPath: 'docs', cache: false };\n");
    write(
      'docs/ng-doc.api.ts',
      "const api = { title: 'API', scopes: [{ name: 'Public', route: 'public', include: ['src/lib/*.ts'] }] };\nexport default api;\n",
    );
    write('src/lib/documented.ts', '/** Documented base. */\nexport class Documented {}\n');
    const compiler = await (bundle ??= bundleSourceCompiler());
    const output = join(root, 'generated');
    const session = createGeneratorBuildSession({
      projectId: 'race',
      workspaceRoot: root,
      configFile: join(root, 'ng-doc.config.ts'),
      defaults: {
        docsRoot: join(root, 'docs'),
        tsConfig: join(root, 'tsconfig.json'),
        outputRoot: output,
        cacheRoot: join(root, 'cache'),
      },
      templateRoot: compiler.templateRoot,
      worker: { moduleUrl: compiler.moduleUrl, workerEntryUrl: compiler.workerEntryUrl },
      session: { batchDelayMs: 0 },
    });
    try {
      const built = await session.buildOnce({ mode: 'development' });
      expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      const watch = await session.watch(
        {
          async subscribe() {
            // Created after buildOnce read its inputs and before the watcher is ready; nothing
            // imports it, so only tsconfig membership can reveal it.
            write(
              'src/extra/new-child.ts',
              "import { Documented } from '../lib/documented';\nexport class RacedChild extends Documented {}\n",
            );
            return { dispose: async () => {} };
          },
        },
        () => {},
      );
      const initial: BuildResult = await watch.initial;
      expect(initial).toMatchObject({ status: 'success', generation: 2 });
      expect(files(output).some((file) => readFileSync(file, 'utf8').includes('RacedChild'))).toBe(
        true,
      );
      await watch.dispose();
    } finally {
      await session.dispose();
    }
  },
  120_000,
);
