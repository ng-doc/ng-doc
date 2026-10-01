import { build } from 'esbuild';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve(import.meta.dirname, '../../../../..');

/** Paths a test passes as worker options to run the current source compiler. */
export interface SourceCompilerBundle {
  /** Absolute path of an ESM module exporting createCompilationService(options). */
  module: string;
  moduleUrl: URL;
  workerEntryUrl: URL;
  templateRoot: string;
  dispose(): Promise<void>;
}

/**
 * Bundles the working-tree compiler (and the worker entry) the way the package build does, so
 * worker-based host tests exercise current source rather than a previously built dist. Packages
 * stay external and resolve through a linked repository node_modules.
 */
export async function bundleSourceCompiler(): Promise<SourceCompilerBundle> {
  const outdir = await mkdtemp(path.join(tmpdir(), 'ngdoc-source-compiler-'));
  await symlink(path.join(repository, 'node_modules'), path.join(outdir, 'node_modules'), 'dir');
  await build({
    absWorkingDir: repository,
    entryPoints: {
      'compiler/index': 'libs/builder/generator/compiler/index.ts',
      'worker/entry': 'libs/builder/generator/worker/entry.ts',
    },
    outdir,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
    alias: {
      '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
    },
  });
  const module = path.join(outdir, 'compiler/index.js');
  return {
    module,
    moduleUrl: pathToFileURL(module),
    workerEntryUrl: pathToFileURL(path.join(outdir, 'worker/entry.js')),
    templateRoot: path.join(repository, 'libs/builder/templates'),
    dispose: () => rm(outdir, { recursive: true, force: true }),
  };
}
