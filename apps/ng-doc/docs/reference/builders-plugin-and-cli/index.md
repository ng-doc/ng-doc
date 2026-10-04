---
keyword: BuildersReference
---

The entry points of the new engine: its Vite plugin, its Vite builders, the `ng-doc` command line
interface, the schematics and the environment switches. `*DevServerAndBuildsPage` explains
how they run.

## Entry points

| Entry point            | Package           | Name                                                                                            |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| Vite plugin            | `@ng-doc/builder` | `createNgDocVitePlugin`, `createNgDocAngularPlugins`, `createNgDocApplicationPlugin`            |
| Vite builders          | `@ng-doc/builder` | `@ng-doc/builder:vite-application`, `@ng-doc/builder:vite-dev-server`                           |
| Prerendering           | `@ng-doc/builder` | `@ng-doc/builder:vite-application`, `ng-doc prerender`                                          |
| Command line interface | `@ng-doc/builder` | `ng-doc`                                                                                        |
| Legacy builders        | `@ng-doc/builder` | `@ng-doc/builder:application`, `@ng-doc/builder:dev-server`, deprecated (`*LegacyBuildersPage`) |

## Vite plugin

Import the plugin from the built entry points of `@ng-doc/builder`:

```typescript name="vite.config.ts"
import { createNgDocAngularPlugins } from '@ng-doc/builder/generator/vite/angular/index.js';
import { createNgDocVitePlugin } from '@ng-doc/builder/generator/vite/index.js';
```

### createNgDocVitePlugin(options)

Returns the Vite plugins that run the new engine inside the Vite development server and build.

| Option                    | Type                        | Default               | Description                                                                                          |
| ------------------------- | --------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `generator`               | `GeneratorBootstrapOptions` | required              | The engine options. See `*BuildersReference#generator-options`.                                      |
| `angularPlugins`          | `Plugin[]`                  | required              | The array returned by `createNgDocAngularPlugins`.                                                   |
| `analogLiveReload`        | `true`                      | required              | Confirms that the Angular plugins use `liveReload: true`.                                            |
| `angularComponentProbe`   | `string`                    | required              | The absolute path of a component that is always in the application, such as the root component.      |
| `generatedAlias`          | `string`                    | `'@ng-doc/generated'` | The import path of the generated code.                                                               |
| `maxExternalWatchTargets` | `number`                    | `50000`               | The most files and folders the plugin watches outside the Vite root.                                 |
| `themeModules`            | `Record<string, string>`    | `{}`                  | Browser module paths for Shiki themes other than `css-variables`, `github-light` and `ayu-dark`.     |
| `progress`                | `string`                    | `'auto'`              | The progress output: `auto`, `live`, `plain`, `verbose`, `summary` or `off` (`*ProgressOutputPage`). |

### Generator options

| Option                | Type       | Default       | Description                                                                                                               |
| --------------------- | ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `projectId`           | `string`   | required      | The project name. It names the generated and cache folders.                                                               |
| `workspaceRoot`       | `string`   | required      | The absolute path of the workspace root.                                                                                  |
| `configFile`          | `string`   | –             | The absolute path of the configuration file. It is discovered by default.                                                 |
| `discovery.tags`      | `string[]` | The Vite mode | The build tags matched against `onlyForTags`. The Vite mode is `development` for the server and `production` for a build. |
| `defaults.docsRoot`   | `string`   | required      | The documentation folder, used when the configuration has no `docsPath`.                                                  |
| `defaults.tsConfig`   | `string`   | required      | The TypeScript configuration, used when the configuration has no `tsConfig`.                                              |
| `defaults.outputRoot` | `string`   | required      | The generated folder, used when the configuration has no `outDir`.                                                        |
| `defaults.cacheRoot`  | `string`   | required      | The cache folder.                                                                                                         |

All paths are absolute.

### createNgDocApplicationPlugin(options)

Returns the Vite plugin that builds and serves the Angular application the way the Angular CLI
`application` builder does. Relative paths are relative to `workspaceRoot`.

