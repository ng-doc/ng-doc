---
keyword: ViteHostPage
---

The Vite host runs the new engine inside the Vite development server, with Analog's Angular
plugin. NgDoc writes the generated files to disk, and Vite serves the application from them. It is
the recommended way to work on documentation with the new engine.

<ng-doc-blockquote type="note" label="🧭 Moving an existing site?">

To move an existing site from the legacy builders, run the migration schematic instead:
`ng g @ng-doc/builder:migrate-to-vite` (`*MigrateToNewEnginePage`). It writes the configuration
below from your build target, and reports the options it can't migrate. This page shows the same
setup by hand.

</ng-doc-blockquote>

## Prerequisites

- A working NgDoc site (`*InstallationPage`).
- `vite` 7.3.5 exactly, pinned in `devDependencies`. The engine checks the version when it starts
  and stops with `NGDOC_VITE_VERSION` on any other, because it is tested and patched for this
  release only. Angular's Vitest accepts Vite 8, so pin it even when Vite is already installed:

  ```bash
  npm i -D vite@7.3.5 @analogjs/vite-plugin-angular@2.6.3
  ```

- The engine is tested with `@analogjs/vite-plugin-angular` 2.6.3 and `@angular/compiler` and
  `@angular/compiler-cli` 22.2.1, on Node.js `>=24.15.0 <25` (`*BuildersReference#supported-versions`).

## 1. Add the Vite configuration

Register both plugins in `vite.config.mjs`. `createNgDocAngularPlugins` configures Analog's Angular
plugin the way NgDoc needs it, and `createNgDocVitePlugin` runs the engine:

```js name="vite.config.mjs"
import path from 'node:path';

import { createNgDocAngularPlugins } from '@ng-doc/builder/generator/vite/angular/index.js';
import { createNgDocVitePlugin } from '@ng-doc/builder/generator/vite/index.js';

const workspaceRoot = import.meta.dirname;

export default {
  plugins: [
    createNgDocVitePlugin({
      analogLiveReload: true,
      angularPlugins: createNgDocAngularPlugins({
        tsconfig: path.join(workspaceRoot, 'tsconfig.app.json'),
        workspaceRoot,
        liveReload: true,
      }),
      angularComponentProbe: path.join(workspaceRoot, 'src/app/app.ts'),
      generator: {
        projectId: 'my-app',
        workspaceRoot,
        defaults: {
          docsRoot: path.join(workspaceRoot, 'src/app'),
          tsConfig: path.join(workspaceRoot, 'tsconfig.app.json'),
          outputRoot: path.join(workspaceRoot, 'ng-doc/my-app'),
          cacheRoot: path.join(workspaceRoot, '.cache/ng-doc/my-app'),
        },
      },
    }),
  ],
};
```

- `angularComponentProbe` is the absolute path of a component that is always in the application,
  such as the root component.
- The `defaults` apply when `ng-doc.config.ts` doesn't set `docsPath`, `tsConfig` or `outDir`. With
  `outDir`, the generated folder is `<outDir>/ng-doc/<projectId>` in the workspace root. All paths
  are absolute.
- `*BuildersReference#vite-plugin` lists every option.

## 2. Point the application at the generated folder

Map `@ng-doc/generated` in `tsconfig.json` to the `index.ts` of the generated folder, here
`ng-doc/my-app/index.ts`. The plugin serves the generated assets itself, so you don't need an asset
entry for them.

Vite doesn't read the `build` options of `angular.json`. Add `createNgDocApplicationPlugin` with
the `browser`, `server`, `polyfills`, `styles` and `assets` of your build target, and set Vite's
`root` to the folder of `index.html`. The other build options have a Vite or Analog equivalent: the
plugin rejects them and names it, for example `createNgDocAngularPlugins({ fileReplacements })`.
It only warns about options with no effect under Vite, such as `budgets` or `outputHashing`.

```js name="vite.config.mjs"
import path from 'node:path';

import { createNgDocApplicationPlugin } from '@ng-doc/builder/generator/vite/index.js';

export default {
  root: path.join(import.meta.dirname, 'src'),
  publicDir: false,
  plugins: [
    createNgDocApplicationPlugin({
      workspaceRoot: import.meta.dirname,
      browser: 'src/main.ts',
      server: 'src/main.server.ts',
      polyfills: ['zone.js'],
      styles: ['src/styles.scss'],
      assets: [
        { glob: '**/*', input: 'public' },
        { glob: '**/*', input: 'node_modules/@ng-doc/app/assets', output: 'assets/ng-doc/app' },
        { glob: '**/*', input: 'node_modules/@ng-doc/ui-kit/assets', output: 'assets/ng-doc/ui-kit' },
      ],
    }),
    // createNgDocVitePlugin(...), as in step 1
  ],
};
```

The plugin loads the polyfills, the global styles and the `browser` entry from `index.html`, so
`index.html` stays as the Angular CLI uses it. It copies the `assets` into the build and serves them
in development, and sets `<base href>` from Vite's `base`. The `server` entry is only needed to
prerender (`*ProductionBuildsPage#build-with-the-vite-host`).

## 3. Start the server

```bash
npx vite
```

To start it with `ng serve`, use the `@ng-doc/builder:vite-dev-server` builder with
`"configFile": "vite.config.mjs"` (`*BuildersReference#vite-builders`).

NgDoc builds the documentation when the server starts. When you save a file, it rebuilds only the
pages that depend on it, and the browser updates. The build tags of the server are `development`
(`*PagesAndCategoriesPage#build-tags`). The terminal shows the build's progress and a line for
each edit (`*ProgressOutputPage`).

## Build for production

`vite build` builds the application with NgDoc. It generates every page once, with the build tag
`production`, before Vite bundles the application. To build the server bundle and prerender every
route, use `ng build` with the `@ng-doc/builder:vite-application` builder or `ng-doc prerender`
(`*ProductionBuildsPage#build-with-the-vite-host`).

## Limitations

- The development server needs file watching and hot module replacement. Don't disable
  `server.watch` or `server.hmr`.
- `vite build --watch` isn't supported. Use the development server to work on pages.
- The Vite builders apply only the Vite configuration. Other options of an `angular.json` build
  target, such as `budgets`, `i18n` or a custom `server.ts`, have no effect.
- Prerendering renders the routes with concrete URLs. It doesn't produce a server that renders on
  request.

{% index false %}

## Related

- `*DevServerAndBuildsPage`
- `*BuildersReference#vite-plugin`
- `*TroubleshootingPage#vite-host`

{% endindex %}

Next: `*ProductionBuildsPage`
