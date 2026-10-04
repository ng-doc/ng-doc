---
keyword: MigrateToNewEnginePage
---

Move a site from the legacy builders to the new engine. The new engine generates the same pages,
with a persistent cache, faster rebuilds and diagnostic codes. A new application that you set up
with `ng add` already uses it (`*InstallationPage`). For an existing site, the
switch is opt-in: `ng update` keeps your project on the legacy builders, and a schematic moves it
when you are ready. You can roll it back.

## Prerequisites

- NgDoc 22.0 with the legacy builders (`*UpgradeTo22Page`).
- A clean working tree, so you can review and undo the changes. The schematic warns when it isn't.
- Node.js `>=24.15.0 <25`.

## 1. Preview the migration

The `migrate-to-vite` schematic moves a project to the new engine in the Vite host, and keeps
`ng build` and `ng serve` working. Run it with `--dry-run` first: it prints the files it would
change and its report, and writes nothing.

```bash
ng g @ng-doc/builder:migrate-to-vite --project <project-name> --dry-run
```

In an Nx workspace, run `nx g @ng-doc/builder:migrate-to-vite` with the same options. You can leave
out `--project` when only one project uses the legacy builders.

## 2. Run the schematic

```bash
ng g @ng-doc/builder:migrate-to-vite --project <project-name>
```

It changes the workspace like this:

- **Targets:** `build` and `serve` run `@ng-doc/builder:vite-application` and
  `@ng-doc/builder:vite-dev-server` (`*BuildersReference#vite-builders`). The original targets
  stay as `build-legacy` and `serve-legacy`. Each build configuration, such as `production`, selects
  the Vite mode with the same name; without a `defaultConfiguration`, the target runs the plain
  options as the `default` mode. `prerender: false` stays off. Angular builders that read the
  build options, such as `extract-i18n` and `unit-test`, now point at `build-legacy`.
- **`vite.config.mjs`:** a new file in the project folder. When the folder already has a
  `vite.config.*`, for example for Vitest, the file is **vite.ng-doc.config.mjs** instead, so Vite
  and Vitest run directly keep loading yours; the `build` and `serve` targets name NgDoc's file
  in `configFile`, and the report says so. `--vite-config` sets another name. The file holds the application of the build
  target (`browser`, `server`, `polyfills`, `styles`, `assets`), the Analog Angular plugin
  (`tsConfig`, `inlineStyleLanguage`, `fileReplacements`) and the engine settings (`*ViteHostPage`).
  Options that differ between configurations, such as `fileReplacements` or `sourceMap`, are
  selected by the Vite mode.
- **Server entry:** with a `server` entry, the default export of `main.server.ts` is wrapped with
  `withNgDocContentReady`, so a page is prerendered once its content is ready.
- **Dependencies:** `vite`, `@analogjs/vite-plugin-angular`, `@angular/compiler` and
  `@angular/compiler-cli` are added with the ranges in `*BuildersReference#supported-versions`
  (`^8.3.0`, `^2.8.0`, `^22.2.0`), unless `package.json` already lists them. Nothing is pinned:
  npm installs the newest matching releases. Pass `--skip-install` to install them yourself. A
  listed package whose installed version (or, before an install, whose range) lies outside the
  engine's range is kept, and the report says so. For `vite` it also tells you to update it with
  `npm i -D vite@^8.3.0`: the Vite engine doesn't start with Vite 7 or earlier
  (`*TroubleshootingPage#ngdoc_vite_version`). An `@angular/compiler` or `@angular/compiler-cli`
  older than 22.2 blocks the migration: update Angular first
  (`*TroubleshootingPage#ngdoc_vite_angular_version`).
- **Files:** `/.cache/ng-doc` is added to `.gitignore`. The legacy generated folder,
  `ng-doc/<project-name>`, is deleted once, because the new engine refuses to overwrite files it
  didn't write (`OUTPUT_UNOWNED_COLLISION`). The `@ng-doc/generated` path in `tsconfig.json` stays
  as it is.

The schematic writes a report to `.ng-doc-migration/<project-name>/report.md` and prints it. The
report lists every option: migrated, dropped because it has no effect under Vite, or left for you
to change by hand. Options that need a manual change include `scripts`, `deployUrl`, `proxyConfig`
and `ssl`. An `ssr.entry` server, such as `server.ts`, isn't built: the Vite build prerenders every
route instead, so deploy the `browser` folder as a static site.

The schematic changes nothing when it can't migrate the project, and the report says why:

- the build target uses another builder, such as a custom esbuild builder;
- the build target localizes the application (`localize`);
- the index file isn't named `index.html`, or `index` is `false`;
- the root component can't be found from the browser entry. Pass it with
  `--root-component src/app/app.ts`;
- the server entry, `main.server.ts`, exports an NgModule (`NGDOC_MIGRATE_SERVER_NGMODULE`). The
  Vite build prerenders with a bootstrap function, so export one instead:
  `(context) => bootstrapApplication(App, config, context)`;
