import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function viteConfiguration({ root, packages, mode, observe }) {
  if (mode !== 'c') throw new Error('Expected c (the virtual content mode c-d was removed)');
  const [{ createNgDocAngularPlugins: angular }, { createNgDocVitePlugin }] = await Promise.all([
    import(pathToFileURL(path.join(packages, 'builder/generator/vite/angular/index.js')).href),
    import(pathToFileURL(path.join(packages, 'builder/generator/vite/index.js')).href),
  ]);
  const prebundles = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit'])
    for (const file of await readdir(path.join(packages, library, 'fesm2022'))) {
      if (!file.endsWith('.mjs')) continue;
      for (const match of (
        await readFile(path.join(packages, library, 'fesm2022', file), 'utf8')
      ).matchAll(/['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g))
        prebundles.add(match[1]);
    }
  return {
    root,
    configFile: false,
    base: '/preview/',
    logLevel: 'warn',
    cacheDir: path.join(root, 'cache/vite'),
    plugins: [
      ...(observe ? [observe] : []),
      createNgDocVitePlugin({
        analogLiveReload: true,
        angularPlugins: angular({
          liveReload: true,
          tsconfig: path.join(root, 'tsconfig.json'),
          workspaceRoot: root,
          disableTypeChecking: false,
          jit: false,
        }),
        angularComponentProbe: path.join(root, 'src/app.ts'),
        generator: {
          projectId: 'benchmark',
          workspaceRoot: root,
          configFile: path.join(root, 'ng-doc.config.mjs'),
          defaults: {
            docsRoot: path.join(root, 'docs'),
            tsConfig: path.join(root, 'tsconfig.json'),
            outputRoot: path.join(root, 'generated'),
            cacheRoot: path.join(root, 'cache/generator'),
          },
        },
      }),
    ],
    optimizeDeps: { include: [...prebundles].sort() },
    ssr: { noExternal: true, optimizeDeps: { include: [...prebundles].sort() } },
    resolve: {
      alias: ['app', 'core', 'ui-kit'].map((lib) => ({
        find: `@ng-doc/${lib}`,
        replacement: path.join(packages, lib),
      })),
      dedupe: [
        '@angular/core',
        '@angular/common',
        '@angular/compiler',
        '@angular/router',
        '@angular/platform-browser',
      ],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root, packages] } },
  };
}