| Option          | Type                 | Default                 | Description                                                                                                                |
| --------------- | -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `workspaceRoot` | `string`             | The current folder      | The absolute path of the workspace root.                                                                                   |
| `sourceRoot`    | `string`             | The folder of `browser` | The project's source folder. A path in `assets` is copied to its path relative to it.                                      |
| `browser`       | `string`             | required                | The browser entry, such as `src/main.ts`.                                                                                  |
| `server`        | `string`             | –                       | The server entry, such as `src/main.server.ts`. Needed to prerender.                                                       |
| `polyfills`     | `string[]`           | `[]`                    | Modules loaded first, such as `zone.js`. The server keeps only `zone.js` (as `zone.js/node`) and `@angular/localize/init`. |
| `styles`        | `string[]`           | `[]`                    | Global style sheets.                                                                                                       |
| `assets`        | `(string\|object)[]` | `[]`                    | Files copied into the build and served in development, as in the `assets` of `angular.json`.                               |

Other options of an `angular.json` build target fail with `NGDOC_VITE_APPLICATION_OPTION`, which
names their Vite or Analog equivalent. `allowedCommonJsDependencies`, `budgets`, `extractLicenses`,
`namedChunks`, `optimization`, `outputHashing`, `progress`, `sourceMap`, `statsJson` and `verbose`
only log a warning. `vite build` sets `ngDevMode` and `ngJitMode` to `false` in every mode, unless
the Vite `define` sets them.

### createNgDocAngularPlugins(options)

Returns the Analog Angular plugins in the configuration that NgDoc supports. It accepts the options
of `@analogjs/vite-plugin-angular`, except that `liveReload` must stay `true`, and `jit`,
`disableTypeChecking` and `fastCompile` must stay `false`.

### Limitations

- `vite build --watch` is not supported. Use the development server.
- The development server needs file watching and hot module replacement. Don't disable
  `server.watch` or `server.hmr`.

## Vite builders

`@ng-doc/builder:vite-application` and `@ng-doc/builder:vite-dev-server` run a Vite configuration
for `ng build` and `ng serve`. Paths are relative to the workspace root.

| Builder            | Option           | Type       | Default                                | Description                                                                    |
| ------------------ | ---------------- | ---------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| both               | `configFile`     | `string`   | required                               | The Vite configuration file.                                                   |
| both               | `mode`           | `string`   | `production` / `development`           | The Vite mode.                                                                 |
| `vite-application` | `outputPath`     | `string`   | required                               | The output folder: `browser/`, `server/server.mjs`, `prerendered-routes.json`. |
| `vite-application` | `ssr`            | `boolean`  | `true` with a `server` entry           | Builds the server bundle.                                                      |
| `vite-application` | `prerender`      | `boolean`  | `true` when the server bundle is built | Prerenders every route into `browser/`.                                        |
| `vite-application` | `routes`         | `string[]` | `[]`                                   | Routes prerendered in addition to the discovered ones.                         |
| `vite-application` | `discoverRoutes` | `boolean`  | `true`                                 | Prerenders every route of the router configuration.                            |
| `vite-application` | `routeTimeout`   | `number`   | No limit                               | Fails a route that takes longer to render, in milliseconds.                    |
| `vite-dev-server`  | `host`, `port`   | –          | Vite's `server` options                | Where the development server listens.                                          |

The NgDoc options, such as `progress` and `generator.discovery.tags`, come from the Vite plugin in
the configuration file. Without `generator.discovery.tags`, the build tags are the `mode`
(`*PagesAndCategoriesPage#build-tags`).

## Command line interface

The `ng-doc` command generates the documentation without Angular CLI or Vite. Use it in scripts and
in custom hosts.

```bash
ng-doc generate --project <project-name>
ng-doc dev --project <project-name> -- <command> [arguments]
ng-doc prerender --vite-config <file> --output-path <folder>
```

