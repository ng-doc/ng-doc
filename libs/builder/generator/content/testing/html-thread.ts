import { build } from 'esbuild';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve(import.meta.dirname, '../../../../..');

/** What a test hands the render pool as its thread entry (`configureRenderPool`). */
export interface ThreadEntryBundle {
  url: URL;
  dispose(): Promise<void>;
}

/**
 * Bundles a render thread entry the way the package build bundles `content/html-worker.ts` (the
 * sources cannot run in a thread): the real entry by default, or a test fixture with `define`d
 * constants. Packages stay external and resolve through a linked repository node_modules.
 */
export async function bundleThreadEntry(
  source: string = path.join(repository, 'libs/builder/generator/content/html-worker.ts'),
  define: Record<string, string> = {},
): Promise<ThreadEntryBundle> {
  const outdir = await mkdtemp(path.join(tmpdir(), 'ngdoc-html-thread-'));
  await symlink(path.join(repository, 'node_modules'), path.join(outdir, 'node_modules'), 'dir');
  await writeFile(path.join(outdir, 'package.json'), JSON.stringify({ type: 'module' }));
  await build({
    absWorkingDir: repository,
    entryPoints: { 'html-worker': source },
    outdir,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
    define,
    alias: {
      '@ng-doc/core': path.join(repository, 'libs/core/index.ts'),
      '@ng-doc/utils': path.join(repository, 'libs/utils/index.ts'),
    },
  });
  return {
    url: pathToFileURL(path.join(outdir, 'html-worker.js')),
    dispose: () => rm(outdir, { recursive: true, force: true }),
  };
}

/** A fixture thread entry that misbehaves as `mode` says (`fixtures/misbehaving-html-worker.ts`). */
export const misbehavingThread = (mode: string): Promise<ThreadEntryBundle> =>
  bundleThreadEntry(path.join(import.meta.dirname, 'fixtures/misbehaving-html-worker.ts'), {
    THREAD_MODE: JSON.stringify(mode),
  });
