// The documentation site on the NgDoc Vite engine (Vite + Analog, physical generated files).
// Used by the `build` and `serve` targets. The plugins come from the built package in
// dist, as the site's Angular CLI targets do.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNgDocAngularPlugins } from '../../dist/libs/builder/generator/vite/angular/index.js';
import {
  createNgDocApplicationPlugin,
  createNgDocVitePlugin,
} from '../../dist/libs/builder/generator/vite/index.js';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const app = (file) => path.join(workspaceRoot, 'apps/ng-doc', file);

/** Replaced in production builds only, as in the Angular CLI targets. */
export const productionFileReplacements = [
  {
    replace: 'apps/ng-doc/src/environments/environment.ts',
    with: 'apps/ng-doc/src/environments/environment.prod.ts',
  },
];

/** The generator options of the site: its configuration and its own output and cache roots. */
export function ngDocSiteGenerator({
  configFile = app('ng-doc.config.modern.ts'),
  tsConfig = app('tsconfig.vite.json'),
  outputRoot = path.join(workspaceRoot, 'ng-doc-modernization/ng-doc/ng-doc-vite'),
  cacheRoot = path.join(workspaceRoot, '.cache/ng-doc/ng-doc-vite'),
} = {}) {
  return {
    projectId: 'ng-doc-vite',
    workspaceRoot,
    configFile,
    defaults: { docsRoot: app('docs'), tsConfig, outputRoot, cacheRoot },
  };
}

/**
 * The site's Vite configuration. The options exist for the production acceptance, which builds
 * the same configuration with a probe page, its own roots and a deployment base.
 */
export function ngDocSiteConfig({
  mode,
  base = '/',
  tsconfig = app('tsconfig.vite.json'),
  generator = ngDocSiteGenerator({ tsConfig: tsconfig }),
  cacheDir = path.join(workspaceRoot, '.angular/vite/ng-doc'),
  outDir = path.join(workspaceRoot, 'dist/apps/ng-doc-vite/browser'),
}) {
  return {
    root: app('src'),
    base,
    cacheDir,
    // The HTML entry is src/index.html; the Angular CLI targets keep using the same file.
    publicDir: false,
    plugins: [
      createNgDocApplicationPlugin({
        workspaceRoot,
        sourceRoot: 'apps/ng-doc/src',
        browser: 'apps/ng-doc/src/main.ts',
        server: 'apps/ng-doc/src/main.server.ts',
        styles: ['apps/ng-doc/src/styles.scss'],
        assets: [
          'apps/ng-doc/src/assets',
          { glob: '**/*', input: 'dist/libs/app/assets', output: 'assets/ng-doc/app' },
          { glob: '**/*', input: 'dist/libs/ui-kit/assets', output: 'assets/ng-doc/ui-kit' },
        ],
      }),
      createNgDocVitePlugin({
        analogLiveReload: true,
        angularPlugins: createNgDocAngularPlugins({
          tsconfig,
          workspaceRoot,
          jit: false,
          disableTypeChecking: false,
          liveReload: true,
          inlineStylesExtension: 'scss',
          fileReplacements: mode === 'production' ? productionFileReplacements : [],
        }),
        angularComponentProbe: app('src/app/app.component.ts'),
        generator,
      }),
    ],
    // This workspace links @ng-doc/core from dist (CommonJS) instead of installing it.
    resolve: {
      alias: [{ find: '@ng-doc/core', replacement: path.join(workspaceRoot, 'dist/libs/core') }],
    },
    css: { preprocessorOptions: { scss: { loadPaths: [workspaceRoot] } } },
    server: { fs: { allow: [workspaceRoot] } },
    build: {
      outDir,
      emptyOutDir: true,
      commonjsOptions: { include: [/node_modules/, /dist\/libs\/core\//] },
    },
  };
}

export default ({ mode }) => ngDocSiteConfig({ mode });