| Command     | Effect                                                                                                                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate`  | Generates the documentation once for production and exits.                                                                                                                                                                                                                                     |
| `dev`       | Generates the documentation, then watches for changes. After `--`, it also starts a command, such as a dev server, and stops it on exit.                                                                                                                                                       |
| `watch`     | The same as `dev`.                                                                                                                                                                                                                                                                             |
| `prerender` | Builds a Vite host application for production and prerenders every route, as the `vite-application` builder does. Its flags are `--vite-config`, `--output-path`, `--mode`, `--routes <a,b>`, `--route-timeout <ms>`, `--no-discover` and `--skip-build` (prerender an existing output again). |

| Flag                   | Default                                                          | Description                                                                                                  |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--project <id>`       | required                                                         | The project name.                                                                                            |
| `--workspace <path>`   | The current folder                                               | The workspace root.                                                                                          |
| `--config <path>`      | Discovered                                                       | The configuration file.                                                                                      |
| `--docs-root <path>`   | `docs`                                                           | The documentation folder, if the configuration has no `docsPath`.                                            |
| `--tsconfig <path>`    | `tsconfig.json`                                                  | The TypeScript configuration, if the configuration has no `tsConfig`.                                        |
| `--output-root <path>` | `.ng-doc/<project-name>`                                         | The generated folder, if the configuration has no `outDir`.                                                  |
| `--cache-root <path>`  | `.cache/ng-doc/<project-name>`                                   | The cache folder.                                                                                            |
| `--json`               | off                                                              | Prints results and diagnostics as JSON lines.                                                                |
| `--progress <mode>`    | `auto`                                                           | The progress output: `auto`, `live`, `plain`, `verbose`, `summary`, `json` or `off` (`*ProgressOutputPage`). |
| `--tags <a,b>`         | `production` for `generate`, `development` for `dev` and `watch` | The build tags matched against `onlyForTags`.                                                                |

Paths are relative to the workspace root. `--help` prints the usage, and `--version` prints the
version.

| Exit code | Meaning                   |
| --------- | ------------------------- |
| `0`       | Success.                  |
| `1`       | The generation failed.    |
| `2`       | Invalid command or flags. |
| `130`     | Stopped with `SIGINT`.    |
| `143`     | Stopped with `SIGTERM`.   |

With a command after `--`, `ng-doc dev` exits with that command's exit code.

## Schematics

| Command                                   | Creates                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ng add @ng-doc/add`                      | The NgDoc setup: the Vite host, or the legacy builders with `--engine legacy` (`*InstallationPage`). |
| `ng g @ng-doc/builder:page "<title>"`     | A page folder with `ng-doc.page.ts` and `index.md`.                                                  |
| `ng g @ng-doc/builder:category "<title>"` | A category folder with `ng-doc.category.ts`.                                                         |
| `ng g @ng-doc/builder:api`                | An `ng-doc.api.ts` file.                                                                             |
| `ng g @ng-doc/builder:migrate-to-vite`    | The Vite host setup of a legacy project (`*MigrateToNewEnginePage`).                                 |

The page, category and API schematics create files in the current folder. Pass `--path` to use
another folder.

| Option               | Schematics     | Description                                             |
| -------------------- | -------------- | ------------------------------------------------------- |
| `--name`, `-n`       | page, category | The name of the exported variable.                      |
| `--route`, `-r`      | page, category | The `route` field.                                      |
| `--category`, `-c`   | page, category | Imports the closest `ng-doc.category.ts` as the parent. |
| `--order`, `-o`      | page, category | The `order` field.                                      |
| `--expandable`, `-e` | category       | The `expandable` field.                                 |
| `--expanded`, `-x`   | category       | The `expanded` field.                                   |

`migrate-to-vite` moves a project from the legacy builders to the Vite engine. It writes a report to
`.ng-doc-migration/<project-name>/report.md`, and `--dry-run` shows the changes without writing them.

| Option             | Default                                 | Description                                                            |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------- |
| `--project`        | The only project on the legacy builders | The project to migrate.                                                |
| `--revert`         | `false`                                 | Undoes the migration of the project: restores its targets and files.   |
| `--vite-config`    | `vite.config.mjs` in the project folder | The Vite configuration file to create, relative to the workspace root. |
| `--root-component` | Found from the browser entry            | The root component's file, relative to the workspace root.             |
| `--skip-install`   | `false`                                 | Doesn't install the added dependencies.                                |

## Environment switches

The new engine reads these variables in every entry point. Each one turns off one optimization.
Use them to find the cause of a problem, and report it (`*TroubleshootingPage`).

| Variable                        | Default | When set to `0`, `false`, `off` or `no`                                                                                                                                                                           |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NGDOC_PERSISTENT_WORKER`       | on      | Starts a new compiler worker for every development build. It keeps no TypeScript program between builds, so this also turns off the next two switches, the targeted rebuild and the reuse of the program.         |
| `NGDOC_PERSISTENT_WORKER_PRIME` | on      | Doesn't prepare the compiler worker for the first edit: the server's first build runs in a separate worker, and the first edit after the start rebuilds the TypeScript program.                                   |
| `NGDOC_DELTA_TRANSPORT`         | on      | Sends complete snapshots to the compiler worker instead of changes.                                                                                                                                               |
| `NGDOC_INCREMENTAL_SKIP`        | on      | Recompiles the TypeScript program from scratch on every development build.                                                                                                                                        |
| `NGDOC_TARGETED_REBUILD`        | on      | Checks every page on every development build, instead of only the pages that an edit can reach.                                                                                                                   |
| `NGDOC_INCREMENTAL_PROGRAM`     | on      | Builds a new TypeScript program after a TypeScript edit, instead of updating the kept one.                                                                                                                        |
| `NGDOC_SEMANTIC_RECORDER`       | on      | Stops recording which files each TypeScript query reads. After a TypeScript edit, every page that reads TypeScript is rendered again, as with the next switch off.                                                |
| `NGDOC_SCOPED_SEMANTIC`         | on      | After any TypeScript edit, renders again every page that reads TypeScript, such as API pages, API embeds, demos and playgrounds, instead of only those that read the edited code. Also turns off the next switch. |
| `NGDOC_SHAPE_CLOSURE`           | on      | Renders again every page whose TypeScript imports an edited file, even when the edit changes no declared type.                                                                                                    |
| `NGDOC_TRACKED_PROGRAM_REUSE`   | on      | Tracks the whole TypeScript program again for every API embed of a production build (or with `NGDOC_SCOPED_SEMANTIC` off), instead of once per build. The output is the same.                                     |
| `NGDOC_ANGULAR_SHARED_PASS`     | on      | Vite host only. Compiles each generated TypeScript module that an edit changed in an Angular pass of its own, instead of one pass for all of them.                                                                |
| `NGDOC_ANGULAR_STRUCTURAL_PASS` | on      | Vite host only. When an edit adds, moves or deletes pages, compiles the application once more on those files before the pass that compiles the edit.                                                              |
| `NGDOC_FAST_START`              | on      | Generates every page on a development server start, even when no file changed since the last run, and doesn't reuse the cached links and generated files of unchanged pages on a start after edits.               |
| `NGDOC_VITE_BUILD_HANDOFF`      | on      | `vite-application` only. Generates the documentation again for the server bundle instead of reusing the browser build's generation.                                                                               |
| `NGDOC_PARALLEL_WRITES`         | on      | Writes the generated files one at a time, instead of several at once. The published files are the same.                                                                                                           |
| `NGDOC_HIGHLIGHT_CACHE`         | on      | Highlights every code block again, instead of reusing the highlighting of code that it highlighted before. The published files are the same.                                                                      |
| `NGDOC_PARALLEL_RENDER`         | on      | Processes the HTML of every page in one thread, instead of on up to four worker threads in a build that renders many pages. The published files are the same.                                                     |

