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
- **`vite.config.mjs`:** a new file in the project folder. It holds the application of the build
  target (`browser`, `server`, `polyfills`, `styles`, `assets`), the Analog Angular plugin
  (`tsConfig`, `inlineStyleLanguage`, `fileReplacements`) and the engine settings (`*ViteHostPage`).
  Options that differ between configurations, such as `fileReplacements` or `sourceMap`, are
  selected by the Vite mode.
- **Server entry:** with a `server` entry, the default export of `main.server.ts` is wrapped with
  `withNgDocContentReady`, so a page is prerendered once its content is ready.
- **Dependencies:** `vite`, `@analogjs/vite-plugin-angular`, `@angular/compiler` and
  `@angular/compiler-cli` are added at the versions in `*BuildersReference#supported-versions`,
  unless the workspace already has them. Pass `--skip-install` to install them yourself.
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
- the index file isn't named `index.html`;
- the root component can't be found from the browser entry. Pass it with
  `--root-component src/app/app.ts`;
- the server entry, `main.server.ts`, exports an NgModule (`NGDOC_MIGRATE_SERVER_NGMODULE`). The
  Vite build prerenders with a bootstrap function, so export one instead:
  `(context) => bootstrapApplication(App, config, context)`;
- `vite.config.mjs` already exists. Pass another file name with `--vite-config`.

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

To set up the Vite host by hand instead, follow `*ViteHostPage`. The `modern-application` and
`modern-dev-server` builders (`*BuildersReference#angular-cli-builders`) run the new engine inside
the Angular CLI application builder, with the options of your build target unchanged.

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

## Roll back

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

## Known limitations

- `vite build --watch` isn't supported. Use the development server.
- Supported platforms: Linux, macOS and Windows, all tested in CI.

{% index false %}

## Related

- `*DevServerAndBuildsPage`
- `*LegacyBuildersPage`
- `*TroubleshootingPage`

{% endindex %}

Next: `*LegacyBuildersPage`