- the Vite configuration file it would create already exists, such as a **vite.ng-doc.config.mjs**
  or the file you named with `--vite-config`. Pass another file name with `--vite-config`;
- a target with the name the legacy target would get, such as `build-legacy`, already exists.

Running the schematic again is safe: it adds only what is missing, and keeps your edits to the
files it created. If the `.ng-doc-migration/<project-name>` folder is gone, it finds the
`build-legacy` target next to the Vite target and changes nothing.

## 3. Build and check

1. Install the dependencies, if you passed `--skip-install`.
2. Start the development server with `ng serve`, then run a production build with `ng build`.
   With a `server` entry, `ng build` also prerenders every route (`*ProductionBuildsPage`).
3. Compare the pages with the legacy build, `ng run <project-name>:build-legacy`. If a build fails,
   the error starts with a diagnostic code: look it up in `*TroubleshootingPage`.

   Both engines write the generated folder, `ng-doc/<project-name>`. Delete it whenever you switch
   between the `-legacy` targets and the Vite targets: the new engine refuses files it didn't write
   (`OUTPUT_UNOWNED_COLLISION`), and the legacy engine replaces the new engine's files.

4. Delete `node_modules/.cache/ng-doc` if it exists. The new engine doesn't use it.

To set up the Vite host by hand instead, follow `*ViteHostPage`.

## ✅ After migrating

Go through this list before you commit the migration:

- **Manual items:** open `.ng-doc-migration/<project-name>/report.md` and handle each entry under
  “Needs a manual change”. The schematic didn't migrate them, so the site can behave differently
  until you do.
- **Output folder:** the Vite build writes the application to `<outputPath>/browser`, whatever
  `outputPath.browser` was, and with a `server` entry the server bundle to `<outputPath>/server`.
  Update deploy scripts and CI artifact paths that read the old folder.
- **Server rendering:** with `outputMode: 'server'`, the Angular server that renders on request
  isn't built. The build prerenders every route into `browser/`: deploy it as a static site, or
  keep the `build-legacy` target for the server.
- **Vite version:** keep `vite` on Vite 8 (`^8.3.0`); updates within Vite 8 are fine. The Vite
  engine doesn't start with Vite 7 or earlier (`*TroubleshootingPage#ngdoc_vite_version`).
- **Vite configuration:** if the project folder already had a `vite.config.*`, NgDoc's
  configuration is **vite.ng-doc.config.mjs**. Run NgDoc through `ng serve` and `ng build` (or pass
  `--config` to Vite); `vite` and `vitest` run directly keep using your own file.
- **The diff:** `ng g` formats every file a schematic changed with the workspace's Prettier, so a
  file can show more changed lines than the schematic's edit. In `main.server.ts` the schematic
  adds one import and wraps the default export.

## What changes

| Behaviour                | Legacy builders                                                 | New engine                                                                                                          |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Cache                    | Off unless `cache: true`                                        | On unless `cache: false`                                                                                            |
| Cache folder             | `node_modules/.cache/ng-doc`                                    | `.cache/ng-doc/<project-name>`                                                                                      |
| Generated folder         | `ng-doc/<project-name>`                                         | The same, owned by the new engine                                                                                   |
| Generated assets         | An asset entry in the build target                              | Added by the builder or the Vite plugin                                                                             |
| Configuration file names | `ng-doc.config.ts`, `.js`                                       | Also `.mjs` and `.cjs`                                                                                              |
| Configuration search     | Starts in the folder of the `browser` entry file, usually `src` | Starts in the parent of that folder. Move `src/ng-doc.config.ts` to the project folder, or set its path explicitly. |
| Errors                   | Messages                                                        | Messages with a diagnostic code (`*DiagnosticCodesReference`)                                                       |
| Progress output          | –                                                               | `*ProgressOutputPage`                                                                                               |

## 🔙 Roll back

```bash
ng g @ng-doc/builder:migrate-to-vite --project <project-name> --revert
```

The revert restores the original `build` and `serve` targets and the files the schematic changed,
and deletes the files it created, the generated folder and the new engine's cache folder, so the
legacy builders start clean. A file you edited after the migration is kept, and the revert says so;
reformatting doesn't count as an edit. It also reports a Vite target you edited, then restores
the original. The added dependencies stay. When a `-legacy` target is missing, the revert stops
and changes nothing: restore the target first.
It needs the `.ng-doc-migration/<project-name>` folder: commit it with the migration if you want to
keep the revert available. Your version control remains the primary way back.

## 🚧 Known limitations

- `vite build --watch` isn't supported. Use the development server.
- Supported platforms: Linux, macOS and Windows, all tested in CI.

{% index false %}

## Related

- `*DevServerAndBuildsPage`
- `*LegacyBuildersPage`
- `*TroubleshootingPage`

{% endindex %}

Next: `*LegacyBuildersPage`