Production builds always use a fresh compiler worker, whatever these variables say.

## Supported versions

| Dependency                                                       | Version                  |
| ---------------------------------------------------------------- | ------------------------ |
| Angular (`@ng-doc/app`, `@ng-doc/ui-kit`)                        | `>=22.0.0 <23.0.0`       |
| `@angular/compiler`, `@angular/compiler-cli` (`@ng-doc/builder`) | `>=22.0.0 <23.0.0`       |
| Node.js                                                          | `>=24.15.0 <25`          |
| Vite (Vite host only)                                            | `^8.3.0`                 |
| `@analogjs/vite-plugin-angular` (Vite host only)                 | `^2.8.0`                 |
| `@angular/compiler`, `@angular/compiler-cli` (Vite host only)    | `^22.2.0`                |
| Platforms                                                        | Linux, macOS and Windows |

The Vite engine is tested with Vite 8.3.2, Analog 2.8.0 and Angular 22.2.1. It checks the Vite
version when it starts and stops with `NGDOC_VITE_VERSION` outside `^8.3.0`; `ng add` and
`migrate-to-vite` add these ranges to `devDependencies` when `package.json` doesn't list them, so
npm installs the newest matching releases. The optional peer dependencies of `@ng-doc/builder` are
the same ranges (`vite` `^8.3.0`, Analog `^2.8.0`). NgDoc bundles its own patched copy of Analog's
Angular plugin; the installed one supplies its types. The legacy builders don't use Vite or
Analog.

{% index false %}

## Related

- `*DevServerAndBuildsPage`
- `*ConfigurationReference`
- `*DiagnosticCodesReference`

{% endindex %}
