// The documentation site on the NgDoc Vite engine (Vite + Analog, physical generated files).
// Used by the `build` and `serve` targets. The plugins come from the built package in
// dist, as the site's legacy targets do.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNgDocAngularPlugins } from '../../dist/libs/builder/generator/vite/angular/index.js';
import {
  createNgDocApplicationPlugin,
  createNgDocVitePlugin,
} from '../../dist/libs/builder/generator/vite/index.js';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const app = (file) => path.join(workspaceRoot, 'apps/ng-doc', file);

/** Replaced in production builds only, as in the legacy targets. */
export const productionFileReplacements = [
  {
    replace: 'apps/ng-doc/src/environments/environment.ts',
    with: 'apps/ng-doc/src/environments/environment.prod.ts',
  },
];

/**
 * The generator options of the site: its configuration and its output and cache roots, which are
 * the engine's defaults for the project `ng-doc` (`ng-doc/<project>`, `.cache/ng-doc/<project>`).
 */
export function ngDocSiteGenerator({
  configFile = app('ng-doc.config.ts'),
  tsConfig = app('tsconfig.vite.json'),
  outputRoot = path.join(workspaceRoot, 'ng-doc/ng-doc'),
  cacheRoot = path.join(workspaceRoot, '.cache/ng-doc/ng-doc'),
} = {}) {
  return {
    projectId: 'ng-doc',
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
  outDir = path.join(workspaceRoot, 'dist/apps/ng-doc/browser'),
}) {
  return {
    root: app('src'),
    base,
    cacheDir,
    // The HTML entry is src/index.html; the legacy targets use the same file.
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
    // Vite 8 bundles with Rolldown, which converts the linked CommonJS @ng-doc/core by itself.
    build: { outDir, emptyOutDir: true },
  };
}

export default ({ mode }) => ngDocSiteConfig({ mode });
